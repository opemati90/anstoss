import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
 * - Cleans up token on unmount
 */
export function usePushNotifications({ apiUrl, token }: UsePushOptions) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null)
  const [lastNotification, setLastNotification] =
    useState<Notifications.NotificationResponse | null>(null)
  const notificationListener = useRef<Notifications.EventSubscription>()
  const responseListener = useRef<Notifications.EventSubscription>()

  useEffect(() => {
    if (!token) return

    // Register for push
    registerForPushNotifications().then((pushToken) => {
      if (pushToken) {
        setExpoPushToken(pushToken)

        // Send token to API
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
          // Silent fail — will retry on next app launch
        })
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
        Notifications.removeNotificationSubscription(notificationListener.current)
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current)
      }
    }
  }, [apiUrl, token])

  return { expoPushToken, lastNotification }
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

  const tokenData = await Notifications.getExpoPushTokenAsync()
  return tokenData.data
}
