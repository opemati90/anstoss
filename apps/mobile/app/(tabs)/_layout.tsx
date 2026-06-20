import { SPACING_XXS, SPACING_XXXL } from '../../src/theme/spacing';
import { useState } from 'react'
import { View, Image, Pressable, StyleSheet } from 'react-native'
import { Tabs, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors, useIsDark } from '../../src/context/ClubThemeContext'
import { useClubSwitchGuard } from '../../src/hooks/useClubSwitchGuard'
import { ClubSwitcher } from '../../src/components/ClubSwitcher'
import { useDmUnreadCount } from '../../src/components/DmListView'
import { Text, Icon } from '../../src/components/ui'
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
  const isDark = useIsDark()
  const { user, activeClub, activeTeamAccess, memberships } = useAuth()
  // Free agents (no activeClub + role=FREE_AGENT) get a dedicated tab
  // bar: Home / Profile / Invites / Messages / More. Club-context tabs
  // (events, squad, roster) don't apply to them yet — they activate when
  // a trial invite is accepted and the user joins a club.
  const isFreeAgent = !activeClub && user?.registrationRole === 'FREE_AGENT'
  const insets = useSafeAreaInsets()
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)

  useClubSwitchGuard()

  const dmUnread = useDmUnreadCount()
  const hasMultipleClubs = memberships.length > 1
  const hasSelectedTeamEvents =
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH' ||
    activeTeamAccess?.role === 'PLAYER'
  const usesParentSchedule =
    activeClub?.role === 'PARENT' && !hasSelectedTeamEvents
  const eventsTabTitle =
    usesParentSchedule ? t('tabs.schedule') : t('tabs.events')

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {!activeClub && (
        <View style={{ height: insets.top, backgroundColor: theme.background }} />
      )}
      {activeClub && (
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.borderDefault,
              paddingTop: insets.top + SPACING_XS,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activeClub.club.name}
            onPress={() => setClubSwitcherVisible(true)}
            style={({ pressed }) => [
              styles.clubBadge,
              pressed && styles.clubBadgePressed,
            ]}
          >
            {activeClub.club.badgeUrl ? (
              <Image
                source={{ uri: activeClub.club.badgeUrl }}
                style={[
                  styles.badgeImage,
                  { borderColor: theme.borderDefault },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.badgePlaceholder,
                  { backgroundColor: activeClub.club.primaryColor },
                ]}
              >
                <Text variant="subheadline" weight="bold" color="inverse">
                  {activeClub.club.name.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text
              variant="headline"
              color="primary"
              numberOfLines={1}
              style={styles.clubName}
            >
              {activeClub.club.name}
            </Text>
            <Icon
              name={hasMultipleClubs ? 'chevron.up.chevron.down' : 'chevron.right'}
              size="sm"
              color="tertiary"
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('notifications.title', 'Notifications')}
            onPress={() => router.push('/notification-settings' as never)}
            style={({ pressed }) => [
              styles.bellButton,
              pressed && styles.clubBadgePressed,
            ]}
          >
            <Icon name="bell" size="md" color="primary" />
          </Pressable>
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          animation: 'fade',
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
            fontSize: 10,
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
                color={color}
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
                color={color}
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
                color={color}
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
                color={color}
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
            title: isFreeAgent
              ? t('tabs.messages', { defaultValue: 'Messages' })
              : t('tabs.chat'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'bubble.fill' : 'bubble'}
                size={TAB_ICON_SIZE}
                color={color}
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
                color={color}
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
                color={color}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.roster'),
          }}
        />
        <Tabs.Screen
          name="more/index"
          options={{
            title: t('tabs.more'),
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={focused ? 'ellipsis.circle.fill' : 'ellipsis.circle'}
                size={TAB_ICON_SIZE}
                color={color}
              />
            ),
            tabBarAccessibilityLabel: t('tabs.more'),
          }}
        />
      </Tabs>
      <ClubSwitcher
        visible={clubSwitcherVisible}
        onClose={() => setClubSwitcherVisible(false)}
      />
      {isDark ? null : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: hairline,
    paddingHorizontal: SPACING_MD,
    paddingBottom: SPACING_SM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
  },
  clubBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    paddingVertical: SPACING_XS,
  },
  bellButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
})
