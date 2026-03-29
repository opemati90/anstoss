import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useClubColors } from '../context/ClubThemeContext'
import { neutralColors, radius, space, fontSize, fontWeight } from '../theme/tokens'

const SCREEN_HEIGHT = Dimensions.get('window').height

interface ClubSwitcherProps {
  visible: boolean
  onClose: () => void
}

export function ClubSwitcher({ visible, onClose }: ClubSwitcherProps) {
  const { t } = useTranslation()
  const { memberships, activeClub, setActiveClub } = useAuth()
  const theme = useClubColors()
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const currentMembership = activeClub ?? memberships[0] ?? null
  const hasMultipleClubs = memberships.length > 1
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

  const handleNavigate = (path: '/admin-dashboard' | '/(tabs)/more' | '/notification-settings') => {
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <Pressable>
            <View style={styles.handle} />
            <Text style={styles.title}>{t('clubSwitcher.title')}</Text>

            <View
              style={[
                styles.summaryCard,
                {
                  borderColor: theme.clubPrimary,
                  backgroundColor: theme.clubPrimaryLight,
                },
              ]}
            >
              <View style={styles.clubInfo}>
                {currentMembership.club.badgeUrl ? (
                  <Image
                    source={{ uri: currentMembership.club.badgeUrl }}
                    style={styles.badge}
                  />
                ) : (
                  <View
                    style={[
                      styles.badgePlaceholder,
                      { backgroundColor: currentMembership.club.primaryColor },
                    ]}
                  >
                    <Text style={styles.badgeInitial}>
                      {currentMembership.club.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.clubText}>
                  <Text style={[styles.clubName, { color: theme.clubPrimary }]} numberOfLines={1}>
                    {currentMembership.club.name}
                  </Text>
                  <Text style={styles.clubRole}>{t(`roles.${currentMembership.role}`)}</Text>
                </View>
              </View>
              <View style={styles.activeIndicator}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={theme.clubPrimary}
                />
                <Text style={[styles.activeLabel, { color: theme.clubPrimary }]}>
                  {t('clubSwitcher.current')}
                </Text>
              </View>
            </View>

            {hasMultipleClubs ? (
              <View style={styles.listSection}>
                {memberships.map((membership) => {
                  const isActive = membership.club.id === currentMembership.club.id

                  return (
                    <Pressable
                      key={membership.club.id}
                      style={styles.clubRow}
                      onPress={() => handleSelect(membership)}
                    >
                      <View style={styles.clubInfo}>
                        {membership.club.badgeUrl ? (
                          <Image
                            source={{ uri: membership.club.badgeUrl }}
                            style={styles.badge}
                          />
                        ) : (
                          <View
                            style={[
                              styles.badgePlaceholder,
                              { backgroundColor: membership.club.primaryColor },
                            ]}
                          >
                            <Text style={styles.badgeInitial}>
                              {membership.club.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.clubText}>
                          <Text style={styles.clubName} numberOfLines={1}>
                            {membership.club.name}
                          </Text>
                          <Text style={styles.clubRole}>
                            {t(`roles.${membership.role}`)}
                          </Text>
                        </View>
                      </View>

                      {isActive ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={theme.clubPrimary}
                        />
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={neutralColors.textTertiary}
                        />
                      )}
                    </Pressable>
                  )
                })}
              </View>
            ) : null}

            <View style={styles.actionGroup}>
              <Pressable
                style={styles.actionRow}
                testID="club-switcher-primary-action"
                onPress={() =>
                  handleNavigate(canManageClub ? '/admin-dashboard' : '/(tabs)/more')
                }
              >
                <Ionicons
                  name={canManageClub ? 'settings-outline' : 'ellipsis-horizontal'}
                  size={20}
                  color={neutralColors.textPrimary}
                />
                <Text style={styles.actionLabel}>
                  {canManageClub ? t('adminDashboard.title') : t('more.title')}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={neutralColors.textTertiary}
                />
              </Pressable>

              <Pressable
                style={styles.actionRow}
                testID="club-switcher-notifications-action"
                onPress={() => handleNavigate('/notification-settings')}
              >
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color={neutralColors.textPrimary}
                />
                <Text style={styles.actionLabel}>{t('notificationSettings.title')}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={neutralColors.textTertiary}
                />
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: neutralColors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.72,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: neutralColors.border,
    alignSelf: 'center',
    marginTop: space.sm,
    marginBottom: space.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.md,
  },
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.md,
  },
  listSection: {
    marginBottom: space.md,
    gap: space.sm,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
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
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  clubText: {
    flex: 1,
    gap: 2,
  },
  clubName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  clubRole: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  actionGroup: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    overflow: 'hidden',
    backgroundColor: neutralColors.surface,
  },
  actionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  actionLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
  },
})
