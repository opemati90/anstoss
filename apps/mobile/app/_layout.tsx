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
import '../src/i18n'

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

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required')
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
            </Stack>
          </ClubThemeProvider>
        </AuthProvider>
      </ClerkLoaded>
    </ClerkProvider>
  )
}
