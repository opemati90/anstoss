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
    return <Redirect href="/(auth)/welcome" />
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

  // No memberships yet — surface the role-specific landing screen the legacy
  // signup form populated. Fresh signups from the new wizard always have a
  // membership by the time they hit `/`.
  if (memberships.length === 0) {
    if (user?.registrationRole === 'FREE_AGENT') {
      return <Redirect href="/free-agent/profile" />
    }

    if (user?.registrationRole === 'CLUB_ADMIN') {
      return <Redirect href="/club-setup" />
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
