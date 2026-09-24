import { ActivityIndicator, View, StyleSheet, useColorScheme } from 'react-native'
import { Redirect, type Href } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { usePendingInviteState } from '../src/auth/pendingInvite'
import { useOnboardingIntent } from '../src/onboarding/intent'
import { useOnboardingResumeTarget } from '../src/onboarding/resume'
import { resolveSignedInRoute } from '../src/onboarding/routing'
import { darkTheme, lightTheme } from '../src/theme/colors'

/**
 * Entry router. Every onboarding step ends with `router.replace('/')`, so this
 * is the single place that decides where a user belongs: signed out → welcome;
 * signed in → the next onboarding step, the waiting screen, or home. Because
 * each hop is a replace, back can never return to an auth screen and Android
 * back from home exits the app.
 */
export default function Index() {
  const {
    isLoading,
    isSignedIn,
    memberships,
    ageGate,
    user,
    pendingClubClaim,
    pendingJoinRequest,
  } = useAuth()
  const palette = useColorScheme() === 'dark' ? darkTheme : lightTheme
  const pendingInvite = usePendingInviteState()
  const inOnboarding = isSignedIn && memberships.length === 0
  const resumeTarget = useOnboardingResumeTarget(inOnboarding, user?.id)
  const intent = useOnboardingIntent(inOnboarding)

  if (
    isLoading ||
    (isSignedIn && pendingInvite === undefined) ||
    (inOnboarding && (resumeTarget === undefined || intent === undefined))
  ) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.textPrimary} />
      </View>
    )
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/welcome" />
  }

  const href = resolveSignedInRoute({
    user,
    memberships,
    ageGate,
    pendingJoinRequest,
    pendingClubClaim,
    pendingInviteCode: pendingInvite ?? null,
    resumeTarget: resumeTarget ?? null,
    intent: intent ?? null,
  })
  return <Redirect href={href as Href} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
