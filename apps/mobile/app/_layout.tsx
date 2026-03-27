import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar, StyleSheet, Text, View } from 'react-native'
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
import { getMissingRequiredRuntimeConfig, getRuntimeConfig } from '../src/config/runtime'
import { useUpdateCheck } from '../src/hooks/useUpdateCheck'
import { initSentry } from '../src/utils/sentry'
import '../src/i18n'

initSentry()

void SplashScreen.preventAutoHideAsync().catch(() => {})

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
      void SplashScreen.hideAsync().catch(() => {})
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={openStore} />
  }

  const runtimeConfig = getRuntimeConfig()
  const missingConfig = getMissingRequiredRuntimeConfig()

  if (missingConfig.length > 0) {
    return <StartupConfigurationErrorScreen missingKeys={missingConfig} />
  }

  return (
    <ClerkProvider publishableKey={runtimeConfig.clerkPublishableKey!} tokenCache={tokenCache}>
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
              <Stack.Screen name="admin-dashboard" options={{ presentation: 'modal' }} />
              <Stack.Screen name="admin-members" options={{ presentation: 'modal' }} />
              <Stack.Screen name="admin-billing" options={{ presentation: 'modal' }} />
              <Stack.Screen name="notification-settings" options={{ presentation: 'modal' }} />
              <Stack.Screen name="join-club" options={{ presentation: 'modal' }} />
              <Stack.Screen name="pending-requests" options={{ presentation: 'modal' }} />
              <Stack.Screen name="stripe-connect" options={{ presentation: 'modal' }} />
            </Stack>
          </ClubThemeProvider>
        </AuthProvider>
      </ClerkLoaded>
    </ClerkProvider>
  )
}

function StartupConfigurationErrorScreen({ missingKeys }: { missingKeys: string[] }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
      <View style={styles.panel}>
        <Text style={styles.title}>Build configuration incomplete</Text>
        <Text style={styles.body}>
          This build is missing the configuration required to start Anstoss.
        </Text>
        <Text style={styles.body}>
          Set these variables for the active EAS environment and rebuild the app:
        </Text>
        <Text style={styles.code}>{missingKeys.join('\n')}</Text>
        <Text style={styles.body}>
          The packaged app needs both the API URL and Clerk publishable key before it
          can load safely.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FAFAF8',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#1A1A18',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A18',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4A4A48',
  },
  code: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1A1A18',
    fontFamily: 'Menlo',
  },
})
