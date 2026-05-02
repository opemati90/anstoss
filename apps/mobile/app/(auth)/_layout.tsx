import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { OnboardingFlowProvider } from '../../src/context/OnboardingFlowContext'
import { setAuthExpiryHandlingSuspended } from '../../src/api/client'

export default function AuthLayout() {
  // The Clerk session isn't active until finalizeSession() runs at the end of
  // the wizard. Any 401 the API returns during onboarding is expected (no token),
  // not a real session expiry — suspend the global "session expired" alert for
  // the whole auth stack and let each screen handle its own errors.
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
