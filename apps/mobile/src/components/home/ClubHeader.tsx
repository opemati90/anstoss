import { useState } from 'react'
import { Image, Pressable, StatusBar, StyleSheet, View } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth, type RoleMode } from '../../context/AuthContext'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import { ClubSwitcher } from '../ClubSwitcher'
import { BottomSheet, Icon, IconButton, ListRow, SectionGroup, Text } from '../ui'
import {
  fonts,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_XS,
  SPACING_XXS,
  space,
} from '../../theme/tokens'
import { crestInitials } from '../match/MatchCrest'
import { formatChildrenSummary, useChildrenSummary } from './childrenSummary'

/**
 * The one identity row above every club tab (redesign screen 08 header).
 *
 * Crest shield in the club colour, then one button: "Trainer · SV Spreewiese"
 * over "1. Herren ▾", which opens one sheet to switch team, role view, or
 * club; the outlined bell sits on the right. Parents act for their children,
 * so their title names the children's teams ("Leo · U15, Mia · U11"), never
 * the parent's own membership.
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

  const club = activeClub.club
  // Screen 08 header: "Trainer · SV Spreewiese" over "1. Herren ▾". Parents
  // see "SV Spreewiese · Eltern" over their children's teams.
  const overline = isParent
    ? [club.name, roleLabel].filter(Boolean).join(' · ')
    : [roleLabel, club.name].filter(Boolean).join(' · ')
  const title = isParent
    ? children.length > 0
      ? formatChildrenSummary(children)
      : club.name
    : teamName || club.name
  const canOpenSheet = canSwitch || hasMultipleClubs

  return (
    <View style={[styles.header, { backgroundColor: c.background, paddingTop: insets.top + space.xs }]}>
      {/* Status bar follows the app theme (not only the system scheme) so the
          Android bar matches this header in light and dark. */}
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={c.background}
      />
      {/* The crest is a second tap target for the club switcher; screen
          readers reach the same action through the identity button. */}
      <Pressable
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        disabled={!hasMultipleClubs}
        onPress={() => setClubSwitcherVisible(true)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <ClubCrest name={club.name} badgeUrl={club.badgeUrl} />
      </Pressable>

      <Pressable
        accessibilityRole={canOpenSheet ? 'button' : 'header'}
        accessibilityLabel={[overline, title].filter(Boolean).join(', ')}
        accessibilityHint={
          canOpenSheet
            ? t('homeHub.header.switchHint', { defaultValue: 'Switch team or role' })
            : undefined
        }
        disabled={!canOpenSheet}
        onPress={() => setContextVisible(true)}
        style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
        testID="club-header-identity"
      >
        {overline ? (
          <Text variant="caption1" weight="regular" color="secondary" numberOfLines={1} style={styles.overline}>
            {overline}
          </Text>
        ) : null}
        <View style={styles.titleRow}>
          <Text variant="headline" weight="bold" color="primary" numberOfLines={1} style={styles.shrink}>
            {title}
          </Text>
          {canOpenSheet ? <Icon name="chevron.down" size={16} color={c.textPrimary} /> : null}
        </View>
      </Pressable>

      {/* Bell keeps its target (notification settings): there is no
          notifications inbox endpoint yet, so no unread dot either. */}
      <IconButton
        variant="outlined"
        accessibilityLabel={t('notifications.title', 'Notifications')}
        onPress={() => router.push('/notification-settings' as never)}
      >
        <Icon name="bell" size={20} color={c.textPrimary} />
      </IconButton>

      <ClubSwitcher visible={clubSwitcherVisible} onClose={() => setClubSwitcherVisible(false)} />

      <BottomSheet visible={contextVisible} onClose={() => setContextVisible(false)} heightPct="auto">
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text variant="title3" weight="bold" color="primary" accessibilityRole="header">
              {t('homeHub.header.sheetTitle', { defaultValue: 'Team and role' })}
            </Text>
            {canSwitchRole ? (
              <Text variant="footnote" color="secondary">
                {t('more.roleModeHint', {
                  defaultValue: 'Switch views without changing any club permissions.',
                })}
              </Text>
            ) : null}
          </View>
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
                    right={<RadioDot on={selected} />}
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
            <SectionGroup header={t('more.roleModeTitle', { defaultValue: 'Use Anstoss as' })}>
              {availableRoleModes.map((option) => (
                <ListRow
                  key={option}
                  title={roleModeLabel(option, t)}
                  selected={mode === option}
                  right={<RadioDot on={mode === option} />}
                  onPress={() => {
                    setActiveRoleMode?.(option)
                    setContextVisible(false)
                  }}
                />
              ))}
            </SectionGroup>
          ) : null}
          {hasMultipleClubs ? (
            <SectionGroup>
              <ListRow
                title={t('clubSwitcher.title')}
                left={<Icon name="arrow.left.arrow.right" size={18} color={c.textPrimary} />}
                showChevron
                onPress={() => {
                  setContextVisible(false)
                  setClubSwitcherVisible(true)
                }}
              />
            </SectionGroup>
          ) : null}
        </View>
      </BottomSheet>
    </View>
  )
}

