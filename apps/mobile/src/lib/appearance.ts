import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'

/** Profile → App → Darstellung: follow the system, or force light / dark. */
export type AppearancePreference = 'system' | 'light' | 'dark'

export const APPEARANCE_STORAGE_KEY = 'anstoss:appearance'

function apply(preference: AppearancePreference) {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference)
  } catch {
    // Older runtimes without setColorScheme simply keep following the system.
  }
}

export async function getAppearancePreference(): Promise<AppearancePreference> {
  try {
    const stored = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export async function setAppearancePreference(preference: AppearancePreference) {
  apply(preference)
  try {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, preference)
  } catch {
    // Preference still applies for this session.
  }
}

/** Called once at startup so a saved light/dark choice survives restarts. */
export async function restoreAppearancePreference() {
  const preference = await getAppearancePreference()
  if (preference !== 'system') apply(preference)
}
