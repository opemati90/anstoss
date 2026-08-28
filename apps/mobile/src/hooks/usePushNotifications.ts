import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'

const PUSH_TOKEN_KEY = 'anstoss:push-token'

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

  useEffect(() => {
    if (!token) {
      setExpoPushToken(null)
      setRegistrationStatus('idle')
      setRegistrationError(null)
      return
    }

    let cancelled = false
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
      for (const delayMs of REGISTER_RETRY_DELAYS_MS) {
        await waitForRetry(delayMs)
        if (cancelled) return false
        try {
          const response = await fetch(`${apiUrl}/push/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              token: pushToken,
              platform: Platform.OS,
            }),
          })
          if (!response.ok) {
            throw new Error(`Push registration failed with HTTP ${response.status}`)
          }
          return true
        } catch (error) {
          lastError = error
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Push registration failed')
    }

    const acquireAndRegister = async () => {
      try {
        setRegistrationError(null)
        setRegistrationStatus('requesting-permission')
        const pushToken = await registerForPushNotifications()
        if (cancelled) return
        if (!pushToken) {
          setRegistrationStatus('denied')
          return
        }

        setExpoPushToken(pushToken)
        await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushToken)
        if (cancelled) return

        setRegistrationStatus('registering')
        const registered = await registerWithApi(pushToken)
        if (!cancelled && registered) {
          setRegistrationStatus('registered')
        }
      } catch (error) {
        if (cancelled) return
        setRegistrationStatus('error')
        setRegistrationError(error instanceof Error ? error.message : String(error))
        if (__DEV__) console.warn('[push] registration failed:', error)
      }
    }

    void acquireAndRegister()

    // A native APNs/FCM token can roll while the app is installed. Re-acquire
    // the associated Expo token and sync it immediately instead of waiting for
    // the next launch.
    const pushTokenSubscription = Device.isDevice
      ? Notifications.addPushTokenListener(() => {
          void acquireAndRegister()
        })
      : null

    // Listen for incoming notifications (app in foreground)
    const notificationSubscription = Notifications.addNotificationReceivedListener(() => {
      // Notification received while app is open - badge handled by handler.
    })

    // Listen for notification taps
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) =>
      setLastNotification(response),
    )

    // Capture a notification that launched the app before listeners mounted.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled && response) setLastNotification(response)
    })

    return () => {
      cancelled = true
      retryTimers.forEach((timer) => clearTimeout(timer))
      retryTimers.clear()
      pushTokenSubscription?.remove()
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
  const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY)
  if (!pushToken) return

  try {
    await fetch(`${apiUrl}/push/unregister`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: pushToken }),
    })
  } catch {
    // Best-effort — server will clean up stale tokens via DeviceNotRegistered
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY)
}

async function registerForPushNotifications(): Promise<string | null> {
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

  if (!hasNotificationPermission(permissions)) {
    permissions = await Notifications.requestPermissionsAsync()
  }

  if (!hasNotificationPermission(permissions)) {
    return null
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) {
    throw new Error('EAS project ID is missing')
  }
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  })
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
