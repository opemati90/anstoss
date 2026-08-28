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
} = {
  activeClub: {
    role: 'COACH',
    permissions: { EVENTS: true },
    club: { id: 'club-1', name: 'FC QA' },
  },
  activeTeamId: 'team-1',
  activeTeamAccess: { role: 'HEAD_COACH' },
  activeRoleMode: null,
}

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
  useFocusEffect: (callback: () => void) => {
    const React = require('react')
    React.useEffect(() => {
      callback()
    }, [callback])
  },
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'event.screenTitle': 'Events',
        'event.createEvent': 'Create event',
        'event.upcoming': 'Upcoming',
        'event.past': 'Past',
        'event.emptyTitle': 'No events yet',
        'event.emptyBody': 'Upcoming training sessions and matches will show here.',
        'event.noPastEvents': 'Past events will show here.',
        'eventFilter.upcoming': 'Upcoming',
        'eventFilter.past': 'Past',
        'eventFilter.training': 'Training',
        'eventFilter.match': 'Match',
        'eventFilter.other': 'Other',
        'parentSchedule.title': "Children's schedule",
        'parentSchedule.emptyDescription': 'Events from your children\'s teams will appear here.',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      clubPrimary: '#1E3A5F',
      clubPrimaryLight: '#DDE7F1',
      primary: '#1E3A5F',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() => Promise.resolve([])),
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
    date: '2026-06-22T16:00:00.000Z',
    location: 'Pitch 1',
    notes: null,
    createdById: 'coach-1',
    createdAt: '2026-06-20T10:00:00.000Z',
    responseCount: 0,
    yesCount: 0,
    maybeCount: 0,
    noCount: 0,
    myRsvp: null,
    ...overrides,
  }
}

describe('EventsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockReset()
    mockApi.mockResolvedValue([])
    authState.activeClub = {
      role: 'COACH',
      permissions: { EVENTS: true },
      club: { id: 'club-1', name: 'FC QA' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'HEAD_COACH' }
    authState.activeRoleMode = null
  })

  it('keeps event creation in the header only', async () => {
    const screen = render(<EventsScreen />)

    await waitFor(() => {
      expect(screen.getByLabelText('Create event')).toBeTruthy()
    })

    expect(screen.queryByText('Create event')).toBeNull()
  })

  it('hides event creation for parents and keeps the parent schedule board', async () => {
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'club-1', name: 'FC QA' },
    }
    authState.activeTeamId = null
    authState.activeTeamAccess = null

    const screen = render(<EventsScreen />)

    await waitFor(() => {
      expect(screen.getByText("Children's schedule")).toBeTruthy()
    })

    expect(screen.queryByLabelText('Create event')).toBeNull()
  })

  it('opens parent schedule cards from the child schedule board', async () => {
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'club-1', name: 'FC QA' },
    }
    authState.activeTeamId = null
    authState.activeTeamAccess = null
    mockApi.mockImplementation((path: string) => {
      if (path === '/me/children-events') {
        return Promise.resolve([
          {
            ...makeEvent({
              id: 'child-event-1',
              teamId: 'team-1',
              title: 'U10 training',
              date: '2026-06-22T16:00:00.000Z',
              location: 'Pitch 1',
            }),
            teamName: 'U10',
            teamDisplayName: 'U10 Juniors',
          },
          {
            ...makeEvent({
              id: 'child-event-2',
              teamId: 'team-2',
              title: 'U12 match',
              type: 'MATCH',
              date: '2026-06-24T10:00:00.000Z',
              location: 'Stadium',
              createdById: 'coach-2',
            }),
            teamName: 'U12',
            teamDisplayName: 'U12 Juniors',
          },
        ])
      }
      return Promise.resolve([])
    })

    const screen = render(<EventsScreen />)

    fireEvent.press(await screen.findByLabelText(/U10 training.*U10 Juniors/))
    fireEvent.press(await screen.findByLabelText(/U12 match.*U12 Juniors/))

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'child-event-1', teamId: 'team-1' },
    })
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/event-detail',
      params: { eventId: 'child-event-2', teamId: 'team-2' },
    })
  })

  it('uses the selected team schedule when a parent also has team access', async () => {
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'club-1', name: 'FC QA' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'ASSISTANT_COACH' }
    authState.activeRoleMode = 'COACH'
    mockApi.mockImplementation((path: string) => {
      if (path.startsWith('/clubs/club-1/events?')) {
        return Promise.resolve([
          makeEvent({
            id: 'coach-event-1',
            title: 'Coach training',
          }),
        ])
      }
      return Promise.resolve([])
    })

    const screen = render(<EventsScreen />)

    expect(await screen.findByLabelText('Coach training')).toBeTruthy()
    expect(screen.queryByText("Children's schedule")).toBeNull()
    expect(mockApi).not.toHaveBeenCalledWith('/me/children-events')
    expect(mockApi).toHaveBeenCalledWith(
      expect.stringContaining('/clubs/club-1/events?'),
    )
  })

  it('keeps the family schedule when the selected team access is parent-only', async () => {
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'club-1', name: 'FC QA' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'PARENT' }
    authState.activeRoleMode = 'PARENT'
    mockApi.mockImplementation((path: string) => {
      if (path === '/me/children-events') {
        return Promise.resolve([
          {
            ...makeEvent({
              id: 'child-event-1',
              teamId: 'team-1',
              title: 'Family training',
            }),
            teamName: 'U10',
            teamDisplayName: 'U10 Juniors',
          },
        ])
      }
      return Promise.resolve([])
    })

    const screen = render(<EventsScreen />)

    expect(await screen.findByText("Children's schedule")).toBeTruthy()
    expect(await screen.findByLabelText(/Family training.*U10 Juniors/)).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/me/children-events')
    expect(mockApi).not.toHaveBeenCalledWith(
      expect.stringContaining('/clubs/club-1/events?'),
    )
  })

  it('hides stale team events while a newly selected team loads', async () => {
    let resolveTeamTwoEvents:
      | ((events: ReturnType<typeof makeEvent>[]) => void)
      | undefined

    mockApi.mockImplementation((path: string) => {
      if (path.startsWith('/teams/')) {
        return Promise.resolve([])
      }
      if (path.includes('teamId=team-1')) {
        return Promise.resolve([
          makeEvent({
            id: 'team-one-event',
            teamId: 'team-1',
            title: 'Team one training',
          }),
        ])
      }
      if (path.includes('teamId=team-2')) {
        return new Promise((resolve) => {
          resolveTeamTwoEvents = resolve
        })
      }
      return Promise.resolve([])
    })

    const screen = render(<EventsScreen />)

    expect(await screen.findByLabelText('Team one training')).toBeTruthy()

    authState.activeTeamId = 'team-2'
    authState.activeTeamAccess = { role: 'HEAD_COACH' }
    screen.rerender(<EventsScreen />)

    await waitFor(() => {
      expect(screen.queryByLabelText('Team one training')).toBeNull()
    })

    resolveTeamTwoEvents?.([
      makeEvent({
        id: 'team-two-event',
        teamId: 'team-2',
        title: 'Team two training',
      }),
    ])

    expect(await screen.findByLabelText('Team two training')).toBeTruthy()
  })
})
