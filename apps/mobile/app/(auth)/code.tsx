import { Redirect } from 'expo-router'

/**
 * The legacy /code screen has been merged into /phone (single screen
 * with progressive disclosure). Any deep link still pointing here
 * lands on the combined flow — preserving signup mode by default.
 */
export default function LegacyCodeRedirect() {
  return <Redirect href="/(auth)/phone" />
}
