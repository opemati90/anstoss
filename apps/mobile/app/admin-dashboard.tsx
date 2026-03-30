import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats } from '@anstoss/shared'
import type { TrialInvite } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, radius, space, fontSize, fontWeight } from '../src/theme/tokens'
import { formatGermanShortDate } from '../src/utils/germanDate'

export default function AdminDashboardScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [stats, setStats] = useState<ClubAggregateStats | null>(null)
  const [trialInvites, setTrialInvites] = useState<TrialInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const clubId = activeClub?.club.id

  const fetchStats = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ClubAggregateStats>(`/clubs/${clubId}/stats`)
      setStats(data)
      const invites = await api<TrialInvite[]>(`/clubs/${clubId}/trial-invites`)
      setTrialInvites(invites || [])
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
      <ModalHeader title={t('adminDashboard.title')} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>{t('more.sectionClub')}</Text>
          <Text style={styles.heroTitle}>{activeClub?.club.name}</Text>
          <Text style={styles.heroBody}>{t('adminDashboard.summary')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: space.xl }} />
        ) : stats ? (
          <View style={styles.statsGrid}>
            <StatCard
              label={t('adminDashboard.members')}
              value={String(stats.memberCount)}
              color={theme.clubPrimary}
            />
            <StatCard
              label={t('adminDashboard.teams')}
              value={String(stats.teamCount)}
              color={theme.clubPrimary}
            />
            <StatCard
              label={t('adminDashboard.upcomingEvents')}
              value={String(stats.upcomingEventCount)}
              color={theme.clubPrimary}
            />
            <StatCard
              label={t('adminDashboard.rsvpRate')}
              value={`${stats.overallRsvpRate}%`}
              color={theme.clubPrimary}
            />
          </View>
        ) : null}

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
            icon="walk-outline"
            label={t('adminDashboard.transferList')}
            subtitle={t('adminDashboard.transferListSubtitle')}
            color={theme.clubPrimary}
            onPress={() => router.push('/transfer-list')}
          />
          <ActionRow
            icon="mail-unread-outline"
            label={t('pendingRequests.title')}
            subtitle={t('pendingRequests.subtitle')}
            color={theme.clubPrimary}
            onPress={() => router.push('/pending-requests')}
          />
          <ActionRow
            icon="stats-chart-outline"
            label={t('clubStats.title')}
            color={theme.clubPrimary}
            onPress={() => router.push('/club-stats')}
          />
          <ActionRow
            icon="people-circle-outline"
            label={t('adminMembers.title')}
            color={theme.clubPrimary}
            onPress={() => router.push('/admin-members')}
          />
          <ActionRow
            icon="qr-code-outline"
            label={t('adminDashboard.shareJoinLink')}
            subtitle={t('adminDashboard.shareJoinLinkSubtitle')}
            color={theme.clubPrimary}
            onPress={() => {
              const slug = activeClub?.club.slug
              if (!slug) return
              const url = `https://anstoss.io/join/${slug}`
              void Share.share({
                message: t('adminDashboard.shareJoinMessage', {
                  clubName: activeClub?.club.name,
                  url,
                }),
                url,
              })
            }}
          />
          <ActionRow
            icon="card-outline"
            label={t('adminBilling.title')}
            color={theme.clubPrimary}
            onPress={() => router.push('/admin-billing')}
          />
        </View>

        {trialInvites.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{t('adminDashboard.trialInvites')}</Text>
            <View style={styles.actionGroup}>
              {trialInvites.slice(0, 3).map((invite) => (
                <View key={invite.id} style={styles.inviteRow}>
                  <View style={styles.inviteCopy}>
                    <Text style={styles.actionLabel}>{invite.team.displayName}</Text>
                    <Text style={styles.actionSubtitle}>
                      {invite.club.name} · {t(`freeAgent.trialStatus.${invite.status}`)}
                    </Text>
                  </View>
                  <Text style={styles.inviteMeta}>
                    {formatGermanShortDate(invite.expiresAt)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
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
  content: { padding: space.md, paddingBottom: 100 },
  heroCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    marginBottom: space.md,
  },
  heroEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: neutralColors.textTertiary,
    marginBottom: space.xs,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  heroBody: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: neutralColors.textSecondary,
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
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    gap: space.md,
  },
  inviteCopy: {
    flex: 1,
  },
  inviteMeta: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
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
