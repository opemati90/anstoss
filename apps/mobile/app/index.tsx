import { ActivityIndicator, View, StyleSheet, useColorScheme } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useOnboardingResumeTarget } from '../src/onboarding/resume'
import { useWelcomeSeen } from '../src/onboarding/welcomeSeen'
import { darkTheme, lightTheme } from '../src/theme/colors'

export default function Index() {
  const { isLoading, isSignedIn, memberships, ageGate, user, needsRegistration } = useAuth()
  const welcomeSeen = useWelcomeSeen()
  const palette = useColorScheme() === 'dark' ? darkTheme : lightTheme
  const shouldResumeOnboarding =
    isSignedIn && memberships.length === 0 && needsRegistration
  const resumeTarget = useOnboardingResumeTarget(
    shouldResumeOnboarding,
    // Stable backend id — clerkId is null for every email-OTP account, which
    // would make resume never match its owner-stamped draft.
    user?.id,
  )

  // Hold while auth resolves, or (when signed out) while the first-launch flag
  // loads — redirecting early would flash welcome→sign-in.
  if (
    isLoading ||
    (!isSignedIn && welcomeSeen === null) ||
    (shouldResumeOnboarding && resumeTarget === undefined)
  ) {
    return (
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <ActivityIndicator size="large" color={palette.textPrimary} />
      </View>
    )
  }

  if (!isSignedIn) {
    // Unified signed-out entry. First-ever launch → the welcome hero (full first
    // impression); returning users → straight to the bare unified sign-in (which
    // tries sign-in and transparently falls back to sign-up — no separate
    // "create account" path). Both welcome buttons lead into sign-in.
    return <Redirect href={welcomeSeen ? '/(auth)/sign-in' : '/(auth)/welcome'} />
  }

  // If registration is incomplete and there is no valid saved resume step,
  // restart at About before the standalone DOB gate. About owns name + DOB
  // collection for new users, so routing to /enter-dob here would skip role
  // selection and strand the account in the post-registration holding screen.
  if (shouldResumeOnboarding) {
    return <Redirect href={resumeTarget ?? '/(auth)/about'} />
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
  // The holding screen below is only for users who have finished registration
  // but are not linked to a club yet.
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
