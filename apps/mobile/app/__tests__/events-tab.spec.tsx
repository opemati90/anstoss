import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import EventsScreen from '../(tabs)/events/index'
import { api } from '../../src/api/client'

const mockRouterPush = jest.fn()
const authState: {
  activeClub: any
  activeTeamId: string | null
  activeTeamAccess: any
  activeRoleMode: string | null
  token: string | null
} = {
  activeClub: null,
  activeTeamId: 'team-1',
  activeTeamAccess: null,
  activeRoleMode: null,
  token: null,
}

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
  useFocusEffect: (callback: () => void) => {
    const React = require('react')
    React.useEffect(() => {
      callback()
    }, [callback])
  },
}))

jest.mock('../../src/utils/haptics', () => {
  const noop = () => undefined
  const Haptics = { select: noop, tap: noop, tapMedium: noop, tapHeavy: noop, success: noop, warn: noop, fail: noop }
  return { Haptics, default: Haptics }
})

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'eventFlow.list.title': 'Schedule',
        'eventFlow.list.parentTitle': "Your children's schedule",
        'eventFlow.list.create': 'Add event',
        'eventFlow.list.upcoming': 'Upcoming',
        'eventFlow.list.past': 'Past',
        'eventFlow.list.emptyTitle': 'Nothing scheduled yet',
        'eventFlow.rsvp.yes': 'In',
        'eventFlow.rsvp.maybe': 'Maybe',
        'eventFlow.rsvp.no': 'Out',
        'eventFlow.absence.confirm': "Can't make it",
        'eventFlow.reason.injured': 'Injured',
        'eventFlow.type.TRAINING': 'Training',
        'eventFlow.type.MATCH': 'Match',
      }
      if (key === 'eventFlow.time.meeting') return `Meet ${options?.time}`
      if (key === 'eventFlow.time.kickoff') return `Kick-off ${options?.time}`
      if (key === 'eventFlow.matchTitle.away') return `Away at ${options?.opponent}`
      if (key === 'eventFlow.matchTitle.home') return `Home vs ${options?.opponent}`
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

jest.mock('../../src/hooks/useEventsSocket', () => ({
  useEventsSocket: () => undefined,
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F' }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() => Promise.resolve([])),
  API_URL: 'http://localhost',
}))

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

const mockApi = api as jest.Mock

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    clubId: 'club-1',
    teamId: 'team-1',
    title: 'Training',
    type: 'TRAINING',
    date: '2030-06-22T17:00:00.000Z',
    location: 'Sportplatz Am Wald',
    notes: null,
    createdById: 'coach-1',
    createdAt: '2030-06-01T10:00:00.000Z',
    responseCount: 0,
    yesCount: 0,
    maybeCount: 0,
    noCount: 0,
    squadSize: 18,
    myRsvp: null,
    ...overrides,
  }
}

function setRole(role: 'COACH' | 'PLAYER' | 'PARENT') {
  authState.activeClub = {
    role,
    permissions: role === 'COACH' ? { EVENTS: true } : {},
    club: { id: 'club-1', name: 'SV Albatros' },
  }
  authState.activeRoleMode = role
  authState.activeTeamId = role === 'PARENT' ? null : 'team-1'
}

