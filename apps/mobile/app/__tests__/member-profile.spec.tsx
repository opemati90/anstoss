import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import MemberProfileScreen from '../member/[id]'
import { api } from '../../src/api/client'

const mockRouterPush = jest.fn()
const authState: {
  user: { id: string } | null
  activeClub: any
  activeTeamId: string | null
  activeTeamAccess: any
  activeRoleMode: string | null
} = {
  user: { id: 'user-player-1' },
  activeClub: { role: 'PLAYER', club: { id: 'club-1', name: 'SV Albatros' } },
  activeTeamId: 'team-1',
  activeTeamAccess: { role: 'PLAYER', team: { id: 'team-1', displayName: 'Herren 1' } },
  activeRoleMode: 'PLAYER',
}

let mockMemberId = 'user-player-2'
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: mockMemberId }),
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
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')

// Keys come back as "key|count" so assertions stay independent of copy.
jest.mock('react-i18next', () => {
  // Match react-i18next's stable translator identity. Recreating t on each
  // render spuriously reruns useFocusEffect and invents extra network calls.
  const t = (key: string, options?: Record<string, unknown>) =>
    options && 'count' in options ? `${key}|${options.count}` : key
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'de',
  getAppLocale: () => 'de-DE',
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F' }),
    useClubTheme: () => ({ theme: FALLBACK_THEME, isDark: false }),
    useIsDark: () => false,
  }
})

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {},
}))

const mockApi = api as jest.MockedFunction<typeof api>

function row(userId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `access-${userId}`,
    userId,
    name: `Name ${userId}`,
    avatarUrl: null,
    role: 'PLAYER',
    phase: 'FULL',
    status: 'ACTIVE',
    position: null,
    jerseyNumber: null,
    operationalStatus: 'ACTIVE',
    absence: 'NONE',
    absenceUntil: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    loanedFromTeamId: null,
    loanedFromTeamName: null,
    ...extra,
  }
}

const SNAPSHOT = {
  team: { id: 'team-1', displayName: 'Herren 1', squadTarget: 20 },
  squadCount: 4,
  squad: [
    row('user-coach-1', { role: 'HEAD_COACH', name: 'Coach Albrecht' }),
    row('user-player-1', { name: 'Julian Becker', position: 'TW', jerseyNumber: 1 }),
    row('user-player-2', { name: 'Tim Weber', position: 'IV', jerseyNumber: 2 }),
    row('user-player-3', {
      name: 'Niklas Wagner',
      position: 'ZM',
      jerseyNumber: 6,
      absence: 'SUSPENDED',
      absenceUntil: '2099-10-04T21:59:00.000Z',
    }),
    row('user-player-4', { name: 'Anna Schmidt', position: 'IV', jerseyNumber: 4 }),
  ],
  operations: {
    trials: [row('user-trial-1', { phase: 'TRIAL', status: 'PENDING', name: 'Ben Schulz' })],
    newPlayers: [],
    inactive: [row('user-inactive-1', { operationalStatus: 'INACTIVE', name: 'Lukas Meyer' })],
    pendingCoaches: [],
  },
  medic: {
    active: [
      {
        id: 'injury-1',
        userId: 'user-player-4',
        title: 'Muskelfaserriss',
        status: 'OUT',
        expectedReturnAt: null,
        expectedReturnLabel: null,
        clearedAt: null,
      },
    ],
    recentlyCleared: [],
  },
  kit: {
    pending: [{ id: 'duty-1', assignedUserId: 'user-player-1', kind: 'BIB_CLEANUP', status: 'PENDING' }],
    recent: [],
  },
}

function mockEndpoints() {
  mockApi.mockImplementation(async (path: string) => {
    if (path.includes('/roster-ops')) return SNAPSHOT as never
    if (path.includes('/events?')) {
      return [{ id: 'event-1', title: 'vs. SV Babelsberg 03', date: '2099-10-03T12:00:00.000Z' }] as never
    }
    if (path.endsWith('/events/event-1')) {
      return {
        id: 'event-1',
        title: 'vs. SV Babelsberg 03',
        date: '2099-10-03T12:00:00.000Z',
        rsvps: [
          { userId: 'user-player-1', status: 'YES' },
          { userId: 'user-player-3', status: 'NO' },
        ],
      } as never
    }
    if (path.endsWith('/members/user-player-2/profile')) return PROFILE as never
    return null as never
  })
}

