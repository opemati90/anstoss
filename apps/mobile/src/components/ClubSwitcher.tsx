import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useClubColors } from '../context/ClubThemeContext'
import { BottomSheet } from './ui/BottomSheet'
import { Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_LG,
  RADIUS_MD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
} from '../theme/tokens'

interface ClubSwitcherProps {
  visible: boolean
  onClose: () => void
}

export function ClubSwitcher({ visible, onClose }: ClubSwitcherProps) {
  const { t } = useTranslation()
  const { memberships, activeClub, setActiveClub } = useAuth()
  const c = useClubColors()
  const currentMembership = activeClub ?? memberships[0] ?? null
  const otherMemberships = memberships.filter(
    (membership) => membership.club.id !== currentMembership?.club.id,
  )
  const canManageClub =
    currentMembership?.role === 'OWNER' || currentMembership?.role === 'ADMIN'

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

  // Rendered inside the shared BottomSheet so it sits flush against the device
  // bottom (no dimmed gap under the sheet) and matches every other sheet in the
  // app — the bespoke Modal this replaced left a visible bottom-inset gap.
  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <ScrollView
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
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
            { borderColor: c.primary, backgroundColor: c.primary50 },
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
            <Text variant="caption1" weight="medium" style={{ color: c.primary }}>
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
    </BottomSheet>
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
  sheetContent: {
    paddingHorizontal: SPACING_LG,
    paddingTop: SPACING_SM,
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
