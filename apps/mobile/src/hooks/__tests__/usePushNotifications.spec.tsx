import { act, renderHook } from '@testing-library/react-native'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { usePushNotifications } from '../usePushNotifications'
import { subscribeNotifications } from '../../lib/notificationEvents'

const mockListeners: Record<string, (...args: any[]) => void> = {}
const mockRemove = jest.fn()
jest.mock('expo-device', () => ({ isDevice: true }))
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { easConfig: { projectId: 'qa-project' } },
}))
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(),
  addPushTokenListener: jest.fn((cb) => {
    mockListeners.token = cb
    return { remove: mockRemove }
  }),
  addNotificationReceivedListener: jest.fn((cb) => {
    mockListeners.receive = cb
    return { remove: mockRemove }
  }),
  addNotificationResponseReceivedListener: jest.fn((cb) => {
    mockListeners.tap = cb
    return { remove: mockRemove }
  }),
  AndroidImportance: { HIGH: 4 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
}))

const mockFetch = jest.fn()
const originalFetch = global.fetch
const originalOS = Platform.OS
const flush = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}
const response = {
  actionIdentifier: 'default',
  notification: {
    request: { identifier: 'qa-notification', content: { data: { type: 'join_approved' } } },
  },
}

describe('native push lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    global.fetch = mockFetch
    mockFetch.mockReset().mockResolvedValue({ ok: true })
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })
    ;(Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true })
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[qa-device]',
    })
    ;(Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null)
    ;(Notifications.clearLastNotificationResponseAsync as jest.Mock).mockResolvedValue(undefined)
    ;(Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(undefined)
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, cb) => {
      mockListeners.appState = cb
      return { remove: mockRemove }
    })
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    global.fetch = originalFetch
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS })
  })
  const mount = () =>
    renderHook(() => usePushNotifications({ apiUrl: 'https://qa.invalid', token: 'qa-session' }))

  it.each(['ios', 'android'])(
    'registers %s with the backend; Android creates its channel before permission',
    async (platform) => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
      const { result, unmount } = mount()
      await flush()
      expect(result.current.registrationStatus).toBe('registered')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://qa.invalid/push/register',
        expect.objectContaining({
          body: JSON.stringify({ token: 'ExponentPushToken[qa-device]', platform }),
          headers: expect.objectContaining({ Authorization: 'Bearer qa-session' }),
        }),
      )
      if (platform === 'android') {
        expect(
          (Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0],
        ).toBeLessThan((Notifications.getPermissionsAsync as jest.Mock).mock.invocationCallOrder[0])
      }
      unmount()
    },
  )

  it('does not register or re-prompt after permission is denied', async () => {
    ;(Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
    })
    const { result, unmount } = mount()
    await flush()
    expect(result.current.registrationStatus).toBe('denied')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
    unmount()
  })

  it('retries failed backend registration without requiring a reopen', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue({ ok: true })
    const { result, unmount } = mount()
    await flush()
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    expect(result.current.registrationStatus).toBe('registered')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('recovers native token acquisition while the app remains open', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    const { result, unmount } = mount()
    await flush()
    expect(result.current.registrationStatus).toBe('error')
    await act(async () => {
      jest.advanceTimersByTime(60_000)
    })
    expect(result.current.registrationStatus).toBe('registered')
    unmount()
  })

  it('invalidates foreground data and handles a cold-start tap only once', async () => {
    ;(Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(response)
    const listener = jest.fn()
    const unsubscribe = subscribeNotifications(listener)
    const { result, unmount } = mount()
    await flush()
    expect(result.current.lastNotification).toEqual(response)
    expect(listener).toHaveBeenCalledTimes(1)
    act(() => mockListeners.tap(response))
    expect(listener).toHaveBeenCalledTimes(1)
    act(() => mockListeners.receive())
    expect(listener).toHaveBeenCalledTimes(2)
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1)
    unsubscribe()
    unmount()
    expect(mockRemove).toHaveBeenCalledTimes(4)
  })

  it('updates a rotated device token', async () => {
    const { unmount } = mount()
    await flush()
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[rotated]',
    })
    await act(async () => {
      mockListeners.token()
    })
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ token: 'ExponentPushToken[rotated]', platform: 'ios' }),
      }),
    )
    unmount()
  })
})
