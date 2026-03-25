import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats, TeamStats } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors, radius, space, fontSize, fontWeight, semanticColors } from '../src/theme/tokens'

export default function ClubStatsScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [stats, setStats] = useState<ClubAggregateStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const clubId = activeClub?.club.id

  const fetchStats = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ClubAggregateStats>(`/clubs/${clubId}/stats`)
      setStats(data)
    } catch {
      // silent
    }
  }, [clubId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchStats()
    setRefreshing(false)
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.heading}>{t('clubStats.title')}</Text>

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
            <TeamRow key={team.teamId} team={team} primary={theme.clubPrimary} />
          ))}
        </>
      )}
    </ScrollView>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function TeamRow({ team, primary }: { team: TeamStats; primary: string }) {
  return (
    <View style={styles.teamRow}>
      <View style={styles.teamRowHeader}>
        <Text style={styles.teamName}>{team.teamDisplayName || team.teamName}</Text>
      </View>
      <View style={styles.teamRowStats}>
        <Text style={styles.teamStat}>{team.memberCount} members</Text>
        <Text style={styles.teamStat}>{team.upcomingEventCount} events</Text>
        <Text style={styles.teamStat}>{Math.round(team.rsvpRate)}% RSVP</Text>
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
    padding: space.md,
  },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.lg,
  },
  statCard: {
    width: '47%',
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderLeftWidth: 3,
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: neutralColors.textSecondary,
    marginTop: 2,
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
    gap: space.md,
    marginBottom: space.sm,
  },
  teamStat: {
    fontSize: fontSize.xs,
    color: neutralColors.textSecondary,
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
