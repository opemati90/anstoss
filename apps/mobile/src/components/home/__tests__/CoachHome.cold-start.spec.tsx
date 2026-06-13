import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { CoachHome } from '../CoachHome'

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
  return { useTranslation: () => ({ t, i18n: { language: 'en' } }) }
})

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

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

describe('CoachHome — cold-start empty-state nudge', () => {
  beforeEach(() => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/roster-ops')) return Promise.resolve(null)
      if (path.includes('season-stats')) {
        return Promise.resolve({ played: 0, wins: 0, draws: 0, losses: 0, winRate: 0, goalDifference: 0, recentForm: [] })
      }
      return Promise.resolve([])
    })
  })

  it('shows empty-state nudge when no upcoming events exist', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    expect(
      await findByText(/No upcoming events yet/),
    ).toBeTruthy()
    // The nudge text includes the full CTA hint
    expect(
      await findByText(/schedule your first training or match/),
    ).toBeTruthy()
  })

  it('hides empty-state nudge when upcoming events exist', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'm1',
            type: 'MATCH',
            title: 'vs FC Nord',
            date: new Date(Date.now() + 86400000 * 3).toISOString(),
            location: 'Stadion',
            yesCount: 0,
            maybeCount: 0,
            noCount: 0,
          },
          {
            id: 'e1',
            type: 'TRAINING',
            title: 'Thursday training',
            date: new Date(Date.now() + 86400000 * 2).toISOString(),
          },
        ])
      }
      if (path.includes('/roster-ops')) return Promise.resolve(null)
      if (path.includes('season-stats')) {
        return Promise.resolve({ played: 5, wins: 3, draws: 1, losses: 1, winRate: 60, goalDifference: 4, recentForm: ['W', 'D', 'W', 'L', 'W'] })
      }
      return Promise.resolve([])
    })

    const { findAllByText, queryByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )
    // Match should be visible (may appear in text + accessibilityLabel)
    expect(await findAllByText('vs FC Nord')).toBeTruthy()
    // Nudge should not be shown
    expect(queryByText(/No upcoming events yet/)).toBeNull()
  })
})
