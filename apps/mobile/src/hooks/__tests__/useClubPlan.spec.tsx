import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import { planFeatureFlags } from '@anstoss/shared'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { fallbackClubPlan, useClubPlan } from '../useClubPlan'

jest.mock('../../api/client', () => ({ api: jest.fn() }))
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }))
let mockFocused = true
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(
    () => mockFocused ? callback() : undefined, [callback, mockFocused],
  ),
}))
const appStateListeners = new Set<(state: AppStateStatus) => void>()
const changeAppState = (state: AppStateStatus) => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: state })
  appStateListeners.forEach(listener => listener(state))
}
const mockApi = api as jest.Mock
const mockAuth = useAuth as jest.Mock
const auth = (role = 'OWNER', id = 'user', clubId = 'club', token = 'session') => ({
  user: { id },
  token,
  activeClub: { role, operationalRoles: [], club: { id: clubId } },
})
const free = fallbackClubPlan('club', true)
const paid = {
  ...free,
  tier: 'PRO',
  source: 'TRIAL',
  trialUsed: true,
  trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
}
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockFocused = true
  appStateListeners.clear()
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener)
    return { remove: () => { appStateListeners.delete(listener) } }
  })
  mockAuth.mockReturnValue(auth())
  mockApi.mockReset().mockResolvedValue(free)
})
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

const complimentary = { ...free, tier: 'PRO', source: 'COMPLIMENTARY',
  features: planFeatureFlags('PRO'), limits: { teams: 3, players: 90 } }

it('shows admin upgrades and revocations on an already-open screen without store billing', async () => {
  const { result } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.plan?.tier).toBe('FREE'))
  mockApi.mockResolvedValue(complimentary)
  await act(async () => { jest.advanceTimersByTime(15_000) })
  expect(result.current.plan).toMatchObject({ source: 'COMPLIMENTARY', limits: { teams: 3, players: 90 } })
  expect(result.current.has('liveTicker')).toBe(true)
  mockApi.mockResolvedValue(free)
  await act(async () => { jest.advanceTimersByTime(15_000) })
  expect(result.current.plan?.tier).toBe('FREE')
  expect(result.current.has('liveTicker')).toBe(false)
  expect(mockApi.mock.calls.every(([path]) => path === '/clubs/club/plan')).toBe(true)
})

it('pauses in the background and refreshes an expired grant immediately on resume', async () => {
  mockApi.mockResolvedValue(complimentary)
  const { result } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.plan?.tier).toBe('PRO'))
  act(() => changeAppState('background'))
  mockApi.mockResolvedValue(free)
  await act(async () => { jest.advanceTimersByTime(60_000) })
  expect(mockApi).toHaveBeenCalledTimes(1)
  await act(async () => changeAppState('active'))
  expect(mockApi).toHaveBeenCalledTimes(2)
  expect(result.current.plan?.tier).toBe('FREE')
})

it('refreshes when navigating back and leaves no polling or resume listener after unmount', async () => {
  const { result, rerender, unmount } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.plan?.tier).toBe('FREE'))
  mockFocused = false
  rerender({})
  mockApi.mockResolvedValue(complimentary)
  await act(async () => { jest.advanceTimersByTime(60_000); changeAppState('active') })
  expect(mockApi).toHaveBeenCalledTimes(1)
  mockFocused = true
  rerender({})
  await waitFor(() => expect(result.current.plan?.tier).toBe('PRO'))
  expect(mockApi).toHaveBeenCalledTimes(2)
  unmount()
  await act(async () => { jest.advanceTimersByTime(60_000); changeAppState('active') })
  expect(mockApi).toHaveBeenCalledTimes(2)
  expect(appStateListeners.size).toBe(0)
})

it('coalesces slow reads across polling, resume and manual refresh', async () => {
  let resolve!: (value: unknown) => void
  mockApi.mockImplementation(() => new Promise(done => { resolve = done }))
  const { result } = renderHook(() => useClubPlan())
  await act(async () => {
    jest.advanceTimersByTime(60_000)
    changeAppState('active')
    void result.current.refresh()
  })
  expect(mockApi).toHaveBeenCalledTimes(1)
  await act(async () => resolve(complimentary))
  expect(result.current.plan?.source).toBe('COMPLIMENTARY')
})

