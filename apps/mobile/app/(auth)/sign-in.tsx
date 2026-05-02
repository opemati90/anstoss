import { Redirect, useLocalSearchParams } from 'expo-router'

/**
 * Legacy email+password sign-in screen replaced by the phone-OTP welcome flow.
 * Any deep link still pointing here gets bounced to the new welcome screen.
 * If an invite code came along, forward it so the welcome → phone → claim
 * flow can resume on the other side.
 */
export default function LegacySignInRedirect() {
  const { inviteCode } = useLocalSearchParams<{ inviteCode?: string }>()
  if (inviteCode) {
    return <Redirect href={{ pathname: '/(auth)/welcome', params: { inviteCode } }} />
  }
  return <Redirect href="/(auth)/welcome" />
}
