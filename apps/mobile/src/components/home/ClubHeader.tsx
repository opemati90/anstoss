import { useState } from 'react'
import { Image, Pressable, StatusBar, StyleSheet, View } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth, type RoleMode } from '../../context/AuthContext'
import { useViewAs } from '../../features/acting/store'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import { useInboxUnreadCount } from '../../hooks/useNotificationInbox'
import { ClubSwitcher } from '../ClubSwitcher'
import { BottomSheet, Icon, IconButton, ListRow, SectionGroup, Text } from '../ui'
import {
  fonts,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
  space,
} from '../../theme/tokens'
import { crestInitials } from '../match/MatchCrest'
import { formatChildrenSummary, useChildrenSummary } from './childrenSummary'
import { useHeldHats } from './useHeldHats'

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
  const { unreadCount } = useInboxUnreadCount()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const isDark = useIsDark()
  const {
    user,
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
  const { hats, combined } = useHeldHats()
  const [clubSwitcherVisible, setClubSwitcherVisible] = useState(false)
  const [contextVisible, setContextVisible] = useState(false)
  // Vorschau und Vertretung (board 31): "Vertretung · SV Spreewiese" while standing in.
  const { acting: actingSession, preview: previewSession } = useViewAs()

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
  const roleLabel =
    actingSession && !previewSession
      ? t('acting.actingLabel')
      : mode
        ? roleModeLabel(mode, t)
        : null

  const club = activeClub.club
  // Screen 08 header: "Trainer · SV Spreewiese" over "1. Herren ▾". Parents
  // see "SV Spreewiese · Eltern" over their children's teams.
  // Players (screen 22) are greeted: "SV Spreewiese · 1. Herren" over
  // "Hi Kofi".
  const isPlayer = mode === 'PLAYER'
  const nameParts = user?.name?.trim().split(/\s+/) ?? []
  const firstName = nameParts[0] ?? ''
  const greetPlayer = isPlayer && firstName.length > 0
  const overline = isParent
    ? [club.name, roleLabel].filter(Boolean).join(' · ')
    : greetPlayer
      ? [club.name, teamName].filter(Boolean).join(' · ')
      : [roleLabel, club.name].filter(Boolean).join(' · ')
  // Board 25: parents are greeted as the family ("Hallo Familie Weber").
  const familyName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''
  // Board 28: several held roles — "Hi Kofi" over "Spieler · Kapitän ·
  // Trainer · Vorstand" (name first, every hat listed).
  const hatsLine = hats.map((hat) => t(`homeHub.hats.${hat}`)).join(' · ')
  const title = isParent
    ? familyName
      ? t('homeHub.header.family', { defaultValue: 'Hello {{name}} family', name: familyName })
      : children.length > 0
        ? formatChildrenSummary(children)
        : club.name
    : greetPlayer
      ? t('homeHub.header.hi', { defaultValue: 'Hi {{name}}', name: firstName })
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
        accessibilityRole="button"
        accessibilityLabel={t('clubSwitcher.title')}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        focusable={false}
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
        {combined && firstName ? (
          <>
            <Text variant="headline" weight="bold" color="primary" numberOfLines={1} style={styles.shrink}>
              {t('homeHub.header.hi', { defaultValue: 'Hi {{name}}', name: firstName })}
            </Text>
            <Text variant="caption1" weight="regular" color="secondary" numberOfLines={1} style={styles.overline}>
              {hatsLine}
            </Text>
          </>
        ) : (
          <>
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
          </>
        )}
      </Pressable>

      {/* Bell opens the notifications inbox; the dot marks unread entries. */}
      <IconButton
        variant="outlined"
        accessibilityLabel={
          unreadCount > 0
            ? t('notificationsInbox.bellUnread', {
                defaultValue: 'Notifications, {{count}} new',
                count: unreadCount,
              })
            : t('notifications.title', 'Notifications')
        }
        onPress={() => router.push('/notifications' as never)}
        testID="club-header-bell"
      >
        <Icon name="bell" size={20} color={c.textPrimary} />
        {unreadCount > 0 ? (
          <View
            testID="club-header-bell-dot"
            style={[styles.bellDot, { backgroundColor: c.alertDot, borderColor: c.surface }]}
          />
        ) : null}
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
  // 8pt dot ringed in the button surface, top-right of the bell glyph.
  bellDot: {
    position: 'absolute',
    top: SPACING_SM + 2,
    right: SPACING_SM + 3,
    width: SPACING_SM + 2,
    height: SPACING_SM + 2,
    borderRadius: RADIUS_FULL,
    borderWidth: 2,
  },
})
