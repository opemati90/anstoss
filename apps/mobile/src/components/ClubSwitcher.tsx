import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { radius, space, fontSize, fonts,
  hairline } from '../theme/tokens'

const SCREEN_HEIGHT = Dimensions.get('window').height

interface ClubSwitcherProps {
  visible: boolean
  onClose: () => void
}

export function ClubSwitcher({ visible, onClose }: ClubSwitcherProps) {
  const { t } = useTranslation()
  const { memberships, activeClub, setActiveClub } = useAuth()
  const c = useClubColors()
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const currentMembership = activeClub ?? memberships[0] ?? null
  const otherMemberships = memberships.filter(
    (membership) => membership.club.id !== currentMembership?.club.id,
  )
  const canManageClub =
    currentMembership?.role === 'OWNER' || currentMembership?.role === 'ADMIN'

  useEffect(() => {
    if (!visible) {
      translateY.stopAnimation()
      translateY.setValue(SCREEN_HEIGHT)
      return
    }

    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start()
  }, [translateY, visible])

  if (!visible || !currentMembership) {
    return null
  }

  const handleSelect = (membership: typeof memberships[number]) => {
    setActiveClub(membership)
    onClose()
  }

  const handleNavigate = (
    path: '/admin-dashboard' | '/(tabs)/more' | '/notification-settings',
  ) => {
    onClose()
    router.push(path)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close club switcher">
        <Animated.View style={[styles.sheet, { backgroundColor: c.surface, transform: [{ translateY }] }]}>
          <Pressable>
            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.handle, { backgroundColor: c.border }]} />
              <Text style={[styles.title, { color: c.textPrimary }]}>{t('clubSwitcher.title')}</Text>
              <Text style={[styles.subtitle, { color: c.textSecondary }]}>
                {t('clubSwitcher.subtitle', { count: memberships.length })}
              </Text>

              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>{t('clubSwitcher.currentSection')}</Text>
              <View
                style={[
                  styles.summaryCard,
                  {
                    borderColor: c.clubPrimary,
                    backgroundColor: c.clubPrimaryLight,
                  },
                ]}
              >
                <View style={styles.clubInfo}>
                  <ClubBadge
                    badgeUrl={currentMembership.club.badgeUrl}
                    clubName={currentMembership.club.name}
                    primaryColor={currentMembership.club.primaryColor}
                  />
                  <View style={styles.clubText}>
                    <Text
                      style={[styles.clubName, { color: c.clubPrimary }]}
                      numberOfLines={1}
                    >
                      {currentMembership.club.name}
                    </Text>
                    <Text style={[styles.clubRole, { color: c.textSecondary }]}>
                      {t(`roles.${currentMembership.role}`)}
                    </Text>
                  </View>
                </View>
                <View style={styles.activeIndicator}>
                  <Icon
                    name="checkmark.circle.fill"
                    size="md"
                    color={c.clubPrimary}
                  />
                  <Text style={[styles.activeLabel, { color: c.clubPrimary }]}>
                    {t('clubSwitcher.current')}
                  </Text>
                </View>
              </View>

              {otherMemberships.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>{t('clubSwitcher.otherSection')}</Text>
                  <View style={styles.listSection}>
                    {otherMemberships.map((membership) => (
                      <Pressable
                        key={membership.club.id}
                        style={[styles.clubRow, { borderColor: c.border, backgroundColor: c.surface }]}
                        onPress={() => handleSelect(membership)}
                        accessibilityRole="button"
                        accessibilityLabel={membership.club.name}
                      >
                        <View style={styles.clubInfo}>
                          <ClubBadge
                            badgeUrl={membership.club.badgeUrl}
                            clubName={membership.club.name}
                            primaryColor={membership.club.primaryColor}
                          />
                          <View style={styles.clubText}>
                            <Text style={[styles.clubName, { color: c.textPrimary }]} numberOfLines={1}>
                              {membership.club.name}
                            </Text>
                            <Text style={[styles.clubRole, { color: c.textSecondary }]}>
                              {t(`roles.${membership.role}`)}
                            </Text>
                          </View>
                        </View>
                        <Icon
                          name="chevron.right"
                          size="sm"
                          color={c.textTertiary}
                        />
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <View style={[styles.actionGroup, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Pressable
                  style={[styles.actionRow, { borderBottomColor: c.border }]}
                  testID="club-switcher-primary-action"
                  onPress={() =>
                    handleNavigate(canManageClub ? '/admin-dashboard' : '/(tabs)/more')
                  }
                  accessibilityRole="button"
                  accessibilityLabel={canManageClub ? t('adminDashboard.title') : t('more.title')}
                >
                  <Icon
                    name={canManageClub ? 'gearshape' : 'ellipsis'}
                    size="md"
                    color={c.textPrimary}
                  />
                  <Text style={[styles.actionLabel, { color: c.textPrimary }]}>
                    {canManageClub ? t('adminDashboard.title') : t('more.title')}
                  </Text>
                  <Icon
                    name="chevron.right"
                    size="sm"
                    color={c.textTertiary}
                  />
                </Pressable>

                <Pressable
                  style={[styles.actionRow, { borderBottomColor: c.border }]}
                  testID="club-switcher-notifications-action"
                  onPress={() => handleNavigate('/notification-settings')}
                  accessibilityRole="button"
                  accessibilityLabel={t('notificationSettings.title')}
                >
                  <Icon
                    name="bell"
                    size="md"
                    color={c.textPrimary}
                  />
                  <Text style={[styles.actionLabel, { color: c.textPrimary }]}>{t('notificationSettings.title')}</Text>
                  <Icon
                    name="chevron.right"
                    size="sm"
                    color={c.textTertiary}
                  />
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

function ClubBadge({
  badgeUrl,
  clubName,
  primaryColor,
}: {
  badgeUrl: string | null
  clubName: string
  primaryColor: string
}) {
  const c = useClubColors()

  if (badgeUrl) {
    return <Image source={{ uri: badgeUrl }} style={styles.badge} />
  }

  return (
    <View style={[styles.badgePlaceholder, { backgroundColor: primaryColor }]}>
      <Text style={[styles.badgeInitial, { color: c.textInverse }]}>{clubName.charAt(0).toUpperCase()}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space['2xl'],
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  sheetContent: {
    paddingBottom: space.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: space['2xs'],
    alignSelf: 'center',
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    marginBottom: space.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginBottom: space.lg,
  },
  sectionLabel: {
    marginBottom: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.lg,
    gap: space.sm,
    marginBottom: space.lg,
  },
  listSection: {
    marginBottom: space.lg,
    gap: space.md,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  clubInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
  },
  badgePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInitial: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  clubText: {
    flex: 1,
    gap: space['2xs'],
  },
  clubName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  clubRole: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  activeLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
  },
  actionGroup: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  actionRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: hairline,
  },
  actionLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
})
