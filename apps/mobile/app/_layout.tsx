import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans'
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono'
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo'
import { tokenCache } from '../src/auth/token-cache'
import { AuthProvider } from '../src/context/AuthContext'
import { ClubThemeProvider } from '../src/context/ClubThemeContext'
import { PushNotificationProvider } from '../src/components/PushNotificationProvider'
import { ForceUpdateScreen } from '../src/components/ForceUpdateScreen'
import { useUpdateCheck } from '../src/hooks/useUpdateCheck'
import { initSentry } from '../src/utils/sentry'
import '../src/i18n'

initSentry()

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    GeistMono_400Regular,
  })
  const { forceUpdate, openStore } = useUpdateCheck()

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required')
  }

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={openStore} />
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        <AuthProvider>
          <ClubThemeProvider>
            <PushNotificationProvider />
            <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              <Stack.Screen name="club-setup" options={{ presentation: 'modal' }} />
              <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
              <Stack.Screen name="create-event" options={{ presentation: 'modal' }} />
              <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
              <Stack.Screen name="join" options={{ presentation: 'modal' }} />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="pending-approval" options={{ animation: 'fade' }} />
              <Stack.Screen name="access-blocked" options={{ animation: 'fade' }} />
              <Stack.Screen name="club-staff" options={{ presentation: 'modal' }} />
              <Stack.Screen name="club-stats" options={{ presentation: 'modal' }} />
              <Stack.Screen name="player-loan" options={{ presentation: 'modal' }} />
              <Stack.Screen name="parent-schedule" options={{ presentation: 'modal' }} />
              <Stack.Screen name="roster-aggregate" options={{ presentation: 'modal' }} />
              <Stack.Screen name="team-families" options={{ presentation: 'modal' }} />
              <Stack.Screen name="team-management" options={{ presentation: 'modal' }} />
              <Stack.Screen name="fussball-link" options={{ presentation: 'modal' }} />
            </Stack>
          </ClubThemeProvider>
        </AuthProvider>
      </ClerkLoaded>
    </ClerkProvider>
  )
}
