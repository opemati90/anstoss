import { useCallback, useMemo, useState } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { RosterOpsSnapshot, RosterOpsMemberSummary } from '@anstoss/shared'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import {
  Text,
  Avatar,
  Icon,
  FilterChipRow,
  ListRow,
  type FilterChip,
  type IconName,
} from '../../../src/components/ui'
import { EmptyState } from '../../../src/components/EmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { elevation, fonts, hairline, radius, space, TAB_BAR_CLEARANCE } from '../../../src/theme/tokens'
import { getSquadEmptyCopy } from '../../../src/lib/squadEmptyCopy'

type Bucket = 'ACTIVE' | 'TRIAL' | 'INACTIVE'
type Availability = 'YES' | 'MAYBE' | 'NO'

const BUCKETS: FilterChip<Bucket>[] = [
  { key: 'ACTIVE', label: 'squad.bucket.active' },
  { key: 'TRIAL', label: 'squad.bucket.trial' },
  { key: 'INACTIVE', label: 'squad.bucket.inactive' },
]

const BUCKET_LABELS: Record<Bucket, { de: string; en: string }> = {
  ACTIVE: { de: 'Aktiv', en: 'Active' },
  TRIAL: { de: 'Probetraining', en: 'Trial' },
  INACTIVE: { de: 'Inaktiv', en: 'Inactive' },
}

type NextEventSummary = {
  id: string
  title: string
  date: string
  byUser: Record<string, Availability>
}

type FeedEvent = { id: string; title: string; date: string; cancelledAt?: string | null }
type DetailEvent = {
  id: string
  title: string
  date: string
  rsvps?: Array<{ status: Availability; user: { id: string } }>
}

/**
 * The Team tab: one surface for the people, their health, and the
 * operations around them.
 *
 * This used to be two doors. "Squad" showed a health card and a player
 * list; anything real (trials, injuries, kit, duties) lived behind a hidden
 * "roster" workspace with its own four tabs. Same team, two screens that
 * looked different and overlapped. Now the workspace is the detail and
 * this screen is the front: health, then operations as rows with the count
 * that matters, then people with their availability for the next event.
 */
