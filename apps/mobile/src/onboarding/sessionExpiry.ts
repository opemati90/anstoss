import { useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import { isSessionExpired } from './errors'

/**
 * M7: the (auth) group turns the global "session expired" alert off (see
 * app/(auth)/_layout.tsx), so every onboarding screen that talks to the API
 * must notice an expired session itself. Returns a handler: pass it any
 * caught error; when the session is gone it signs out (keeping a pending
 * invite, so the invitation survives signing in again), sends the user to
 * welcome with a "please sign in again" message and returns true. Anything
 * else returns false and the screen shows its own error.
 */
export function useSessionExpiryHandler(): (error: unknown) => boolean {
  const router = useRouter()
  const { signOut } = useAuth()
  const handled = useRef(false)
  // Stable identity (safe in effect dependency lists): read the latest
  // router and signOut through a ref.
  const latest = useRef({ router, signOut })
  latest.current = { router, signOut }
  return useCallback((error: unknown) => {
    if (!isSessionExpired(error)) return false
    if (handled.current) return true
    handled.current = true
    void (async () => {
      await latest.current.signOut({ keepPendingInvite: true }).catch(() => undefined)
      latest.current.router.replace({ pathname: '/(auth)/welcome', params: { reason: 'expired' } })
    })()
    return true
  }, [])
}
