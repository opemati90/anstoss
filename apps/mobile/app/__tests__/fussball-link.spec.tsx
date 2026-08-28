import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const mockUseAuth = jest.fn()
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#000',
    clubPrimaryLight: '#eee',
  }),
  useIsDark: () => false,
}))
jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))
jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))
jest.mock('../../src/components/ModalHeader', () => ({
  ModalHeader: ({ title }: { title?: string }) => {
    const { Text } = require('react-native')
    return <Text>{title}</Text>
  },
}))

import FussballLinkScreen from '../fussball-link'
import { api } from '../../src/api/client'
import { router } from 'expo-router'

const mockApi = api as jest.Mock

const coachAuth = () => ({
  activeClub: { club: { id: 'c1', name: 'FC Test' }, role: 'COACH' },
  activeTeamId: 't1',
  activeTeamAccess: { team: { displayName: '1. Herren' }, role: 'HEAD_COACH' },
})

const managerAuth = (role: 'OWNER' | 'ADMIN') => ({
  activeClub: { club: { id: 'c1', name: 'FC Test' }, role },
  activeTeamId: 't1',
  activeTeamAccess: { team: { displayName: '1. Herren' }, role: 'HEAD_COACH' },
})

const playerAuth = () => ({
  activeClub: { club: { id: 'c1', name: 'FC Test' }, role: 'PLAYER' },
  activeTeamId: 't1',
  activeTeamAccess: { team: { displayName: '1. Herren' }, role: 'PLAYER' },
})

const noTeamAuth = () => ({
  activeClub: null,
  activeTeamId: null,
  activeTeamAccess: null,
})

