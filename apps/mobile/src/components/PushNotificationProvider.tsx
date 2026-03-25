import { useAuth } from '../context/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { API_URL } from '../api/client'

/**
 * Wires push notification registration into the auth-aware tree.
 * Renders nothing — just activates the hook.
 */
export function PushNotificationProvider() {
  const { token } = useAuth()
  usePushNotifications({ apiUrl: API_URL, token })
  return null
}
