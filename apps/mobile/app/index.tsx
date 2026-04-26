import { ActivityIndicator, View, StyleSheet, useColorScheme } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { darkTheme, lightTheme } from '../src/theme/colors'
import { isFeatureEnabled } from '../src/utils/featureFlags'

export default function Index() {
  const { isLoading, isSignedIn, memberships, ageGate, needsOnboarding, needsRegistration, user } = useAuth()
  const palette = useColorScheme() === 'dark' ? darkTheme : lightTheme

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.textPrimary} />
      </View>
    )
  }

  if (!isSignedIn) {
    const dest = isFeatureEnabled('anstoss.newOnboarding')
      ? '/(auth)/welcome'
      : '/(auth)/sign-in'
    return <Redirect href={dest} />
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

  // Fresh signup: no memberships AND no recorded dateOfBirth — route through the new /register flow.
  if (needsRegistration) {
    return <Redirect href="/register" />
  }

  // Legacy fallback: user has a registrationRole already set (old signup form) but no memberships yet.
  // These users completed /enter-dob so dateOfBirth is set — needsRegistration is false for them.
  if (memberships.length === 0) {
    if (user?.registrationRole === 'FREE_AGENT') {
      return <Redirect href="/free-agent/profile" />
    }

    if (user?.registrationRole === 'CLUB_ADMIN') {
      return <Redirect href="/club-setup" />
    }

    return <Redirect href="/account-next-step" />
  }

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />
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
