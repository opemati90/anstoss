import { useCallback, useEffect, useState } from 'react'
import { View, StyleSheet, RefreshControl } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats, TeamStats } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { AdminStatsSkeleton } from '../src/components/Skeleton'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  ListRow,
  Screen,
  SectionGroup,
  SectionHeader,
  StatCard,
  StatGrid,
  SettingsIcon,
  Text,
} from '../src/components/ui'
import { space } from '../src/theme/tokens'

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
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const data = await api<ClubAggregateStats>(`/clubs/${clubId}/stats`)
      setStats(data)
      setError(null)
    } catch {
      setError(t('errors.loadFailed'))
    } finally {
      setLoading(false)
    }
    // `t` is stable in production; excluding it avoids a refetch loop when a
    // fresh `t` identity is created each render (e.g. in tests).
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
    <Screen
      header={<ModalHeader title={t('clubStats.title')} mode="back" />}
      scroll
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {error ? (
        <View style={styles.section}>
          <ErrorState message={error} onRetry={fetchStats} />
        </View>
      ) : !loading && !clubId ? (
        <EmptyState
          icon="chart.bar"
          title={t('clubStats.noClubTitle', { defaultValue: 'No club selected' })}
          description={t('clubStats.noClubBody', { defaultValue: 'Join a club to view club statistics.' })}
        />
      ) : loading && !stats ? (
        <View style={styles.section}>
          <AdminStatsSkeleton />
        </View>
      ) : null}

      {stats ? (
        <>
          <View>
            <SectionHeader
              title={t('clubStats.overview', { defaultValue: 'Club totals' })}
            />
            <View style={styles.section}>
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
                  tint={c.primary}
                />
                <StatCard
                  icon="calendar.fill"
                  label={t('clubStats.upcomingEvents')}
                  value={stats.upcomingEventCount}
                  tint={c.primary}
                />
                <StatCard
                  icon="checkmark.circle.fill"
                  label={t('clubStats.rsvpRate')}
                  value={`${Math.round(stats.overallRsvpRate)}%`}
                  tint={c.primary}
                />
              </StatGrid>
            </View>
          </View>

          <SectionGroup
            header={t('clubStats.perTeam')}
            style={styles.section}
          >
            {stats.teams.map((team) => (
              <TeamProgressRow key={team.teamId} team={team} t={t} />
            ))}
          </SectionGroup>
        </>
      ) : null}
    </Screen>
  )
}

function TeamProgressRow({
  team,
  t,
}: {
  team: TeamStats
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const c = useClubColors()
  const rsvp = Math.round(team.rsvpRate)
  const tone =
    rsvp >= 80 ? c.success : rsvp >= 50 ? c.warning : c.error
  return (
    <ListRow
      left={<SettingsIcon name="figure.soccer.fill" tint={c.primary} />}
      title={team.teamDisplayName || team.teamName}
      subtitle={`${t('clubStats.teamMembers', { count: team.memberCount })} · ${t('clubStats.teamEvents', { count: team.upcomingEventCount })}`}
      right={
        <Text variant="data" tabular style={{ color: tone }}>
          {`${rsvp}%`}
        </Text>
      }
    />
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.lg,
  },
  section: {
    paddingHorizontal: space.md,
  },
})
