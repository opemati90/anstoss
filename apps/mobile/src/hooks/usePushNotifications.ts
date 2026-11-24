import { useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { pushRegistrationLeaseSchema, type PushRegistrationLease } from '@anstoss/shared'
import { notifyNotificationReceived } from '../lib/notificationEvents'
import { notifyAccessChanged } from '../auth/accessChanges'

const PUSH_TOKEN_KEY = 'anstoss:push-token'
const PUSH_REGISTRATION_KEY = 'anstoss:push-registration'
const UNREGISTER_TIMEOUT_MS = 12_000
const PUSH_TOKEN_TIMEOUT_MS = 20_000

class PushTokenTimeoutError extends Error {
  constructor() {
    super('Push token acquisition timed out; registration will retry')
    this.name = 'PushTokenTimeoutError'
  }
}

async function acquireExpoPushToken(projectId: string, devicePushToken?: Notifications.DevicePushToken) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    // Expo's native/provider request can stay pending without rejecting. Do not
    // leave the registration lock held forever. The SDK request is not
    // cancellable; Promise.race ignores late results (including rejections).
    return await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId, ...(devicePushToken ? { devicePushToken } : {}) }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new PushTokenTimeoutError()), PUSH_TOKEN_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
// Credentials stay in memory only. Storage operations are ordered independently
// of network cleanup, so an old logout cannot erase a newer login's token.
type RegistrationOwner = { authToken: string; pushToken: string | null; registeredToken: string | null; registration: PushRegistrationLease | null; revoked: boolean }
let registrationOwner: RegistrationOwner | null = null
let storageQueue: Promise<unknown> = Promise.resolve()
function withPushStorage<T>(work: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(work, work)
  storageQueue = result.catch(() => undefined)
  return result
}
async function storedRegistration(token: string): Promise<PushRegistrationLease | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_REGISTRATION_KEY)
    const record = raw ? JSON.parse(raw) : null
    if (record?.token !== token) return null
    const parsed = pushRegistrationLeaseSchema.safeParse(record.registration)
    return parsed.success ? parsed.data : null
  } catch { return null }
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

type UsePushOptions = {
  apiUrl: string
  token: string | null
}

export type PushRegistrationStatus =
  'idle' | 'requesting-permission' | 'denied' | 'registering' | 'registered' | 'error'

const REGISTER_RETRY_DELAYS_MS = [0, 2000, 8000]

/**
 * Register for push notifications and handle incoming notifications.
 *
 * - Registers Expo push token on mount
 * - Handles notification taps (returns last notification response)
 * - Cleans up listeners on unmount
 */
