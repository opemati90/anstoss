import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { CoachHome } from '../../src/components/home/CoachHome'

const mockShare = jest.fn()
const mockAlert = jest.fn()
let mockFixtures: Array<{
  id: string
  teamId: string
  eventId: string | null
  kickoffAt: string
}> = []

const mockSoon = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('react-native/Libraries/Share/Share', () => ({
  share: (...args: unknown[]) => mockShare(...args),
}))

jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
  (...args: unknown[]) => mockAlert(...args),
)

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
  ApiError: class MockApiError extends Error {
    status: number
    code?: string
    data?: unknown

    constructor(
      message: string,
      mockStatus: number,
      mockCode?: string,
      mockData?: unknown,
    ) {
      super(message)
      this.status = mockStatus
      this.code = mockCode
      this.data = mockData
    }
  },
  api: jest.fn((path: string) => {
    if (path.includes('/fixtures')) {
      return Promise.resolve(mockFixtures)
    }
    if (path.includes('scope=upcoming')) {
      // Return mix of match + training events within the next 7 days
      const soon = (offsetDays: number) =>
        new Date(Date.now() + offsetDays * 86400000).toISOString()
      return Promise.resolve([
        {
          id: 'e0',
          type: 'TRAINING',
          title: 'Recovery training',
          date: soon(1),
        },
        {
          id: 'm1',
          type: 'MATCH',
          title: 'vs FC Nord',
          date: soon(2),
          location: 'Stadion',
          readiness: {
            status: 'WATCH',
            score: 82,
            metrics: {
              squadSize: 18,
              responseCount: 15,
              yesCount: 13,
              maybeCount: 1,
              noCount: 1,
              pendingCount: 3,
              responseRate: 0.83,
              confirmedRate: 0.72,
              checkInCount: 0,
              injuryRiskCount: 0,
              suspensionRiskCount: 0,
            },
            signals: [
              { key: 'pending_replies', severity: 'info', count: 3, target: 18 },
            ],
            nudge: {
              recommended: true,
              reason: 'pending_replies',
              targetCount: 3,
              urgency: 'medium',
            },
          },
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
    if (path.includes('/remind-rsvp')) {
      return Promise.resolve({ sent: 3, nextAvailableAt: new Date().toISOString() })
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
  beforeEach(() => {
    const { router } = require('expo-router')
    router.push.mockReset()
    mockFixtures = [
      {
        id: 'fixture-1',
        teamId: 'team-1',
        eventId: 'm1',
        kickoffAt: mockSoon(2),
      },
    ]
    mockShare.mockReset()
    mockAlert.mockReset()
  })

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

  it('shares the readiness briefing for the next match', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Share briefing'))

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Anstoss readiness: vs FC Nord'),
        }),
      )
    })
  })

  it('sends a smart RSVP nudge from the readiness card', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Nudge now'))

    await waitFor(() => {
      const { api } = require('../../src/api/client')
      expect(api).toHaveBeenCalledWith(
        '/clubs/club-1/events/m1/remind-rsvp',
        { method: 'POST' },
      )
    })
    expect(mockAlert).toHaveBeenCalledWith('Nudge sent', expect.stringContaining('3'))
  })

  it('opens the lineup builder with the linked imported fixture', async () => {
    const { router } = require('expo-router')
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Build lineup'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lineup-builder',
      params: { teamId: 'team-1', fixtureId: 'fixture-1' },
    })
  })

  it('opens the lineup builder with team context when no fixture is linked', async () => {
    mockFixtures = []
    const { router } = require('expo-router')
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Build lineup'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lineup-builder',
      params: { teamId: 'team-1' },
    })
  })
})
