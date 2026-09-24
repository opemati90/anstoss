import AsyncStorage from '@react-native-async-storage/async-storage'
import { ONBOARDING_WELCOME_NOTICE_PREFIX } from './storageKeys'

/**
 * One-shot "Willkommen bei SV Albatros" banner on home. Replaces the old
 * full-screen confetti "done" step: onboarding ends on home, and home says
 * once that you are in.
 */
export type WelcomeNotice = { clubId: string; clubName: string }

function key(userId: string) {
  return `${ONBOARDING_WELCOME_NOTICE_PREFIX}${userId}`
}

export async function setWelcomeNotice(userId: string, notice: WelcomeNotice): Promise<void> {
  await AsyncStorage.setItem(key(userId), JSON.stringify(notice)).catch(() => {})
}

export async function readWelcomeNotice(userId: string): Promise<WelcomeNotice | null> {
  const raw = await AsyncStorage.getItem(key(userId)).catch(() => null)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<WelcomeNotice>
    return parsed && typeof parsed.clubId === 'string' && typeof parsed.clubName === 'string'
      ? { clubId: parsed.clubId, clubName: parsed.clubName }
      : null
  } catch {
    return null
  }
}

export async function clearWelcomeNotice(userId: string): Promise<void> {
  await AsyncStorage.removeItem(key(userId)).catch(() => {})
}
