import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { Alert, StatusBar, StyleSheet, Text, View } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { ClerkProvider } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { useTranslation } from 'react-i18next'
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
import i18n, { initializeI18n } from '../src/i18n'
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
        <Text style={styles.configTitle}>{i18n.t('auth.missingClerkConfigTitle')}</Text>
        <Text style={styles.configBody}>{i18n.t('auth.missingClerkConfigBody')}</Text>
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
  const { t } = useTranslation()
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
      t('update.available'),
      t('update.availableBody', { version: recommendedVersion }),
      [
        { text: t('update.dismiss'), style: 'cancel', onPress: dismissSoftUpdate },
        { text: t('update.openStore'), onPress: openStore },
      ],
    )
  }, [dismissSoftUpdate, openStore, recommendedVersion, softUpdate, t])

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={openStore} />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="join/[code]" options={{ animation: 'fade' }} />
      <Stack.Screen name="club-setup" options={{ presentation: 'modal' }} />
      <Stack.Screen name="invite" options={{ presentation: 'modal' }} />
      <Stack.Screen name="team-management" options={{ presentation: 'modal' }} />
      <Stack.Screen name="fussball-link" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create-event" options={{ presentation: 'modal' }} />
      <Stack.Screen name="pending-approval" options={{ animation: 'fade' }} />
      <Stack.Screen name="access-blocked" options={{ animation: 'fade' }} />
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
