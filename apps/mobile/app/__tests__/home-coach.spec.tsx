import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { CoachHome } from '../../src/components/home/CoachHome'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('scope=upcoming')) {
      // Return mix of match + training events within the next 7 days
      const soon = (offsetDays: number) =>
        new Date(Date.now() + offsetDays * 86400000).toISOString()
      return Promise.resolve([
        {
          id: 'm1',
          type: 'MATCH',
          title: 'vs FC Nord',
          date: soon(2),
          location: 'Stadion',
        },
        {
          id: 'e1',
          type: 'TRAINING',
          title: 'Tuesday training',
          date: soon(3),
        },
        {
          id: 'e2',
          type: 'TRAINING',
          title: 'Thursday training',
          date: soon(5),
        },
      ])
    }
    if (path.includes('season-stats')) {
      return Promise.resolve({ played: 0, wins: 0, draws: 0, losses: 0, winRate: 0, goalDifference: 0, recentForm: [] })
    }
    if (path.includes('/roster-ops')) {
      return Promise.resolve({
        team: { id: 't1', displayName: 'U19', squadTarget: 18 },
        squad: Array.from({ length: 18 }).map((_, i) => ({ userId: `u${i}` })),
        operations: {
          trials: Array.from({ length: 2 }).map((_, i) => ({ userId: `t${i}` })),
          newPlayers: [],
          inactive: [],
        },
        medic: { active: [], recentlyCleared: [] },
        kit: { pending: [], recent: [] },
      })
    }
    return Promise.resolve([])
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

describe('CoachHome', () => {
  it('renders next match with kick-off eyebrow + title', async () => {
    const { findByText, findAllByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )
    const titleHits = await findAllByText('vs FC Nord')
    expect(titleHits.length).toBeGreaterThan(0)
    // Eyebrow uses locale-formatted day + time joined by ` · ` so we can't
    // pin a specific clock format across CI timezones. Match the separator
    // pattern instead — that's what the eyebrow renderer always produces.
    expect(await findByText(/[A-Z]{3}\s·\s/)).toBeTruthy()
  })

  it("renders this week's events", async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Tuesday training')).toBeTruthy()
    expect(await findByText('Thursday training')).toBeTruthy()
  })

  it('renders roster snapshot counts', async () => {
    const { findAllByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    // Active squad count (18) renders in SquadStat — may appear in multiple places (target, active)
    expect((await findAllByText('18')).length).toBeGreaterThan(0)
  })
})
