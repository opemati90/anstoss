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
let mockEventsFail = false
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

const mockDefaultRosterOps = (overrides: Record<string, unknown> = {}) => ({
  team: { id: 't1', displayName: 'U19', squadTarget: 18 },
  squadCount: 20,
  squad: Array.from({ length: 20 }).map((_, i) => ({ userId: `u${i}`, name: `Player ${i}` })),
  operations: {
    trials: [],
    newPlayers: [],
    inactive: [],
    pendingCoaches: [],
  },
  medic: { active: [], recentlyCleared: [] },
  kit: {
    pending: [
      {
        id: 'duty-1',
        kind: 'JERSEY_CLEANUP',
        status: 'PENDING',
        assignedUserId: 'u3',
        dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
    ],
    recent: [],
  },
  ...overrides,
})

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  // The real useFocusEffect runs its callback on mount (and on refocus).
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))

// home revamp: CoachHome reads the auth token (events socket) and roles.
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    token: null,
    activeClub: { role: 'COACH', club: { id: 'c1' } },
    activeTeamAccess: { role: 'HEAD_COACH' },
  }),
}))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'en', getAppLocale: () => 'en-GB' }))
jest.mock('../../src/hooks/useEventsSocket', () => ({ useEventsSocket: jest.fn() }))

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
      if (mockEventsFail) return Promise.reject(new Error('offline'))
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
    mockEventsFail = false
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

  const renderCoach = () => render(wrap(<CoachHome clubId="c1" teamId="team-1" />))

  it('shows a layout-shaped skeleton before the first load resolves', () => {
    const { getByTestId } = renderCoach()
    expect(getByTestId('home-skeleton', { includeHiddenElements: true })).toBeTruthy()
  })

  it('leads with the next match and its kick-off time', async () => {
    const { findByText, getAllByText, getByText } = renderCoach()
    // Redesign screen 08: the match is the club hero, then "Before the match".
    expect(await findByText('Before the match')).toBeTruthy()
    expect(getAllByText('vs FC Nord').length).toBeGreaterThan(0)
    expect(getByText('Match')).toBeTruthy()
  })

  it('spells the squad split out instead of bare numbers', async () => {
    const { findByText, getByText, getByLabelText } = renderCoach()
    const hidden = { includeHiddenElements: true }
    expect(await findByText('13 going', hidden)).toBeTruthy()
    expect(getByText('1 maybe', hidden)).toBeTruthy()
    expect(getByText('3 no reply', hidden)).toBeTruthy()
    // Absagen take no bar segment but are still counted.
    expect(getByText('1 declined', hidden)).toBeTruthy()
    expect(getByLabelText('13 going, 1 maybe, 3 no reply, 1 declined')).toBeTruthy()
  })

  it('makes reminding the open replies the primary action', async () => {
    const { findByLabelText, getByText } = renderCoach()
    fireEvent.press(await findByLabelText('Remind 3 players'))
    expect(getByText("3 haven't replied yet")).toBeTruthy()
    const { api } = require('../../src/api/client')
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/clubs/c1/events/m1/remind-rsvp', { method: 'POST' })
    })
    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Nudge sent', 'Sent RSVP reminders to 3 players.')
    })
  })

  it('opens the lineup builder with the linked fixture from the secondary action', async () => {
    const { findByText } = renderCoach()
    fireEvent.press(await findByText('Set the lineup'))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/lineup-builder',
      params: { teamId: 'team-1', fixtureId: 'fixture-1' },
    })
  })

  it('switches to the lineup once a reminder is on cooldown and says when the next is possible', async () => {
    mockUpcomingEvents = mockDefaultUpcomingEvents().map((event) =>
      event.id === 'm1'
        ? {
            ...event,
            readiness: mockDefaultReadiness({
              nudge: {
                recommended: false,
                reason: 'cooldown',
                targetCount: 3,
                nextAvailableAt: new Date(TEST_NOW_MS + 3 * 3600000).toISOString(),
              },
            }),
          }
        : event,
    )
    const { findByText, queryByLabelText } = renderCoach()
    expect(await findByText(/Reminder sent\. You can send the next one from/)).toBeTruthy()
    expect(queryByLabelText('Remind 3 players')).toBeNull()
    expect(await findByText('Set the lineup')).toBeTruthy()
  })

  it('opens attendance as the primary action once kick-off is close', async () => {
    mockUpcomingEvents = mockDefaultUpcomingEvents().map((event) =>
      event.id === 'm1' ? { ...event, date: new Date(TEST_NOW_MS + 30 * 60000).toISOString() } : event,
    )
    const { findByText } = renderCoach()
    fireEvent.press(await findByText('Open attendance'))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'm1', attendance: '1' },
    })
  })

  it('shares the readiness briefing from the match card', async () => {
    const { findByLabelText } = renderCoach()
    fireEvent.press(await findByLabelText('Share briefing'))
    await waitFor(() => expect(mockShare).toHaveBeenCalled())
  })

  it('ends with one quiet line for the next other event and a link to all events', async () => {
    const { findByText } = renderCoach()
    // The recovery training falls before the match, so it is "Next up".
    expect(await findByText('Next up')).toBeTruthy()
    expect(await findByText(/Recovery training/)).toBeTruthy()
    fireEvent.press(await findByText('All events'))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/(tabs)/events')
  })

  it('surfaces only what the data proves needs attention', async () => {
    mockRosterOps = mockDefaultRosterOps({
      medic: {
        active: [{ id: 'i1', title: 'Hamstring', user: { name: 'Tim Weber' } }],
        recentlyCleared: [],
      },
      operations: {
        trials: [{ userId: 't1', name: 'Jonas Wagner' }],
        newPlayers: [],
        inactive: [],
        pendingCoaches: [],
      },
      // The team runs the rota (last wash was weeks ago) but nobody has the
      // wash for this match.
      kit: {
        pending: [],
        recent: [
          {
            id: 'old',
            kind: 'JERSEY_CLEANUP',
            status: 'COMPLETED',
            assignedUserId: 'u1',
            dueDate: new Date(TEST_NOW_MS - 20 * 86400000).toISOString(),
          },
        ],
      },
    })
    const { findByText, getByText, queryByText } = renderCoach()
    expect(await findByText('Needs attention')).toBeTruthy()
    expect(getByText('1 injured')).toBeTruthy()
    expect(getByText('Tim Weber')).toBeTruthy()
    expect(getByText(/No one on kit wash for/)).toBeTruthy()
    expect(getByText('1 trial players to review')).toBeTruthy()
    // A full squad never produces a "fill squad spots" nag.
    expect(queryByText(/Squad:/)).toBeNull()
    expect(queryByText(/Fill/)).toBeNull()
  })

  // ── home review fixes ──
  it('only chases the kit wash for teams that use duties, counts a done wash, and opens Aufgaben', async () => {
    // No duty ever assigned: the team does not run the rota, no nag.
    mockRosterOps = mockDefaultRosterOps({ kit: { pending: [], recent: [] } })
    const first = renderCoach()
    expect(await first.findByText('Before the match')).toBeTruthy()
    expect(first.queryByText(/No one on kit wash for/)).toBeNull()
    first.unmount()

    // Wash already done around this match: covered.
    mockRosterOps = mockDefaultRosterOps({
      kit: {
        pending: [],
        recent: [
          {
            id: 'done',
            kind: 'JERSEY_CLEANUP',
            status: 'COMPLETED',
            assignedUserId: 'u2',
            dueDate: mockSoon(2),
            completedAt: mockSoon(2),
          },
        ],
      },
    })
    const second = renderCoach()
    expect(await second.findByText('Before the match')).toBeTruthy()
    expect(second.queryByText(/No one on kit wash for/)).toBeNull()
    second.unmount()

    // Rota in use, nothing for this match: the row opens the assign action.
    mockRosterOps = mockDefaultRosterOps({
      kit: {
        pending: [
          {
            id: 'far',
            kind: 'JERSEY_CLEANUP',
            status: 'PENDING',
            assignedUserId: 'u2',
            dueDate: mockSoon(20),
          },
        ],
        recent: [],
      },
    })
    const third = renderCoach()
    fireEvent.press(await third.findByText(/No one on kit wash for/))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/aufgaben')
  })

  it('names the day of a reminder cooldown that ends tomorrow, not just a time', async () => {
    mockUpcomingEvents = mockDefaultUpcomingEvents().map((event) =>
      event.id === 'm1'
        ? {
            ...event,
            readiness: mockDefaultReadiness({
              nudge: {
                recommended: false,
                reason: 'cooldown',
                targetCount: 3,
                nextAvailableAt: new Date(TEST_NOW_MS + 26 * 3600000).toISOString(),
              },
            }),
          }
        : event,
    )
    const { findByText } = renderCoach()
    const note = await findByText(/You can send the next one from/)
    const when = new Date(TEST_NOW_MS + 26 * 3600000)
    const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(when)
    expect(String(note.props.children)).toContain(weekday)
  })

  it('makes "Invite players" the primary action while the squad is empty', async () => {
    mockRosterOps = mockDefaultRosterOps({ squadCount: 0, squad: [] })
    mockUpcomingEvents = mockDefaultUpcomingEvents().map((event) =>
      event.id === 'm1'
        ? { ...event, yesCount: 0, maybeCount: 0, noCount: 0, readiness: undefined, squadSize: 0 }
        : event,
    )
    const { findByLabelText } = renderCoach()
    fireEvent.press(await findByLabelText('Invite players'))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/invite')
  })

  it('renders only the new team when the team switches during an in-flight load', async () => {
    const { api } = require('../../src/api/client')
    const original = api.getMockImplementation()
    let releaseOld: (() => void) | null = null
    api.mockImplementation((path: string) => {
      if (path.includes('teamId=team-old') && path.includes('scope=upcoming')) {
        // The old team's feed answers late, after the switch.
        return new Promise((resolve) => {
          releaseOld = () =>
            resolve([
              { id: 'old-m', type: 'MATCH', title: 'vs Old Opponent', date: mockSoon(2), yesCount: 9 },
            ])
        })
      }
      if (path.includes('teamId=team-new') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          { id: 'new-m', type: 'MATCH', title: 'vs SV Babelsberg 03', date: mockSoon(3), yesCount: 4 },
        ])
      }
      return original(path)
    })
    try {
      const view = render(wrap(<CoachHome clubId="c1" teamId="team-old" />))
      view.rerender(wrap(<CoachHome clubId="c1" teamId="team-new" />))
      expect((await view.findAllByText('vs SV Babelsberg 03')).length).toBeGreaterThan(0)
      await React.act(async () => {
        releaseOld?.()
        await Promise.resolve()
      })
      expect(view.queryByText('vs Old Opponent')).toBeNull()
      expect(view.getAllByText('vs SV Babelsberg 03').length).toBeGreaterThan(0)
    } finally {
      api.mockImplementation(original)
    }
  })
  // ── end home review fixes ──

  it('hides the attention section when nothing needs the coach', async () => {
    const { findByText, queryByText } = renderCoach()
    expect(await findByText('Before the match')).toBeTruthy()
    expect(queryByText('Needs attention')).toBeNull()
  })

  it('flags a short squad from roster-ops squadCount only when truly short', async () => {
    mockRosterOps = mockDefaultRosterOps({ squadCount: 11 })
    const { findByText } = renderCoach()
    expect(await findByText('Squad: 11 of 18')).toBeTruthy()
  })

  it('asks for the next match when only training is planned', async () => {
    mockUpcomingEvents = mockDefaultUpcomingEvents().filter((event) => event.type !== 'MATCH')
    const { findByText } = renderCoach()
    expect(await findByText('Schedule the next match')).toBeTruthy()
    fireEvent.press(await findByText('Schedule match'))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/create-event')
  })

  it('shows a composed empty state when nothing is planned', async () => {
    mockUpcomingEvents = []
    const { findByText } = renderCoach()
    expect(await findByText('Nothing planned yet')).toBeTruthy()
    expect(await findByText('Create event')).toBeTruthy()
  })

  it('shows the first-start checklist when the squad is empty and nothing is planned', async () => {
    mockUpcomingEvents = []
    mockRosterOps = mockDefaultRosterOps({ squadCount: 0, squad: [] })
    const { findByText, getByText, getByLabelText } = renderCoach()
    // Redesign screen 26.
    expect(await findByText('Welcome, coach.')).toBeTruthy()
    expect(getByText('Club created')).toBeTruthy()
    fireEvent.press(getByLabelText(/Invite your team/))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/invite')
  })

  it('shows an inline error with retry when the schedule fails to load', async () => {
    mockEventsFail = true
    const { findByText, getByLabelText } = renderCoach()
    expect(await findByText("Couldn't load your team's week")).toBeTruthy()
    mockEventsFail = false
    fireEvent.press(getByLabelText('Try again'))
    expect(await findByText('Before the match')).toBeTruthy()
  })

  it('offers announcing the meeting point before the match', async () => {
    const { findByLabelText } = renderCoach()
    fireEvent.press(await findByLabelText(/Announce meeting point/))
  })
})
