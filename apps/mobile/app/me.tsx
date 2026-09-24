import { Redirect } from 'expo-router'

/**
 * "Me" merged into the Profile tab (More). Kept as a redirect so old links
 * and pushes that open /me still land on the member's profile.
 */
export default function MeRedirect() {
  return <Redirect href={'/(tabs)/more' as never} />
}
