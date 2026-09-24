import { SPACING_XXS } from '../../src/theme/spacing'
import { View, type ColorValue } from 'react-native'
import { useEffect } from 'react'
import { Redirect, Tabs, router, usePathname } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useClubSwitchGuard } from '../../src/hooks/useClubSwitchGuard'
import { ClubHeader } from '../../src/components/home/ClubHeader'
import { resolveRoleMode } from '../../src/components/home/resolveHomeRole'
// chat revamp: the badge is the inbox's unread total (channels + DMs, unmuted)
import { useInboxUnreadCount } from '../../src/hooks/useInbox'
import { Icon } from '../../src/components/ui'
import {
  FONT_FAMILY_BOLD,
  FONT_FAMILY_MEDIUM,
  hairline,
  SPACING_MD,
  SPACING_XS,
  TAB_BAR_HEIGHT,
  TAB_ICON_SIZE,
} from '../../src/theme/tokens'

export default function TabLayout() {
  const { t } = useTranslation()
  const theme = useClubColors()
  const {
    user,
    activeClub,
    activeRoleMode,
    activeTeamAccess,
    memberships,
    isLoading,
  } = useAuth()
  // Free agents (no activeClub + role=FREE_AGENT) get a dedicated tab
  // bar: Home / Profile / Invites / Messages / More. Club-context tabs
  // (events, squad, roster) don't apply to them yet — they activate when
  // a trial invite is accepted and the user joins a club.
  const isFreeAgent = !activeClub && user?.registrationRole === 'FREE_AGENT'
  const shouldExitClubTabs =
    !isLoading &&
    !!user &&
    !activeClub &&
    memberships.length === 0 &&
    user?.registrationRole !== 'FREE_AGENT' &&
    user?.registrationRole !== 'CLUB_ADMIN'
  const insets = useSafeAreaInsets()
  const chatUnread = useInboxUnreadCount()
  // home revamp: one resolver for the header and the home screen (it honours
  // the active team role, e.g. a club PLAYER who is HEAD_COACH of a team).
  const resolvedRoleMode = activeClub
    ? resolveRoleMode({
        activeRoleMode,
        clubRole: activeClub.role,
        registrationRole: user?.registrationRole ?? null,
        teamRole: activeTeamAccess?.role ?? null,
      })
    : null

  useClubSwitchGuard()

  // ── club-admin review fixes (M5): a tab that becomes hidden while focused
  // (admin switches to coach mode on Verein, or back to admin mode on Team)
  // would leave the user on a screen with no tab bar entry. Go home instead.
  const pathname = usePathname()
  const vereinVisible =
    !isFreeAgent &&
    (activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN') &&
    resolvedRoleMode === 'ADMIN'
  useEffect(() => {
    const onHiddenTab =
      (pathname === '/verein' && !vereinVisible) ||
      (pathname === '/squad' && (isFreeAgent || vereinVisible))
    if (onHiddenTab) router.replace('/(tabs)' as never)
  }, [isFreeAgent, pathname, vereinVisible])
  // ── end M5 ──

  if (shouldExitClubTabs) {
    return <Redirect href="/account-next-step" />
  }

  // ── club-admin revamp: the Verein tab is the OWNER/ADMIN workspace. It
  // shows in admin mode and takes the Team tab's slot so the bar keeps five
  // tabs; switching to coach mode brings the Team tab back.
  const showVereinTab = vereinVisible
  // ── end club-admin revamp ──
  const usesParentSchedule = resolvedRoleMode === 'PARENT'
  const eventsTabTitle = usesParentSchedule ? t('tabs.schedule') : t('tabs.events')
  const navigationMode = isFreeAgent ? 'free-agent' : 'club'
  const tabIconColor = (color: ColorValue) =>
    typeof color === 'string' ? color : theme.textSecondary

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {!activeClub && <View style={{ height: insets.top, backgroundColor: theme.background }} />}
      {/* home revamp: one identity row (crest, club, team·role pill, bell). */}
      {activeClub ? <ClubHeader resolvedRoleMode={resolvedRoleMode} /> : null}
      <Tabs
        key={navigationMode}
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          lazy: false,
          freezeOnBlur: false,
          sceneStyle: {
            flex: 1,
            backgroundColor: theme.background,
          },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textTertiary,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.borderSubtle,
            borderTopWidth: hairline,
            height: TAB_BAR_HEIGHT,
            paddingBottom: SPACING_MD,
            paddingTop: SPACING_XS,
            elevation: 0,
          },
          tabBarLabelStyle: {
            fontFamily: FONT_FAMILY_MEDIUM,
            fontSize: 12,
            letterSpacing: 0,
          },
          tabBarItemStyle: {
            paddingTop: SPACING_XXS,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            // Wechselbörse: free agents discover Gesuche here ("Entdecken").
            title: isFreeAgent ? t('entdecken.tab') : t('tabs.home'),
            tabBarIcon: ({ color, focused }) =>
              isFreeAgent ? (
                <Icon name="magnifyingglass" size={TAB_ICON_SIZE} color={tabIconColor(color)} />
              ) : (
                <Icon
                  name={focused ? 'home.fill' : 'home'}
                  size={TAB_ICON_SIZE}
                  color={tabIconColor(color)}
                />
              ),
            tabBarAccessibilityLabel: isFreeAgent ? t('entdecken.tab') : t('tabs.home'),
          }}
        />
        <Tabs.Screen
          name="invites/index"
          options={{
            // Wechselbörse: free agents' "Probetrainings" pipeline.
            href: isFreeAgent ? '/(tabs)/invites' : null,
            title: t('probetraining.tab'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'figure.soccer.fill' : 'figure.soccer'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('probetraining.tab'),
          }}
        />
        <Tabs.Screen
          name="events/index"
          options={{
            // Club-context tab. Free agents have no team yet, so it's hidden
            // until they accept a trial.
            href: isFreeAgent ? null : '/(tabs)/events',
            title: eventsTabTitle,
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'calendar.fill' : 'calendar'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: eventsTabTitle,
          }}
        />
        <Tabs.Screen
          name="chat/index"
          options={{
            title: t('tabs.chat'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'bubble.fill' : 'bubble'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarBadge: chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : undefined,
            tabBarBadgeStyle:
              chatUnread > 0
                ? {
                    backgroundColor: theme.primary,
                    color: theme.textInverse,
                    fontSize: 12,
                    fontFamily: FONT_FAMILY_BOLD,
                  }
                : undefined,
            tabBarAccessibilityLabel:
              chatUnread > 0
                ? t('chatHub.a11y.tabUnread', { count: chatUnread })
                : t('tabs.chat'),
          }}
        />
        {/* Wechselbörse: free agents' Profil tab (the player profile editor). */}
        <Tabs.Screen
          name="profile/index"
          options={{
            href: isFreeAgent ? '/(tabs)/profile' : null,
            title: t('tabs.profile', { defaultValue: 'Profile' }),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'person.fill' : 'person'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.profile', { defaultValue: 'Profile' }),
          }}
        />
        <Tabs.Screen
          name="squad/index"
          options={{
            href: isFreeAgent || showVereinTab ? null : '/(tabs)/squad',
            title: t('tabs.team', { defaultValue: 'Team' }),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'person.2.fill' : 'person.2'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.team', { defaultValue: 'Team' }),
          }}
        />
        {/* club-admin revamp: Verein tab (OWNER/ADMIN in admin mode only) */}
        <Tabs.Screen
          name="verein/index"
          options={{
            href: showVereinTab ? '/(tabs)/verein' : null,
            title: t('verein.tabTitle'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'building.2.fill' : 'building.2'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('verein.tabTitle'),
          }}
        />
        <Tabs.Screen
          name="more/index"
          options={{
            // For club members this tab leads with the verified player card,
            // so it reads as "Profile"; free agents keep the catch-all "More".
            title: isFreeAgent ? t('tabs.more') : t('tabs.profile', { defaultValue: 'Profile' }),
            tabBarIcon: ({ color, focused }) =>
              isFreeAgent ? (
                <Icon
                  name={focused ? 'ellipsis.circle.fill' : 'ellipsis.circle'}
                  size={TAB_ICON_SIZE}
                  color={tabIconColor(color)}
                />
              ) : (
                <Icon
                  name={focused ? 'person.fill' : 'person'}
                  size={TAB_ICON_SIZE}
                  color={tabIconColor(color)}
                />
              ),
            tabBarAccessibilityLabel: isFreeAgent
              ? t('tabs.more')
              : t('tabs.profile', { defaultValue: 'Profile' }),
          }}
        />
      </Tabs>
    </View>
  )
}
