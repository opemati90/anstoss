import React from 'react'
import { Alert, AppState, type AppStateStatus } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import type { MatchLiveStateDto } from '@anstoss/shared'

const mockApi = jest.fn()
const mockEmit = jest.fn()
const mockOn = jest.fn()
const mockGetToken = () => Promise.resolve('tok')
let mockClubId = 'c1'
let mockSession = 'tok'
let mockFocused = true
const appStateListeners = new Set<(state: AppStateStatus) => void>()
const changeAppState = (state: AppStateStatus) => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state })
  appStateListeners.forEach(listener => listener(state))
}

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(
    () => mockFocused ? callback() : undefined, [callback, mockFocused],
  ),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'de' } }),
}))
jest.mock('socket.io-client', () => ({
  io: () => ({ emit: mockEmit, on: mockOn, disconnect: jest.fn() }),
}))
jest.mock('../../../api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'coach' }, token: mockSession, activeClub: { club: { id: mockClubId } }, getToken: mockGetToken }),
}))
jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../../utils/haptics', () => {
  const noop = () => undefined
  const Haptics = { select: noop, tap: noop, tapMedium: noop, success: noop, fail: noop }
  return { Haptics, default: Haptics }
})

import { RecordedMatchLive, liveMinute } from '../RecordedMatchLive'
import { ApiError } from '../../../api/client'

function state(overrides: Partial<MatchLiveStateDto> = {}): MatchLiveStateDto {
  return {
    eventId: 'e1',
    status: 'FIRST_HALF',
    goalsFor: 0,
    goalsAgainst: 0,
    scoreHome: 0,
    scoreAway: 0,
    homeAway: 'HOME',
    opponent: 'RW Köpenick III',
    minute: 12,
    kickoffAt: new Date(Date.now() - 11 * 60_000).toISOString(),
    secondHalfAt: null,
    finishedAt: null,
    events: [],
    canRecord: true,
    ...overrides,
  }
}

const detail = {
  id: 'e1',
  type: 'MATCH',
  opponent: 'RW Köpenick III',
  team: { id: 't1', name: 'SV Spreewiese' },
  members: [
    { userId: 'p9', name: 'Kofi Osei', jerseyNumber: 9 },
    { userId: 'p4', name: 'Tomasz Nowak', jerseyNumber: 4 },
  ],
  lineup: null,
}

function route(live: MatchLiveStateDto, after?: MatchLiveStateDto) {
  mockApi.mockImplementation((path: string, init?: { method?: string }) => {
    if (path === '/clubs/c1/events/e1/live' && !init) return Promise.resolve(live)
    if (path === '/clubs/c1/events/e1') return Promise.resolve(detail)
    return Promise.resolve(after ?? live)
  })
}

