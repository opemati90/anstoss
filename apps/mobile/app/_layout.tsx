import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { Alert, StatusBar, StyleSheet, Text, View } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { ClerkProvider } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans'
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono'
import { AuthProvider } from '../src/context/AuthContext'
import { useAuth } from '../src/context/AuthContext'
import { ClubThemeProvider } from '../src/context/ClubThemeContext'
import { initializeI18n } from '../src/i18n'
import { API_URL, subscribeToApiResponses } from '../src/api/client'
import { ForceUpdateScreen } from '../src/components/ForceUpdateScreen'
import { usePushNotifications } from '../src/hooks/usePushNotifications'
import { useUpdateCheck } from '../src/hooks/useUpdateCheck'

SplashScreen.preventAutoHideAsync()

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    GeistMono_400Regular,
  })
  const [ready, setReady] = useState(false)
  const [i18nReady, setI18nReady] = useState(false)

  useEffect(() => {
    let isCancelled = false

    initializeI18n().finally(() => {
      if (!isCancelled) {
        setI18nReady(true)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if ((fontsLoaded || fontError) && i18nReady) {
      SplashScreen.hideAsync()
      setReady(true)
    }
    // Safety timeout — never block on font load failure
    const t = setTimeout(() => {
      if (i18nReady) {
        SplashScreen.hideAsync()
        setReady(true)
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [fontsLoaded, fontError, i18nReady])

  if (!ready) return null

  if (!clerkPublishableKey) {
    return (
      <View style={styles.configContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
        <Text style={styles.configTitle}>Missing Clerk Configuration</Text>
        <Text style={styles.configBody}>
          Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/mobile/.env` to enable
          real email sign-in.
        </Text>
      </View>
    )
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <AuthProvider>
        <ClubThemeProvider>
          <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
          <AppRuntimeShell />
        </ClubThemeProvider>
      </AuthProvider>
    </ClerkProvider>
  )
}

function AppRuntimeShell() {
  const { token } = useAuth()
  const {
    forceUpdate,
    softUpdate,
    recommendedVersion,
    checkResponse,
    openStore,
    dismissSoftUpdate,
  } = useUpdateCheck()

  usePushNotifications({ apiUrl: API_URL, token })

  useEffect(() => subscribeToApiResponses(checkResponse), [checkResponse])

  useEffect(() => {
    if (!softUpdate || !recommendedVersion) return

    Alert.alert(
      'Update available',
      `Version ${recommendedVersion} is available for download.`,
      [
        { text: 'Later', style: 'cancel', onPress: dismissSoftUpdate },
        { text: 'Update', onPress: openStore },
      ],
    )
  }, [dismissSoftUpdate, openStore, recommendedVersion, softUpdate])

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={openStore} />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="club-setup" options={{ presentation: 'modal' }} />
      <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create-event" options={{ presentation: 'modal' }} />
    </Stack>
  )
}

const styles = StyleSheet.create({
  configContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FAFAF8',
  },
  configTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A18',
    textAlign: 'center',
  },
  configBody: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#4A4A48',
    textAlign: 'center',
  },
})