/** Radio indicator of the role sheet (screen 31): ink ring when chosen. */
function RadioDot({ on }: { on: boolean }) {
  const c = useClubColors()
  return (
    <View
      style={[
        styles.radio,
        on ? { borderWidth: 7, borderColor: c.ink } : { borderWidth: 2, borderColor: c.borderStrong },
      ]}
    />
  )
}

/**
 * The crest: the club badge when there is one, otherwise the redesign's
 * shield in the club colour with a lime inner line and the initials.
 */
export function ClubCrest({ name, badgeUrl }: { name: string; badgeUrl?: string | null }) {
  const c = useClubColors()
  if (badgeUrl) {
    return <Image source={{ uri: badgeUrl }} style={styles.crestImage} resizeMode="contain" />
  }
  return (
    <Svg width={CREST_W} height={CREST_H} viewBox="0 0 40 44">
      <Path
        d="M20 1.5 37.5 7.5v12.5c0 10.5-7.5 18.5-17.5 22.5C10 38.5 2.5 30.5 2.5 20V7.5z"
        fill={c.heroBg}
      />
      <Path
        d="M20 5 34 9.8v10.2c0 8.6-6 15.2-14 18.6C12 35.2 6 28.6 6 20V9.8z"
        fill="none"
        stroke={c.accent}
        strokeOpacity={0.55}
        strokeWidth={1}
      />
      <SvgText
        x={20}
        y={25.5}
        textAnchor="middle"
        fontFamily={fonts.display}
        fontWeight="700"
        fontSize={12.5}
        fill={c.onHeroBg}
      >
        {crestInitials(name)}
      </SvgText>
    </Svg>
  )
}

export function roleModeLabel(mode: string | undefined | null, t: TFunction) {
  if (mode === 'ADMIN') return t('roles.ADMIN', { defaultValue: 'Club administrator' })
  if (mode === 'COACH') return t('roles.COACH', { defaultValue: 'Coach' })
  if (mode === 'PLAYER') return t('roles.PLAYER', { defaultValue: 'Player' })
  if (mode === 'PARENT') return t('roles.PARENT', { defaultValue: 'Parent' })
  return t('roles.FREE_AGENT', { defaultValue: 'Free agent' })
}

const CREST_W = 36
const CREST_H = 40

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_MD,
  },
  pressed: { opacity: 0.7 },
  crestImage: { width: CREST_W, height: CREST_H },
  identity: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' },
  overline: { letterSpacing: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING_XS },
  shrink: { flexShrink: 1 },
  sheet: { gap: SPACING_LG },
  sheetHead: { gap: SPACING_XS + SPACING_XXS },
  radio: { width: 22, height: 22, borderRadius: RADIUS_FULL },
})
