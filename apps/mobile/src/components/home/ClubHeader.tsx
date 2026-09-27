import { useState } from 'react'
import { Image, Pressable, StatusBar, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth, type RoleMode } from '../../context/AuthContext'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import { ClubSwitcher } from '../ClubSwitcher'
import { BottomSheet, Icon, ListRow, SectionGroup, Text } from '../ui'
import { hairline, radius, space } from '../../theme/tokens'
import { formatChildrenSummary, useChildrenSummary } from './childrenSummary'

/**
 * The one identity row above every club tab.
 *
 * Crest (tinted with the club colour), club name, and beneath it a single
 * context pill ("1. Herren · Spieler") that switches team and role in one
 * sheet; the bell sits on the right. This replaces three stacked identity
 * rows (club header, greeting, avatar bar) that pushed the first decision
 * below the fold.
 */
export function ClubHeader({ resolvedRoleMode }: { resolvedRoleMode: RoleMode | null }) {
  const c = useClubColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const isDark = useIsDark()
  const {
    activeClub,
    activeTeamAccess,
    activeRoleMode,
    availableRoleModes: availableRoleModesFromAuth,
    setActiveRoleMode,
    teamsForActiveClub: teamsFromAuth,
    setActiveTeam,
    memberships,
  } = useAuth()
  const children = useChildrenSummary()
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)
  const [contextVisible, setContextVisible] = useState(false)

  if (!activeClub) return null

  const availableRoleModes = availableRoleModesFromAuth ?? []
  const teams = teamsFromAuth ?? []
  const hasMultipleClubs = (memberships?.length ?? 0) > 1
  const mode = activeRoleMode ?? resolvedRoleMode ?? availableRoleModes[0] ?? null
  const isParent = mode === 'PARENT'
  const canSwitchRole = availableRoleModes.length > 1
  const canSwitchTeam = !isParent && teams.length > 1
  const canSwitch = canSwitchRole || canSwitchTeam

  const teamName = activeTeamAccess?.team?.displayName || activeTeamAccess?.team?.name || null
  const roleLabel = mode ? roleModeLabel(mode, t) : null
  // Parents act for their children, so the pill names the children's teams
  // ("Leo · U15, Mia · U11"), never the parent's own membership.
  const context = isParent
    ? children.length > 0
      ? formatChildrenSummary(children)
      : roleLabel
    : [teamName, roleLabel].filter(Boolean).join(' · ')

  const club = activeClub.club
  const initials = club.name
    .split(/\s+/)
    .filter((part) => /^[A-Za-zÀ-ÿ0-9]/.test(part))
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <View style={[styles.header, { backgroundColor: c.background, paddingTop: insets.top + space.xs }]}>
      {/* Status bar follows the app theme (not only the system scheme) so the
          Android bar matches this header in light and dark. */}
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={c.background}
      />
      {/* The crest is a second tap target for the same action as the club
          name; screen readers get the name alone, so crest + name read as
          one button instead of the club name twice. */}
      <Pressable
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        disabled={!hasMultipleClubs}
        onPress={() => setClubSwitcherVisible(true)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={[styles.crest, { backgroundColor: c.primary50, borderColor: c.primary }]}>
          {club.badgeUrl ? (
            <Image source={{ uri: club.badgeUrl }} style={styles.crestImage} />
          ) : (
            <View style={[styles.crestFill, { backgroundColor: c.primary }]}>
              <Text variant="subheadline" weight="bold" style={{ color: c.onPrimary }}>
                {initials || club.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      <View style={styles.identity}>
        <Pressable
          accessibilityRole={hasMultipleClubs ? 'button' : 'header'}
          accessibilityLabel={club.name}
          accessibilityHint={hasMultipleClubs ? t('clubSwitcher.title') : undefined}
          disabled={!hasMultipleClubs}
          onPress={() => setClubSwitcherVisible(true)}
          style={({ pressed }) => [styles.nameRow, pressed && styles.pressed]}
        >
          <Text variant="headline" weight="bold" color="primary" numberOfLines={2} style={styles.shrink}>
            {club.name}
          </Text>
          {hasMultipleClubs ? (
            <Icon name="chevron.up.chevron.down" size={13} color="secondary" />
          ) : null}
        </Pressable>
        {context ? (
          <Pressable
            accessibilityRole={canSwitch ? 'button' : 'text'}
            accessibilityLabel={context}
            accessibilityHint={
              canSwitch
                ? t('homeHub.header.switchHint', { defaultValue: 'Switch team or role' })
                : undefined
            }
            disabled={!canSwitch}
            onPress={() => setContextVisible(true)}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [
              styles.pill,
              canSwitch
                ? { borderColor: c.borderControl, borderWidth: hairline }
                : styles.pillStatic,
              pressed && styles.pressed,
            ]}
          >
            <Text variant="footnote" weight="medium" color="secondary" numberOfLines={2} style={styles.shrink}>
              {context}
            </Text>
            {canSwitch ? <Icon name="chevron.down" size={12} color="secondary" /> : null}
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('notifications.title', 'Notifications')}
        onPress={() => router.push('/notification-settings' as never)}
        style={({ pressed }) => [
          styles.bell,
          { backgroundColor: c.surfaceSunken },
          pressed && styles.pressed,
        ]}
      >
        <Icon name="bell" size="md" color="primary" />
      </Pressable>

      <ClubSwitcher visible={clubSwitcherVisible} onClose={() => setClubSwitcherVisible(false)} />

      <BottomSheet visible={contextVisible} onClose={() => setContextVisible(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('homeHub.header.sheetTitle', { defaultValue: 'Team and role' })}
          </Text>
          {canSwitchTeam ? (
            <SectionGroup header={t('homeHub.header.team', { defaultValue: 'Team' })}>
              {teams.map((access) => {
                const selected = access.team.id === activeTeamAccess?.team?.id
                return (
                  <ListRow
                    key={access.team.id}
                    title={access.team.displayName || access.team.name}
                    subtitle={access.team.ageGroup ?? undefined}
                    selected={selected}
                    right={
                      selected ? <Icon name="checkmark.circle.fill" size="md" color="tint" /> : undefined
                    }
                    onPress={() => {
                      setActiveTeam?.(access.team.id)
                      setContextVisible(false)
                    }}
                  />
                )
              })}
            </SectionGroup>
          ) : null}
          {canSwitchRole ? (
            <SectionGroup
              header={t('more.roleModeTitle', { defaultValue: 'Use Anstoss as' })}
              footer={t('more.roleModeHint', {
                defaultValue: 'Switch views without changing any club permissions.',
              })}
            >
              {availableRoleModes.map((option) => (
                <ListRow
                  key={option}
                  title={roleModeLabel(option, t)}
                  selected={mode === option}
                  right={
                    mode === option ? (
                      <Icon name="checkmark.circle.fill" size="md" color="tint" />
                    ) : undefined
                  }
                  onPress={() => {
                    setActiveRoleMode?.(option)
                    setContextVisible(false)
                  }}
                />
              ))}
            </SectionGroup>
          ) : null}
        </View>
      </BottomSheet>
    </View>
  )
}

export function roleModeLabel(mode: string | undefined | null, t: TFunction) {
  if (mode === 'ADMIN') return t('roles.ADMIN', { defaultValue: 'Club administrator' })
  if (mode === 'COACH') return t('roles.COACH', { defaultValue: 'Coach' })
  if (mode === 'PLAYER') return t('roles.PLAYER', { defaultValue: 'Player' })
  if (mode === 'PARENT') return t('roles.PARENT', { defaultValue: 'Parent' })
  return t('roles.FREE_AGENT', { defaultValue: 'Free agent' })
}

const CREST = 44

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm + 4,
    paddingHorizontal: space.md,
    paddingBottom: space.sm + 4,
  },
  pressed: { opacity: 0.7 },
  crest: {
    width: CREST,
    height: CREST,
    borderRadius: radius.md + 2,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  crestImage: { width: CREST - 10, height: CREST - 10, resizeMode: 'contain' },
  crestFill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1, minWidth: 0, minHeight: CREST, justifyContent: 'center', gap: space.xs },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  shrink: { flexShrink: 1 },
  pill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderCurve: 'continuous',
  },
  pillStatic: { paddingHorizontal: 0, minHeight: 0, paddingVertical: 0 },
  bell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  sheet: { gap: space.sm },
})
