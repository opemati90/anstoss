import { useCallback, useMemo, useState } from 'react'
import {
  Image,
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
import { Screen, Text, FilterChipRow, type FilterChip } from '../../../src/components/ui'
import { hairline, fontSize, fonts, radius, space } from '../../../src/theme/tokens'

type Bucket = 'ACTIVE' | 'TRIAL' | 'INACTIVE'

const BUCKETS: FilterChip<Bucket>[] = [
  { key: 'ACTIVE', label: 'squad.bucket.active' },
  { key: 'TRIAL', label: 'squad.bucket.trial' },
  { key: 'INACTIVE', label: 'squad.bucket.inactive' },
]

export default function SquadScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
  const [bucket, setBucket] = useState<Bucket>('ACTIVE')
  const [refreshing, setRefreshing] = useState(false)

  const isCoach =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

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
        return {
          ...chip,
          label: `${t(chip.label, { defaultValue: chip.label.split('.').pop() })} · ${count}`,
        }
      }),
    [snapshot, t],
  )

  return (
    <Screen
      largeTitle={t('squad.title', { defaultValue: 'Squad' })}
      eyebrow={activeTeamAccess?.team.displayName ?? activeClub?.club.name}
      scroll={false}
      tabBarClearance
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
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
      >
        {members.length === 0 ? (
          <View style={[styles.empty, { borderColor: c.borderDefault }]}>
            <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
              {t('squad.empty', {
                defaultValue: 'No players in this list yet.',
              })}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {members.map((m: RosterOpsMemberSummary) => (
              <PlayerTile key={m.userId} member={m} />
            ))}
          </View>
        )}

        {isCoach ? (
          <Pressable
            onPress={() => router.push('/(tabs)/roster')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.manageBtn,
              { borderColor: c.borderDefault },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text variant="footnote" weight="semibold" color={c.primary}>
              {t('squad.manage', { defaultValue: 'Manage roster' })} →
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function PlayerTile({ member }: { member: RosterOpsMemberSummary }) {
  const c = useClubColors()
  const initials = member.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  const onPress = () => {
    router.push({
      pathname: '/dm-chat',
      params: { userId: member.userId, name: member.name },
    })
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={member.name}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.avatarWrap}>
        {member.avatarUrl ? (
          <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: c.primary }]}>
            <Text style={styles.avatarInit}>{initials || '?'}</Text>
          </View>
        )}
        {member.jerseyNumber != null ? (
          <View style={[styles.jersey, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            <Text style={[styles.jerseyText, { color: c.textPrimary }]}>{member.jerseyNumber}</Text>
          </View>
        ) : null}
      </View>
      <Text variant="footnote" weight="semibold" color="primary" numberOfLines={1} style={styles.name}>
        {member.name}
      </Text>
      {member.position ? (
        <Text variant="caption2" color="tertiary" numberOfLines={1}>
          {member.position}
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  gridWrap: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.lg,
  },
  tile: {
    width: '33.333%',
    paddingHorizontal: space.xs,
    alignItems: 'center',
    gap: 4,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInit: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  jersey: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jerseyText: {
    fontFamily: fonts.data,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  name: {
    textAlign: 'center',
    width: '100%',
  },
  empty: {
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: 14,
    borderWidth: hairline,
    borderStyle: 'dashed',
  },
  manageBtn: {
    alignSelf: 'center',
    marginTop: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: hairline,
  },
})
