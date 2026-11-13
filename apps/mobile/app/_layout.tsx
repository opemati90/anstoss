import { useEffect, useRef, useState } from 'react'
import { Stack, router } from 'expo-router'
import { Linking, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { openNotificationTarget } from '../src/lib/notificationRoute'
// Chat revamp: gestures (swipe-to-reply, swipe actions) + native keyboard tracking.
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { ClubThemeProvider } from '../src/context/ClubThemeContext'
import {
  PushNotificationProvider,
  usePushContext,
} from '../src/components/PushNotificationProvider'
import { AppErrorBoundary } from '../src/components/AppErrorBoundary'
import { ForceUpdateScreen } from '../src/components/ForceUpdateScreen'
import { ReleaseNotices } from '../src/components/ReleaseNotices'
import { getRuntimeConfigIssues, type RuntimeConfigIssue } from '../src/config/runtime'
import { useUpdateCheck } from '../src/hooks/useUpdateCheck'
import { initSentry } from '../src/utils/sentry'
import { initializeI18n } from '../src/i18n'
import { restoreAppearancePreference } from '../src/lib/appearance' // club-admin revamp: Darstellung
import { fonts, fontSize, lineHeight, radius, space } from '../src/theme/tokens'
import { darkTheme, lightTheme } from '../src/theme/colors'

initSentry()

void SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  })
  const [i18nReady, setI18nReady] = useState(false)
  const [startupTimedOut, setStartupTimedOut] = useState(false)
  // club-admin review fixes (L1): the saved light/dark choice is applied
  // before the splash hides, so the first frame is never the wrong theme.
  const [appearanceReady, setAppearanceReady] = useState(false)
  const {
    forceUpdate,
    forceUpdateMessage,
    softUpdate,
    recommendedVersion,
    announcement,
    openStore,
    dismissSoftUpdate,
    dismissAnnouncement,
  } = useUpdateCheck()
  const isDark = useColorScheme() === 'dark'
  const palette = isDark ? darkTheme : lightTheme
  const startupReady =
    (fontsLoaded || !!fontError || startupTimedOut) &&
    (i18nReady || startupTimedOut) &&
    (appearanceReady || startupTimedOut)

  useEffect(() => {
    // club-admin revamp: saved light/dark choice (L1: gates the splash)
    restoreAppearancePreference()
      .catch(() => undefined)
      .finally(() => setAppearanceReady(true))
    initializeI18n()
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true))
  }, [])

  useEffect(() => {
    const startupTimeout = setTimeout(() => {
      setStartupTimedOut(true)
      void SplashScreen.hideAsync().catch(() => {})
    }, 3500)
    return () => {
      clearTimeout(startupTimeout)
    }
  }, [])

  // L1: the early "first paint" hide waits for the appearance restore, so the
  // loading screen underneath already has the right palette.
  useEffect(() => {
    if (!appearanceReady) return
    const firstPaintTimeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {})
    }, 750)
    return () => clearTimeout(firstPaintTimeout)
  }, [appearanceReady])

  useEffect(() => {
    if (startupReady) {
      void SplashScreen.hideAsync().catch(() => {})
    }
  }, [startupReady])

  if (!startupReady) {
    return <StartupLoadingScreen palette={palette} />
  }

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={openStore} message={forceUpdateMessage} />
  }

  const runtimeConfigIssues = getRuntimeConfigIssues()

  if (runtimeConfigIssues.length > 0) {
    return <StartupConfigurationErrorScreen issues={runtimeConfigIssues} />
  }

  // Navigation notes (kept out of the <Stack> children: JSX comments there
  // surfaced as unknown children and warned on every render).
  // Full-screen setup/onboarding flows
  // onboarding revamp: club-setup, find-club and account-next-step are
  // redirects into the (auth) onboarding group now.
  // Form sheets — iOS 15+ pageSheet with swipe-to-dismiss
  // NOTE: do NOT add sheetAllowedDetents:'fitToContents' here.
  // A fit-to-contents detent + the screen's KeyboardAvoidingView
  // form a native<->JS layout feedback loop when the software
  // keyboard opens (KAV grows content -> sheet refits -> keyboard
  // frame changes -> KAV recalculates -> ...), which FROZE the JS
  // thread and OOM-crashed the app on any text-field focus. A
  // standard large form sheet (like edit-profile) avoids it.
  // Events revamp: create/edit is a self-contained task, so a page
  // modal with Cancel + one sticky CTA (no KAV, no detents).
  // privacy: guardian consent overview + withdrawal (parents, from Profil)
  // ── chat revamp: inbox → conversation → info; new chat is a modal.
  // dm-new / dm-chat are redirect-only routes for old deep links. ──
  // Header visibility is fixed here, never toggled from inside the screen:
  // react-native-screens remounts a modal whose header visibility
  // changes, which looped forever on chat/new.
  // Detail views — card presentation for stacked feel
  // Kader revamp (team agent): team tools reached from the Kader tab.
  // club-admin revamp: admin workspace screens are ordinary pushes
  // from the Verein tab (back button, no stacked fullScreenModals).
  // /admin-dashboard is now a redirect to the Verein tab.
  // club-admin revamp: pushed from Verein
  // club-admin revamp: pushed from Verein
  // Wechselbörse: club recruiting desk, trial detail, Aufnahmeantrag
  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <AuthProvider>
          <ClubThemeProvider>
            <ReleaseNotices
              announcement={announcement}
              softUpdate={softUpdate}
              recommendedVersion={recommendedVersion}
              onOpenStore={openStore}
              onDismissAnnouncement={dismissAnnouncement}
              onDismissSoftUpdate={dismissSoftUpdate}
            />
            <PushNotificationProvider>
              <URLDeepLinkHandler />
              <PushDeepLinkHandler />
              <AppErrorBoundary>
                <StatusBar
                  barStyle={isDark ? 'light-content' : 'dark-content'}
                  backgroundColor={palette.background}
                />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="e2e" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="invite" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="add-members" options={{ presentation: 'card' }} />
                  <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
                  <Stack.Screen
                    name="join/[...code]"
                    options={{ presentation: 'fullScreenModal' }}
                  />
                  <Stack.Screen name="join-club" options={{ presentation: 'fullScreenModal' }} />
                  <Stack.Screen name="enter-dob" options={{ animation: 'fade' }} />
                  <Stack.Screen name="pending-approval" options={{ animation: 'fade' }} />
                  <Stack.Screen name="access-blocked" options={{ animation: 'fade' }} />
                  <Stack.Screen name="account-next-step" options={{ animation: 'fade' }} />
                  <Stack.Screen
                    name="create-event"
                    options={{ presentation: 'modal', gestureEnabled: true }}
                  />
                  <Stack.Screen name="edit-profile" options={{ presentation: 'formSheet' }} />
                  <Stack.Screen name="notification-settings" options={{ presentation: 'card' }} />
                  <Stack.Screen name="language" options={{ presentation: 'formSheet' }} />
                  <Stack.Screen name="policy/[kind]" options={{ presentation: 'card' }} />
                  <Stack.Screen name="legal" options={{ presentation: 'card' }} />
                  <Stack.Screen name="child-consent" options={{ presentation: 'card' }} />
                  <Stack.Screen
                    name="chat/[id]"
                    options={{ presentation: 'card', headerShown: true }}
                  />
                  <Stack.Screen
                    name="chat/[id]/info"
                    options={{ presentation: 'card', headerShown: true }}
                  />
                  <Stack.Screen
                    name="chat/new"
                    options={{ presentation: 'modal', headerShown: true }}
                  />
                  <Stack.Screen name="dm-new" options={{ animation: 'none' }} />
                  <Stack.Screen name="event-detail" options={{ presentation: 'card' }} />
                  <Stack.Screen name="match-detail" options={{ presentation: 'card' }} />
                  <Stack.Screen name="league-table" options={{ presentation: 'card' }} />
                  <Stack.Screen name="aufgaben" options={{ presentation: 'card' }} />
                  <Stack.Screen name="team-spiele" options={{ presentation: 'card' }} />
                  <Stack.Screen name="team-stats" options={{ presentation: 'card' }} />
                  <Stack.Screen name="free-agent/[id]" options={{ presentation: 'card' }} />
                  <Stack.Screen name="dm-chat" options={{ animation: 'none' }} />
                  <Stack.Screen name="my-contributions" options={{ presentation: 'card' }} />
                  <Stack.Screen name="lineup-builder" options={{ presentation: 'card' }} />
                  <Stack.Screen name="conflicts" options={{ presentation: 'card' }} />
                  <Stack.Screen name="carpool" options={{ presentation: 'card' }} />
                  <Stack.Screen name="photo-wall" options={{ presentation: 'card' }} />
                  <Stack.Screen name="compliance" options={{ presentation: 'card' }} />
                  <Stack.Screen name="admin-dashboard" options={{ animation: 'none' }} />
                  <Stack.Screen name="admin-members" options={{ presentation: 'card' }} />
                  <Stack.Screen name="admin-billing" options={{ presentation: 'card' }} />
                  <Stack.Screen name="admin-club-profile" options={{ presentation: 'card' }} />
                  <Stack.Screen name="admin-reports" options={{ presentation: 'card' }} />
                  <Stack.Screen name="admin-sponsors" options={{ presentation: 'card' }} />
                  <Stack.Screen name="admin-contribution-bank" options={{ presentation: 'card' }} />
                  <Stack.Screen name="admin-contribution-plan" options={{ presentation: 'card' }} />
                  <Stack.Screen
                    name="admin-contribution-reconciliation"
                    options={{ presentation: 'card' }}
                  />
                  <Stack.Screen name="club-staff" options={{ presentation: 'card' }} />
                  <Stack.Screen name="me" options={{ animation: 'none' }} />
                  <Stack.Screen name="admin-chat-retention" options={{ animation: 'none' }} />
                  <Stack.Screen name="club-stats" options={{ presentation: 'card' }} />{' '}
                  <Stack.Screen name="team-management" options={{ presentation: 'card' }} />
                  <Stack.Screen name="team-families" options={{ presentation: 'card' }} />{' '}
                  <Stack.Screen
                    name="fussball-link"
                    options={{ presentation: 'fullScreenModal' }}
                  />
                  <Stack.Screen name="official-team-page" options={{ presentation: 'card' }} />
                  <Stack.Screen
                    name="roster-aggregate"
                    options={{ presentation: 'fullScreenModal' }}
                  />
                  <Stack.Screen name="pending-requests" options={{ presentation: 'card' }} />
                  <Stack.Screen name="ownership-transfers" options={{ presentation: 'card' }} />
                  <Stack.Screen name="wechselboerse/index" options={{ presentation: 'card' }} />
                  <Stack.Screen name="trial/[id]" options={{ presentation: 'card' }} />
                  <Stack.Screen
                    name="aufnahmeantrag/[trialId]"
                    options={{ presentation: 'modal' }}
                  />
                  <Stack.Screen
                    name="free-agent/profile"
                    options={{ presentation: 'fullScreenModal' }}
                  />
                </Stack>
              </AppErrorBoundary>
            </PushNotificationProvider>
          </ClubThemeProvider>
        </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

