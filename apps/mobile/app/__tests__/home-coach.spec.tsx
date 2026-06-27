import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, Share } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { CoachHome } from '../../src/components/home/CoachHome'

const mockShare = jest.fn((_content: unknown, _options?: unknown) =>
  Promise.resolve({ action: 'sharedAction' }),
)
const mockAlert = jest.fn()
const TEST_NOW_MS = Date.UTC(2026, 5, 20, 12, 0, 0)
let mockFixtures: Array<{
  id: string
  teamId: string
  eventId: string | null
  kickoffAt: string
}> = []
let mockUpcomingEvents: Array<Record<string, unknown>> | null = null
let mockRosterOps: Record<string, unknown> | null = null
let dateNowSpy: jest.SpyInstance<number, []>

const mockSoon = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString()

const mockDefaultReadiness = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
})

const mockDefaultUpcomingEvents = () => [
  {
    id: 'e0',
    type: 'TRAINING',
    title: 'Recovery training',
    date: mockSoon(1),
  },
  {
    id: 'm1',
    type: 'MATCH',
    title: 'vs FC Nord',
    date: mockSoon(2),
    location: 'Stadion',
    yesCount: 13,
    maybeCount: 1,
    noCount: 1,
    readiness: mockDefaultReadiness(),
  },
  {
    id: 'e1',
    type: 'TRAINING',
    title: 'Tuesday training',
    date: mockSoon(3),
  },
  {
    id: 'e2',
    type: 'TRAINING',
    title: 'Thursday training',
    date: mockSoon(5),
  },
]

const mockDefaultRosterOps = () => ({
  team: { id: 't1', displayName: 'U19', squadTarget: 18 },
  squad: Array.from({ length: 18 }).map((_, i) => ({ userId: `u${i}` })),
  operations: {
    trials: [],
    newPlayers: [],
    inactive: [],
  },
  medic: { active: [], recentlyCleared: [] },
  kit: { pending: [], recent: [] },
})

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('react-i18next', () => {
  const t = (k: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    if (opts && typeof opts === 'object' && typeof opts.defaultValue === 'string') {
      return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
        const v = (opts as Record<string, unknown>)[name]
        return v == null ? `{{${name}}}` : String(v)
      })
    }
    return k
  }
  return { useTranslation: () => ({ t, i18n: { language: 'en' } }) }
})

jest.spyOn(Share, 'share').mockImplementation(
  ((content: unknown, options?: unknown) =>
    options === undefined
      ? mockShare(content)
      : mockShare(content, options)) as typeof Share.share,
)

