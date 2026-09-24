import { Redirect } from 'expo-router'

/**
 * The old admin workspace moved into the Verein tab. This route only keeps
 * existing deep links (anstoss://admin-dashboard, pushes, bookmarks) working.
 */
export default function AdminDashboardRedirect() {
  return <Redirect href={'/(tabs)/verein' as never} />
}
