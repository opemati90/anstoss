import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

/**
 * Whether the user has seen the welcome hero at least once.
 *
 * Unifies the signed-out entry point: a brand-new (never-onboarded) user lands
 * on the welcome hero so they get the full first impression; everyone after
 * that goes straight to the bare unified sign-in screen (faster for returning
 * users). The flag is set the moment the user advances off welcome.
 */
const KEY = 'anstoss.welcomeSeen'

export async function markWelcomeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1')
  } catch {
    // Best effort — worst case the hero shows once more.
  }
}

/**
 * Tri-state: `null` while the flag is still loading from storage (callers should
 * hold their redirect until it resolves to avoid a welcome→sign-in flicker),
 * then `true`/`false`.
 */
export function useWelcomeSeen(): boolean | null {
  const [seen, setSeen] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    void AsyncStorage.getItem(KEY)
      .then((v) => {
        if (alive) setSeen(v === '1')
      })
      .catch(() => {
        // On storage error, treat as seen so we never trap a user on the hero.
        if (alive) setSeen(true)
      })
    return () => {
      alive = false
    }
  }, [])
  return seen
}
