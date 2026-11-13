import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import KaderScreen from '../(tabs)/squad/index'
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
    return null as never
  })
}

describe('Kader tab', () => {
  beforeEach(() => {
    mockRouterPush.mockReset()
    mockApi.mockReset()
    mockEndpoints()
    authState.user = { id: 'user-player-1' }
    authState.activeRoleMode = 'PLAYER'
    authState.activeClub = { role: 'PLAYER', club: { id: 'club-1', name: 'SV Albatros' } }
    authState.activeTeamAccess = { role: 'PLAYER', team: { id: 'team-1', displayName: 'Herren 1' } }
  })

  it('shows the one squad number and the availability summary', async () => {
    const screen = render(<KaderScreen />)
    expect(await screen.findByText('kader.subtitle|4')).toBeTruthy()
    // Medic kill switch is off for release: injury data never shows.
    expect(screen.getByText('kader.summary.fit|3')).toBeTruthy()
    expect(screen.queryByText('kader.summary.injured|1')).toBeNull()
    expect(screen.getByText('kader.summary.suspended|1')).toBeTruthy()
    expect(screen.queryByText('kader.summary.away|0')).toBeNull()
  })

  it('pins the signed-in player and groups the rest by line, then the coaches', async () => {
    const screen = render(<KaderScreen />)
    expect(await screen.findByText('kader.self.change')).toBeTruthy()
    // Section labels carry their head count ("Abwehr · 2").
    expect(screen.getByText('kader.lines.defence · 2')).toBeTruthy()
    expect(screen.getByText('kader.lines.midfield · 1')).toBeTruthy()
    expect(screen.getByText('kader.lines.coaches · 1')).toBeTruthy()
    // Goalkeeper section disappears: the only keeper is the pinned "Du" row.
    expect(screen.queryByText(/^kader\.lines\.goalkeepers/)).toBeNull()
  })

  it('marks suspended players; fit players and injury data carry no pill', async () => {
    const screen = render(<KaderScreen />)
    await screen.findByText('Anna Schmidt')
    expect(screen.queryByText('kader.status.injured')).toBeNull()
    expect(screen.getByText('kader.status.suspendedUntil')).toBeTruthy()
  })

  it('filters the list from the summary and resets on a second tap', async () => {
    const screen = render(<KaderScreen />)
    fireEvent.press(await screen.findByTestId('kader-summary-SUSPENDED'))
    expect(screen.queryByText('Tim Weber')).toBeNull()
    expect(screen.getByText('Niklas Wagner')).toBeTruthy()
    fireEvent.press(screen.getByTestId('kader-summary-SUSPENDED'))
    expect(screen.getByText('Tim Weber')).toBeTruthy()
  })

  it('searches players by name and resets the filter from the Alle chip', async () => {
    const screen = render(<KaderScreen />)
    await screen.findByText('Anna Schmidt')
    fireEvent.changeText(screen.getByLabelText('kader.search'), 'anna')
    expect(screen.getByText('Anna Schmidt')).toBeTruthy()
    expect(screen.queryByText('Tim Weber')).toBeNull()
    fireEvent.changeText(screen.getByLabelText('kader.search'), '')
    fireEvent.press(screen.getByTestId('kader-summary-SUSPENDED'))
    expect(screen.queryByText('Tim Weber')).toBeNull()
    fireEvent.press(screen.getByTestId('kader-summary-ALL'))
    expect(screen.getByText('Tim Weber')).toBeTruthy()
  })

  it('opens a DM when a player taps a teammate', async () => {
    const screen = render(<KaderScreen />)
    fireEvent.press(await screen.findByTestId('kader-row-user-player-2'))
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/dm-chat',
      params: { userId: 'user-player-2', userName: 'Tim Weber' },
    })
  })

  it('has exactly three team tools, with the player’s own duty count on Aufgaben', async () => {
    const screen = render(<KaderScreen />)
    fireEvent.press(await screen.findByTestId('kader-tool-duties'))
    expect(mockRouterPush).toHaveBeenCalledWith('/aufgaben')
    fireEvent.press(screen.getByTestId('kader-tool-matches'))
    expect(mockRouterPush).toHaveBeenCalledWith('/team-spiele')
    fireEvent.press(screen.getByTestId('kader-tool-stats'))
    expect(mockRouterPush).toHaveBeenCalledWith('/team-stats')
    expect(screen.getByLabelText('kader.tools.duties, 1')).toBeTruthy()
  })

  it('hides coach-only surfaces from players', async () => {
    const screen = render(<KaderScreen />)
    await screen.findByText('kader.self.change')
    expect(screen.queryByTestId('kader-requests-banner')).toBeNull()
    expect(screen.queryByTestId('kader-off-squad-toggle')).toBeNull()
    expect(screen.queryByLabelText('kader.menu.a11y')).toBeNull()
  })

  describe('as coach', () => {
    beforeEach(() => {
      authState.user = { id: 'user-coach-1' }
      authState.activeRoleMode = 'COACH'
      authState.activeClub = { role: 'COACH', club: { id: 'club-1', name: 'SV Albatros' } }
      authState.activeTeamAccess = { role: 'HEAD_COACH', team: { id: 'team-1', displayName: 'Herren 1' } }
    })

    it('offers Einladen in the header', async () => {
      const screen = render(<KaderScreen />)
      await screen.findByText('kader.requestsBanner|1')
      fireEvent.press(screen.getByTestId('kader-invite'))
      expect(mockRouterPush).toHaveBeenCalledWith('/invite')
    })

    it('shows the open-requests banner and the collapsed inactive/trial section', async () => {
      const screen = render(<KaderScreen />)
      expect(await screen.findByText('kader.requestsBanner|1')).toBeTruthy()
      expect(screen.queryByText('Lukas Meyer')).toBeNull()
      fireEvent.press(screen.getByTestId('kader-off-squad-toggle'))
      expect(screen.getByText('Lukas Meyer')).toBeTruthy()
      expect(screen.getByText('Ben Schulz')).toBeTruthy()
    })

    it('L2: warns in the player sheet when the shirt number is already worn', async () => {
      const screen = render(<KaderScreen />)
      fireEvent.press(await screen.findByTestId('kader-row-user-player-2'))
      await waitFor(() => expect(screen.getByText('kader.edit.title')).toBeTruthy())
      fireEvent.changeText(screen.getByTestId('player-edit-number'), '6')
      expect(screen.getByText('kader.edit.numberTaken')).toBeTruthy()
    })

    it('H2: hides the message button in the player sheet when a DM is not allowed', async () => {
      const blocked = {
        ...SNAPSHOT,
        squad: SNAPSHOT.squad.map((m) =>
          m.userId === 'user-player-2' ? { ...m, canMessage: false, messageBlockedReason: 'MINOR_BLOCKED' } : m,
        ),
      }
      mockApi.mockImplementation(async (path: string) => {
        if (path.includes('/roster-ops')) return blocked as never
        return [] as never
      })
      const screen = render(<KaderScreen />)
      fireEvent.press(await screen.findByTestId('kader-row-user-player-2'))
      await waitFor(() => expect(screen.getByText('kader.edit.title')).toBeTruthy())
      expect(screen.queryByText('kader.edit.message')).toBeNull()
    })

    it('opens the player sheet instead of a DM when tapping a player', async () => {
      const screen = render(<KaderScreen />)
      fireEvent.press(await screen.findByTestId('kader-row-user-player-2'))
      expect(mockRouterPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/dm-chat' }))
      await waitFor(() => expect(screen.getByText('kader.edit.title')).toBeTruthy())
    })
  })

  // ── Kader adversarial fixes ──────────────────────────────────────────────
  it('H2: does not offer a DM the API would refuse; the row does nothing', async () => {
    const blocked = {
      ...SNAPSHOT,
      squad: SNAPSHOT.squad.map((m) =>
        m.userId === 'user-player-2' ? { ...m, canMessage: false, messageBlockedReason: 'NEEDS_GUARDIAN_LINK' } : m,
      ),
    }
    mockApi.mockImplementation(async (path: string) => {
      if (path.includes('/roster-ops')) return blocked as never
      return [] as never
    })
    const screen = render(<KaderScreen />)
    const row = await screen.findByTestId('kader-row-user-player-2')
    expect(row.props.accessibilityLabel).not.toContain('kader.row.messageHint')
    expect(row.props.accessibilityLabel).toContain('kader.message.blockedMinor')
    fireEvent.press(row)
    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/dm-chat' }))
  })

  it('L7: the RSVP marker has a distinct shape per answer', async () => {
    const screen = render(<KaderScreen />)
    expect(await screen.findByTestId('kader-row-user-player-3-rsvp-NO')).toBeTruthy()
    expect(screen.getByTestId('kader-row-user-player-2-rsvp-NONE')).toBeTruthy()
  })

  it('L4: a filter lists the signed-in player too when they match', async () => {
    const suspendedSelf = {
      ...SNAPSHOT,
      squad: SNAPSHOT.squad.map((m) =>
        m.userId === 'user-player-1' ? { ...m, absence: 'SUSPENDED', absenceUntil: null } : m,
      ),
    }
    mockApi.mockImplementation(async (path: string) => {
      if (path.includes('/roster-ops')) return suspendedSelf as never
      return [] as never
    })
    const screen = render(<KaderScreen />)
    fireEvent.press(await screen.findByTestId('kader-summary-SUSPENDED'))
    expect(screen.getByTestId('kader-row-user-player-1')).toBeTruthy()
    expect(screen.getByText('Niklas Wagner')).toBeTruthy()
    // The pin is hidden while filtering, so the player is listed once.
    expect(screen.queryByText('kader.self.change')).toBeNull()
  })

  it('L3: an older roster response that lands late never overwrites a newer one', async () => {
    const resolvers: Array<(value: unknown) => void> = []
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/roster-ops')) {
        return new Promise((resolve) => resolvers.push(resolve)) as never
      }
      return Promise.resolve([]) as never
    })
    const screen = render(<KaderScreen />)
    await waitFor(() => expect(resolvers.length).toBe(1))
    const list = () =>
      screen.UNSAFE_root.findAll((node: any) => Boolean(node.props?.refreshControl))
    const newer = { ...SNAPSHOT, squadCount: 9 }
    const older = { ...SNAPSHOT, squadCount: 2 }
    resolvers[0](older)
    expect(await screen.findByText('kader.subtitle|2')).toBeTruthy()
    // Two pull-to-refreshes: request #2 (older) and #3 (newer) in flight;
    // #3 answers first, then #2 arrives late and must be ignored.
    const refresh = list()[0]?.props.refreshControl.props.onRefresh
    refresh()
    refresh()
    await waitFor(() => expect(resolvers.length).toBe(3))
    resolvers[2](newer)
    expect(await screen.findByText('kader.subtitle|9')).toBeTruthy()
    resolvers[1]({ ...SNAPSHOT, squadCount: 5 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByText('kader.subtitle|9')).toBeTruthy()
    expect(screen.queryByText('kader.subtitle|5')).toBeNull()
  })

  it('M1: a club COACH without a coach access on this team gets the player view', async () => {
    authState.activeRoleMode = 'COACH'
    authState.activeClub = { role: 'COACH', club: { id: 'club-1', name: 'SV Albatros' } }
    authState.activeTeamAccess = { role: 'PLAYER', team: { id: 'team-1', displayName: 'Herren 1' } }
    const screen = render(<KaderScreen />)
    await screen.findByText('Tim Weber')
    expect(screen.queryByLabelText('kader.menu.a11y')).toBeNull()
    expect(screen.queryByTestId('kader-requests-banner')).toBeNull()
  })

  it('shows an inline error with retry when the roster fails to load', async () => {
    mockApi.mockImplementation(async (path: string) => {
      if (path.includes('/roster-ops')) throw new Error('offline')
      return [] as never
    })
    const screen = render(<KaderScreen />)
    expect(await screen.findByText('kader.errors.loadTitle')).toBeTruthy()
  })
})