describe('RecordedMatchLive', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
    mockClubId = 'c1'
    mockSession = 'tok'
    mockFocused = true
    appStateListeners.clear()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListeners.add(listener)
      return { remove: () => { appStateListeners.delete(listener) } }
    })
    mockApi.mockReset()
    mockEmit.mockReset()
    mockOn.mockReset()
  })
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

  it('unlocks after an admin grant, closes the picker on revoke and ignores broadcast rights', async () => {
    route(state({ canRecord: false }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByText('matchLive.timeline')
    expect(screen.queryByTestId('live-actions')).toBeNull()
    route(state())
    await act(async () => { jest.advanceTimersByTime(15_000) })
    fireEvent.press(await screen.findByTestId('live-goal'))
    expect(screen.queryByLabelText('Kofi Osei')).not.toBeNull()
    route(state({ canRecord: false }))
    await act(async () => { jest.advanceTimersByTime(15_000) })
    expect(screen.queryByTestId('live-actions')).toBeNull()
    expect(screen.queryByTestId('live-clock')).toBeNull()
    expect(screen.queryByLabelText('Kofi Osei')).toBeNull()
    const receive = mockOn.mock.calls.find(([name]) => name === 'live:match')[1]
    act(() => receive(state({ canRecord: true, goalsFor: 1 })))
    expect(screen.queryByTestId('live-actions')).toBeNull()
  })

  it('checks permissions on resume and navigation focus, with no hidden polling', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    const initial = mockApi.mock.calls.length
    act(() => changeAppState('background'))
    route(state({ canRecord: false }))
    await act(async () => { jest.advanceTimersByTime(60_000) })
    expect(mockApi).toHaveBeenCalledTimes(initial)
    await act(async () => changeAppState('active'))
    expect(screen.queryByTestId('live-actions')).toBeNull()
    mockFocused = false
    screen.rerender(<RecordedMatchLive eventId="e1" />)
    const hidden = mockApi.mock.calls.length
    route(state())
    await act(async () => { jest.advanceTimersByTime(60_000) })
    expect(mockApi).toHaveBeenCalledTimes(hidden)
    mockFocused = true
    screen.rerender(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    screen.unmount()
    const stopped = mockApi.mock.calls.length
    await act(async () => { jest.advanceTimersByTime(60_000); changeAppState('active') })
    expect(mockApi).toHaveBeenCalledTimes(stopped)
  })

  it('keeps history but removes write controls when permission revalidation fails', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    mockApi.mockRejectedValue(new Error('offline'))
    await act(async () => { jest.advanceTimersByTime(15_000) })
    expect(screen.queryByTestId('live-actions')).toBeNull()
    expect(screen.queryByText('matchLive.timeline')).not.toBeNull()
  })

  it('removes history if the server revokes read access', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    mockApi.mockRejectedValue(Object.assign(new ApiError('forbidden', 403), { status: 403 }))
    await act(async () => { jest.advanceTimersByTime(15_000) })
    expect(screen.queryByTestId('live-actions')).toBeNull()
    expect(screen.queryByText('matchLive.timeline')).toBeNull()
    expect(screen.queryByText('matchLive.unavailableTitle')).not.toBeNull()
  })

  it('does not roll back newer socket scores when a permission read or write finishes late', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    const receive = mockOn.mock.calls.find(([name]) => name === 'live:match')[1]
    let finishRead!: (value: MatchLiveStateDto) => void
    mockApi.mockImplementation((path: string) => path.endsWith('/live')
      ? new Promise(resolve => { finishRead = resolve }) : Promise.resolve(detail))
    await act(async () => { jest.advanceTimersByTime(15_000) })
    act(() => receive(state({ goalsFor: 2 })))
    await act(async () => finishRead(state()))
    expect(screen.queryByText('2:0')).not.toBeNull()
    let finishWrite!: (value: MatchLiveStateDto) => void
    let finishRecheck!: (value: MatchLiveStateDto) => void
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method) return new Promise(resolve => { finishWrite = resolve })
      return path.endsWith('/live') ? new Promise(resolve => { finishRecheck = resolve }) : Promise.resolve(detail)
    })
    fireEvent.press(screen.getByTestId('live-conceded'))
    act(() => receive(state({ goalsFor: 3 })))
    await act(async () => finishWrite(state({ goalsFor: 2, goalsAgainst: 1 })))
    expect(screen.queryByText('3:0')).not.toBeNull()
    await act(async () => finishRecheck(state({ goalsFor: 3, goalsAgainst: 1 })))
    expect(screen.queryByText('3:1')).not.toBeNull()
  })

  it('does not restore revoked controls from a late successful write', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    let finish!: (value: MatchLiveStateDto) => void
    mockApi.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method) return new Promise(resolve => { finish = resolve })
      return Promise.resolve(path.endsWith('/live') ? state({ canRecord: false }) : detail)
    })
    fireEvent.press(screen.getByTestId('live-conceded'))
    await act(async () => { jest.advanceTimersByTime(15_000) })
    expect(screen.queryByTestId('live-actions')).toBeNull()
    await act(async () => finish(state({ goalsAgainst: 1 })))
    expect(screen.queryByTestId('live-actions')).toBeNull()
  })

  it.each(['club', 'session'])('ignores old reads and socket callbacks after a %s switch', async field => {
    let stale!: (value: MatchLiveStateDto) => void
    route(state())
    mockApi.mockImplementationOnce(() => new Promise(resolve => { stale = resolve }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await waitFor(() => expect(mockOn).toHaveBeenCalled())
    const receive = mockOn.mock.calls[0][1]
    if (field === 'club') mockClubId = 'c2'
    else mockSession = 'new-session'
    mockApi.mockImplementation((path: string) => Promise.resolve(path.endsWith('/live') ? state({ canRecord: false }) : detail))
    screen.rerender(<RecordedMatchLive eventId="e1" />)
    await screen.findByText('matchLive.timeline')
    await act(async () => { stale(state()); receive(state()) })
    expect(screen.queryByTestId('live-actions')).toBeNull()
  })

  it('joins the event room for live updates', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByTestId('live-actions')
    await waitFor(() => expect(mockEmit).toHaveBeenCalledWith('live:join', { eventId: 'e1' }))
    expect(mockOn).toHaveBeenCalledWith('live:match', expect.any(Function))
  })

  it('records a goal with the picked scorer', async () => {
    route(state(), state({ goalsFor: 1, scoreHome: 1 }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-goal'))
    fireEvent.press(await screen.findByLabelText('Kofi Osei'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live/events', {
        method: 'POST',
        body: { kind: 'GOAL', playerUserId: 'p9' },
      }),
    )
  })

  it('records a goal against in one tap', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-conceded'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live/events', {
        method: 'POST',
        body: { kind: 'CONCEDED' },
      }),
    )
  })

  it('records a substitution as player on for player off', async () => {
    route(state())
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-sub'))
    fireEvent.press(await screen.findByLabelText('Tomasz Nowak'))
    fireEvent.press(await screen.findByLabelText('Kofi Osei'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live/events', {
        method: 'POST',
        body: { kind: 'SUB', playerUserId: 'p9', relatedUserId: 'p4' },
      }),
    )
  })

  it('kicks off from the footer before any actions show', async () => {
    route(state({ status: 'NOT_STARTED', minute: null, kickoffAt: null }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-clock'))
    expect(screen.queryByTestId('live-actions')).toBeNull()
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/events/e1/live', {
        method: 'PATCH',
        body: { status: 'FIRST_HALF' },
      }),
    )
  })

  it('asks before the final whistle', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    route(state({ status: 'SECOND_HALF', secondHalfAt: new Date().toISOString() }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    fireEvent.press(await screen.findByTestId('live-clock'))
    expect(alert).toHaveBeenCalled()
    expect(mockApi).not.toHaveBeenCalledWith('/clubs/c1/events/e1/live', expect.objectContaining({ method: 'PATCH' }))
    alert.mockRestore()
  })

  it('is read-only for players', async () => {
    route(state({ canRecord: false }))
    const screen = render(<RecordedMatchLive eventId="e1" />)
    await screen.findByText('matchLive.timeline')
    expect(screen.queryByTestId('live-actions')).toBeNull()
    expect(screen.queryByTestId('live-clock')).toBeNull()
  })
})

describe('liveMinute', () => {
  it('ticks from the recorded kick-off and restart', () => {
    const now = Date.parse('2026-11-15T13:30:00Z')
    expect(liveMinute(state({ status: 'FIRST_HALF', kickoffAt: '2026-11-15T13:00:00Z' }), now)).toBe(31)
    expect(
      liveMinute(state({ status: 'SECOND_HALF', secondHalfAt: '2026-11-15T13:25:00Z' }), now),
    ).toBe(51)
    expect(liveMinute(state({ status: 'HALF_TIME', minute: 45 }), now)).toBe(45)
  })
})
