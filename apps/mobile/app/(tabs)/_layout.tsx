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
  const { activeClub, activeTeamAccess, memberships } = useAuth()
  const insets = useSafeAreaInsets()
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)

  useClubSwitchGuard()

  const dmUnread = useDmUnreadCount()
  const hasMultipleClubs = memberships.length > 1
  const canOpenRoster =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'
  const eventsTabTitle =
    activeClub?.role === 'PARENT' ? t('tabs.schedule') : t('tabs.events')

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
            onPress={() => router.push('/notifications' as never)}
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
          name="events/index"
          options={{
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
            title: t('tabs.chat'),
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
            tabBarAccessibilityLabel: t('tabs.chat'),
          }}
        />
        <Tabs.Screen
          name="squad/index"
          options={{
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
