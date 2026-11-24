import { act, renderHook } from '@testing-library/react-native'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { unregisterPushToken, usePushNotifications } from '../usePushNotifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
const lease = { id: "qa-registration", updatedAt: "2026-11-16T10:00:00.000Z" }
const registeredResponse = { ok: true, status: 201, json: async () => ({ success: true, registration: lease }) }
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
  beforeEach(async () => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    await AsyncStorage.clear()
    global.fetch = mockFetch
    mockFetch.mockReset().mockResolvedValue(registeredResponse)
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
          body: JSON.stringify({ token: 'ExponentPushToken[qa-device]', platform, registration: null }),
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
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) }).mockResolvedValue(registeredResponse)
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

  it.each(['ios', 'android'])('times out stalled %s token acquisition and recovers without a reopen', async (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    let finishStalled!: (value: { data: string }) => void
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementationOnce(
      () => new Promise(resolve => { finishStalled = resolve }),
    )
    const { result, unmount } = mount()
    await flush()
    await act(async () => { jest.advanceTimersByTime(20_000) })
    expect(result.current.registrationStatus).toBe('error')
    expect(result.current.registrationError).toContain('timed out')
    expect(mockFetch).not.toHaveBeenCalled()
    await act(async () => { jest.advanceTimersByTime(40_000) })
    expect(result.current.registrationStatus).toBe('registered')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await act(async () => { finishStalled({ data: 'ExponentPushToken[stale]' }) })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.current.expoPushToken).toBe('ExponentPushToken[qa-device]')
    unmount()
  })

  it('ignores a stalled acquisition that completes after sign-out', async () => {
    let finishStalled!: (value: { data: string }) => void
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementationOnce(
      () => new Promise(resolve => { finishStalled = resolve }),
    )
    const { result, rerender, unmount } = renderHook<ReturnType<typeof usePushNotifications>, { token: string | null }>(
      ({ token }) => usePushNotifications({ apiUrl: 'https://qa.invalid', token }),
      { initialProps: { token: 'qa-session' } },
    )
    await flush()
    rerender({ token: null })
    await act(async () => { finishStalled({ data: 'ExponentPushToken[old-account]' }) })
    expect(result.current.registrationStatus).toBe('idle')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem('anstoss:push-token')).toBeNull()
    unmount()
  })

  it('retries a failed token refresh even after an earlier successful registration', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { result, unmount } = mount()
    await flush()
    expect(result.current.registrationStatus).toBe('registered')
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    await act(async () => { mockListeners.token() })
    expect(result.current.registrationStatus).toBe('error')
    await act(async () => { jest.advanceTimersByTime(60_000) })
    expect(result.current.registrationStatus).toBe('registered')
    expect(mockFetch).toHaveBeenCalledTimes(2)
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
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ token: 'ExponentPushToken[rotated]', platform: 'ios', registration: null }),
      }),
    )
    expect(mockFetch).toHaveBeenLastCalledWith('https://qa.invalid/push/unregister', expect.objectContaining({
      body: JSON.stringify({ token: 'ExponentPushToken[qa-device]', registration: lease }),
    }))
    unmount()
  })

  it.each(['ios', 'android'])('does not loop when %s native acquisition emits its token event', async (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
    const nativeToken = { type: platform, data: 'qa-native-token' }
    let nativeAcquisitions = 0
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(async options => {
      if (!options.devicePushToken) {
        nativeAcquisitions += 1
        if (nativeAcquisitions > 3) throw new Error('Native token feedback loop')
        mockListeners.token(nativeToken)
      }
      return { data: 'ExponentPushToken[qa-device]' }
    })
    const { result, unmount } = mount()
    await flush()
    expect(result.current.registrationStatus).toBe('registered')
    expect(nativeAcquisitions).toBe(1)
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2)
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({
      projectId: 'qa-project', devicePushToken: nativeToken,
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('passes only the latest queued native rotation to Expo after registration settles', async () => {
    let finish!: (value: typeof registeredResponse) => void
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { result, unmount } = mount()
    await flush()
    act(() => {
      mockListeners.token({ type: 'ios', data: 'native-intermediate' })
      mockListeners.token({ type: 'ios', data: 'native-latest' })
    })
    await act(async () => { finish(registeredResponse) })
    expect(result.current.registrationStatus).toBe('registered')
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2)
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({
      projectId: 'qa-project', devicePushToken: { type: 'ios', data: 'native-latest' },
    })
    unmount()
  })

  it('keeps the new account registration when an old logout request finishes later', async () => {
    const { rerender, unmount } = renderHook<ReturnType<typeof usePushNotifications>, { token: string }>(
      ({ token }) => usePushNotifications({ apiUrl: 'https://qa.invalid', token }),
      { initialProps: { token: 'account-a-session' } },
    )
    await flush()
    let finishLogout!: (response: { ok: boolean }) => void
    mockFetch.mockImplementation((_url, options) => options.method === 'DELETE'
      ? new Promise(resolve => { finishLogout = resolve }) : Promise.resolve(registeredResponse))
    const cleanup = unregisterPushToken('https://qa.invalid', 'account-a-session')
    await flush()
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[account-b]' })
    rerender({ token: 'account-b-session' })
    await flush()
    finishLogout({ ok: true })
    await cleanup
    expect(await AsyncStorage.getItem('anstoss:push-token')).toBe('ExponentPushToken[account-b]')
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('session'))
    mockFetch.mockResolvedValue(registeredResponse)
    await unregisterPushToken('https://qa.invalid', 'account-b-session')
    expect(mockFetch).toHaveBeenLastCalledWith('https://qa.invalid/push/unregister', expect.objectContaining({
      body: JSON.stringify({ token: 'ExponentPushToken[account-b]', registration: lease }),
      headers: expect.objectContaining({ Authorization: 'Bearer account-b-session' }),
    }))
    unmount()
  })

  it('ignores logout cleanup from a session replaced before cleanup starts', async () => {
    const { unmount } = renderHook(() => usePushNotifications({ apiUrl: 'https://qa.invalid', token: 'new-session' }))
    await flush()
    mockFetch.mockClear()
    await unregisterPushToken('https://qa.invalid', 'old-session')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(await AsyncStorage.getItem('anstoss:push-token')).toBe('ExponentPushToken[qa-device]')
    unmount()
  })

  it('bounds unregister cleanup even when native fetch does not settle on abort', async () => {
    const { unmount } = mount()
    await flush()
    mockFetch.mockImplementation(() => new Promise(() => {}))
    const cleanup = unregisterPushToken('https://qa.invalid', 'qa-session')
    await flush()
    const request = mockFetch.mock.calls.at(-1)![1]
    await act(async () => { jest.advanceTimersByTime(12_000); await cleanup })
    expect(request.signal.aborted).toBe(true)
    expect(await AsyncStorage.getItem('anstoss:push-token')).toBeNull()
    unmount()
  })

  it('does not persist or register token acquisition that finishes after its session ended', async () => {
    let finishAcquisition!: (data: { data: string }) => void
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementationOnce(() =>
      new Promise(resolve => { finishAcquisition = resolve }))
    const { rerender, unmount } = renderHook<ReturnType<typeof usePushNotifications>, { token: string }>(
      ({ token }) => usePushNotifications({ apiUrl: 'https://qa.invalid', token }),
      { initialProps: { token: 'old-session' } },
    )
    await flush()
    rerender({ token: 'new-session' })
    await flush()
    await act(async () => { finishAcquisition({ data: 'ExponentPushToken[obsolete]' }) })
    expect(await AsyncStorage.getItem('anstoss:push-token')).toBe('ExponentPushToken[qa-device]')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('retries a registration conflict only for the current session and persists its returned lease', async () => {
    const next = { ...lease, updatedAt: '2026-11-16T10:00:00.001Z' }
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({
      code: 'push_registration_changed', registration: lease,
    }) }).mockResolvedValue({ ok: true, json: async () => ({ registration: next }) })
    const { result, unmount } = mount()
    await flush()
    await act(async () => { jest.advanceTimersByTime(2000) })
    expect(result.current.registrationStatus).toBe('registered')
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).registration).toEqual(lease)
    const saved = JSON.parse((await AsyncStorage.getItem('anstoss:push-registration'))!)
    expect(saved).toEqual({ token: 'ExponentPushToken[qa-device]', registration: next })
    await unregisterPushToken('https://qa.invalid', 'qa-session')
    expect(JSON.parse(mockFetch.mock.calls.at(-1)![1].body).registration).toEqual(next)
    unmount()
  })

  it('removes only the returned old lease when an in-flight registration finishes after logout', async () => {
    let finishRegister!: (response: typeof registeredResponse) => void
    mockFetch.mockImplementation((_url, options) => options.method === 'POST'
      ? new Promise(resolve => { finishRegister = resolve }) : Promise.resolve({ ok: true }))
    const { unmount } = mount()
    await flush()
    await unregisterPushToken('https://qa.invalid', 'qa-session')
    unmount()
    await act(async () => { finishRegister(registeredResponse) })
    expect(mockFetch).toHaveBeenLastCalledWith('https://qa.invalid/push/unregister', expect.objectContaining({
      body: JSON.stringify({ token: 'ExponentPushToken[qa-device]', registration: lease }),
    }))
    expect(await AsyncStorage.getItem('anstoss:push-registration')).toBeNull()
  })

  it('does not let a stale registration conflict retry into a newer account', async () => {
    let finishOld!: (response: unknown) => void
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    const { rerender, unmount } = renderHook<ReturnType<typeof usePushNotifications>, { token: string }>(
      ({ token }) => usePushNotifications({ apiUrl: 'https://qa.invalid', token }),
      { initialProps: { token: 'old-session' } },
    )
    await flush()
    rerender({ token: 'new-session' })
    await flush()
    await act(async () => { finishOld({ ok: false, status: 409, json: async () => ({
      code: 'push_registration_changed', registration: lease,
    }) }); jest.advanceTimersByTime(10_000) })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('reacquires a native token that rotates during registration', async () => {
    let finishRegister!: (response: typeof registeredResponse) => void
    mockFetch.mockImplementationOnce(() => new Promise(resolve => { finishRegister = resolve }))
    const { unmount } = mount()
    await flush()
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[rotated-in-flight]' })
    act(() => mockListeners.token())
    await act(async () => { finishRegister(registeredResponse) })
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).token).toBe('ExponentPushToken[rotated-in-flight]')
    unmount()
  })

  it('keeps leases paired with their tokens when logout interrupts token rotation', async () => {
    const { unmount } = mount()
    await flush()
    const rotatedLease = { ...lease, id: 'rotated-registration' }
    let finishRotation!: (response: unknown) => void
    mockFetch.mockImplementation((_url, options) => options.method === 'POST'
      ? new Promise(resolve => { finishRotation = resolve }) : Promise.resolve({ ok: true }))
    ;(Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[rotated-pending]' })
    await act(async () => { mockListeners.token() })
    await unregisterPushToken('https://qa.invalid', 'qa-session')
    expect(mockFetch).toHaveBeenLastCalledWith('https://qa.invalid/push/unregister', expect.objectContaining({
      body: JSON.stringify({ token: 'ExponentPushToken[qa-device]', registration: lease }),
    }))
    unmount()
    await act(async () => { finishRotation({ ok: true, json: async () => ({ registration: rotatedLease }) }) })
    expect(mockFetch).toHaveBeenLastCalledWith('https://qa.invalid/push/unregister', expect.objectContaining({
      body: JSON.stringify({ token: 'ExponentPushToken[rotated-pending]', registration: rotatedLease }),
    }))
  })
})