export function usePushNotifications({ apiUrl, token }: UsePushOptions) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [registrationStatus, setRegistrationStatus] = useState<PushRegistrationStatus>('idle')
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [lastNotification, setLastNotification] =
    useState<Notifications.NotificationResponse | null>(null)
  const handledResponse = useRef<string | null>(null)

  useEffect(() => {
    setLastNotification(null)
    // Native push only: expo-notifications has no web implementation, and the
    // web build is used for previews.
    if (!token || Platform.OS === 'web') {
      setExpoPushToken(null)
      setRegistrationStatus('idle')
      setRegistrationError(null)
      return
    }

    let cancelled = false
    const owner: RegistrationOwner = { authToken: token, pushToken: null, registeredToken: null, registration: null, revoked: false }
    registrationOwner = owner
    const isCurrent = () => !cancelled && !owner.revoked && registrationOwner === owner
    let registering = false
    let registerAgain = false
    let registered = false
    let latestNativeToken: Notifications.DevicePushToken | undefined
    const retryTimers = new Set<ReturnType<typeof setTimeout>>()

    const waitForRetry = (delayMs: number) =>
      new Promise<void>((resolve) => {
        if (delayMs === 0) {
          resolve()
          return
        }
        const timer = setTimeout(() => {
          retryTimers.delete(timer)
          resolve()
        }, delayMs)
        retryTimers.add(timer)
      })

    const registerWithApi = async (pushToken: string) => {
      let lastError: unknown
      let expected = await withPushStorage(() => storedRegistration(pushToken))
      for (const delayMs of REGISTER_RETRY_DELAYS_MS) {
        await waitForRetry(delayMs)
        if (!isCurrent()) return false
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 12_000)
        try {
          const response = await fetch(`${apiUrl}/push/register`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              token: pushToken,
              platform: Platform.OS,
              registration: expected,
            }),
          })
          const body = await response.json()
          if (!isCurrent()) {
            // A request accepted before logout may finish afterward. Remove
            // exactly its returned lease; a subsequent login's lease survives.
            const lease = pushRegistrationLeaseSchema.safeParse(body?.registration)
            if (response.ok && lease.success) await removeRegistration(apiUrl, token, pushToken, lease.data)
            return false
          }
          if (response.status === 409 && body?.code === 'push_registration_changed') {
            expected = body.registration === null ? null : pushRegistrationLeaseSchema.parse(body.registration)
            lastError = new Error('Push registration changed; retrying current session')
            continue
          }
          if (!response.ok) {
            throw new Error(`Push registration failed with HTTP ${response.status}`)
          }
          const priorToken = owner.registeredToken
          const priorLease = owner.registration
          owner.registration = pushRegistrationLeaseSchema.parse(body.registration)
          owner.registeredToken = pushToken
          await withPushStorage(async () => {
            if (isCurrent()) await AsyncStorage.setItem(PUSH_REGISTRATION_KEY,
              JSON.stringify({ token: pushToken, registration: owner.registration }))
          })
          if (priorToken && priorLease && priorToken !== pushToken) {
            await removeRegistration(apiUrl, token, priorToken, priorLease)
          }
          return true
        } catch (error) {
          lastError = error
        } finally {
          clearTimeout(timeout)
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Push registration failed')
    }

    const acquireAndRegister = async () => {
      if (!isCurrent()) return
      if (registering) { registerAgain = true; return }
      registering = true
      try {
        setRegistrationError(null)
        setRegistrationStatus('requesting-permission')
        const pushToken = await registerForPushNotifications(latestNativeToken)
        if (!isCurrent()) return
        if (!pushToken) {
          setRegistrationStatus('denied')
          return
        }

        setExpoPushToken(pushToken)
        owner.pushToken = pushToken
        await withPushStorage(async () => {
          if (isCurrent()) await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushToken)
        })
        if (!isCurrent()) return

        setRegistrationStatus('registering')
        registered = await registerWithApi(pushToken)
        if (isCurrent() && registered) {
          setRegistrationStatus('registered')
        }
      } catch (error) {
        if (!isCurrent()) return
        registered = false
        setRegistrationStatus('error')
        setRegistrationError(error instanceof Error ? error.message : String(error))
        if (__DEV__) console.warn('[push] registration failed:', error)
      } finally {
        registering = false
        if (registerAgain && isCurrent()) {
          registerAgain = false
          void acquireAndRegister()
        }
      }
    }

    void acquireAndRegister()
    // Recovery must not depend on leaving/reopening the app after an outage.
    const recoveryTimer = setInterval(() => {
      if (!registered && AppState.currentState === 'active') void acquireAndRegister()
    }, 60_000)
    const foregroundSubscription = AppState.addEventListener('change', (state) => {
      // Recover registration after connectivity returns or the user enables
      // notifications in Settings, without requiring a logout/reinstall.
      if (state === 'active') void acquireAndRegister()
    })

    // A native APNs/FCM token can roll while the app is installed. Re-acquire
    // the associated Expo token and sync it immediately instead of waiting for
    // the next launch.
    const pushTokenSubscription = Device.isDevice
      ? Notifications.addPushTokenListener((nativeToken) => {
          // Native acquisition itself emits this event. Reuse its payload:
          // reacquiring without it creates an acquisition/event feedback loop.
          // Keep the newest rotation when another registration is in flight.
          latestNativeToken = nativeToken
          void acquireAndRegister()
        })
      : null

    // Listen for incoming notifications (app in foreground)
    const notificationSubscription = Notifications.addNotificationReceivedListener(() => {
      notifyNotificationReceived()
      notifyAccessChanged()
    })

    // Listen for notification taps
    const handleResponse = (response: Notifications.NotificationResponse) => {
      if (!isCurrent()) return
      const responseId = `${response.notification.request.identifier}:${response.actionIdentifier}`
      if (handledResponse.current === responseId) return
      handledResponse.current = responseId
      notifyNotificationReceived()
      notifyAccessChanged()
      setLastNotification(response)
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined)
    }
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse)

    // Capture a notification that launched the app before listeners mounted.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      clearInterval(recoveryTimer)
      // Let already-sent requests settle (their 12s timeout still applies), so
      // a late success can be conditionally unregistered using its exact lease.
      retryTimers.forEach((timer) => clearTimeout(timer))
      retryTimers.clear()
      pushTokenSubscription?.remove()
      foregroundSubscription.remove()
      notificationSubscription.remove()
      responseSubscription.remove()
    }
  }, [apiUrl, token])

  return { expoPushToken, lastNotification, registrationStatus, registrationError }
}

