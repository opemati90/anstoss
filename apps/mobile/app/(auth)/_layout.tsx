import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { OnboardingFlowProvider } from '../../src/context/OnboardingFlowContext'
import { setAuthExpiryHandlingSuspended } from '../../src/api/client'

export default function AuthLayout() {
  // The global "session expired" alert + sign-out stays off in the auth
  // stack: a stray 401 here must not yank someone out of the middle of a
  // form. Every screen that calls the API instead routes a 401 through
  // useSessionExpiryHandler (src/onboarding/sessionExpiry.ts), which signs out
  // and returns to welcome with a "please sign in again" message (M7).
  useEffect(() => {
    setAuthExpiryHandlingSuspended(true)
    return () => setAuthExpiryHandlingSuspended(false)
  }, [])

  return (
    <OnboardingFlowProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="sign-in" />
      </Stack>
    </OnboardingFlowProvider>
  )
}