export function URLDeepLinkHandler() {
  useEffect(() => {
    const handle = (url: string) => {
      const m = url.match(/\/join\/([^/?#]+)\/([^/?#]+)/)
      if (m?.[1] && m?.[2]) {
        router.push({
          pathname: '/join/[...code]',
          params: { code: [m[1], m[2]] },
        } as never)
      }
    }

    Linking.getInitialURL()
      .then((url) => {
        if (url) handle(url)
      })
      .catch(() => undefined)

    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [])

  return null
}

export function PushDeepLinkHandler() {
  const { lastNotification } = usePushContext()
  // Chat revamp (M3): chat pushes carry clubId. A tap on a push from another
  // club must switch the active club before opening the conversation, or the
  // screen loads under the wrong tenant. Refs keep the effect keyed on the
  // notification alone.
  const auth = useAuth()
  const authRef = useRef(auth)
  authRef.current = auth

  useEffect(() => {
    if (!lastNotification) return
    // Two payload shapes coexist: legacy DM/event pushes use `type`,
    // newer chat/contribution pushes use `kind`. Read both so a tap on
    // a media-message or contribution-paid push lands on the right
    // screen instead of dropping into a no-op.
    const data = lastNotification.notification.request.content.data as
      | {
          type?: string
          kind?: string
          conversationId?: string
          eventId?: string
          teamId?: string
          channelId?: string
          messageId?: string
          fixtureId?: string
          trialInviteId?: string
          clubId?: string
        }
      | undefined

    if (!data) return
    const ensureClub = () => {
      const { memberships, activeClub, setActiveClub } = authRef.current ?? {}
      if (!data.clubId || !memberships || !setActiveClub) return
      if (activeClub?.club?.id === data.clubId) return
      const target = memberships.find((m) => m.club?.id === data.clubId)
      if (target) setActiveClub(target)
    }
    openNotificationTarget(data, ensureClub)
  }, [lastNotification])

  return null
}

function StartupConfigurationErrorScreen({ issues }: { issues: RuntimeConfigIssue[] }) {
  const isDark = useColorScheme() === 'dark'
  const palette = isDark ? darkTheme : lightTheme
  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={palette.background}
      />
      <View
        style={[
          styles.panel,
          { backgroundColor: palette.surface, shadowColor: palette.textPrimary },
        ]}
      >
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          Build configuration incomplete
        </Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          This build cannot start safely until the runtime configuration is fixed.
        </Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          Update these settings for the active EAS environment and rebuild the app:
        </Text>
        <View style={styles.issueList}>
          {issues.map((issue) => (
            <View key={`${issue.key}:${issue.reason}`} style={styles.issueItem}>
              <Text style={[styles.code, { color: palette.textPrimary }]}>{issue.key}</Text>
              <Text style={[styles.body, { color: palette.textSecondary }]}>{issue.reason}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

function StartupLoadingScreen({ palette }: { palette: typeof lightTheme | typeof darkTheme }) {
  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Text style={[styles.startupTitle, { color: palette.textPrimary }]}>Anstoss</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  startupTitle: {
    fontSize: fontSize['2xl'],
    lineHeight: lineHeight['2xl'],
    fontWeight: '700',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    padding: space.lg,
    borderRadius: radius.lg,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
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
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
  },
  code: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.md,
    fontFamily: fonts.data,
  },
})
