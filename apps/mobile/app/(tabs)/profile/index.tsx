import { Redirect } from 'expo-router'

/**
 * Free-agent "Profile" tab — there's no separate destination, the tab
 * just opens the marketplace listing editor where free agents manage
 * everything about themselves.
 */
export default function ProfileTab() {
  return <Redirect href="/free-agent/profile" />
}
