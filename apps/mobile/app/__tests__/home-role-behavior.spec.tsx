import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import HomeScreen from '../(tabs)/index'

const mockRouterPush = jest.fn()

const authState: {
  user: { name: string }
  activeClub: any
  activeTeamId: string | null
  activeTeamAccess: any
  teamsForActiveClub: any[]
} = {
  user: { name: 'QA User' },
  activeClub: {
    role: 'OWNER',
    permissions: { EVENTS: true },
    club: { id: 'club-1', name: 'FC QA', badgeUrl: null },
  },
  activeTeamId: 'team-1',
  activeTeamAccess: {
    role: 'HEAD_COACH',
    team: { displayName: 'Herren I' },
  },
  teamsForActiveClub: [],
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, style }: { children?: React.ReactNode; style?: any }) => {
    const React = require('react')
    const { View } = require('react-native')
    return React.createElement(View, { style }, children)
  },
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'home.pendingTrialsTitle') {
        return Number(options?.count) === 1 ? '1 trial to review' : `${options?.count} trials to review`
      }

      const map: Record<string, string> = {
        'home.greetingMorning': 'Good morning',
        'home.greetingAfternoon': 'Good afternoon',
        'home.greetingEvening': 'Good evening',
        'home.fallbackName': 'Player',
        'roles.OWNER': 'Super Admin',
        'roles.COACH': 'Coach',
        'roles.PARENT': 'Parent',
        'roles.PLAYER': 'Player',
        'teamRoles.HEAD_COACH': 'Head coach',
        'home.nextEvent': 'Next event',
        'home.quickActions': 'Quick actions',
        'tabs.events': 'Events',
        'tabs.schedule': 'Schedule',
        'tabs.chat': 'Chat',
        'tabs.roster': 'Roster',
        'tabs.more': 'More',
        'adminDashboard.clubOverview': 'Club overview',
        'adminDashboard.members': 'Members',
        'adminDashboard.teams': 'Teams',
        'home.actionCreateEvent': 'Create event',
        'home.actionEvents': 'Open schedule',
        'home.actionChat': 'Open chat',
        'home.actionRoster': 'Open squad',
        'home.actionInvite': 'Invite players',
        'home.actionMyTeam': 'Open team',
        'home.pendingTrialsEyebrow': 'Needs review',
        'home.pendingTrialsBody': 'Review trial access in your squad.',
        'home.reviewTrialsCta': 'Open squad',
        'home.noUpcomingEventsTitle': 'No upcoming events',
        'home.noUpcomingEventsBody': 'Upcoming training sessions and matches will show here.',
        'home.openSchedule': 'Open schedule',
        'adminDashboard.title': 'Administration',
        'parentSchedule.title': "Children's Schedule",
        'parentSchedule.viewAll': 'View full schedule',
        'more.title': 'More',
        'event.type.TRAINING': 'Training',
        'rsvp.yes': 'Yes',
        'rsvp.maybe': 'Maybe',
        'rsvp.no': 'No',
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
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/stats')) {
      return Promise.resolve({
        memberCount: 18,
        teamCount: 6,
        upcomingEventCount: 12,
        overallRsvpRate: 84,
      })
    }

    if (path.includes('/members?teamId=')) {
      return Promise.resolve([
        { phase: 'TRIAL', status: 'ACTIVE' },
      ])
    }

    if (path.includes('/me/children-events')) {
      return Promise.resolve([
        {
          id: 'child-event-1',
          title: 'Away match',
          date: '2026-05-01T10:00:00.000Z',
          location: 'Pitch 2',
          teamName: 'U12',
          teamDisplayName: 'U12',
        },
      ])
    }

    if (path.includes('/events?teamId=')) {
      return Promise.resolve([
        {
          id: 'event-1',
          type: 'TRAINING',
          title: 'Morning training',
          date: '2026-05-01T10:00:00.000Z',
          location: 'Pitch 1',
          myRsvp: null,
          yesCount: 0,
          maybeCount: 0,
          noCount: 0,
        },
      ])
    }

    return Promise.resolve([])
  }),
}))

jest.mock('../../src/components/EmptyState', () => ({
  EmptyState: () => null,
}))

jest.mock('../../src/components/TeamSwitcher', () => ({
  TeamSwitcher: () => null,
}))

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

jest.mock('../../src/utils/featureFlags', () => ({
  isFeatureEnabled: () => false,
}))

describe('HomeScreen role behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authState.user = { name: 'QA User' }
    authState.activeClub = {
      role: 'OWNER',
      permissions: { EVENTS: true },
      club: { id: 'club-1', name: 'FC QA', badgeUrl: null },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = {
      role: 'HEAD_COACH',
      team: { displayName: 'Herren I' },
    }
    authState.teamsForActiveClub = []
  })

  it('shows the compact administration entry for admins', async () => {
    const screen = render(<HomeScreen />)

    await waitFor(() => {
      expect(screen.getByLabelText('Administration')).toBeTruthy()
    })

    expect(screen.getByText('Create event')).toBeTruthy()
    expect(screen.getByText('Administration')).toBeTruthy()
    expect(screen.getByText('Invite players')).toBeTruthy()
    expect(screen.queryByText('Open team')).toBeNull()
  })

  it('keeps coaches on operational shortcuts without admin entry', async () => {
    authState.activeClub = {
      role: 'COACH',
      permissions: { EVENTS: true },
      club: { id: 'club-1', name: 'FC QA', badgeUrl: null },
    }

    const screen = render(<HomeScreen />)

    await waitFor(() => {
      expect(screen.getByText('Invite players')).toBeTruthy()
    })

    expect(screen.queryByLabelText('Administration')).toBeNull()
    expect(screen.getByText('Create event')).toBeTruthy()
    expect(screen.getByText('Invite players')).toBeTruthy()
  })

  it('keeps parents out of admin surfaces', async () => {
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'club-1', name: 'FC QA', badgeUrl: null },
    }
    authState.activeTeamId = null
    authState.activeTeamAccess = null

    const screen = render(<HomeScreen />)

    await waitFor(() => {
      expect(screen.getByText('More')).toBeTruthy()
    })

    expect(screen.queryByLabelText('Administration')).toBeNull()
    expect(screen.queryByText('Invite players')).toBeNull()
    expect(screen.queryByText('Open squad')).toBeNull()
    expect(screen.queryByText('Create event')).toBeNull()
  })
})
