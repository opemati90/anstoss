import { useState } from 'react'
import { View, Image, Pressable, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors, useIsDark } from '../../src/context/ClubThemeContext'
import { useClubSwitchGuard } from '../../src/hooks/useClubSwitchGuard'
import { ClubSwitcher } from '../../src/components/ClubSwitcher'
import { useDmUnreadCount } from '../../src/components/DmListView'
import { Text, Icon } from '../../src/components/ui'
import { hairline, radius, space } from '../../src/theme/tokens'

/**
 * Tab layout with a slim club-identity header. The header sits above the
 * main content across all tabs; tapping it opens the club switcher.
 *
 * Tab-bar icons switch between outline and filled variants based on
 * focus state, matching Apple's first-party tab bars.
 */
export default function TabLayout() {
  const { t } = useTranslation()
  const theme = useClubColors()
  const isDark = useIsDark()
  const { activeClub, activeTeamAccess, memberships } = useAuth()
  const insets = useSafeAreaInsets()
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)

  // ANS-202: Reset nav stack on club switch
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
      {/* Club identity header */}
      {activeClub && (
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.background,
              borderBottomColor: theme.border,
              paddingTop: insets.top + space.xs,
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
                  { borderColor: theme.border },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.badgePlaceholder,
                  { backgroundColor: activeClub.club.primaryColor },
                ]}
              >
                <Text
                  variant="subheadline"
                  weight="bold"
                  color="inverse"
                >
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
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          tabBarActiveTintColor: theme.clubPrimary,
          tabBarInactiveTintColor: theme.textTertiary,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            borderTopWidth: hairline,
            height: 84,
            paddingBottom: space.lg,
            paddingTop: space.xs,
            // Subtle elevation (Android ripple fallback)
            elevation: 0,
          },
          tabBarLabelStyle: {
            fontFamily: 'DMSans_500Medium',
            fontSize: 10,
            letterSpacing: 0.2,
          },
          tabBarItemStyle: {
            paddingTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color, size, focused }) => (
              <Icon
                name={focused ? 'home.fill' : 'home'}
                size={size}
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
            tabBarIcon: ({ color, size, focused }) => (
              <Icon
                name={focused ? 'calendar.fill' : 'calendar'}
                size={size}
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
            tabBarIcon: ({ color, size, focused }) => (
              <Icon
                name={focused ? 'bubble.fill' : 'bubble'}
                size={size}
                color={color}
              />
            ),
            tabBarBadge: dmUnread > 0 ? dmUnread : undefined,
            tabBarBadgeStyle:
              dmUnread > 0
                ? {
                    backgroundColor: theme.clubPrimary,
                    color: theme.textInverse,
                    fontSize: 10,
                    fontFamily: 'DMSans_700Bold',
                  }
                : undefined,
            tabBarAccessibilityLabel: t('tabs.chat'),
          }}
        />
        <Tabs.Screen
          name="roster/index"
          options={{
            href: canOpenRoster ? undefined : null,
            title: t('tabs.roster'),
            tabBarIcon: ({ color, size, focused }) => (
              <Icon
                name={focused ? 'person.2.fill' : 'person.2'}
                size={size}
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
            tabBarIcon: ({ color, size, focused }) => (
              <Icon
                name={focused ? 'ellipsis.circle.fill' : 'ellipsis.circle'}
                size={size}
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
      {/* Intentionally unused: isDark kept for future nav-bar blur swap */}
      {isDark ? null : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: hairline,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  clubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  clubBadgePressed: {
    opacity: 0.72,
  },
  badgeImage: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  badgePlaceholder: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubName: {
    flex: 1,
  },
})
