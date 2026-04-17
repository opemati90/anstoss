import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats, TeamStats } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { AdminStatsSkeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, StatCard, StatGrid, Text } from '../src/components/ui'
import { card, hairline, space } from '../src/theme/tokens'

export default function ClubStatsScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [stats, setStats] = useState<ClubAggregateStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clubId = activeClub?.club.id

  const fetchStats = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ClubAggregateStats>(`/clubs/${clubId}/stats`)
      setStats(data)
      setError(null)
    } catch {
      setError(t('errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchStats()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Screen header={<ModalHeader title={t('clubStats.title')} />} padded={false}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {error ? (
          <ErrorState message={error} onRetry={fetchStats} />
        ) : loading && !stats ? (
          <AdminStatsSkeleton />
        ) : null}

        {stats ? (
          <>
            <StatGrid columns={2}>
              <StatCard
                icon="person.2.fill"
                label={t('clubStats.members')}
                value={stats.memberCount}
                tint={c.primary}
              />
              <StatCard
                icon="figure.soccer.fill"
                label={t('clubStats.teams')}
                value={stats.teamCount}
                tint={c.info}
              />
              <StatCard
                icon="calendar.fill"
                label={t('clubStats.upcomingEvents')}
                value={stats.upcomingEventCount}
                tint={c.success}
              />
              <StatCard
                icon="checkmark.circle.fill"
                label={t('clubStats.rsvpRate')}
                value={`${Math.round(stats.overallRsvpRate)}%`}
                tint={c.warning}
              />
            </StatGrid>

            <View style={styles.sectionHeader}>
              <Text variant="caption2" color="tertiary" tracking="wide">
                {t('clubStats.perTeam').toUpperCase()}
              </Text>
            </View>
            {stats.teams.map((team) => (
              <TeamRow key={team.teamId} team={team} t={t} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function TeamRow({
  team,
  t,
}: {
  team: TeamStats
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const c = useClubColors()
  return (
    <View
      style={[
        styles.teamRow,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <Text variant="headline" color="primary">
        {team.teamDisplayName || team.teamName}
      </Text>
      <View style={styles.teamRowStats}>
        <Text variant="footnote" color="secondary">
          {t('clubStats.teamMembers', { count: team.memberCount })}
        </Text>
        <Text variant="footnote" color="secondary">
          {t('clubStats.teamEvents', { count: team.upcomingEventCount })}
        </Text>
        <Text variant="footnote" color="secondary" tabular>
          {t('clubStats.teamRsvpRate', { count: Math.round(team.rsvpRate) })}
        </Text>
      </View>
      <View style={[styles.progressBar, { backgroundColor: c.borderDefault }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(team.rsvpRate, 100)}%`,
              backgroundColor: c.primary,
            },
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: space.md,
    paddingBottom: space['2xl'],
  },
  sectionHeader: {
    marginTop: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  teamRow: {
    borderRadius: card.radius,
    borderCurve: 'continuous',
    padding: card.paddingCompact,
    borderWidth: hairline,
    marginBottom: space.sm,
    gap: space.xs,
  },
  teamRowStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
})
