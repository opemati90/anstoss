import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { notifyNotificationReceived } from '../../lib/notificationEvents'
import { useInboxUnreadCount, useNotificationInbox } from '../useNotificationInbox'
import { useApiQuery, resetApiCache } from '../../features/wechsel/query'

const mockApi = jest.fn()
jest.mock('../../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}))
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'qa-agent' }, activeClub: null }),
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
})
