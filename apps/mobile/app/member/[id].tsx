import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  MEMBER_ROLE_KEYS,
  teamMemberProfileSchema,
  type MemberRoleKey,
  type RosterOpsSnapshot,
  type TeamMemberProfile,
} from '@anstoss/shared'
import { api } from '../../src/api/client'
import { EmptyState } from '../../src/components/EmptyState'
import { DuesTag, type DuesTagTone } from '../../src/components/club/DuesTag'
import { PlayerEditSheet } from '../../src/components/squad/PlayerEditSheet'
import {
  buildKader,
  canMessageMember,
  jerseyHolders,
  type KaderMember,
} from '../../src/components/squad/squadModel'
import { useIsTeamCoach } from '../../src/components/squad/useIsTeamCoach'
import { attendanceFor, useTrainingAttendance } from '../../src/components/squad/useTrainingAttendance'
import {
  Avatar,
  Button,
  FilterChipRow,
  Icon,
  IconButton,
  Screen,
  Text,
} from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../../src/i18n'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_MD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXL,
} from '../../src/theme/tokens'
import { goBackOrReplace } from '../../src/utils/navigation'

/** Design 17: "Training · letzte 8". */
const PROFILE_TRAININGS = 8
// Design 17 metrics.
const PAGE_GAP = 22
const SECTION_GAP = 10
const NUMBER_SIZE = 96
const NAME_SIZE = 28
const ACTION_HEIGHT = 48
const STAT_SIZE = 32
const SQUARE_HEIGHT = 28
const SQUARE_RADIUS = 6
const ICON_WELL = 40

const DUES_TONE: Record<NonNullable<TeamMemberProfile['duesState']>, DuesTagTone> = {
  CURRENT: 'paid',
  OPEN: 'neutral',
  OVERDUE: 'overdue',
}

/**
 * Spielerprofil (board 17): back + edit, the shirt number in large Barlow
 * beside the name and "Stürmer · Kapitän · seit 2023", Nachricht (ink) and
 * Rollen (outline), the role toggles (Vorstand edits), season stats, the
 * last eight trainings, then Beiträge and Spielerpass.
 *
 * Team facts come from roster-ops; the rest from the profile bundle
 * (`GET …/members/:userId/profile`). Without that endpoint the blocks show
 * empty values and attendance falls back to the team's past trainings.
 */
