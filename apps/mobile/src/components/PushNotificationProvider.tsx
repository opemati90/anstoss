import { createContext, useContext, type ReactNode } from 'react'
import type * as Notifications from 'expo-notifications'
import { useAuth } from '../context/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import type { PushRegistrationStatus } from '../hooks/usePushNotifications'
import { API_URL } from '../api/client'

type PushContextValue = {
  lastNotification: Notifications.NotificationResponse | null
  registrationStatus: PushRegistrationStatus
  registrationError: string | null
}

const PushContext = createContext<PushContextValue>({
  lastNotification: null,
  registrationStatus: 'idle',
  registrationError: null,
})

export function usePushContext() {
  return useContext(PushContext)
}

/**
 * Wires push notification registration into the auth-aware tree.
 * Provides lastNotification via context for deep linking.
 */
export function PushNotificationProvider({ children }: { children: ReactNode }) {
  const { token, memberships } = useAuth()

  // Defer the iOS permission prompt until the user has actually entered
  // a club workspace. Prompting during auth blocks signup role selection.
  const pushReadyToken = memberships.length > 0 ? token : null

  const { lastNotification, registrationStatus, registrationError } = usePushNotifications({
    apiUrl: API_URL,
    token: pushReadyToken,
  })

  return (
    <PushContext.Provider value={{ lastNotification, registrationStatus, registrationError }}>
      {children}
    </PushContext.Provider>
  )
}
