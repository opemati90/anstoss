import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { TrialInviteStatus, type PlayerSearch, type TrialInvite } from '@anstoss/shared'
import WechselboerseScreen from '../wechselboerse/index'
import { api } from '../../src/api/client'
import { resetApiCache } from '../../src/features/wechsel/query'

const mockAuth = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => useEffect(() => cb(), [cb]),
  }
})

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))

jest.mock('../../src/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../src/utils/useSafeAreaInsetsSafe', () => ({
  useSafeAreaInsetsSafe: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuth(),
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

jest.mock('../../src/i18n', () => ({
  __esModule: true,
  default: { language: 'de', resolvedLanguage: 'de' },
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 500
  },
}))

const mockApi = api as jest.MockedFunction<typeof api>
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

const requested: TrialInvite = {
  id: 'trial-club-niklas',
  clubId: 'club-1',
  freeAgentProfileId: 'fa-niklas',
  teamId: 'team-2',
  sentByUserId: 'coach-1',
  message: 'Fünf Jahre Bezirksliga im Tor.',
  expiresAt: inDays(13),
  status: TrialInviteStatus.REQUESTED,
  respondedAt: null,
  createdAt: inDays(-1),
  initiatedBy: 'PLAYER' as TrialInvite['initiatedBy'],
  playerSearchId: 'gesuch-1',
  sessionEventIds: [],
  sessions: [],
  feedback: null,
  rating: null,
  attended: null,
  decisionMessage: null,
  decidedAt: null,
  club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
  team: { id: 'team-2', displayName: 'Herren II', groupName: 'Herren', leagueName: 'Kreisliga A' },
  sender: { id: 'coach-1', name: 'Mara Schulz' },
  player: {
    profileId: 'fa-niklas',
    userId: 'user-niklas',
    name: 'Niklas Schulz',
    avatarUrl: null,
    position: 'GK' as TrialInvite['player']['position'],
    preferredFoot: 'LEFT' as TrialInvite['player']['preferredFoot'],
    highestLeague: 'BEZIRKSLIGA',
    age: 30,
    isMinor: false,
  },
  joinRequest: null,
}

const gesuch = {
  id: 'gesuch-1',
  clubId: 'club-1',
  teamId: 'team-2',
  positions: ['GK'],
  note: 'Herren II sucht Torwart, Kreisliga A.',
  status: 'OPEN',
  expiresAt: null,
  createdAt: inDays(-4),
  club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C', city: 'Potsdam' },
  team: { id: 'team-2', displayName: 'Herren II', leagueName: 'Kreisliga A', ageGroup: null },
  openTrialCount: 1,
} as unknown as PlayerSearch

function adminAuth() {
  return {
    activeClub: {
      id: 'm1',
      role: 'OWNER',
      operationalRoles: [],
      club: { id: 'club-1', name: 'SV Albatros', slug: 'sv-albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
    },
    teamMembers: [],
  }
}

function routeApi() {
  mockApi.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'PATCH' || options?.method === 'POST') return {} as never
    if (path.includes('/trial-invites')) return [requested] as never
    if (path.includes('/player-searches')) return [gesuch] as never
    if (path.includes('/team-groups')) {
      return [
        { id: 'g', displayName: 'Herren', teams: [{ id: 'team-2', displayName: 'Herren II', leagueName: 'Kreisliga A' }] },
      ] as never
    }
    if (path.includes('/events')) {
      return [
        { id: 'event-tr-1', title: 'Training', type: 'TRAINING', date: inDays(3), location: 'Kunstrasen' },
      ] as never
    }
    return [] as never
  })
}

describe('Wechselbörse', () => {
  beforeEach(() => {
    resetApiCache()
    mockApi.mockReset()
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  })

  it('tells plain players the Wechselbörse is for coaches and the board', () => {
    mockAuth.mockReturnValue({
      activeClub: { ...adminAuth().activeClub, role: 'PLAYER' },
      teamMembers: [],
    })
    const screen = render(<WechselboerseScreen />)
    expect(screen.getByText('wechsel.noAccessTitle')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('opens on the trial pipeline and invites a requester to a training', async () => {
    mockAuth.mockReturnValue(adminAuth())
    routeApi()
    const screen = render(<WechselboerseScreen />)

    expect(await screen.findByText('Niklas Schulz')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('wechsel.actionInvite: Niklas Schulz'))
    fireEvent.press(await screen.findByRole('checkbox'))
    fireEvent.press(screen.getByText('wechsel.inviteSend'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/trial-invites/trial-club-niklas', {
        method: 'PATCH',
        body: { action: 'invite', sessionEventIds: ['event-tr-1'], message: undefined },
      }),
    )
  })

  it('marks a Gesuch as filled', async () => {
    mockAuth.mockReturnValue(adminAuth())
    routeApi()
    const screen = render(<WechselboerseScreen />)

    fireEvent.press(screen.getByText('wechsel.tabGesuche'))
    expect(await screen.findByText('Herren II sucht Torwart, Kreisliga A.')).toBeTruthy()
    fireEvent.press(screen.getByText('wechsel.gesuchMarkFilled'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/player-searches/gesuch-1', {
        method: 'PATCH',
        body: { status: 'FILLED' },
      }),
    )
  })
})
