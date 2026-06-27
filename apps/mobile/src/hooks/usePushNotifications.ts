import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'

const PUSH_TOKEN_KEY = 'anstoss:push-token'

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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

/**
 * Register for push notifications and handle incoming notifications.
 *
 * - Registers Expo push token on mount
 * - Handles notification taps (returns last notification response)
 * - Cleans up listeners on unmount
 */
export function usePushNotifications({ apiUrl, token }: UsePushOptions) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [lastNotification, setLastNotification] =
    useState<Notifications.NotificationResponse | null>(null)
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    if (!token) return

    // Register for push
    registerForPushNotifications().then((pushToken) => {
      if (pushToken) {
        setExpoPushToken(pushToken)
        void AsyncStorage.setItem(PUSH_TOKEN_KEY, pushToken)

        // Send token to API with retry
        const registerToken = (retries = 2) => {
          fetch(`${apiUrl}/push/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              token: pushToken,
              platform: Platform.OS,
            }),
          }).catch(() => {
            if (retries > 0) {
              setTimeout(() => registerToken(retries - 1), 5000)
            }
          })
        }
        registerToken()
      }
    })

    // Listen for incoming notifications (app in foreground)
    notificationListener.current =
      Notifications.addNotificationReceivedListener(() => {
        // Notification received while app is open — badge handled by handler
      })

    // Listen for notification taps
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        setLastNotification(response)
      })

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove()
      }
      if (responseListener.current) {
        responseListener.current.remove()
      }
    }
  }, [apiUrl, token])

  return { expoPushToken, lastNotification }
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
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return null
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  })
  return tokenData.data
}
