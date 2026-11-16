import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { notifyNotificationReceived } from '../../lib/notificationEvents'
import { useInboxUnreadCount, useNotificationInbox } from '../useNotificationInbox'
import { useApiQuery, resetApiCache } from '../../features/wechsel/query'

const mockApi = jest.fn()
let mockUserId: string | null = 'qa-agent'
let mockToken = 'session-a'
jest.mock('../../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}))
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null, token: mockToken, activeClub: null }),
}))

const page = (id: string, cursor: string | null = null) => ({
  items: [{ id, readAt: null, createdAt: new Date().toISOString() }],
  unreadCount: 1,
  nextCursor: cursor,
})
const flush = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('notification-driven foreground refresh', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockApi.mockReset()
    mockUserId = 'qa-agent'
    mockToken = 'session-a'
    resetApiCache()
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('updates the inbox and bell on a received push without manual refresh', async () => {
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('unread-count') ? { unreadCount: 1 } : page('first')),
    )
    const inbox = renderHook(useNotificationInbox)
    const bell = renderHook(() => useInboxUnreadCount())
    await flush()
    mockApi.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('unread-count') ? { unreadCount: 2 } : { ...page('second'), unreadCount: 2 },
      ),
    )
    await act(async () => {
      notifyNotificationReceived()
    })
    expect(inbox.result.current.items.map((item) => item.id)).toEqual(['second', 'first'])
    expect(bell.result.current.unreadCount).toBe(2)
    inbox.unmount()
    bell.unmount()
  })

  it('discards old account responses and unread broadcasts after switching accounts', async () => {
    let resolveOld!: (value: unknown) => void
    mockApi.mockImplementation((path: string) => path.endsWith('unread-count')
      ? Promise.resolve({ unreadCount: 9 }) : new Promise(resolve => { resolveOld = resolve }))
    const inbox = renderHook(useNotificationInbox)
    const bell = renderHook(() => useInboxUnreadCount())
    await flush()
    mockUserId = 'new-account'
    mockToken = 'session-b'
    mockApi.mockImplementation((path: string) => Promise.resolve(path.endsWith('unread-count')
      ? { unreadCount: 1 } : page('new-account-item')))
    inbox.rerender({})
    bell.rerender({})
    await flush()
    await act(async () => { resolveOld({ ...page('private-old-account-item'), unreadCount: 99 }) })
    expect(inbox.result.current.items.map(item => item.id)).toEqual(['new-account-item'])
    expect(bell.result.current.unreadCount).toBe(1)
    mockUserId = null
    inbox.rerender({})
    bell.rerender({})
    expect(inbox.result.current.items).toEqual([])
    expect(bell.result.current.unreadCount).toBe(0)
    inbox.unmount()
    bell.unmount()
  })

  it('ignores a delayed mark-read response after a new login for the same user', async () => {
    mockApi.mockResolvedValue(page('first'))
    const inbox = renderHook(useNotificationInbox)
    await flush()
    let resolveRead!: (value: unknown) => void
    mockApi.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve }))
    let pending!: Promise<void>
    act(() => { pending = inbox.result.current.markRead('first') })
    mockToken = 'new-session'
    mockApi.mockResolvedValue(page('new-session-item'))
    inbox.rerender({})
    await flush()
    await act(async () => { resolveRead({ unreadCount: 99 }); await pending })
    expect(inbox.result.current.unreadCount).toBe(1)
    expect(inbox.result.current.items.map(item => item.id)).toEqual(['new-session-item'])
    inbox.unmount()
  })

  it('keeps paginated history while automatically adding new notifications', async () => {
    mockApi
      .mockResolvedValueOnce(page('first', 'cursor-1'))
      .mockResolvedValueOnce(page('older', 'cursor-2'))
      .mockResolvedValueOnce(page('newest', 'cursor-new'))
      .mockResolvedValueOnce(page('oldest'))
    const { result, unmount } = renderHook(useNotificationInbox)
    await flush()
    await act(async () => {
      await result.current.loadMore()
    })
    await act(async () => {
      notifyNotificationReceived()
    })
    expect(result.current.items.map((item) => item.id)).toEqual(['newest', 'first', 'older'])
    await act(async () => {
      await result.current.loadMore()
    })
    expect(mockApi).toHaveBeenLastCalledWith('/me/notifications?limit=30&cursor=cursor-2')
    unmount()
  })

  it('polls while visible when push is denied, but stops in the background and after unmount', async () => {
    mockApi.mockResolvedValue(page('first'))
    const { unmount } = renderHook(useNotificationInbox)
    await flush()
    const initial = mockApi.mock.calls.length
    await act(async () => {
      jest.advanceTimersByTime(15_000)
    })
    expect(mockApi).toHaveBeenCalledTimes(initial + 1)
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    expect(mockApi).toHaveBeenCalledTimes(initial + 1)
    unmount()
    act(() => notifyNotificationReceived())
    expect(mockApi).toHaveBeenCalledTimes(initial + 1)
  })

  it('refreshes a free agent trial offer while the portal stays open', async () => {
    mockApi.mockResolvedValue([])
    const { result, unmount } = renderHook(() => useApiQuery('/me/trial-invites'))
    await flush()
    mockApi.mockResolvedValue([{ id: 'offer-1', status: 'PENDING' }])
    await act(async () => {
      notifyNotificationReceived()
    })
    expect(result.current.data).toEqual([{ id: 'offer-1', status: 'PENDING' }])
    unmount()
  })

  it('suppresses stale reads and pagination during mark-all, then reconciles with the server', async () => {
    mockApi.mockResolvedValueOnce(page('first', 'older'))
    const { result, unmount } = renderHook(useNotificationInbox)
    await flush()
    let finishOldRead!: (value: unknown) => void
    mockApi.mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve }))
    let refresh!: Promise<void>
    act(() => { refresh = result.current.refresh() })
    expect(result.current.refreshing).toBe(true)
    let finishWrite!: (value: unknown) => void
    mockApi.mockImplementationOnce(() => new Promise(resolve => { finishWrite = resolve }))
    let write!: Promise<void>
    act(() => { write = result.current.markAllRead() })
    expect(result.current.refreshing).toBe(false)
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.items[0].readAt).not.toBeNull()
    const calls = mockApi.mock.calls.length
    await act(async () => {
      notifyNotificationReceived()
      await result.current.loadMore()
      finishOldRead(page('first', 'older'))
      await refresh
    })
    expect(mockApi).toHaveBeenCalledTimes(calls)
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.items[0].readAt).not.toBeNull()
    mockApi.mockResolvedValue({ ...page('first'), items: [{ ...page('first').items[0], readAt: '2026-11-16T12:00:00.000Z' }], unreadCount: 0 })
    await act(async () => { finishWrite({}); await write })
    expect(mockApi).toHaveBeenLastCalledWith('/me/notifications?limit=30')
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.refreshing).toBe(false)
    unmount()
  })

})
