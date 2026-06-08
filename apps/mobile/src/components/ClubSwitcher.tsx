import { SPACING_XXS } from '../theme/spacing';
import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { useClubColors } from '../context/ClubThemeContext'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  RADIUS_MD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../theme/tokens'

const SCREEN_HEIGHT = Dimensions.get('window').height

interface ClubSwitcherProps {
  visible: boolean
  onClose: () => void
}

export function ClubSwitcher({ visible, onClose }: ClubSwitcherProps) {
  const { t } = useTranslation()
  const { memberships, activeClub, setActiveClub } = useAuth()
  const c = useClubColors()
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
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

    if (reduceMotion) {
      translateY.setValue(0)
      return
    }

    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start()
  }, [reduceMotion, translateY, visible])

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
      // Plain transparent Modal (matching the shared BottomSheet) covers the
      // full screen INCLUDING the bottom safe-area, so the flex-end sheet sits
      // flush against the device bottom. presentationStyle="overFullScreen"
      // (previously here) insets the content from the bottom on iOS, which left
      // a visible dimmed gap below the sheet. The sheet's own paddingBottom
      // (insets.bottom + SPACING_LG) provides the home-indicator clearance.
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: c.surfaceOverlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close club switcher"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              // Pad the sheet container itself (not the ScrollView content) so
              // the WHITE sheet background extends below the last row by the
              // home-indicator inset. Previously this padding lived on the
              // ScrollView contentContainer, which made the *content* taller
              // but left the sheet's white background ending at the last row
              // — exposing the dimmed tab bar through the backdrop in the
              // visual gap. Cross-checked with codex.
              paddingBottom: insets.bottom + SPACING_LG,
              transform: [{ translateY }],
            },
          ]}
        >
          <Pressable accessible={false}>
            <ScrollView
              style={{ maxHeight: SCREEN_HEIGHT * 0.85 }}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />
              <Text variant="title3" color="primary" style={styles.title}>
                {t('clubSwitcher.title')}
              </Text>
              <Text variant="footnote" color="secondary" style={styles.subtitle}>
                {t('clubSwitcher.subtitle', { count: memberships.length })}
              </Text>

              <Text
                variant="caption1"
                color="tertiary"
                tracking="wide"
                style={styles.sectionLabel}
              >
                {t('clubSwitcher.currentSection').toUpperCase()}
              </Text>
              <View
                style={[
                  styles.summaryCard,
                  {
                    borderColor: c.primary,
                    backgroundColor: c.primary50,
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
                      variant="headline"
                      weight="bold"
                      numberOfLines={1}
                      style={{ color: c.primary }}
                    >
                      {currentMembership.club.name}
                    </Text>
                    <Text variant="footnote" color="secondary">
                      {t(`roles.${currentMembership.role}`)}
                    </Text>
                  </View>
                </View>
                <View style={styles.activeIndicator}>
                  <Icon name="checkmark.circle.fill" size="md" color={c.primary} />
                  <Text
                    variant="caption1"
                    weight="medium"
                    style={{ color: c.primary }}
                  >
                    {t('clubSwitcher.current')}
                  </Text>
                </View>
              </View>

              {otherMemberships.length > 0 ? (
                <>
                  <Text
                    variant="caption1"
                    color="tertiary"
                    tracking="wide"
                    style={styles.sectionLabel}
                  >
                    {t('clubSwitcher.otherSection').toUpperCase()}
                  </Text>
                  <View style={styles.listSection}>
                    {otherMemberships.map((membership) => (
                      <Pressable
                        key={membership.club.id}
                        style={[
                          styles.clubRow,
                          { borderColor: c.borderDefault, backgroundColor: c.surface },
                        ]}
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
                            <Text
                              variant="headline"
                              weight="bold"
                              color="primary"
                              numberOfLines={1}
                            >
                              {membership.club.name}
                            </Text>
                            <Text variant="footnote" color="secondary">
                              {t(`roles.${membership.role}`)}
                            </Text>
                          </View>
                        </View>
                        <Icon name="chevron.right" size="sm" color={c.textTertiary} />
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <View
                style={[
                  styles.actionGroup,
                  { borderColor: c.borderDefault, backgroundColor: c.surface },
                ]}
              >
                <Pressable
                  style={[styles.actionRow, { borderBottomColor: c.borderSubtle }]}
                  testID="club-switcher-primary-action"
                  onPress={() =>
                    handleNavigate(canManageClub ? '/admin-dashboard' : '/(tabs)/more')
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    canManageClub ? t('adminDashboard.title') : t('more.title')
                  }
                >
                  <Icon
                    name={canManageClub ? 'gearshape' : 'ellipsis'}
                    size="md"
                    color={c.textPrimary}
                  />
                  <Text
                    variant="subheadline"
                    color="primary"
                    weight="medium"
                    style={styles.actionLabel}
                  >
                    {canManageClub ? t('adminDashboard.title') : t('more.title')}
                  </Text>
                  <Icon name="chevron.right" size="sm" color={c.textTertiary} />
                </Pressable>

                <Pressable
                  style={[styles.actionRow, styles.actionRowLast]}
                  testID="club-switcher-notifications-action"
                  onPress={() => handleNavigate('/notification-settings')}
                  accessibilityRole="button"
                  accessibilityLabel={t('notificationSettings.title')}
                >
                  <Icon name="bell" size="md" color={c.textPrimary} />
                  <Text
                    variant="subheadline"
                    color="primary"
                    weight="medium"
                    style={styles.actionLabel}
                  >
                    {t('notificationSettings.title')}
                  </Text>
                  <Icon name="chevron.right" size="sm" color={c.textTertiary} />
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
  if (badgeUrl) {
    return <Image source={{ uri: badgeUrl }} style={styles.badge} />
  }

  return (
    <View style={[styles.badgePlaceholder, { backgroundColor: primaryColor }]}>
      <Text variant="headline" weight="bold" color="inverse">
        {clubName.charAt(0).toUpperCase()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS_LG,
    borderTopRightRadius: RADIUS_LG,
    paddingHorizontal: SPACING_LG,
    // No outer paddingBottom and no maxHeight cap: the sheet extends to the
    // device bottom edge, the rounded top corners are still visible, and
    // internal bottom spacing is provided by the ScrollView contentContainer
    // (insets.bottom + SPACING_LG, computed at render time).
  },
  sheetContent: {
    // paddingBottom is added dynamically in the JSX so the sheet content
    // clears the home indicator on notched + non-notched devices alike.
  },
  handle: {
    width: 36,
    height: SPACING_XS,
    borderRadius: RADIUS_FULL,
    alignSelf: 'center',
    marginTop: SPACING_SM,
    marginBottom: SPACING_LG,
  },
  title: {
    marginBottom: SPACING_XS,
  },
  subtitle: {
    marginBottom: SPACING_LG,
  },
  sectionLabel: {
    marginBottom: SPACING_SM,
  },
  summaryCard: {
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
    padding: SPACING_LG,
    gap: SPACING_SM,
    marginBottom: SPACING_LG,
  },
  listSection: {
    marginBottom: SPACING_LG,
    gap: SPACING_SM,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
  },
  clubInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_MD,
  },
  badgePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubText: {
    flex: 1,
    gap: SPACING_XXS,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
  },
  actionGroup: {
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  actionRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_LG,
    borderBottomWidth: hairline,
  },
  actionRowLast: {
    borderBottomWidth: 0,
  },
  actionLabel: {
    flex: 1,
  },
})
