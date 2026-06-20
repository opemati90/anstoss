import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

/**
 * Persisted invite code for the `anstoss://join/<code>` flow.
 *
 * The code is threaded through auth via route params for the happy path, but
 * params don't survive a full app-kill (e.g. the user leaves to fetch their SMS
 * code and the OS reclaims the process). Persisting it here lets the unified
 * sign-in / about screens recover the invite after a cold relaunch and still
 * land the user back on /join/<code> to redeem.
 */
const KEY = 'anstoss.pendingInviteCode'

export async function setPendingInvite(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, code)
  } catch {
    // Best effort — the route param still carries the code on the happy path.
  }
}

export async function getPendingInvite(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY)
  } catch {
    return null
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY)
  } catch {
    // Best effort.
  }
}

/**
 * Loads the persisted pending invite code once on mount. Returns `null` until
 * loaded (and if none is stored), so callers prefer a route param when present
 * and fall back to this for the cold-relaunch case.
 */
export function usePendingInvite(): string | null {
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void getPendingInvite().then((c) => {
      if (alive) setCode(c)
    })
    return () => {
      alive = false
    }
  }, [])
  return code
}
