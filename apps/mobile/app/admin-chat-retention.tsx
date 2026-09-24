import { Redirect } from 'expo-router'

/**
 * Chat retention is now a single picker row in the Verein tab
 * (Kommunikation → Chat-Aufbewahrung, src/components/admin/ChatRetentionRow).
 * This route only keeps older links working.
 */
export default function AdminChatRetentionRedirect() {
  return <Redirect href={'/(tabs)/verein' as never} />
}
