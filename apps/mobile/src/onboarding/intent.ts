import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

/**
 * What the user said they want before signing in:
 *  - 'free-agent': "Ohne Verein? Als Spieler gefunden werden" on welcome,
 *    which goes from the name straight to the free-agent profile;
 *  - 'parent-handoff': "Einrichtungscode eingeben" for a parent whose child
 *    was handed over, which goes from the name to "Kind hinzufügen";
 *  - 'club-setup': "Verein anlegen" on welcome, which goes from the name
 *    straight to "Dein Verein" (club setup).
 * Stored so it survives the trip through the email code (and an app kill
 * while the user fetches the code from their inbox). Cleared on sign-out.
 */
export type OnboardingIntent = 'free-agent' | 'parent-handoff' | 'club-setup'

export function parseOnboardingIntent(value: unknown): OnboardingIntent | null {
  return value === 'free-agent' || value === 'parent-handoff' || value === 'club-setup'
    ? value
    : null
}

const KEY = 'anstoss:onboarding-intent'

export async function setOnboardingIntent(intent: OnboardingIntent): Promise<void> {
  await AsyncStorage.setItem(KEY, intent).catch(() => {})
}

export async function clearOnboardingIntent(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {})
}

export async function getOnboardingIntent(): Promise<OnboardingIntent | null> {
  const value = await AsyncStorage.getItem(KEY).catch(() => null)
  return parseOnboardingIntent(value)
}

/**
 * `undefined` while loading, then the stored intent or null. The value is
 * keyed to `enabled`, so the render in which `enabled` flips never returns a
 * stale answer from before (index.tsx would otherwise route too early).
 */
export function useOnboardingIntent(enabled = true): OnboardingIntent | null | undefined {
  const [loaded, setLoaded] = useState<{ enabled: boolean; value: OnboardingIntent | null } | null>(
    null,
  )
  useEffect(() => {
    let alive = true
    if (!enabled) {
      setLoaded({ enabled, value: null })
      return () => {
        alive = false
      }
    }
    void getOnboardingIntent().then((value) => {
      if (alive) setLoaded({ enabled, value })
    })
    return () => {
      alive = false
    }
  }, [enabled])
  if (!enabled) return null
  return loaded?.enabled === enabled ? loaded.value : undefined
}