const PROFILE = {
  userId: 'user-player-2',
  roles: ['PLAYER', 'CAPTAIN'],
  memberSince: '2023-08-01T00:00:00.000Z',
  season: '2026/27',
  stats: { appearances: 9, goals: 6, assists: 3 },
  attendance: { items: [true, true, true, false, true, true, true, true], attended: 7, total: 8 },
  duesState: 'CURRENT',
  playerPass: { number: '123456', validUntil: '2027-06-30T00:00:00.000Z' },
}

describe('Member profile (board 17)', () => {
  beforeEach(() => {
    mockMemberId = 'user-player-2'
    mockRouterPush.mockReset()
    mockApi.mockReset()
    mockEndpoints()
    authState.user = { id: 'user-coach-1' }
    authState.activeRoleMode = 'COACH'
    authState.activeClub = { role: 'COACH', club: { id: 'club-1', name: 'SV Albatros' } }
    authState.activeTeamAccess = { role: 'HEAD_COACH', team: { id: 'team-1', displayName: 'Herren 1' } }
  })

  it('shows number, name, roles line, stats, attendance and pass from the profile bundle', async () => {
    const screen = render(<MemberProfileScreen />)
    expect(await screen.findByText('Tim Weber')).toBeTruthy()
    expect(screen.getByText('IV · kader.profile.role.CAPTAIN · kader.profile.since')).toBeTruthy()
    expect(screen.getByLabelText('kader.profile.goals: 6')).toBeTruthy()
    expect(screen.getByText('kader.profile.attendanceOf|7')).toBeTruthy()
    expect(screen.getByText('kader.profile.duesState.CURRENT')).toBeTruthy()
    expect(screen.getByText('kader.profile.passValid')).toBeTruthy()
  })

  it('degrades quietly when the profile endpoint is missing', async () => {
    mockMemberId = 'user-player-3'
    const screen = render(<MemberProfileScreen />)
    expect(await screen.findByText('Niklas Wagner')).toBeTruthy()
    expect(screen.getByLabelText('kader.profile.goals: –')).toBeTruthy()
    expect(screen.getByText('kader.profile.passMissing')).toBeTruthy()
  })

  it('opens a DM from Nachricht', async () => {
    const screen = render(<MemberProfileScreen />)
    fireEvent.press(await screen.findByTestId('member-message'))
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/dm-chat',
      params: { userId: 'user-player-2', userName: 'Tim Weber' },
    })
  })

  it('L2: the edit sheet warns when the shirt number is already worn', async () => {
    const screen = render(<MemberProfileScreen />)
    fireEvent.press(await screen.findByTestId('member-edit'))
    await waitFor(() => expect(screen.getByText('kader.edit.title')).toBeTruthy())
    fireEvent.changeText(screen.getByTestId('player-edit-number'), '6')
    expect(screen.getByText('kader.edit.numberTaken')).toBeTruthy()
  })

  it('H2: no message action when a DM is not allowed', async () => {
    const blocked = {
      ...SNAPSHOT,
      squad: SNAPSHOT.squad.map((m) =>
        m.userId === 'user-player-2' ? { ...m, canMessage: false, messageBlockedReason: 'MINOR_BLOCKED' } : m,
      ),
    }
    mockApi.mockImplementation(async (path: string) => {
      if (path.includes('/roster-ops')) return blocked as never
      return null as never
    })
    const screen = render(<MemberProfileScreen />)
    fireEvent.press(await screen.findByTestId('member-edit'))
    await waitFor(() => expect(screen.getByText('kader.edit.title')).toBeTruthy())
    expect(screen.queryByText('kader.edit.message')).toBeNull()
    fireEvent.press(screen.getByTestId('member-message'))
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/dm-chat' }))
  })

  it('lets only the Vorstand toggle roles', async () => {
    const screen = render(<MemberProfileScreen />)
    fireEvent.press(await screen.findByTestId('member-role-TREASURER'))
    // Board 18: Medienwart sits between Kassenwart and Vorstand.
    expect(screen.getByTestId('member-role-MEDIA_MANAGER')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalledWith(expect.stringContaining('/roles'), expect.anything())

    authState.activeClub = { role: 'OWNER', club: { id: 'club-1', name: 'SV Albatros' } }
    const board = render(<MemberProfileScreen />)
    await board.findAllByText('Tim Weber')
    fireEvent.press(board.getAllByTestId('member-role-TREASURER')[0])
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/teams/team-1/members/user-player-2/roles', {
        method: 'PUT',
        body: { roles: ['PLAYER', 'CAPTAIN', 'TREASURER'] },
      }),
    )
  })
})
