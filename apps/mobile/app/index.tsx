import { ActivityIndicator, View, StyleSheet, useColorScheme } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { darkTheme, lightTheme } from '../src/theme/colors'

export default function Index() {
  const { isLoading, isSignedIn, memberships, ageGate, user } = useAuth()
  const palette = useColorScheme() === 'dark' ? darkTheme : lightTheme

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.textPrimary} />
      </View>
    )
  }

  if (!isSignedIn) {
    // Returning users land on the bare phone+OTP sign-in screen.
    // First-timers tap "Create account" inside sign-in to reach welcome.
    return <Redirect href="/(auth)/sign-in" />
  }

  if (ageGate?.status === 'DOB_REQUIRED') {
    return <Redirect href="/enter-dob" />
  }

  if (ageGate?.status === 'PENDING_PARENT_APPROVAL') {
    return <Redirect href="/pending-approval" />
  }

  if (ageGate?.status === 'BLOCKED') {
    return <Redirect href="/access-blocked" />
  }

  // No memberships yet — branch by role.
  // - FREE_AGENT: dedicated profile screen (no tabs make sense without a club)
  // - CLUB_ADMIN: lands on /(tabs) with a "Finish setting up your club" CTA on
  //   home. Used to hard-redirect to /club-setup, which locked admins out of
  //   marketplace, more tab, sign-out etc. until club creation completed —
  //   too aggressive. Soft state: tabs render, home prompts setup.
  // - PLAYER / COACH / PARENT: holding screen with a join-club CTA.
  if (memberships.length === 0) {
    if (user?.registrationRole === 'FREE_AGENT') {
      return <Redirect href="/free-agent/profile" />
    }
    if (user?.registrationRole === 'CLUB_ADMIN') {
      return <Redirect href="/(tabs)" />
    }
    return <Redirect href="/account-next-step" />
  }

  return <Redirect href="/(tabs)" />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
