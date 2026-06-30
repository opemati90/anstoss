import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PlayerHome } from '../PlayerHome'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => {
  const t = (k: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    if (opts && typeof opts === 'object' && typeof opts.defaultValue === 'string') {
      return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
        const v = (opts as Record<string, unknown>)[name]
        return v == null ? '' : String(v)
      })
    }
    return k
  }
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../../i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}))

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../../api/client', () => ({
  api: (...a: unknown[]) => mockApi(...a),
}))

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Julian Becker' },
    activeClub: { club: { id: 'club-1', name: 'SV Albatros' }, role: 'PLAYER' },
    activeTeamAccess: {
      team: { id: 'team-1', displayName: 'Senior Team' },
      role: 'PLAYER',
    },
    activeTeamId: 'team-1',
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 375, height: 812 },
    }}
  >
    {ui}
  </SafeAreaProvider>
)

describe('PlayerHome — cold-start welcome card', () => {
  beforeEach(() => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/announcements')) {
        return Promise.resolve([])
      }
      if (path.includes('/channels')) {
        return Promise.resolve([])
      }
      if (path.includes('/fixtures')) {
        return Promise.resolve([])
      }
      // No upcoming events by default
      return Promise.resolve([])
    })
  })

  it('shows welcome card when no upcoming events exist', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    // Welcome card with club name
    expect(
      await findByText(/Welcome to SV Albatros!/),
    ).toBeTruthy()
    // Subtitle
    expect(
      await findByText(/Your upcoming matches will appear here/),
    ).toBeTruthy()
  })

  it('hides welcome card when at least one event exists', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'e1',
            type: 'TRAINING',
            title: 'Tuesday training',
            date: new Date(Date.now() + 86400000 * 2).toISOString(),
            myRsvp: null,
            yesCount: 0,
            maybeCount: 0,
            noCount: 0,
          },
        ])
      }
      if (path.includes('/announcements')) return Promise.resolve([])
      if (path.includes('/channels')) return Promise.resolve([])
      if (path.includes('/fixtures')) return Promise.resolve([])
      return Promise.resolve([])
    })

    const { findByText, queryByText } = render(
      wrap(<PlayerHome clubId="club-1" teamId="team-1" />),
    )
    // Event should be visible
    expect(await findByText('Tuesday training')).toBeTruthy()
    // Welcome card should not be shown
    expect(queryByText(/Welcome to SV Albatros!/)).toBeNull()
  })
})
