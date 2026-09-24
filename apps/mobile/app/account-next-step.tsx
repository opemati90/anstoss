import { Redirect } from 'expo-router'

/**
 * The old holding screen for accounts without a club. The entry router now
 * knows the next step (name, Verein finden, waiting for the club), so this
 * route only forwards there. Kept because the tab layout still redirects here.
 */
export default function AccountNextStepRedirect() {
  return <Redirect href="/" />
}