jest.spyOn(Alert, 'alert').mockImplementation(
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
      return Promise.resolve(mockUpcomingEvents ?? mockDefaultUpcomingEvents())
    }
    if (path.includes('season-stats')) {
      return Promise.resolve({ played: 0, wins: 0, draws: 0, losses: 0, winRate: 0, goalDifference: 0, recentForm: [] })
    }
    if (path.includes('/roster-ops')) {
      return Promise.resolve(mockRosterOps ?? mockDefaultRosterOps())
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
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(TEST_NOW_MS)
    const { router } = require('expo-router')
    router.push.mockReset()
    mockUpcomingEvents = null
    mockRosterOps = null
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

  afterEach(() => {
    dateNowSpy.mockRestore()
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

  it('surfaces the smart RSVP nudge as the coach next action', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('Chase 3 missing replies')).toBeTruthy()
    expect(await findByText('Send nudge')).toBeTruthy()
  })

  it('uses singular copy for one missing RSVP nudge', async () => {
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 17,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          metrics: {
            squadSize: 18,
            responseCount: 17,
            yesCount: 17,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 1,
            responseRate: 0.94,
            confirmedRate: 0.94,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [{ key: 'pending_replies', severity: 'info', count: 1, target: 18 }],
          nudge: {
            recommended: true,
            reason: 'pending_replies',
            targetCount: 1,
            urgency: 'medium',
          },
        }),
      },
    ]
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('Chase 1 missing reply')).toBeTruthy()
  })

  it('sends the RSVP nudge from the coach next-action panel', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Send nudge'))

    await waitFor(() => {
      const { api } = require('../../src/api/client')
      expect(api).toHaveBeenCalledWith(
        '/clubs/club-1/events/m1/remind-rsvp',
        { method: 'POST' },
      )
    })
  })

  it('surfaces create-event only when there are no upcoming events', async () => {
    mockUpcomingEvents = []
    const { router } = require('expo-router')
    const { findAllByText, findByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Create the next team event')).toBeTruthy()
    const createActions = await findAllByText('Create event')
    fireEvent.press(createActions[0])

    expect(router.push).toHaveBeenCalledWith('/create-event')
  })

  it('does not call a training-only week empty', async () => {
    mockUpcomingEvents = [
      {
        id: 'e-training',
        type: 'TRAINING',
        title: 'Recovery training',
        date: mockSoon(1),
      },
    ]
    const { router } = require('expo-router')
    const { findByText, queryByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Schedule the next match')).toBeTruthy()
    expect(queryByText('Create the next team event')).toBeNull()
    fireEvent.press(await findByText('Schedule match'))

    expect(router.push).toHaveBeenCalledWith('/create-event')
  })

  it('does not show the cold-start nudge when training exists outside this week', async () => {
    mockUpcomingEvents = [
      {
        id: 'e-training-later',
        type: 'TRAINING',
        title: 'Next block training',
        date: mockSoon(8),
      },
    ]
    const { findByText, queryByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Schedule the next match')).toBeTruthy()
    expect(queryByText(/No upcoming events yet/)).toBeNull()
  })


  it('prioritizes attendance when the next match is underway', async () => {
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(0),
        location: 'Stadion',
        yesCount: 18,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'WATCH',
          briefing: { key: 'event_started' },
          signals: [{ key: 'check_in_gap', severity: 'warning', count: 6, target: 18 }],
          nudge: null,
        }),
      },
    ]
    const { router } = require('expo-router')
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('Run arrivals for vs FC Nord')).toBeTruthy()
    fireEvent.press(await findByText('Open attendance'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'm1', attendance: '1' },
    })
  })

  it('prioritizes roster gaps before lineup work', async () => {
    mockRosterOps = {
      team: { id: 't1', displayName: 'U19', squadTarget: 18 },
      squad: Array.from({ length: 12 }).map((_, i) => ({ userId: `u${i}` })),
      operations: { trials: [], newPlayers: [], inactive: [] },
      medic: { active: [], recentlyCleared: [] },
      kit: { pending: [], recent: [] },
    }
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 12,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'READY',
          metrics: {
            squadSize: 18,
            responseCount: 18,
            yesCount: 18,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 0,
            responseRate: 1,
            confirmedRate: 1,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [],
          nudge: null,
        }),
      },
    ]
    const { router } = require('expo-router')
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('Fill 6 squad spots')).toBeTruthy()
    fireEvent.press(await findByText('Open squad'))

    expect(router.push).toHaveBeenCalledWith('/(tabs)/roster')
  })

  it('uses singular copy for one open roster spot', async () => {
    mockRosterOps = {
      team: { id: 't1', displayName: 'U19', squadTarget: 18 },
      squad: Array.from({ length: 17 }).map((_, i) => ({ userId: `u${i}` })),
      operations: { trials: [], newPlayers: [], inactive: [] },
      medic: { active: [], recentlyCleared: [] },
      kit: { pending: [], recent: [] },
    }
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 17,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'READY',
          metrics: {
            squadSize: 17,
            responseCount: 17,
            yesCount: 17,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 0,
            responseRate: 1,
            confirmedRate: 1,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [],
          nudge: null,
        }),
      },
    ]
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('Fill 1 squad spot')).toBeTruthy()
    expect(await findByText('1 spot open')).toBeTruthy()
  })

  it('routes no-squad readiness to roster setup instead of lineup', async () => {
    mockRosterOps = {}
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 0,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'NEEDS_SETUP',
          metrics: {
            squadSize: 0,
            responseCount: 0,
            yesCount: 0,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 0,
            responseRate: 0,
            confirmedRate: 0,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [{ key: 'no_squad', severity: 'critical' }],
          nudge: null,
        }),
      },
    ]
    const { router } = require('expo-router')
    const { findByText, queryByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Set up the squad for vs FC Nord')).toBeTruthy()
    expect(queryByText('Build the lineup for vs FC Nord')).toBeNull()
    expect(queryByText('Build lineup')).toBeNull()
    fireEvent.press(await findByText('Open squad'))

    expect(router.push).toHaveBeenCalledWith('/(tabs)/roster')
  })

  it('routes at-risk readiness to event review instead of lineup', async () => {
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 18,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'AT_RISK',
          metrics: {
            squadSize: 18,
            responseCount: 18,
            yesCount: 18,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 0,
            responseRate: 1,
            confirmedRate: 1,
            checkInCount: 0,
            injuryRiskCount: 2,
            suspensionRiskCount: 0,
          },
          signals: [{ key: 'availability_risks', severity: 'warning', count: 2 }],
          nudge: null,
        }),
      },
    ]
    const { router } = require('expo-router')
    const { findByText, queryByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Review blockers for vs FC Nord')).toBeTruthy()
    expect(queryByText('Build the lineup for vs FC Nord')).toBeNull()
    expect(queryByText('Build lineup')).toBeNull()
    fireEvent.press(await findByText('Open event'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'm1' },
    })
  })

  it('uses readiness pending counts when roster ops are unavailable', async () => {
    mockRosterOps = {}
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 14,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'WATCH',
          metrics: {
            squadSize: 18,
            responseCount: 14,
            yesCount: 14,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 4,
            responseRate: 0.78,
            confirmedRate: 0.78,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [{ key: 'pending_replies', severity: 'info', count: 4, target: 18 }],
          nudge: null,
        }),
      },
    ]
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    expect(await findByText('Review 4 pending replies')).toBeTruthy()
    expect(await findByText('4 awaiting RSVP')).toBeTruthy()
    expect(await findByText('4 pending')).toBeTruthy()
  })

  it('moves to lineup when the match is ready', async () => {
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 18,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'READY',
          metrics: {
            squadSize: 18,
            responseCount: 18,
            yesCount: 18,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 0,
            responseRate: 1,
            confirmedRate: 1,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [],
          nudge: null,
        }),
      },
    ]
    const { router } = require('expo-router')
    const { findAllByText, findByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Build the lineup for vs FC Nord')).toBeTruthy()
    const lineupActions = await findAllByText('Build lineup')
    fireEvent.press(lineupActions[0])

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lineup-builder',
      params: { teamId: 'team-1', fixtureId: 'fixture-1' },
    })
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
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 18,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'READY',
          metrics: {
            squadSize: 18,
            responseCount: 18,
            yesCount: 18,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 0,
            responseRate: 1,
            confirmedRate: 1,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [],
          nudge: null,
        }),
      },
    ]
    const { router } = require('expo-router')
    const { findAllByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    const lineupActions = await findAllByText('Build lineup')
    fireEvent.press(lineupActions[0])

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lineup-builder',
      params: { teamId: 'team-1', fixtureId: 'fixture-1' },
    })
  })

  it('opens the lineup builder with team context when no fixture is linked', async () => {
    mockUpcomingEvents = [
      {
        id: 'm1',
        type: 'MATCH',
        title: 'vs FC Nord',
        date: mockSoon(2),
        yesCount: 18,
        maybeCount: 0,
        noCount: 0,
        readiness: mockDefaultReadiness({
          status: 'READY',
          metrics: {
            squadSize: 18,
            responseCount: 18,
            yesCount: 18,
            maybeCount: 0,
            noCount: 0,
            pendingCount: 0,
            responseRate: 1,
            confirmedRate: 1,
            checkInCount: 0,
            injuryRiskCount: 0,
            suspensionRiskCount: 0,
          },
          signals: [],
          nudge: null,
        }),
      },
    ]
    mockFixtures = []
    const { router } = require('expo-router')
    const { findAllByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))

    const lineupActions = await findAllByText('Build lineup')
    fireEvent.press(lineupActions[0])

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lineup-builder',
      params: { teamId: 'team-1' },
    })
  })
})
