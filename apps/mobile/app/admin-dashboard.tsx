import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors, radius, space, fontSize, fontWeight } from '../src/theme/tokens'

export default function AdminDashboardScreen() {
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
    await fetchStats()
    setRefreshing(false)
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.headerTitle}>{t('adminDashboard.title')}</Text>
      <Text style={styles.headerSubtitle}>
        {activeClub?.club.name}
      </Text>

      {/* Stats cards */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} />
      ) : stats ? (
        <View style={styles.statsGrid}>
          <StatCard
            label={t('adminDashboard.members')}
            value={String(stats.totalMembers)}
            color={theme.clubPrimary}
          />
          <StatCard
            label={t('adminDashboard.teams')}
            value={String(stats.totalTeams)}
            color={theme.clubPrimary}
          />
          <StatCard
            label={t('adminDashboard.upcomingEvents')}
            value={String(stats.upcomingEvents)}
            color={theme.clubPrimary}
          />
          <StatCard
            label={t('adminDashboard.rsvpRate')}
            value={`${stats.avgRsvpRate}%`}
            color={theme.clubPrimary}
          />
        </View>
      ) : null}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>{t('adminDashboard.quickActions')}</Text>
      <View style={styles.actionGroup}>
        <ActionRow
          icon="people-outline"
          label={t('more.manageTeams')}
          subtitle={t('teamManagement.subtitle')}
          color={theme.clubPrimary}
          onPress={() => router.push('/team-management')}
        />
        <ActionRow
          icon="shield-outline"
          label={t('more.manageStaff')}
          subtitle={t('more.manageStaffSubtitle')}
          color={theme.clubPrimary}
          onPress={() => router.push('/club-staff')}
        />
        <ActionRow
          icon="heart-outline"
          label={t('more.manageFamilies')}
          subtitle={t('more.manageFamiliesSubtitle')}
          color={theme.clubPrimary}
          onPress={() => router.push('/team-families')}
        />
        <ActionRow
          icon="person-add-outline"
          label={t('more.invitePlayers')}
          color={theme.clubPrimary}
          onPress={() => router.push('/invite')}
        />
        <ActionRow
          icon="stats-chart-outline"
          label={t('clubStats.title')}
          color={theme.clubPrimary}
          onPress={() => router.push('/club-stats')}
        />
      </View>
    </ScrollView>
  )
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function ActionRow({
  icon,
  label,
  subtitle,
  color,
  onPress,
}: {
  icon: any
  label: string
  subtitle?: string
  color: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color} />
      <View style={styles.actionContent}>
        <Text style={styles.actionLabel}>{label}</Text>
        {subtitle && <Text style={styles.actionSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={neutralColors.textTertiary} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: space.md, paddingTop: 60, paddingBottom: 100 },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.md,
    color: neutralColors.textSecondary,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: neutralColors.textSecondary,
    marginTop: space.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.sm,
  },
  actionGroup: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  actionContent: { flex: 1, marginLeft: 14 },
  actionLabel: {
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
  },
  actionSubtitle: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    marginTop: 2,
  },
})
