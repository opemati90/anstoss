import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import EventsScreen from '../(tabs)/events/index'

const mockRouterPush = jest.fn()
const authState: {
  activeClub: any
  activeTeamId: string | null
  activeTeamAccess: any
} = {
  activeClub: {
    role: 'COACH',
    permissions: { EVENTS: true },
    club: { id: 'club-1', name: 'FC QA' },
  },
  activeTeamId: 'team-1',
  activeTeamAccess: { role: 'HEAD_COACH' },
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
        'parentSchedule.title': "Children's Schedule",
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

describe('EventsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authState.activeClub = {
      role: 'COACH',
      permissions: { EVENTS: true },
      club: { id: 'club-1', name: 'FC QA' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'HEAD_COACH' }
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
      expect(screen.getByText("Children's Schedule")).toBeTruthy()
    })

    expect(screen.queryByLabelText('Create event')).toBeNull()
  })
})
