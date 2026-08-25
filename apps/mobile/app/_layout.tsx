import { useEffect, useState } from 'react'
import { Stack, router } from 'expo-router'
import { Linking, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans'
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono'
import { AuthProvider } from '../src/context/AuthContext'
import { ClubThemeProvider } from '../src/context/ClubThemeContext'
import {
  PushNotificationProvider,
  usePushContext,
} from '../src/components/PushNotificationProvider'
import { AppErrorBoundary } from '../src/components/AppErrorBoundary'
import { ForceUpdateScreen } from '../src/components/ForceUpdateScreen'
import { getRuntimeConfigIssues, type RuntimeConfigIssue } from '../src/config/runtime'
import { useUpdateCheck } from '../src/hooks/useUpdateCheck'
import { initSentry } from '../src/utils/sentry'
import { initializeI18n } from '../src/i18n'
import { fonts, fontSize, lineHeight, radius, space } from '../src/theme/tokens'
import { darkTheme, lightTheme } from '../src/theme/colors'

initSentry()

void SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    GeistMono_400Regular,
  })
  const [i18nReady, setI18nReady] = useState(false)
  const [startupTimedOut, setStartupTimedOut] = useState(false)
  const { forceUpdate, openStore } = useUpdateCheck()
  const isDark = useColorScheme() === 'dark'
  const palette = isDark ? darkTheme : lightTheme
  const startupReady =
    (fontsLoaded || !!fontError || startupTimedOut) && (i18nReady || startupTimedOut)

  useEffect(() => {
    initializeI18n()
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true))
  }, [])

  useEffect(() => {
    const firstPaintTimeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {})
    }, 750)
    const startupTimeout = setTimeout(() => {
      setStartupTimedOut(true)
      void SplashScreen.hideAsync().catch(() => {})
    }, 3500)
    return () => {
      clearTimeout(firstPaintTimeout)
      clearTimeout(startupTimeout)
    }
  }, [])

  useEffect(() => {
    if (startupReady) {
      void SplashScreen.hideAsync().catch(() => {})
    }
  }, [startupReady])

  if (!startupReady) {
    return <StartupLoadingScreen palette={palette} />
  }

  if (forceUpdate) {
    return <ForceUpdateScreen onUpdate={openStore} />
  }

  const runtimeConfigIssues = getRuntimeConfigIssues()

  if (runtimeConfigIssues.length > 0) {
    return <StartupConfigurationErrorScreen issues={runtimeConfigIssues} />
  }

  return (
    <AuthProvider>
      <ClubThemeProvider>
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
              {/* Full-screen setup/onboarding flows */}
              <Stack.Screen name="club-setup" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="invite" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="join/[...code]" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="join-club" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="enter-dob" options={{ animation: 'fade' }} />
              <Stack.Screen name="pending-approval" options={{ animation: 'fade' }} />
              <Stack.Screen name="access-blocked" options={{ animation: 'fade' }} />
              <Stack.Screen name="account-next-step" options={{ animation: 'fade' }} />
              {/* Form sheets — iOS 15+ pageSheet with swipe-to-dismiss */}
              {/* NOTE: do NOT add sheetAllowedDetents:'fitToContents' here.
                      A fit-to-contents detent + the screen's KeyboardAvoidingView
                      form a native<->JS layout feedback loop when the software
                      keyboard opens (KAV grows content -> sheet refits -> keyboard
                      frame changes -> KAV recalculates -> ...), which FROZE the JS
                      thread and OOM-crashed the app on any text-field focus. A
                      standard large form sheet (like edit-profile) avoids it. */}
              <Stack.Screen
                name="create-event"
                options={{
                  presentation: 'formSheet',
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                }}
              />
              <Stack.Screen name="edit-profile" options={{ presentation: 'formSheet' }} />
              <Stack.Screen name="notification-settings" options={{ presentation: 'card' }} />
              <Stack.Screen name="language" options={{ presentation: 'formSheet' }} />
              <Stack.Screen name="policy/[kind]" options={{ presentation: 'card' }} />
              <Stack.Screen name="legal" options={{ presentation: 'card' }} />
              <Stack.Screen name="dm-new" options={{ presentation: 'formSheet' }} />
              {/* Detail views — card presentation for stacked feel */}
              <Stack.Screen name="event-detail" options={{ presentation: 'card' }} />
              <Stack.Screen name="event-attendance" options={{ presentation: 'card' }} />
              <Stack.Screen name="match-detail" options={{ presentation: 'card' }} />
              <Stack.Screen name="league-table" options={{ presentation: 'card' }} />
              <Stack.Screen name="free-agent/[id]" options={{ presentation: 'card' }} />
              <Stack.Screen name="dm-list" options={{ presentation: 'card' }} />
              <Stack.Screen name="dm-chat" options={{ presentation: 'card' }} />
              <Stack.Screen name="my-contributions" options={{ presentation: 'card' }} />
              <Stack.Screen name="duty-roster" options={{ presentation: 'card' }} />
              <Stack.Screen name="lineup-builder" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="conflicts" options={{ presentation: 'card' }} />
              <Stack.Screen name="carpool" options={{ presentation: 'card' }} />
              <Stack.Screen name="photo-wall" options={{ presentation: 'card' }} />
              <Stack.Screen name="compliance" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="ehrenamt" options={{ presentation: 'card' }} />
              <Stack.Screen name="trikotwart" options={{ presentation: 'card' }} />
              <Stack.Screen name="pitch-status" options={{ presentation: 'card' }} />
              <Stack.Screen name="vereinsheim" options={{ presentation: 'card' }} />
              <Stack.Screen name="scouting" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="exchange" options={{ presentation: 'card' }} />
              <Stack.Screen name="streaks" options={{ presentation: 'card' }} />
              <Stack.Screen name="voice-memos" options={{ presentation: 'card' }} />
              <Stack.Screen name="sportgericht" options={{ presentation: 'fullScreenModal' }} />
              {/* Admin/management modals */}
              <Stack.Screen name="admin-dashboard" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="admin-members" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="admin-billing" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen
                name="admin-contribution-plan"
                options={{ presentation: 'fullScreenModal' }}
              />
              <Stack.Screen name="club-staff" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="club-stats" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="team-management" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="team-matches" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="team-families" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="fussball-link" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="roster-aggregate" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="parent-schedule" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="pending-requests" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen
                name="ownership-transfers"
                options={{ presentation: 'fullScreenModal' }}
              />
              <Stack.Screen name="transfer-list" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen
                name="free-agent/profile"
                options={{ presentation: 'fullScreenModal' }}
              />
            </Stack>
          </AppErrorBoundary>
        </PushNotificationProvider>
      </ClubThemeProvider>
    </AuthProvider>
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
        }
      | undefined

    if (!data) return
    const action = data.type ?? data.kind
    if (!action) {
      // Some pushes (trial invites) carry only an entity id, no type/kind.
      if (data.trialInviteId) router.push('/(tabs)/invites' as never)
      return
    }

    switch (action) {
      case 'dm':
        if (data.conversationId) {
          router.push({ pathname: '/dm-chat', params: { conversationId: data.conversationId } })
        }
        break
      case 'event':
      case 'event_created':
      case 'event_rsvp_reminder':
        if (data.eventId) {
          router.push({ pathname: '/event-detail', params: { eventId: data.eventId } })
        }
        break
      case 'join_request':
      case 'JOIN_REQUEST_REMINDER':
        // Coaches/admins land on the pending-requests queue to act on it.
        router.push('/pending-requests')
        break
      case 'join_approved':
      case 'join_rejected':
        // The requester just got a decision — drop them on home, which
        // re-derives their membership/holding state.
        router.push('/(tabs)' as never)
        break
      case 'GOAL_SCORED':
      case 'MATCH_FINAL':
        if (data.fixtureId) {
          router.push({
            pathname: '/match-detail',
            params: {
              fixtureId: data.fixtureId,
              ...(data.teamId ? { teamId: data.teamId } : {}),
            },
          })
        }
        break
      case 'TRIAL_INVITE':
      case 'TRIAL_RESPONSE':
        router.push('/(tabs)/invites' as never)
        break
      case 'CONTRIBUTION_PAID':
      case 'contribution':
        // contribution-paid (self-pay/admin-marked) and contribution
        // reminders both belong on the same screen — the user wants to
        // see status + outstanding plans in one place.
        router.push('/my-contributions')
        break
      case 'MEDIA_MESSAGE':
      case 'MESSAGE_REPLY':
      case 'MENTION':
      case 'announcement':
      case 'LINEUP_POSTED':
        // Land on the team chat. Channel rail will pick up the right
        // channel once it sees the channelId hint.
        router.push({
          pathname: '/(tabs)/chat' as never,
          params: data.channelId ? { channelId: data.channelId } : undefined,
        })
        break
      default:
        // Unknown payload — drop the deep-link, the tap still
        // foregrounds the app which is a reasonable fallback.
        break
    }
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