it.each(['resume', 'focus'])('discards a delayed pre-revocation response on %s and makes a fresh read', async trigger => {
  let stale!: (value: unknown) => void
  mockApi.mockImplementationOnce(() => new Promise(resolve => { stale = resolve }))
  const { result, rerender } = renderHook(() => useClubPlan())
  if (trigger === 'resume') act(() => changeAppState('background'))
  else { mockFocused = false; rerender({}) }
  mockApi.mockResolvedValue(free)
  if (trigger === 'resume') await act(async () => changeAppState('active'))
  else { mockFocused = true; rerender({}) }
  await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2))
  await act(async () => stale(complimentary))
  expect(result.current.plan?.tier).toBe('FREE')
  expect(result.current.has('liveTicker')).toBe(false)
})

it('clears stale access on a failed refresh and recovers on the next check', async () => {
  mockApi.mockResolvedValue(complimentary)
  const { result } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.has('liveTicker')).toBe(true))
  mockApi.mockRejectedValue(new Error('offline'))
  await act(async () => { jest.advanceTimersByTime(15_000) })
  expect(result.current.error).toBe(true)
  expect(result.current.plan).toBeNull()
  expect(result.current.has('liveTicker')).toBe(false)
  mockApi.mockResolvedValue(free)
  await act(async () => { jest.advanceTimersByTime(15_000) })
  expect(result.current.error).toBe(false)
  expect(result.current.plan?.tier).toBe('FREE')
})

it('does not poll a club or session after logout', async () => {
  const { result, rerender } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.plan?.tier).toBe('FREE'))
  mockAuth.mockReturnValue({ user: null, token: null, activeClub: null })
  rerender({})
  await act(async () => { jest.advanceTimersByTime(60_000); changeAppState('active') })
  expect(mockApi).toHaveBeenCalledTimes(1)
  expect(result.current.plan).toBeNull()
})

it('reloads permissions when the same club switches from a player to an owner', async () => {
  mockAuth.mockReturnValue(auth('PLAYER'))
  mockApi.mockResolvedValueOnce({ ...free, canManage: false })
  const { result, rerender } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.plan?.canManage).toBe(false))
  mockAuth.mockReturnValue(auth())
  rerender({})
  expect(result.current.plan).toBeNull()
  await waitFor(() => expect(result.current.plan?.canManage).toBe(true))
  expect(mockApi).toHaveBeenCalledTimes(2)
})

it.each(['user', 'token', 'club', 'role'])(
  'rejects a stale read after %s changes',
  async (field) => {
    let resolve!: (value: unknown) => void
    mockApi.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { result, rerender } = renderHook(() => useClubPlan())
    mockAuth.mockReturnValue(
      auth(
        field === 'role' ? 'PLAYER' : 'OWNER',
        field === 'user' ? 'other' : 'user',
        field === 'club' ? 'other-club' : 'club',
        field === 'token' ? 'other-session' : 'session',
      ),
    )
    mockApi.mockResolvedValueOnce({
      ...free,
      clubId: field === 'club' ? 'other-club' : 'club',
      canManage: false,
    })
    rerender({})
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => resolve(paid))
    expect(result.current.plan?.tier).toBe('FREE')
    expect(result.current.plan?.canManage).toBe(false)
  },
)

it.each([null, {}, { ...free, clubId: 'foreign' }])(
  'fails closed on invalid plan data: %p',
  async (raw) => {
    mockApi.mockResolvedValue(raw)
    const { result } = renderHook(() => useClubPlan())
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.plan).toBeNull()
    expect(result.current.has('fixtureImport')).toBe(false)
  },
)

it('broadcasts a confirmed trial only to hooks in the same session', async () => {
  const first = renderHook(() => useClubPlan())
  const second = renderHook(() => useClubPlan())
  await waitFor(() => expect(first.result.current.plan).toEqual(free))
  await waitFor(() => expect(second.result.current.plan).toEqual(free))
  mockApi.mockResolvedValueOnce(paid)
  await act(async () => {
    await first.result.current.startTrial()
  })
  expect(first.result.current.plan?.tier).toBe('PRO')
  expect(second.result.current.plan?.tier).toBe('PRO')
})

it('does not report a trial as started from an incomplete acknowledgement', async () => {
  const { result } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.plan).toEqual(free))
  mockApi.mockResolvedValueOnce(free)
  await act(async () => {
    await expect(result.current.startTrial()).rejects.toThrow()
  })
  expect(result.current.plan?.tier).toBe('FREE')
})

it('does not request a plan after logout', async () => {
  const { result, rerender } = renderHook(() => useClubPlan())
  await waitFor(() => expect(result.current.plan).toEqual(free))
  mockAuth.mockReturnValue({ user: null, token: null, activeClub: null })
  rerender({})
  expect(result.current.plan).toBeNull()
  expect(mockApi).toHaveBeenCalledTimes(1)
  await expect(result.current.startTrial()).rejects.toThrow()
})
