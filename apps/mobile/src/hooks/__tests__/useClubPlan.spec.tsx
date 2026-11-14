import { act, renderHook, waitFor } from '@testing-library/react-native'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { fallbackClubPlan, useClubPlan } from '../useClubPlan'

jest.mock('../../api/client', () => ({ api: jest.fn() }))
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }))
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
  jest.clearAllMocks()
  mockAuth.mockReturnValue(auth())
  mockApi.mockReset().mockResolvedValue(free)
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