/**
 * Unregister the stored push token from the API.
 * Call this on logout before clearing auth state.
 */
export async function unregisterPushToken(apiUrl: string, authToken: string) {
  const owner = registrationOwner
  // A newer session already owns the device. The API registration has its own
  // user ownership check; stale cleanup must not touch the new local session.
  if (owner && owner.authToken !== authToken) return
  if (owner) owner.revoked = true
  const capturedToken = owner?.registeredToken ?? owner?.pushToken
  const capturedRegistration = owner?.registration
  const cleanup = await withPushStorage(async () => {
    if (registrationOwner !== owner) return { token: capturedToken, registration: capturedRegistration }
    const stored = await AsyncStorage.getItem(PUSH_TOKEN_KEY)
    const token = capturedToken ?? stored
    const registration = capturedRegistration ?? (token ? await storedRegistration(token) : null)
    if (registrationOwner !== owner) return { token: capturedToken, registration: capturedRegistration }
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY)
    await AsyncStorage.removeItem(PUSH_REGISTRATION_KEY)
    return { token, registration }
  })
  if (registrationOwner === owner) {
    registrationOwner = null
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined)
  }
  if (!cleanup.token || !cleanup.registration) return
  await removeRegistration(apiUrl, authToken, cleanup.token, cleanup.registration)
}

async function removeRegistration(apiUrl: string, authToken: string, pushToken: string, registration: PushRegistrationLease) {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const request = fetch(`${apiUrl}/push/unregister`, {
      method: 'DELETE',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: pushToken, registration }),
    })
    // Race as well as abort: native fetch implementations need not settle
    // immediately when aborted. Logout cleanup always has a finite lifetime.
    await Promise.race([request, new Promise<void>((resolve) => {
      timeout = setTimeout(() => { controller.abort(); resolve() }, UNREGISTER_TIMEOUT_MS)
    })])
  } catch {
    // Best-effort — server will clean up stale tokens via DeviceNotRegistered
  } finally {
    clearTimeout(timeout)
  }
}

async function registerForPushNotifications(devicePushToken?: Notifications.DevicePushToken): Promise<string | null> {
  // APNs/FCM registration is unavailable in the iOS simulator and some
  // emulators. Calling into expo-notifications there can surface a native
  // keychain error as a development LogBox before the promise rejects.
  if (!Device.isDevice) return null

  // Android 13 will not present the permission prompt until at least one
  // channel exists. Create it before reading/requesting permissions.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Team updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
    })
  }

  let permissions = await Notifications.getPermissionsAsync()

  if (!hasNotificationPermission(permissions) && permissions.canAskAgain !== false) {
    permissions = await Notifications.requestPermissionsAsync()
  }

  if (!hasNotificationPermission(permissions)) {
    return null
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) {
    throw new Error('EAS project ID is missing')
  }
  const tokenData = await acquireExpoPushToken(projectId, devicePushToken)
  return tokenData.data
}

function hasNotificationPermission(
  permissions: Notifications.NotificationPermissionsStatus,
): boolean {
  if (permissions.granted || permissions.status === 'granted') return true
  if (Platform.OS !== 'ios' || !permissions.ios) return false
  return (
    permissions.ios.status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    permissions.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permissions.ios.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  )
}