describe('FussballLinkScreen', () => {
  beforeEach(() => {
    mockApi.mockReset()
    ;(router.push as jest.Mock).mockReset()
  })

  it('shows no-team state when no active team', async () => {
    mockUseAuth.mockReturnValue(noTeamAuth())
    const { getByText } = render(<FussballLinkScreen />)
    expect(getByText('fussball.noTeamTitle')).toBeTruthy()
    expect(getByText('fussball.noTeamBody')).toBeTruthy()
  })

  it.each(['OWNER', 'ADMIN'] as const)('renders link form for %s members', async (role) => {
    mockUseAuth.mockReturnValue(managerAuth(role))
    mockApi.mockImplementation(() => Promise.resolve([]))

    const { getByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('fussball.linkTitle')).toBeTruthy()
      expect(getByText('fussball.previewAction')).toBeTruthy()
    })
  })

  it('hides link form and sync controls for coaches', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation(() => Promise.resolve([]))

    const { queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(queryByText('fussball.linkTitle')).toBeNull()
      expect(queryByText('fussball.previewAction')).toBeNull()
      expect(queryByText('fussball.syncNow')).toBeNull()
    })
  })

  it('hides link form and sync button for players', async () => {
    mockUseAuth.mockReturnValue(playerAuth())
    mockApi.mockImplementation(() => Promise.resolve([]))

    const { queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(queryByText('fussball.linkTitle')).toBeNull()
      expect(queryByText('fussball.previewAction')).toBeNull()
    })
  })

  it('never exposes ingestion controls even for a historical capable row', async () => {
    mockUseAuth.mockReturnValue(managerAuth('ADMIN'))
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) {
        return Promise.resolve([
          {
            id: 'link1',
            label: 'SV Musterstadt',
            provider: 'licensed_feed',
            externalUrl: 'https://www.fussball.de/mannschaft/example-team',
            externalTeamId: '011MI9MUDK',
            status: 'ACTIVE',
            lastSyncedAt: '2026-04-01T12:00:00Z',
            capabilities: { canManualSync: true, canImportRoster: true },
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText, queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('SV Musterstadt')).toBeTruthy()
      expect(queryByText('fussball.syncNow')).toBeNull()
    })
  })

  it('does not expose sync for a licensed-feed label without server capability', async () => {
    mockUseAuth.mockReturnValue(managerAuth('ADMIN'))
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) {
        return Promise.resolve([
          {
            id: 'link1',
            label: 'SV Musterstadt',
            provider: 'licensed_feed',
            externalUrl: 'https://feed.example.test/team/1',
            externalTeamId: '011MI9MUDK',
            status: 'ACTIVE',
            lastSyncedAt: null,
            capabilities: { canManualSync: false, canImportRoster: false },
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText, queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => expect(getByText('SV Musterstadt')).toBeTruthy())
    expect(queryByText('fussball.syncNow')).toBeNull()
  })

  it('does not offer sync for an admin-managed public-page reference', async () => {
    mockUseAuth.mockReturnValue(managerAuth('ADMIN'))
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) {
        return Promise.resolve([
          {
            id: 'link1',
            label: 'SV Musterstadt',
            provider: 'fussball_public_page',
            externalUrl: 'https://next.fussball.de/mannschaft/-/TEAM',
            externalTeamId: 'TEAM',
            status: 'ACTIVE',
            lastSyncedAt: null,
            capabilities: { canManualSync: false, canImportRoster: false },
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText, getByRole, queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('SV Musterstadt')).toBeTruthy()
      expect(queryByText('fussball.syncNow')).toBeNull()
    })
    fireEvent.press(getByRole('link', { name: 'FUSSBALL.DE · SV Musterstadt' }))
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/official-team-page',
      params: {
        url: 'https://next.fussball.de/mannschaft/-/TEAM',
        title: 'SV Musterstadt',
      },
    })
  })

  it('hides sync button for players on linked feeds', async () => {
    mockUseAuth.mockReturnValue(playerAuth())
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) {
        return Promise.resolve([
          {
            id: 'link1',
            label: 'SV Musterstadt',
            provider: 'fussball_public_page',
            externalUrl: 'https://www.fussball.de/mannschaft/example-team',
            externalTeamId: '011MI9MUDK',
            status: 'ACTIVE',
            lastSyncedAt: '2026-04-01T12:00:00Z',
            capabilities: { canManualSync: true, canImportRoster: true },
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText, queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('SV Musterstadt')).toBeTruthy()
      expect(queryByText('fussball.syncNow')).toBeNull()
    })
  })

  it('keeps fixture data out of the official-page reference screen', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockResolvedValue([])

    const { queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/integrations/fussball/team-links?teamId=t1')
    })
    expect(mockApi).not.toHaveBeenCalledWith(expect.stringContaining('/fixtures'))
    expect(queryByText('fussball.upcomingFixtures')).toBeNull()
  })

  it('shows empty state when no linked feeds', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation(() => Promise.resolve([]))

    const { getByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('fussball.noLinksTitle')).toBeTruthy()
    })
  })

  it('treats a historical error row as a passive reference instead of a failed feed', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) {
        return Promise.resolve([
          {
            id: 'link1',
            label: 'SV Broken',
            provider: 'fussball_public_page',
            externalUrl: 'https://www.fussball.de/mannschaft/broken-team',
            externalTeamId: '011ERR',
            status: 'ERROR',
            lastSyncedAt: '2026-03-01T12:00:00Z',
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText, queryByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('fussball.referenceLabel')).toBeTruthy()
    })
    expect(queryByText('ERROR')).toBeNull()
    expect(queryByText('fussball.linkErrorNotice')).toBeNull()
  })

  it('re-submits the original widget snippet and never replaces it with the root URL', async () => {
    mockUseAuth.mockReturnValue(managerAuth('OWNER'))
    const widgetId = '47c66e04-204b-49ec-8a54-9e7e429df6c4'
    const snippet = `<div class="fussballde_widget" data-id="${widgetId}" data-type="competition"></div>`
    mockApi.mockImplementation((url: string, options?: { method?: string }) => {
      if (url.endsWith('/team-preview')) {
        return Promise.resolve({
          input: snippet,
          provider: 'widget_embed',
          externalTeamId: `widget:${widgetId}:competition`,
          externalUrl: 'https://www.fussball.de/',
          widgetId,
          widgetType: 'competition',
          label: 'FUSSBALL.DE · live widget',
          competition: null,
          pitchAddress: null,
          sourceConfidence: 'official_widget',
        })
      }
      if (url === '/integrations/fussball/team-links' && options?.method === 'POST') {
        return Promise.resolve({ link: {} })
      }
      return Promise.resolve([])
    })

    const screen = render(<FussballLinkScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('fussball.inputPlaceholder'), snippet)
    fireEvent.press(screen.getByText('fussball.previewAction'))
    await waitFor(() => expect(screen.getByText('fussball.liveWidget')).toBeTruthy())
    fireEvent.press(screen.getByText('fussball.connectAction'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/integrations/fussball/team-links', {
        method: 'POST',
        headers: { 'x-club-id': 'c1' },
        body: {
          teamId: 't1',
          input: snippet,
          label: 'FUSSBALL.DE · live widget',
        },
      })
    })
  })
})
