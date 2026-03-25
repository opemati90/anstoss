import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'

export default function Index() {
  const { isLoading, isSignedIn, memberships, ageGate, needsOnboarding } = useAuth()

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A4A48" />
      </View>
    )
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />
  }

  if (ageGate?.status === 'PENDING_PARENT_APPROVAL') {
    return <Redirect href="/pending-approval" />
  }

  if (ageGate?.status === 'BLOCKED') {
    return <Redirect href="/access-blocked" />
  }

  if (memberships.length === 0) {
    return <Redirect href="/club-setup" />
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
    backgroundColor: '#FAFAF8',
  },
})
