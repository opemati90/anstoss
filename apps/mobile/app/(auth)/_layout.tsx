import { Stack } from 'expo-router'
import { OnboardingFlowProvider } from '../../src/context/OnboardingFlowContext'

export default function AuthLayout() {
  return (
    <OnboardingFlowProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="sign-in" />
      </Stack>
    </OnboardingFlowProvider>
  )
}
