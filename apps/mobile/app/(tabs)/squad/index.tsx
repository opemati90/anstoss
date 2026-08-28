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
  Button,
  Icon,
  FilterChipRow,
  type FilterChip,
} from '../../../src/components/ui'
import { EmptyState } from '../../../src/components/EmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { elevation, fonts, hairline, radius, space, TAB_BAR_CLEARANCE } from '../../../src/theme/tokens'
import { getSquadEmptyCopy } from '../../../src/lib/squadEmptyCopy'

type Bucket = 'ACTIVE' | 'TRIAL' | 'INACTIVE'

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

export default function SquadScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess, activeRoleMode } = useAuth()
  const c = useClubColors()
  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
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

  useFocusEffect(
    useCallback(() => {
      void fetchSnapshot()
    }, [fetchSnapshot]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchSnapshot()
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

  // No active team — surface a clear empty state so the squad tab doesn't
  // look like it's broken/loading. Two distinct cases: no club at all,
  // or a club with no team selected (e.g. free-agent membership).
  if (!activeClub || !activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.headerWrap}>
          <TabScreenHeader title={t('squad.title', { defaultValue: 'Squad' })} />
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
      <View style={styles.headerWrap}>
        <TabScreenHeader
          title={t('squad.title', { defaultValue: 'Squad' })}
          subtitle={
            activeTeamAccess?.team?.displayName ?? activeClub?.club?.name ?? undefined
          }
        />
      </View>
      {isCoach ? (
        <View style={styles.adminActions}>
          <Button
            label={t('invite.screenTitle', { defaultValue: 'Invite players' })}
            variant="filled"
            size="sm"
            onPress={() => router.push('/invite')}
            style={styles.adminBtn}
          />
          <Button
            label={t('squad.manage', { defaultValue: 'Manage roster' })}
            variant="bordered"
            size="sm"
            onPress={() => router.push('/(tabs)/roster')}
            style={styles.adminBtn}
          />
        </View>
      ) : null}

      {isCoach && snapshot ? <SquadHealth snapshot={snapshot} /> : null}

      <View style={styles.controls}>
        <FilterChipRow<Bucket>
          chips={chipOptions}
          selected={bucket}
          onToggle={setBucket}
          singleSelect
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.gridWrap}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {members.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="person.2.fill"
              title={t(emptyCopy.titleKey, {
                defaultValue: emptyCopy.title,
              })}
              description={t(emptyCopy.bodyKey, {
                defaultValue: emptyCopy.body,
              })}
            />
          </View>
        ) : (
          <View style={styles.list}>
            {members.map((m: RosterOpsMemberSummary) => (
              <PlayerRow key={m.userId} member={m} />
            ))}
          </View>
        )}

      </ScrollView>
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

  // Trials are intentionally NOT a health chip — the Active/Trial/Inactive
  // filter below already surfaces trial players, so showing "Trials" here too
  // read as a confusing duplicate. Health chips are operational alerts that the
  // phase filter doesn't cover: pending coaches, injuries, kit duties.
  const ops = [
    {
      key: 'coaches',
      count: snapshot.operations.pendingCoaches.length,
      tab: 'operations',
      label: t('squad.health.coaches', { defaultValue: 'Coaches pending' }),
    },
    {
      key: 'injured',
      count: snapshot.medic.active.length,
      tab: 'medic',
      label: t('squad.health.injured', { defaultValue: 'Injured' }),
    },
    {
      key: 'kit',
      count: snapshot.kit.pending.length,
      tab: 'kit',
      label: t('squad.health.kit', { defaultValue: 'Kit duties' }),
    },
  ].filter((o) => o.count > 0)

  return (
    <View style={styles.healthWrap}>
      <View
        style={[
          styles.healthCard,
          elevation.card,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
        ]}
      >
        <View style={styles.healthTopRow}>
          <Text variant="footnote" weight="medium" style={styles.healthEyebrow} color="secondary">
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
          <Text variant="caption1" color="secondary" style={styles.healthHint}>
            {full
              ? t('squad.health.complete', { defaultValue: 'Full strength' })
              : t('squad.health.fill', { defaultValue: 'Invite to fill the squad' })}
          </Text>
        ) : null}

        {ops.length > 0 ? (
          <View style={styles.opsRow}>
            {ops.map((o) => (
              <Pressable
                key={o.key}
                accessibilityRole="button"
                accessibilityLabel={`${o.count} ${o.label}`}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                onPress={() =>
                  router.push({ pathname: '/(tabs)/roster', params: { tab: o.tab } })
                }
                style={({ pressed }) => [
                  styles.opChip,
                  { borderColor: c.borderDefault, backgroundColor: c.background },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <View style={[styles.opBadge, { backgroundColor: c.primary }]}>
                  <Text style={[styles.opBadgeText, { color: c.textInverse }]} tabular>
                    {o.count}
                  </Text>
                </View>
                <Text variant="caption1" weight="medium" color="primary">
                  {o.label}
                </Text>
                <Icon name="chevron.right" size={12} color="tertiary" />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function PlayerRow({ member }: { member: RosterOpsMemberSummary }) {
  const c = useClubColors()

  const onPress = () => {
    router.push({
      pathname: '/dm-chat',
      params: { userId: member.userId, userName: member.name },
    })
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={member.name}
      style={({ pressed }) => [
        styles.row,
        elevation.card,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.96 },
      ]}
    >
      <Avatar size="md" src={member.avatarUrl} fallbackText={member.name} />
      <View style={styles.rowBody}>
        <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
          {member.name}
        </Text>
        {member.position ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {member.position}
          </Text>
        ) : null}
      </View>
      {member.jerseyNumber != null ? (
        <Text style={[styles.jersey, { color: c.textTertiary }]} tabular>
          #{member.jerseyNumber}
        </Text>
      ) : null}
      <Icon name="chevron.right" size={14} color="tertiary" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  adminActions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  adminBtn: {
    flex: 1,
  },
  healthWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
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
  healthEyebrow: {
    letterSpacing: 0.6,
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
  healthHint: {
    marginTop: space['2xs'],
  },
  opsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space['2xs'],
  },
  opChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2xs'] + 2,
    paddingVertical: space['2xs'] + 1,
    paddingLeft: space['2xs'] + 1,
    paddingRight: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  opBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['2xs'],
  },
  opBadgeText: {
    fontFamily: fonts.data,
    fontSize: 12,
    fontWeight: '700',
  },
  controls: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  gridWrap: {
    paddingHorizontal: space.md,
    // Clear the floating tab bar so the last roster row isn't pinned under it.
    // Matches the canonical clearance used by the events/home tab scrollers.
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
    gap: space.lg,
  },
  list: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  rowBody: {
    flex: 1,
    gap: space['2xs'],
  },
  jersey: {
    fontFamily: fonts.data,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWrap: {
    paddingTop: space.xl,
    paddingHorizontal: space.md,
  },
  manageBtn: {
    alignSelf: 'center',
    marginTop: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
})