describe('EventsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockReset()
    mockApi.mockResolvedValue([])
  })

  it('gives coaches the + in the header and a reply summary instead of a control', async () => {
    setRole('COACH')
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/clubs/club-1/events?')
          ? [makeEvent({ yesCount: 12, responseCount: 15 })]
          : [],
      ),
    )
    const screen = render(<EventsScreen />)

    // Design 10: the Zusagen as one number ("12 dabei"); open replies are read out.
    expect(await screen.findByText('12')).toBeTruthy()
    expect(screen.getByText('eventFlow.list.going')).toBeTruthy()
    expect(screen.getByLabelText(/eventFlow.list.openCount/)).toBeTruthy()
    expect(screen.getByLabelText('Add event')).toBeTruthy()
    expect(screen.queryByLabelText('In')).toBeNull()

    fireEvent.press(screen.getByLabelText('Add event'))
    expect(mockRouterPush).toHaveBeenCalledWith('/create-event')
  })

  it('shows Treff and Anstoß on match rows and opens the one event screen', async () => {
    setRole('PLAYER')
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/clubs/club-1/events?')
          ? [
              makeEvent({
                id: 'match-1',
                type: 'MATCH',
                title: '@ SV Babelsberg 03',
                opponent: 'SV Babelsberg 03',
                homeAway: 'AWAY',
                date: '2030-06-23T13:00:00.000Z',
                meetingAt: '2030-06-23T12:00:00.000Z',
              }),
            ]
          : [],
      ),
    )
    const screen = render(<EventsScreen />)

    const row = await screen.findByLabelText(/Away at SV Babelsberg 03.*Meet .*Kick-off/)
    fireEvent.press(row)
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'match-1' },
    })
    // No more fixture heuristic: the list never routes a match to match-detail.
    expect(mockRouterPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/match-detail' }),
    )
  })

  it('lets a player answer in the row', async () => {
    setRole('PLAYER')
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') return Promise.resolve({})
      return Promise.resolve(path.startsWith('/clubs/club-1/events?') ? [makeEvent()] : [])
    })
    const screen = render(<EventsScreen />)

    fireEvent.press(await screen.findByLabelText('In'))

    await waitFor(
      () =>
        expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/event-1/rsvp', {
          method: 'PUT',
          body: { status: 'YES' },
        }),
      { timeout: 2000 },
    )
  })

  it('tells a player how many events still wait for an answer', async () => {
    setRole('PLAYER')
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/clubs/club-1/events?')
          ? [makeEvent(), makeEvent({ id: 'event-2', myRsvp: 'YES' })]
          : [],
      ),
    )
    const screen = render(<EventsScreen />)
    expect(await screen.findByText('eventFlow.list.awaitingReply')).toBeTruthy()
  })

  it('filters the list by type with the chip row', async () => {
    setRole('COACH')
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/clubs/club-1/events?')
          ? [
              makeEvent({ id: 'training-1', title: 'Abschluss' }),
              makeEvent({ id: 'match-1', type: 'MATCH', title: 'Derby', opponent: 'SV Nord', homeAway: 'HOME' }),
            ]
          : [],
      ),
    )
    const screen = render(<EventsScreen />)
    expect(await screen.findByText('Abschluss')).toBeTruthy()
    fireEvent.press(screen.getByText('eventFlow.list.filterMatches'))
    await waitFor(() => expect(screen.queryByText('Abschluss')).toBeNull())
    expect(screen.getByText('Home vs SV Nord')).toBeTruthy()
  })

  it('asks for a reason before sending an Absage', async () => {
    setRole('PLAYER')
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') return Promise.resolve({})
      return Promise.resolve(path.startsWith('/clubs/club-1/events?') ? [makeEvent()] : [])
    })
    const screen = render(<EventsScreen />)

    fireEvent.press(await screen.findByLabelText('Out'))
    expect(mockApi).not.toHaveBeenCalledWith(expect.stringContaining('/rsvp'), expect.anything())

    fireEvent.press(await screen.findByTestId('absence-reason-injured'))
    fireEvent.press(screen.getByTestId('absence-confirm'))

    await waitFor(
      () =>
        expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/event-1/rsvp', {
          method: 'PUT',
          body: { status: 'NO', reason: 'injured' },
        }),
      { timeout: 2000 },
    )
  })

  it('gives parents one row per child and answers with the childUserId', async () => {
    setRole('PARENT')
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') return Promise.resolve({})
      if (path === '/me/children-events') {
        return Promise.resolve([
          {
            ...makeEvent({ id: 'ev-1', title: 'Training' }),
            teamName: 'U11',
            teamDisplayName: 'U11',
            childUserId: 'kid-mia',
            childName: 'Mia Weber',
            childRsvp: null,
          },
          {
            ...makeEvent({ id: 'ev-1', title: 'Training' }),
            teamName: 'U11',
            teamDisplayName: 'U11',
            childUserId: 'kid-ben',
            childName: 'Ben Weber',
            childRsvp: 'YES',
          },
        ])
      }
      return Promise.resolve([])
    })
    const screen = render(<EventsScreen />)

    expect(await screen.findByText("Your children's schedule")).toBeTruthy()
    expect(screen.getByText('Mia Weber · U11')).toBeTruthy()
    expect(screen.getByText('Ben Weber · U11')).toBeTruthy()
    expect(screen.queryByLabelText('Add event')).toBeNull()

    fireEvent.press(screen.getByLabelText('Mia: In'))
    await waitFor(
      () =>
        expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/ev-1/rsvp', {
          method: 'PUT',
          body: { status: 'YES', childUserId: 'kid-mia' },
        }),
      { timeout: 2000 },
    )
  })

  it('hides the previous team while a newly selected team loads', async () => {
    setRole('COACH')
    let resolveTeamTwo: ((events: unknown[]) => void) | undefined
    mockApi.mockImplementation((path: string) => {
      if (path.includes('teamId=team-1')) {
        return Promise.resolve([makeEvent({ id: 'one', title: 'Team one training' })])
      }
      if (path.includes('teamId=team-2')) {
        return new Promise((resolve) => {
          resolveTeamTwo = resolve
        })
      }
      return Promise.resolve([])
    })
    const screen = render(<EventsScreen />)
    expect(await screen.findByLabelText(/Team one training/)).toBeTruthy()

    authState.activeTeamId = 'team-2'
    screen.rerender(<EventsScreen />)
    await waitFor(() => expect(screen.queryByLabelText(/Team one training/)).toBeNull())

    resolveTeamTwo?.([makeEvent({ id: 'two', title: 'Team two training' })])
    expect(await screen.findByLabelText(/Team two training/)).toBeTruthy()
  })

  it('shows a composed empty state with the create action for coaches', async () => {
    setRole('COACH')
    const screen = render(<EventsScreen />)
    expect(await screen.findByText('Nothing scheduled yet')).toBeTruthy()
  })
})
