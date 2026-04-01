import { useEffect, useState } from 'react'
import { Stack, router } from 'expo-router'
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
import { PushNotificationProvider, usePushContext } from '../src/components/PushNotificationProvider'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { ForceUpdateScreen } from '../src/components/ForceUpdateScreen'
import { getRuntimeConfig, getRuntimeConfigIssues, type RuntimeConfigIssue } from '../src/config/runtime'
import { useUpdateCheck } from '../src/hooks/useUpdateCheck'
import { initSentry } from '../src/utils/sentry'
import { initializeI18n } from '../src/i18n'
import { fonts, fontSize, lineHeight, neutralColors, radius, space } from '../src/theme/tokens'

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
  const [i18nReady, setI18nReady] = useState(false)
  const { forceUpdate, openStore } = useUpdateCheck()

  useEffect(() => {
    initializeI18n().then(() => setI18nReady(true)).catch(() => setI18nReady(true))
  }, [])

  useEffect(() => {
    if (fontsLoaded && i18nReady) {
      void SplashScreen.hideAsync().catch(() => {})
    }
  }, [fontsLoaded, i18nReady])

  if (!fontsLoaded || !i18nReady) return null

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={openStore} />
  }

  const runtimeConfig = getRuntimeConfig()
  const runtimeConfigIssues = getRuntimeConfigIssues()

  if (runtimeConfigIssues.length > 0) {
    return <StartupConfigurationErrorScreen issues={runtimeConfigIssues} />
  }

  return (
    <ClerkProvider publishableKey={runtimeConfig.clerkPublishableKey!} tokenCache={tokenCache}>
      <ClerkLoaded>
        <AuthProvider>
          <ClubThemeProvider>
            <PushNotificationProvider>
              <PushDeepLinkHandler />
              <ErrorBoundary>
                <StatusBar barStyle="dark-content" backgroundColor={neutralColors.background} />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="club-setup" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="invite" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="create-event" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="edit-profile" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="join" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
                  <Stack.Screen name="enter-dob" options={{ animation: 'fade' }} />
                  <Stack.Screen name="pending-approval" options={{ animation: 'fade' }} />
                  <Stack.Screen name="access-blocked" options={{ animation: 'fade' }} />
                  <Stack.Screen name="club-staff" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="club-stats" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="parent-schedule" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="roster-aggregate" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="team-families" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="team-management" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="team-matches" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="fussball-link" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="admin-dashboard" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="admin-members" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="admin-billing" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="notification-settings" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="join-club" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="account-next-step" options={{ animation: 'fade' }} />
                  <Stack.Screen name="pending-requests" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="stripe-connect" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="event-detail" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="event-attendance" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="transfer-list" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="free-agent/profile" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="free-agent/[id]" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="match-detail" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="league-table" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="dm-list" options={{ presentation: 'card' }} />
                  <Stack.Screen name="dm-chat" options={{ presentation: 'card' }} />
                  <Stack.Screen name="dm-new" options={{ presentation: 'fullScreenModal' }} />
                </Stack>
              </ErrorBoundary>
            </PushNotificationProvider>
        </ClubThemeProvider>
      </AuthProvider>
      </ClerkLoaded>
    </ClerkProvider>
  )
}

function PushDeepLinkHandler() {
  const { lastNotification } = usePushContext()

  useEffect(() => {
    if (!lastNotification) return
    const data = lastNotification.notification.request.content.data as
      | { type?: string; conversationId?: string; eventId?: string }
      | undefined

    if (!data?.type) return

    if (data.type === 'dm' && data.conversationId) {
      router.push({ pathname: '/dm-chat', params: { conversationId: data.conversationId } })
    } else if (data.type === 'event' && data.eventId) {
      router.push({ pathname: '/event-detail', params: { id: data.eventId } })
    }
  }, [lastNotification])

  return null
}

function StartupConfigurationErrorScreen({ issues }: { issues: RuntimeConfigIssue[] }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={neutralColors.background} />
      <View style={styles.panel}>
        <Text style={styles.title}>Build configuration incomplete</Text>
        <Text style={styles.body}>
          This build cannot start safely until the runtime configuration is fixed.
        </Text>
        <Text style={styles.body}>
          Update these settings for the active EAS environment and rebuild the app:
        </Text>
        <View style={styles.issueList}>
          {issues.map((issue) => (
            <View key={`${issue.key}:${issue.reason}`} style={styles.issueItem}>
              <Text style={styles.code}>{issue.key}</Text>
              <Text style={styles.body}>{issue.reason}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    backgroundColor: neutralColors.background,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    shadowColor: neutralColors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
    gap: space.sm,
  },
  issueList: {
    gap: space.sm,
  },
  issueItem: {
    gap: space.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    color: neutralColors.textSecondary,
  },
  code: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.md,
    color: neutralColors.textPrimary,
    fontFamily: fonts.data,
  },
})
