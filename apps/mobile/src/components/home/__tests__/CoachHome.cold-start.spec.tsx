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
      if (path.includes('/roster-ops')) {
        return Promise.resolve(null)
      }
      // No events
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
      if (path.includes('scope=nextMatch')) {
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
        ])
      }
      if (path.includes('scope=thisWeek')) {
        return Promise.resolve([
          {
            id: 'e1',
            type: 'TRAINING',
            title: 'Thursday training',
            date: new Date(Date.now() + 86400000 * 2).toISOString(),
          },
        ])
      }
      if (path.includes('/roster-ops')) return Promise.resolve(null)
      return Promise.resolve([])
    })

    const { findByText, queryByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )
    // Match should be visible
    expect(await findByText('vs FC Nord')).toBeTruthy()
    // Nudge should not be shown
    expect(queryByText(/No upcoming events yet/)).toBeNull()
  })
})
