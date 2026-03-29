import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats, TeamStats } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, radius, space, fontSize, fontWeight, semanticColors } from '../src/theme/tokens'

export default function ClubStatsScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [stats, setStats] = useState<ClubAggregateStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const clubId = activeClub?.club.id

  const fetchStats = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ClubAggregateStats>(`/clubs/${clubId}/stats`)
      setStats(data)
    } catch {
      // silent
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
    <View style={styles.container}>
      <ModalHeader title={t('clubStats.title')} />
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >

      {loading && !stats && (
        <View style={{ alignItems: 'center', marginTop: space.xl }}>
          <ActivityIndicator size="large" color={theme.clubPrimary} />
        </View>
      )}

      {stats && (
        <>
          <View style={styles.grid}>
            <StatCard label={t('clubStats.members')} value={stats.memberCount} color={theme.clubPrimary} />
            <StatCard label={t('clubStats.teams')} value={stats.teamCount} color={semanticColors.info} />
            <StatCard label={t('clubStats.upcomingEvents')} value={stats.upcomingEventCount} color={semanticColors.success} />
            <StatCard
              label={t('clubStats.rsvpRate')}
              value={`${Math.round(stats.overallRsvpRate)}%`}
              color={semanticColors.warning}
            />
          </View>

          <Text style={styles.sectionTitle}>{t('clubStats.perTeam')}</Text>
          {stats.teams.map((team) => (
            <TeamRow key={team.teamId} team={team} primary={theme.clubPrimary} t={t} />
          ))}
        </>
      )}
      </ScrollView>
    </View>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text numberOfLines={2} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  )
}

function TeamRow({
  team,
  primary,
  t,
}: {
  team: TeamStats
  primary: string
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <View style={styles.teamRow}>
      <View style={styles.teamRowHeader}>
        <Text style={styles.teamName}>{team.teamDisplayName || team.teamName}</Text>
      </View>
      <View style={styles.teamRowStats}>
        <Text style={styles.teamStat}>{t('clubStats.teamMembers', { count: team.memberCount })}</Text>
        <Text style={styles.teamStat}>{t('clubStats.teamEvents', { count: team.upcomingEventCount })}</Text>
        <Text style={styles.teamStat}>{t('clubStats.teamRsvpRate', { count: Math.round(team.rsvpRate) })}</Text>
      </View>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(team.rsvpRate, 100)}%`, backgroundColor: primary },
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  scrollContent: {
    padding: space.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.lg,
  },
  statCard: {
    width: '48%',
    minHeight: 92,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm + 2,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderLeftWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: fontSize['2xl'],
    lineHeight: 28,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  statLabel: {
    width: '100%',
    fontSize: fontSize.xs,
    lineHeight: 14,
    color: neutralColors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.md,
  },
  teamRow: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    marginBottom: space.sm,
  },
  teamRowHeader: {
    marginBottom: space.xs,
  },
  teamName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  teamRowStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.sm,
  },
  teamStat: {
    fontSize: fontSize.xs,
    lineHeight: 16,
    color: neutralColors.textSecondary,
    flexShrink: 1,
  },
  progressBar: {
    height: 4,
    backgroundColor: neutralColors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
})
