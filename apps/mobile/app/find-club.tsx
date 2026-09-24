import { Redirect } from 'expo-router'

/**
 * Legacy entry point (home, chat, club switcher link here). "Verein finden"
 * lives in the onboarding group now: one screen for club name, place, team
 * code and invite code.
 */
export default function FindClubRedirect() {
  return <Redirect href="/(auth)/club-search" />
}
