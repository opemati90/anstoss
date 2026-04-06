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

  it('renders link form for coaches', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation(() => Promise.resolve([]))

    const { getByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('fussball.linkTitle')).toBeTruthy()
      expect(getByText('fussball.previewAction')).toBeTruthy()
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

  it('shows linked feeds and allows coaches to sync', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) {
        return Promise.resolve([
          {
            id: 'link1',
            label: 'SV Musterstadt',
            externalTeamId: '011MI9MUDK',
            status: 'ACTIVE',
            lastSyncedAt: '2026-04-01T12:00:00Z',
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('SV Musterstadt')).toBeTruthy()
      expect(getByText('fussball.syncNow')).toBeTruthy()
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
            externalTeamId: '011MI9MUDK',
            status: 'ACTIVE',
            lastSyncedAt: '2026-04-01T12:00:00Z',
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

  it('renders upcoming fixtures as tappable cards', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) return Promise.resolve([])
      if (url.includes('fixtures')) {
        return Promise.resolve([
          {
            id: 'fix1',
            teamId: 't1',
            competition: 'Kreisliga A',
            homeTeam: 'SV Musterstadt',
            awayTeam: 'FC Beispiel',
            kickoffAt: '2026-04-12T14:00:00Z',
            venueName: 'Sportplatz Am Wald',
            pitchAddress: null,
            status: 'scheduled',
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('SV Musterstadt vs FC Beispiel')).toBeTruthy()
    })

    fireEvent.press(getByText('SV Musterstadt vs FC Beispiel'))
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/match-detail',
      params: { fixtureId: 'fix1', teamId: 't1' },
    })
  })

  it('shows empty state when no linked feeds', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation(() => Promise.resolve([]))

    const { getByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('fussball.noLinksTitle')).toBeTruthy()
    })
  })

  it('shows error status indicator on errored links', async () => {
    mockUseAuth.mockReturnValue(coachAuth())
    mockApi.mockImplementation((url: string) => {
      if (url.includes('team-links')) {
        return Promise.resolve([
          {
            id: 'link1',
            label: 'SV Broken',
            externalTeamId: '011ERR',
            status: 'ERROR',
            lastSyncedAt: '2026-03-01T12:00:00Z',
          },
        ])
      }
      return Promise.resolve([])
    })

    const { getByText } = render(<FussballLinkScreen />)

    await waitFor(() => {
      expect(getByText('ERROR')).toBeTruthy()
      expect(getByText('fussball.linkErrorNotice')).toBeTruthy()
    })
  })
})