export default function SquadScreen() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId, activeTeamAccess, activeRoleMode } = useAuth()
  const c = useClubColors()
  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
  const [nextEvent, setNextEvent] = useState<NextEventSummary | null>(null)
  const [bucket, setBucket] = useState<Bucket>('ACTIVE')
  const [refreshing, setRefreshing] = useState(false)

  const resolvedRoleMode = activeRoleMode ?? (
    activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
      ? 'ADMIN'
      : activeClub?.role === 'COACH'
        ? 'COACH'
        : activeClub?.role === 'PARENT'
          ? 'PARENT'
          : 'PLAYER'
  )
  const isCoach = resolvedRoleMode === 'ADMIN' || resolvedRoleMode === 'COACH'

  const fetchSnapshot = useCallback(async () => {
    if (!activeClub || !activeTeamId) return
    try {
      const data = await api<RosterOpsSnapshot>(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/roster-ops`,
      )
      setSnapshot(data)
    } catch {
      // stale-while-revalidate
    }
  }, [activeClub, activeTeamId])

  // Availability for the next event rides on the roster. It is a second
  // request on purpose: the roster answers "who is on the team", the event
  // answers "who is coming", and either can fail without taking the other.
  const fetchNextEvent = useCallback(async () => {
    if (!activeClub || !activeTeamId) return
    try {
      const feed = await api<FeedEvent[]>(
        `/clubs/${activeClub.club.id}/events?${new URLSearchParams({
          teamId: activeTeamId,
          scope: 'upcoming',
        }).toString()}`,
      )
      const upcoming = (Array.isArray(feed) ? feed : []).find((e) => !e.cancelledAt)
      if (!upcoming) {
        setNextEvent(null)
        return
      }
      const detail = await api<DetailEvent>(`/clubs/${activeClub.club.id}/events/${upcoming.id}`)
      const byUser: Record<string, Availability> = {}
      for (const r of detail.rsvps ?? []) {
        if (r?.user?.id) byUser[r.user.id] = r.status
      }
      setNextEvent({ id: detail.id, title: detail.title, date: detail.date, byUser })
    } catch {
      // Availability is a garnish; the list stands without it.
    }
  }, [activeClub, activeTeamId])

  useFocusEffect(
    useCallback(() => {
      void fetchSnapshot()
      void fetchNextEvent()
    }, [fetchSnapshot, fetchNextEvent]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([fetchSnapshot(), fetchNextEvent()])
    } finally {
      setRefreshing(false)
    }
  }

  const members = useMemo(() => {
    if (!snapshot) return []
    if (bucket === 'ACTIVE') return snapshot.squad
    if (bucket === 'TRIAL') return snapshot.operations.trials
    return snapshot.operations.inactive
  }, [snapshot, bucket])

  const chipOptions = useMemo(
    () =>
      BUCKETS.map((chip) => {
        const list =
          chip.key === 'ACTIVE'
            ? snapshot?.squad
            : chip.key === 'TRIAL'
              ? snapshot?.operations.trials
              : snapshot?.operations.inactive
        const count = list?.length ?? 0
        const label = t(chip.label, { defaultValue: BUCKET_LABELS[chip.key].en })
        return {
          ...chip,
          label: count > 0 ? `${label} · ${count}` : label,
        }
      }),
    [snapshot, t],
  )
  const emptyCopy = getSquadEmptyCopy(bucket, isCoach)

  const teamName = activeTeamAccess?.team?.displayName ?? snapshot?.team.displayName

  // No active team — surface a clear empty state so the tab doesn't look
  // like it's broken/loading. Two distinct cases: no club at all, or a club
  // with no team selected (e.g. free-agent membership).
  if (!activeClub || !activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.headerWrap}>
          <TabScreenHeader title={t('tabs.team', { defaultValue: 'Team' })} />
        </View>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="person.2.fill"
            title={
              !activeClub
                ? t('squad.noClubTitle', { defaultValue: 'Join a club to see a squad' })
                : t('squad.noTeamTitle', { defaultValue: 'No team selected' })
            }
            description={
              !activeClub
                ? t('squad.noClubBody', {
                    defaultValue: 'Once you join or create a club, your team appears here.',
                  })
                : t('squad.noTeamBody', {
                    defaultValue:
                      "Pick a team from the club switcher to view its players. Free agents see this until they're added to a team.",
                  })
            }
          />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <TabScreenHeader
          title={t('tabs.team', { defaultValue: 'Team' })}
          subtitle={teamName ?? activeClub?.club?.name ?? undefined}
          actionIcon={isCoach ? 'person.badge.plus' : undefined}
          actionAccessibilityLabel={
            isCoach ? t('invite.screenTitle', { defaultValue: 'Invite players' }) : undefined
          }
          onActionPress={isCoach ? () => router.push('/invite') : undefined}
        />

        {isCoach && snapshot ? <SquadHealth snapshot={snapshot} /> : null}

        <OperationsSection
          snapshot={snapshot}
          isCoach={isCoach}
          userId={user?.id ?? null}
        />

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
              {t('squad.people.title', { defaultValue: 'People' }).toUpperCase()}
            </Text>
            {nextEvent ? (
              <Text variant="caption2" color="tertiary" numberOfLines={1} style={styles.sectionAside}>
                {t('squad.people.availabilityFor', {
                  defaultValue: 'Availability for {{title}}',
                  title: nextEvent.title,
                })}
              </Text>
            ) : null}
          </View>

          <FilterChipRow<Bucket>
            chips={chipOptions}
            selected={bucket}
            onToggle={setBucket}
            singleSelect
          />

          {members.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="person.2.fill"
                title={t(emptyCopy.titleKey, { defaultValue: emptyCopy.title })}
                description={t(emptyCopy.bodyKey, { defaultValue: emptyCopy.body })}
              />
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              {members.map((m: RosterOpsMemberSummary, index) => (
                <PlayerRow
                  key={m.userId}
                  member={m}
                  isSelf={m.userId === user?.id}
                  availability={nextEvent ? (nextEvent.byUser[m.userId] ?? null) : undefined}
                  showDivider={index > 0}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

type OpRow = {
  key: string
  icon: IconName
  title: string
  subtitle?: string
  count: number
  onPress: () => void
}

/**
 * Operations as rows, each carrying the number that matters. This replaces
 * the "Manage roster" button and the health chips: a coach reaches any
 * operations screen in one tap, and sees whether it needs them before
 * tapping. Players get the two rows that are about them.
 */
function OperationsSection({
  snapshot,
  isCoach,
  userId,
}: {
  snapshot: RosterOpsSnapshot | null
  isCoach: boolean
  userId: string | null
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  const rows = useMemo<OpRow[]>(() => {
    const ops = snapshot?.operations
    const attention =
      (ops?.trials.length ?? 0) + (ops?.newPlayers.length ?? 0) + (ops?.pendingCoaches.length ?? 0)
    const injured = snapshot?.medic.active.length ?? 0
    const kitPending = snapshot?.kit.pending.length ?? 0
    const myDuties = userId
      ? (snapshot?.kit.pending ?? []).filter((d) => d.assignedUserId === userId).length
      : 0

    if (!isCoach) {
      return [
        {
          key: 'my-duties',
          icon: 'list.clipboard',
          title: t('squad.ops.myDuties', { defaultValue: 'My duties' }),
          subtitle: t('squad.ops.myDutiesHint', { defaultValue: 'Kit, wash, and match-day jobs' }),
          count: myDuties,
          onPress: () => router.push('/duty-roster' as never),
        },
        {
          key: 'carpool',
          icon: 'car',
          title: t('squad.ops.carpool', { defaultValue: 'Carpool' }),
          subtitle: t('squad.ops.carpoolHint', { defaultValue: 'Rides to the next away game' }),
          count: 0,
          onPress: () => router.push('/carpool' as never),
        },
      ]
    }

    return [
      {
        key: 'roster',
        icon: 'person.2',
        title: t('squad.ops.roster', { defaultValue: 'Squad management' }),
        subtitle: t('squad.ops.rosterHint', { defaultValue: 'Positions, numbers, activation' }),
        count: 0,
        onPress: () => router.push({ pathname: '/(tabs)/roster', params: { tab: 'squad' } }),
      },
      {
        key: 'requests',
        icon: 'person.badge.plus',
        title: t('squad.ops.requests', { defaultValue: 'Trials and requests' }),
        subtitle: t('squad.ops.requestsHint', { defaultValue: 'New players, trials, pending coaches' }),
        count: attention,
        onPress: () => router.push({ pathname: '/(tabs)/roster', params: { tab: 'operations' } }),
      },
      {
        key: 'medic',
        icon: 'heart',
        title: t('squad.ops.medic', { defaultValue: 'Medic' }),
        subtitle: t('squad.ops.medicHint', { defaultValue: 'Injuries and return dates' }),
        count: injured,
        onPress: () => router.push({ pathname: '/(tabs)/roster', params: { tab: 'medic' } }),
      },
      {
        key: 'kit',
        icon: 'list.clipboard',
        title: t('squad.ops.kit', { defaultValue: 'Kit and duties' }),
        subtitle: t('squad.ops.kitHint', { defaultValue: 'Who washes, who brings what' }),
        count: kitPending,
        onPress: () => router.push({ pathname: '/(tabs)/roster', params: { tab: 'kit' } }),
      },
      {
        key: 'carpool',
        icon: 'car',
        title: t('squad.ops.carpool', { defaultValue: 'Carpool' }),
        subtitle: t('squad.ops.carpoolHint', { defaultValue: 'Rides to the next away game' }),
        count: 0,
        onPress: () => router.push('/carpool' as never),
      },
    ]
  }, [snapshot, isCoach, userId, t])

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
          {t('squad.ops.title', { defaultValue: 'Operations' }).toUpperCase()}
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        {rows.map((row, index) => (
          <ListRow
            key={row.key}
            title={row.title}
            subtitle={row.subtitle}
            accessibilityLabel={row.count > 0 ? `${row.title}, ${row.count}` : row.title}
            onPress={row.onPress}
            left={
              <View style={[styles.opIcon, { backgroundColor: c.surfaceSunken }]}>
                <Icon name={row.icon} size={18} color="secondary" />
              </View>
            }
            right={
              row.count > 0 ? (
                <View style={[styles.opBadge, { backgroundColor: c.primary }]}>
                  <Text style={[styles.opBadgeText, { color: c.textInverse }]} tabular>
                    {row.count}
                  </Text>
                </View>
              ) : undefined
            }
            style={index > 0 ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : undefined}
          />
        ))}
      </View>
    </View>
  )
}

function SquadHealth({ snapshot }: { snapshot: RosterOpsSnapshot }) {
  const { t } = useTranslation()
  const c = useClubColors()

  const squadCount = snapshot.squad.length
  const target = snapshot.team.squadTarget || 0
  const hasTarget = target > 0
  const pct = hasTarget ? Math.min(1, squadCount / target) : 0
  const full = hasTarget && squadCount >= target

  return (
    <View
      style={[
        styles.healthCard,
        elevation.card,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <View style={styles.healthTopRow}>
        <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
          {t('squad.health.title', { defaultValue: 'Squad health' }).toUpperCase()}
        </Text>
        {hasTarget ? (
          <Text style={styles.healthCount} color="primary" tabular>
            {squadCount}
            <Text variant="footnote" color="tertiary" tabular>
              {` / ${target}`}
            </Text>
          </Text>
        ) : (
          <Text style={styles.healthCount} color="primary" tabular>
            {squadCount}
          </Text>
        )}
      </View>

      {hasTarget ? (
        <View style={[styles.healthTrack, { backgroundColor: c.borderDefault }]}>
          <View
            style={[
              styles.healthFill,
              { backgroundColor: c.primary, width: `${Math.round(pct * 100)}%` },
            ]}
          />
        </View>
      ) : null}

      {hasTarget ? (
        <Text variant="caption1" color="secondary">
          {full
            ? t('squad.health.complete', { defaultValue: 'Full strength' })
            : t('squad.health.fill', { defaultValue: 'Invite to fill the squad' })}
        </Text>
      ) : null}
    </View>
  )
}

function PlayerRow({
  member,
  isSelf,
  availability,
  showDivider,
}: {
  member: RosterOpsMemberSummary
  isSelf: boolean
  /** undefined = no upcoming event; null = event exists, no answer yet */
  availability: Availability | null | undefined
  showDivider: boolean
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  const availabilityLabel =
    availability === 'YES'
      ? t('event.rsvpYes', { defaultValue: 'Yes' })
      : availability === 'MAYBE'
        ? t('event.rsvpMaybe', { defaultValue: 'Maybe' })
        : availability === 'NO'
          ? t('event.rsvpNo', { defaultValue: 'No' })
          : availability === null
            ? t('squad.people.noReply', { defaultValue: 'No reply' })
            : null

  const availabilityColor =
    availability === 'YES'
      ? c.primary
      : availability === 'MAYBE'
        ? c.textSecondary
        : availability === 'NO'
          ? c.textTertiary
          : c.borderDefault

  const onPress = () => {
    if (isSelf) return
    router.push({
      pathname: '/dm-chat',
      params: { userId: member.userId, userName: member.name },
    })
  }

  const label = [
    member.name,
    member.position,
    availabilityLabel,
    isSelf ? null : t('squad.people.message', { defaultValue: 'Message' }),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Pressable
      onPress={onPress}
      disabled={isSelf}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        showDivider && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
        pressed && { backgroundColor: c.surfaceSunken },
      ]}
    >
      <Avatar size="md" src={member.avatarUrl} fallbackText={member.name} />
      <View style={styles.rowBody}>
        <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
          {member.name}
          {member.jerseyNumber != null ? (
            <Text variant="callout" color="tertiary" tabular>
              {`  #${member.jerseyNumber}`}
            </Text>
          ) : null}
        </Text>
        {member.position || availabilityLabel ? (
          <View style={styles.rowMeta}>
            {availabilityLabel ? (
              <View style={styles.availability}>
                <View style={[styles.availabilityDot, { backgroundColor: availabilityColor }]} />
                <Text variant="caption1" color="secondary" numberOfLines={1}>
                  {availabilityLabel}
                </Text>
              </View>
            ) : null}
            {member.position ? (
              <Text variant="caption1" color="tertiary" numberOfLines={1} style={styles.rowMetaText}>
                {availabilityLabel ? ` · ${member.position}` : member.position}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {isSelf ? (
        <Text variant="caption1" color="tertiary">
          {t('squad.people.you', { defaultValue: 'You' })}
        </Text>
      ) : (
        <Icon name="chatbubble" size={18} color="tertiary" />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  scroll: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    // Clear the floating tab bar so the last row isn't pinned under it.
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
    gap: space.lg,
  },
  section: { gap: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  sectionAside: { flexShrink: 1 },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  healthCard: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    gap: space.sm,
  },
  healthTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  healthCount: {
    fontFamily: fonts.data,
    fontSize: 22,
    fontWeight: '700',
  },
  healthTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  healthFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  opIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['2xs'] + 2,
  },
  opBadgeText: {
    fontFamily: fonts.data,
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 60,
  },
  rowBody: {
    flex: 1,
    gap: space['2xs'],
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMetaText: { flexShrink: 1 },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2xs'] + 2,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  emptyWrap: {
    paddingTop: space.xl,
    paddingHorizontal: space.md,
  },
})
