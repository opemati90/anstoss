import { useState } from 'react'
import { View, Text, Image, Pressable, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useClubSwitchGuard } from '../../src/hooks/useClubSwitchGuard'
import { ClubSwitcher } from '../../src/components/ClubSwitcher'
import { neutralColors, space, fontSize, fontWeight, radius } from '../../src/theme/tokens'

export default function TabLayout() {
  const { t } = useTranslation()
  const theme = useClubColors()
  const { activeClub, activeTeamAccess, memberships } = useAuth()
  const insets = useSafeAreaInsets()
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)

  // ANS-202: Reset nav stack on club switch
  useClubSwitchGuard()

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
    <View style={{ flex: 1 }}>
      {/* Club header bar */}
      {activeClub && (
        <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
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
                style={styles.badgeImage}
              />
            ) : (
              <View
                style={[
                  styles.badgePlaceholder,
                  { backgroundColor: activeClub.club.primaryColor },
                ]}
              >
                <Text style={styles.badgeInitial}>
                  {activeClub.club.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.clubName} numberOfLines={1}>
              {activeClub.club.name}
            </Text>
            <Ionicons
              name={hasMultipleClubs ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color={neutralColors.textSecondary}
            />
          </Pressable>
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.clubPrimary,
          tabBarInactiveTintColor: neutralColors.textTertiary,
          tabBarStyle: {
            backgroundColor: neutralColors.surface,
            borderTopColor: neutralColors.border,
            height: 88,
            paddingBottom: 28,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="events/index"
          options={{
            title: eventsTabTitle,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat/index"
          options={{
            title: t('tabs.chat'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="roster/index"
          options={{
            href: canOpenRoster ? undefined : null,
            title: t('tabs.roster'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more/index"
          options={{
            title: t('tabs.more'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="ellipsis-horizontal" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      <ClubSwitcher
        visible={clubSwitcherVisible}
        onClose={() => setClubSwitcherVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: neutralColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  clubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  clubBadgePressed: {
    opacity: 0.72,
  },
  badgeImage: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
  },
  badgePlaceholder: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInitial: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  clubName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    flex: 1,
  },
})
