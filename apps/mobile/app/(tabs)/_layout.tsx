import {
  RADIUS_FULL,
  SPACING_LG,
  SPACING_XXS,
  SPACING_XXXL,
} from '../../src/theme/spacing'
import { useState } from 'react'
import { View, Image, Pressable, StyleSheet, type ColorValue } from 'react-native'
import { Redirect, Tabs, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useClubSwitchGuard } from '../../src/hooks/useClubSwitchGuard'
import { ClubSwitcher } from '../../src/components/ClubSwitcher'
import { TeamSwitcher } from '../../src/components/TeamSwitcher'
import { useDmUnreadCount } from '../../src/components/DmListView'
import { BottomSheet, Icon, ListRow, Text } from '../../src/components/ui'
import {
  FONT_FAMILY_BOLD,
  FONT_FAMILY_MEDIUM,
  hairline,
  RADIUS_SM,
  SPACING_MD,
  SPACING_SM,
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
    activeTeamAccess,
    teamsForActiveClub: teamsForActiveClubFromAuth,
    activeRoleMode,
    availableRoleModes: availableRoleModesFromAuth,
    setActiveRoleMode,
    memberships,
    isLoading,
  } = useAuth()
  const availableRoleModes = availableRoleModesFromAuth ?? []
  const teamsForActiveClub = teamsForActiveClubFromAuth ?? []
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
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)
  const [teamSwitcherVisible, setTeamSwitcherVisible] = useState(false)
  const [roleSwitcherVisible, setRoleSwitcherVisible] = useState(false)
  const dmUnread = useDmUnreadCount()
  const resolvedRoleMode =
    activeRoleMode ??
    (activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
      ? 'ADMIN'
      : activeClub?.role === 'COACH'
        ? 'COACH'
        : activeClub?.role === 'PARENT'
          ? 'PARENT'
          : activeClub?.role === 'PLAYER'
            ? 'PLAYER'
            : null)

  useClubSwitchGuard()

  if (shouldExitClubTabs) {
    return <Redirect href="/account-next-step" />
  }

  const hasMultipleClubs = memberships.length > 1
  const usesParentSchedule = resolvedRoleMode === 'PARENT'
  const eventsTabTitle = usesParentSchedule ? t('tabs.schedule') : t('tabs.events')
  const navigationMode = isFreeAgent ? 'free-agent' : 'club'
  const tabIconColor = (color: ColorValue) =>
    typeof color === 'string' ? color : theme.textSecondary

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {!activeClub && <View style={{ height: insets.top, backgroundColor: theme.background }} />}
      {activeClub && (
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.background,
              borderBottomColor: theme.background,
              paddingTop: insets.top + SPACING_XS,
            },
          ]}
        >
          <View style={styles.headerIdentity}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={activeClub.club.name}
              accessibilityHint={hasMultipleClubs ? t('clubSwitcher.title') : undefined}
              disabled={!hasMultipleClubs}
              onPress={() => setClubSwitcherVisible(true)}
              style={({ pressed }) => [
                styles.clubBadge,
                pressed && styles.clubBadgePressed,
              ]}
            >
              {activeClub.club.badgeUrl ? (
                <Image
                  source={{ uri: activeClub.club.badgeUrl }}
                  style={[styles.badgeImage, { borderColor: theme.borderDefault }]}
                />
              ) : (
                <View
                  style={[styles.badgePlaceholder, { backgroundColor: activeClub.club.primaryColor }]}
                >
                  <Text variant="subheadline" weight="bold" color="inverse">
                    {activeClub.club.name.substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text variant="headline" color="primary" numberOfLines={1} style={styles.clubName}>
                {activeClub.club.name}
              </Text>
              {hasMultipleClubs ? (
                <Icon name="chevron.up.chevron.down" size="sm" color="tertiary" />
              ) : null}
            </Pressable>
            <View style={styles.headerMeta}>
            {availableRoleModes.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('more.roleModeTitle', { defaultValue: 'Use Anstoss as' })}
                onPress={() => setRoleSwitcherVisible(true)}
                style={({ pressed }) => [
                  styles.teamButton,
                  { borderColor: theme.borderDefault },
                  pressed && styles.clubBadgePressed,
                ]}
              >
                <Text variant="footnote" color="secondary" numberOfLines={1}>
                  {roleModeLabel(activeRoleMode ?? availableRoleModes[0], t)}
                </Text>
                <Icon name="chevron.up.chevron.down" size="sm" color="tertiary" />
              </Pressable>
            ) : null}
            {teamsForActiveClub.length > 1 && activeTeamAccess ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('teamSwitcher.currentTeam', {
                  defaultValue: 'Current team: {{team}}',
                  team: activeTeamAccess.team.displayName || activeTeamAccess.team.name,
                })}
                accessibilityHint={t('teamSwitcher.title')}
                onPress={() => setTeamSwitcherVisible(true)}
                style={({ pressed }) => [
                  styles.teamButton,
                  { borderColor: theme.borderDefault },
                  pressed && styles.clubBadgePressed,
                ]}
              >
                <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.teamName}>
                  {activeTeamAccess.team.displayName || activeTeamAccess.team.name}
                </Text>
                <Icon name="chevron.up.chevron.down" size="sm" color="tertiary" />
              </Pressable>
            ) : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('notifications.title', 'Notifications')}
            onPress={() => router.push('/notification-settings' as never)}
            style={({ pressed }) => [
              styles.bellButton,
              { backgroundColor: theme.surfaceSunken },
              pressed && styles.clubBadgePressed,
            ]}
          >
            <Icon name="bell" size="md" color="primary" />
          </Pressable>
        </View>
      )}
      <Tabs
        key={navigationMode}
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
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
            fontSize: 11,
            letterSpacing: 0.2,
          },
          tabBarItemStyle: {
            paddingTop: SPACING_XXS,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'home.fill' : 'home'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.home'),
          }}
        />
        <Tabs.Screen
          name="profile/index"
          options={{
            // Profile tab only renders for free agents — gated by `href: null`
            // for everyone else. Regular club members reach their profile via
            // More → Profile.
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
          name="invites/index"
          options={{
            // Invites tab is free-agent only — trial invites from clubs.
            href: isFreeAgent ? '/(tabs)/invites' : null,
            title: t('tabs.invites', { defaultValue: 'Invites' }),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'envelope.fill' : 'envelope'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.invites', { defaultValue: 'Invites' }),
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
            // Free agents see the same DM-list, just labelled "Messages"
            // (no team chat to surface yet).
            title: isFreeAgent ? t('tabs.messages', { defaultValue: 'Messages' }) : t('tabs.chat'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'bubble.fill' : 'bubble'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarBadge: dmUnread > 0 ? dmUnread : undefined,
            tabBarBadgeStyle:
              dmUnread > 0
                ? {
                    backgroundColor: theme.primary,
                    color: theme.textInverse,
                    fontSize: 10,
                    fontFamily: FONT_FAMILY_BOLD,
                  }
                : undefined,
            tabBarAccessibilityLabel: isFreeAgent
              ? t('tabs.messages', { defaultValue: 'Messages' })
              : t('tabs.chat'),
          }}
        />
        <Tabs.Screen
          name="squad/index"
          options={{
            href: isFreeAgent ? null : '/(tabs)/squad',
            title: t('tabs.squad', { defaultValue: 'Squad' }),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'person.2.fill' : 'person.2'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.squad', { defaultValue: 'Squad' }),
          }}
        />
        <Tabs.Screen
          name="roster/index"
          options={{
            href: null,
            title: t('tabs.roster'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'person.2.fill' : 'person.2'}
                size={TAB_ICON_SIZE}
                color={tabIconColor(color)}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.roster'),
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
      <ClubSwitcher visible={clubSwitcherVisible} onClose={() => setClubSwitcherVisible(false)} />
      <TeamSwitcher visible={teamSwitcherVisible} onClose={() => setTeamSwitcherVisible(false)} />
      <BottomSheet
        visible={roleSwitcherVisible}
        onClose={() => setRoleSwitcherVisible(false)}
        heightPct="auto"
      >
        <View style={styles.roleSheet}>
          <Text variant="title2" color="primary">
            {t('more.roleModeTitle', { defaultValue: 'Use Anstoss as' })}
          </Text>
          <Text variant="body" color="secondary">
            {t('more.roleModeHint', {
              defaultValue: 'Switch views without changing any club permissions.',
            })}
          </Text>
          {availableRoleModes.map((mode) => (
            <ListRow
              key={mode}
              title={roleModeLabel(mode, t)}
              selected={activeRoleMode === mode}
              right={
                activeRoleMode === mode ? (
                  <Icon name="checkmark.circle.fill" size="md" color="primary" />
                ) : undefined
              }
              onPress={() => {
                setActiveRoleMode?.(mode)
                setRoleSwitcherVisible(false)
              }}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 0,
    paddingHorizontal: SPACING_LG,
    paddingBottom: SPACING_SM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
  },
  headerIdentity: {
    flex: 1,
    minWidth: 0,
  },
  headerMeta: {
    marginLeft: SPACING_XXXL + SPACING_SM,
    marginTop: -SPACING_XXS,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING_XS,
  },
  clubBadge: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
  },
  bellButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
  },
  clubBadgePressed: {
    opacity: 0.72,
  },
  badgeImage: {
    width: SPACING_XXXL,
    height: SPACING_XXXL,
    borderRadius: RADIUS_SM,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  badgePlaceholder: {
    width: SPACING_XXXL,
    height: SPACING_XXXL,
    borderRadius: RADIUS_SM,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubName: {
    flex: 1,
  },
  teamButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    maxWidth: '100%',
    paddingHorizontal: SPACING_SM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
    borderWidth: hairline,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
  },
  teamName: {
    flexShrink: 1,
  },
  roleSheet: {
    gap: SPACING_SM,
  },
})

function roleModeLabel(mode: string | undefined, t: TFunction) {
  if (mode === 'ADMIN') return t('roles.ADMIN', { defaultValue: 'Club administrator' })
  if (mode === 'COACH') return t('roles.COACH', { defaultValue: 'Coach' })
  if (mode === 'PLAYER') return t('roles.PLAYER', { defaultValue: 'Player' })
  if (mode === 'PARENT') return t('roles.PARENT', { defaultValue: 'Parent' })
  return t('roles.FREE_AGENT', { defaultValue: 'Free agent' })
}