export default function MemberProfileScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const params = useLocalSearchParams<{ id?: string }>()
  const memberId = typeof params.id === 'string' ? params.id : ''
  const { user, activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const isCoach = useIsTeamCoach()
  const isBoard = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const hasBillingAccess = Boolean(activeClub?.permissions?.BILLING) || isBoard

  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
  const [profile, setProfile] = useState<TeamMemberProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState(false)
  const { attendance: teamAttendance, reload: reloadAttendance } = useTrainingAttendance(
    clubId,
    activeTeamId,
    PROFILE_TRAININGS,
  )

  const load = useCallback(async () => {
    if (!clubId || !activeTeamId || !memberId) {
      setLoading(false)
      return
    }
    const base = `/clubs/${clubId}/teams/${activeTeamId}`
    const [roster, bundle] = await Promise.all([
      api<RosterOpsSnapshot>(`${base}/roster-ops`).catch(() => null),
      // Contract for backend: absent on older servers → empty values.
      api<unknown>(`${base}/members/${memberId}/profile`).catch(() => null),
    ])
    setSnapshot(roster && Array.isArray(roster.squad) ? roster : null)
    const parsed = teamMemberProfileSchema.safeParse(bundle)
    setProfile(parsed.success ? parsed.data : null)
    setLoading(false)
  }, [clubId, activeTeamId, memberId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const model = useMemo(
    () => (snapshot ? buildKader(snapshot, { userId: user?.id ?? null }) : null),
    [snapshot, user?.id],
  )
  const member: KaderMember | null = useMemo(() => {
    if (!model) return null
    return (
      [...model.players, ...model.coaches, ...model.inactive, ...model.trials].find(
        (entry) => entry.userId === memberId,
      ) ?? null
    )
  }, [model, memberId])

  const roles: MemberRoleKey[] = profile?.roles ?? (member ? [member.isCoach ? 'COACH' : 'PLAYER'] : [])
  const attendanceItems =
    profile?.attendance?.items ?? attendanceFor(teamAttendance, memberId, PROFILE_TRAININGS) ?? []
  const attended = attendanceItems.filter(Boolean).length
  const teamName = activeTeamAccess?.team?.displayName || snapshot?.team.displayName || ''
  const sinceIso = profile?.memberSince ?? member?.createdAt ?? null
  const isSelf = memberId === user?.id

  const onRefresh = async () => {
    setRefreshing(true)
    reloadAttendance()
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const toggleRole = async (role: MemberRoleKey) => {
    if (!isBoard || !clubId || !activeTeamId) return
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]
    const previous = profile
    setProfile((current) => (current ? { ...current, roles: next } : current))
    try {
      const saved = await api<unknown>(`/clubs/${clubId}/teams/${activeTeamId}/members/${memberId}/roles`, {
        method: 'PUT',
        body: { roles: next },
      })
      const parsed = teamMemberProfileSchema.safeParse(saved)
      if (parsed.success) setProfile(parsed.data)
    } catch {
      setProfile(previous)
      Alert.alert(t('common.error'), t('kader.profile.rolesError'))
    }
  }

  const openMessage = () => {
    if (!member || !canMessageMember(member)) return
    router.push({ pathname: '/dm-chat', params: { userId: member.userId, userName: member.name } })
  }

  const canEdit = isCoach && Boolean(member) && !member?.isCoach
  const header = (
    <View style={styles.headerRow}>
      <IconButton
        variant="outlined"
        accessibilityLabel={t('common.back')}
        onPress={() => goBackOrReplace(router, '/(tabs)/squad')}
        testID="member-back"
      >
        <Icon name="chevron.left" size={20} color="primary" />
      </IconButton>
      {canEdit ? (
        <IconButton
          variant="outlined"
          accessibilityLabel={t('kader.profile.edit')}
          onPress={() => setEditing(true)}
          testID="member-edit"
        >
          <Icon name="pencil" size={18} color="primary" />
        </IconButton>
      ) : null}
    </View>
  )

  if (!loading && !member) {
    return (
      <Screen padded={false} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          {header}
          <EmptyState icon="person.fill" title={t('kader.profile.notFound')} description="" />
        </View>
      </Screen>
    )
  }

  const metaLine = [
    member?.position,
    roles.includes('CAPTAIN') ? t('kader.profile.role.CAPTAIN') : null,
    member?.isCoach ? t('kader.profile.role.COACH') : null,
    sinceIso ? t('kader.profile.since', { year: new Date(sinceIso).getFullYear() }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const stats = profile?.stats ?? null
  const statValue = (value: number | undefined) => (value == null ? '–' : String(value))
  const duesState = profile?.duesState ?? null
  const duesTarget = isSelf ? '/my-contributions' : hasBillingAccess ? '/admin-billing' : null
  const pass = profile?.playerPass ?? null

  return (
    <Screen padded={false} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {header}

        {member ? (
          <View style={styles.identity}>
            {member.jerseyNumber != null ? (
              <Text variant="dataLarge" style={[styles.number, { color: c.primary }]} maxFontSizeMultiplier={1.2}>
                {member.jerseyNumber}
              </Text>
            ) : (
              <Avatar size={72} src={member.avatarUrl} fallbackText={member.name} />
            )}
            <View style={styles.identityText}>
              <Text variant="title1" weight="bold" color="primary" accessibilityRole="header" style={styles.name}>
                {member.name}
              </Text>
              {metaLine ? (
                <Text variant="subheadline" weight="regular" color="secondary">
                  {metaLine}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label={t('kader.profile.message')}
              leftIcon={<Icon name="bubble.left" size={18} color={c.onInk} />}
              onPress={openMessage}
              disabled={!member || !canMessageMember(member)}
              fullWidth
              style={styles.actionButton}
              testID="member-message"
            />
          </View>
          <View style={styles.action}>
            <Button
              label={t('kader.profile.roles')}
              variant="bordered"
              onPress={() => (canEdit ? setEditing(true) : undefined)}
              disabled={!canEdit}
              fullWidth
              style={styles.actionButton}
              testID="member-roles"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="label" accessibilityRole="header" style={styles.flex} numberOfLines={1}>
              {t('kader.profile.rolesIn', { team: teamName })}
            </Text>
            <Text variant="caption1" color="secondary">
              {t('kader.profile.rolesHint')}
            </Text>
          </View>
          <FilterChipRow<MemberRoleKey>
            wrap
            chips={MEMBER_ROLE_KEYS.map((key) => ({
              key,
              label: t(`kader.profile.role.${key}`),
              testID: `member-role-${key}`,
            }))}
            selected={roles}
            onToggle={(key) => void toggleRole(key)}
            testID="member-roles-chips"
          />
        </View>

        <View style={[styles.statsCard, { backgroundColor: c.surface }]}>
          {(
            [
              ['appearances', stats?.appearances],
              ['goals', stats?.goals],
              ['assists', stats?.assists],
            ] as const
          ).map(([key, value]) => (
            <View
              key={key}
              style={styles.stat}
              accessible
              accessibilityLabel={`${t(`kader.profile.${key}`)}: ${statValue(value)}`}
            >
              <Text variant="dataLarge" style={[styles.statValue, { color: c.textPrimary }]}>
                {statValue(value)}
              </Text>
              <Text variant="caption1" color="secondary">
                {t(`kader.profile.${key}`)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="label" accessibilityRole="header" style={styles.flex}>
              {t('kader.profile.training', { count: PROFILE_TRAININGS })}
            </Text>
            {attendanceItems.length > 0 ? (
              <Text variant="footnote" weight="semibold" color="primary">
                {t('kader.profile.attendanceOf', { count: attended, total: attendanceItems.length })}
              </Text>
            ) : null}
          </View>
          <View
            style={styles.squares}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('kader.profile.attendanceA11y', {
              count: attended,
              total: attendanceItems.length || PROFILE_TRAININGS,
            })}
          >
            {(attendanceItems.length > 0
              ? attendanceItems
              : Array.from({ length: PROFILE_TRAININGS }, () => false)
            ).map((on, index) => (
              <View
                key={index}
                style={[styles.square, { backgroundColor: on ? c.primary : c.surfaceSunken }]}
              />
            ))}
          </View>
        </View>

        <View style={[styles.group, { backgroundColor: c.surface }]}>
          <Pressable
            accessibilityRole={duesTarget ? 'button' : undefined}
            accessibilityLabel={[
              t('kader.profile.dues'),
              duesState ? t(`kader.profile.duesState.${duesState}`) : null,
            ]
              .filter(Boolean)
              .join(', ')}
            disabled={!duesTarget}
            onPress={() => (duesTarget ? router.push(duesTarget as never) : undefined)}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: c.borderSubtle },
              styles.rowDivider,
              pressed && styles.pressed,
            ]}
            testID="member-dues"
          >
            <View style={[styles.well, { backgroundColor: c.surfaceMuted }]}>
              <Icon name="creditcard" size={18} color="primary" />
            </View>
            <Text variant="body" weight="semibold" color="primary" style={styles.flex}>
              {t('kader.profile.dues')}
            </Text>
            {duesState ? (
              <DuesTag label={t(`kader.profile.duesState.${duesState}`)} tone={DUES_TONE[duesState]} />
            ) : null}
            {duesTarget ? <Icon name="chevron.right" size={18} color="secondary" /> : null}
          </Pressable>
          <View
            style={styles.row}
            accessible
            accessibilityLabel={[
              t('kader.profile.passTitle'),
              pass?.validUntil
                ? t('kader.profile.passValid', { date: formatDate(pass.validUntil, locale) })
                : t('kader.profile.passMissing'),
            ].join(', ')}
            testID="member-pass"
          >
            <View style={[styles.well, { backgroundColor: c.surfaceMuted }]}>
              <Icon name="shield" size={18} color="primary" />
            </View>
            <View style={styles.flex}>
              <Text variant="body" weight="semibold" color="primary">
                {t('kader.profile.passTitle')}
              </Text>
              <Text variant="caption1" color="secondary">
                {pass?.validUntil
                  ? t('kader.profile.passValid', { date: formatDate(pass.validUntil, locale) })
                  : t('kader.profile.passMissing')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {clubId && activeTeamId ? (
        <PlayerEditSheet
          visible={editing}
          member={member}
          clubId={clubId}
          teamId={activeTeamId}
          onClose={() => setEditing(false)}
          onSaved={() => void load()}
          onMessage={() => setTimeout(openMessage, 250)}
          takenNumbers={jerseyHolders(model, memberId)}
        />
      ) : null}
    </Screen>
  )
}

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso),
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_XXL * 2,
    gap: PAGE_GAP,
  },
  flex: { flex: 1, minWidth: 0 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING_LG + 2 },
  number: { fontSize: NUMBER_SIZE, lineHeight: NUMBER_SIZE * 0.8 + SPACING_XS, paddingTop: SPACING_XS },
  identityText: { flex: 1, minWidth: 0, gap: SPACING_XS, paddingBottom: SPACING_XS },
  name: { fontSize: NAME_SIZE, lineHeight: NAME_SIZE * 1.1, letterSpacing: -0.7 },
  actions: { flexDirection: 'row', gap: SECTION_GAP },
  action: { flex: 1 },
  actionButton: { height: ACTION_HEIGHT },
  section: { gap: SECTION_GAP },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING_SM },
  statsCard: {
    flexDirection: 'row',
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingVertical: SPACING_LG + 2,
    paddingHorizontal: SPACING_LG,
  },
  stat: { flex: 1, gap: SPACING_XS },
  statValue: { fontSize: STAT_SIZE, lineHeight: STAT_SIZE },
  squares: { flexDirection: 'row', gap: SPACING_XS },
  square: { flex: 1, height: SQUARE_HEIGHT, borderRadius: SQUARE_RADIUS },
  group: { borderRadius: RADIUS_CARD, borderCurve: 'continuous', paddingHorizontal: SPACING_LG },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    paddingVertical: SPACING_MD,
  },
  rowDivider: { borderBottomWidth: hairline },
  well: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
})
