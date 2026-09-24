import { act, renderHook, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()
jest.mock('../../../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }))

let mockAuth = { user: { id: 'user-a' }, activeClub: { club: { id: 'club-1' } } }
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockAuth }))

import { invalidateApi, resetApiCache, useApiQuery } from '../query'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** M6 (review 2026-09-24): the Wechselbörse cache is per user + club. */
describe('wechsel query cache', () => {
  beforeEach(() => {
    resetApiCache()
    mockApi.mockReset()
    mockAuth = { user: { id: 'user-a' }, activeClub: { club: { id: 'club-1' } } }
  })

  it('drops cached data when another user signs in', async () => {
    mockApi.mockResolvedValueOnce([{ id: 'trial-of-a' }])
    const { result, rerender } = renderHook(() => useApiQuery<Array<{ id: string }>>('/me/trial-invites'))
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'trial-of-a' }]))

    const next = deferred<unknown>()
    mockApi.mockReturnValueOnce(next.promise)
    mockAuth = { user: { id: 'user-b' }, activeClub: { club: { id: 'club-1' } } }
    rerender({})

    // Never shows user A's trials to user B, not even while loading.
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
    await act(async () => next.resolve([{ id: 'trial-of-b' }]))
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'trial-of-b' }]))
  })

  it('drops cached data when the active club changes', async () => {
    mockApi.mockResolvedValueOnce({ club: 1 })
    const { result, rerender } = renderHook(() => useApiQuery('/free-agents'))
    await waitFor(() => expect(result.current.data).toEqual({ club: 1 }))

    mockApi.mockResolvedValueOnce({ club: 2 })
    mockAuth = { user: { id: 'user-a' }, activeClub: { club: { id: 'club-2' } } }
    rerender({})
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toEqual({ club: 2 }))
  })

  it('invalidation ignores a stale in-flight answer and refetches', async () => {
    const stale = deferred<unknown>()
    mockApi.mockReturnValueOnce(stale.promise)
    const { result } = renderHook(() => useApiQuery('/me/trial-invites'))

    mockApi.mockResolvedValueOnce({ status: 'ACCEPTED' })
    act(() => invalidateApi('/me/trial-invites'))
    await waitFor(() => expect(result.current.data).toEqual({ status: 'ACCEPTED' }))

    // The request sent before the mutation lands late: it must not win.
    await act(async () => stale.resolve({ status: 'PENDING' }))
    expect(result.current.data).toEqual({ status: 'ACCEPTED' })
    expect(mockApi).toHaveBeenCalledTimes(2)
  })
})
