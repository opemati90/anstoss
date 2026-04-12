import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Share,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats } from '@anstoss/shared'
import type { TrialInvite } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { AdminStatsSkeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  StatCard,
  StatGrid,
  Text,
} from '../src/components/ui'
import { elevation, hairline, card, space } from '../src/theme/tokens'
import { formatGermanShortDate } from '../src/utils/germanDate'

export default function AdminDashboardScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [stats, setStats] = useState<ClubAggregateStats | null>(null)
  const [trialInvites, setTrialInvites] = useState<TrialInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clubId = activeClub?.club.id
  const isAdmin = activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN
  const shareJoinLink = () => {
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
  }

  const fetchStats = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ClubAggregateStats>(`/clubs/${clubId}/stats`)
      setStats(data)
      const invites = await api<TrialInvite[]>(`/clubs/${clubId}/trial-invites`)
      setTrialInvites(invites || [])
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

  if (!isAdmin) {
    return (
      <Screen header={<ModalHeader title={t('adminDashboard.title')} mode="back" />} scroll={false} padded={false}>
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('adminDashboard.title')} />} scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
              ...elevation.card,
            },
          ]}
        >
          <Text variant="caption2" color="tertiary" tracking="wide">
            {t('adminDashboard.clubOverview').toUpperCase()}
          </Text>
          <Text variant="title2" color="primary" numberOfLines={2}>
            {activeClub?.club.name}
          </Text>
          <Text variant="subheadline" color="secondary">
            {t('adminDashboard.summary')}
          </Text>
        </View>

        {error ? (
          <ErrorState message={error} onRetry={fetchStats} />
        ) : loading ? (
          <AdminStatsSkeleton />
        ) : stats ? (
          <View style={styles.statsWrap}>
            <StatGrid columns={2}>
              <StatCard
                icon="person.2.fill"
                label={t('adminDashboard.members')}
                value={stats.memberCount}
              />
              <StatCard
                icon="figure.soccer.fill"
                label={t('adminDashboard.teams')}
                value={stats.teamCount}
              />
              <StatCard
                icon="calendar.fill"
                label={t('adminDashboard.upcomingEvents')}
                value={stats.upcomingEventCount}
              />
              <StatCard
                icon="checkmark.circle.fill"
                label={t('adminDashboard.rsvpRate')}
                value={`${stats.overallRsvpRate}%`}
              />
            </StatGrid>
          </View>
        ) : null}

        <SectionLabel>{t('adminDashboard.peopleAccess')}</SectionLabel>
        <SectionGroup>
          <ListRow
            left={<Icon name="person.2.fill" size="md" color="tint" />}
            title={t('adminMembers.title')}
            onPress={() => router.push('/admin-members')}
          />
          <ListRow
            left={<Icon name="lock.shield.fill" size="md" color="tint" />}
            title={t('more.manageStaff')}
            subtitle={t('more.manageStaffSubtitle')}
            onPress={() => router.push('/club-staff')}
          />
          <ListRow
            left={<Icon name="heart.fill" size="md" color="tint" />}
            title={t('more.manageFamilies')}
            subtitle={t('more.manageFamiliesSubtitle')}
            onPress={() => router.push('/team-families')}
          />
          <ListRow
            left={<Icon name="envelope.fill" size="md" color="tint" />}
            title={t('pendingRequests.title')}
            subtitle={t('pendingRequests.subtitle')}
            onPress={() => router.push('/pending-requests')}
          />
        </SectionGroup>

        <SectionLabel>{t('adminDashboard.teamsEvents')}</SectionLabel>
        <SectionGroup>
          <ListRow
            left={<Icon name="person.2.fill" size="md" color="tint" />}
            title={t('more.manageTeams')}
            subtitle={t('teamManagement.subtitle')}
            onPress={() => router.push('/team-management')}
          />
          <ListRow
            left={<Icon name="flag.fill" size="md" color="tint" />}
            title={t('clubStats.title')}
            onPress={() => router.push('/club-stats')}
          />
        </SectionGroup>

        <SectionLabel>{t('adminDashboard.finance')}</SectionLabel>
        <SectionGroup>
          <ListRow
            left={<Icon name="creditcard.fill" size="md" color="tint" />}
            title={t('adminBilling.title')}
            subtitle={t('adminDashboard.financeSubtitle')}
            onPress={() => router.push('/admin-billing')}
          />
        </SectionGroup>

        <SectionLabel>{t('adminDashboard.growth')}</SectionLabel>
        <SectionGroup>
          <ListRow
            left={<Icon name="person.circle.fill" size="md" color="tint" />}
            title={t('more.invitePlayers')}
            onPress={() => router.push('/invite')}
          />
          <ListRow
            left={<Icon name="square.and.arrow.up" size="md" color="tint" />}
            title={t('adminDashboard.shareJoinLink')}
            subtitle={t('adminDashboard.shareJoinLinkSubtitle')}
            onPress={shareJoinLink}
          />
          <ListRow
            left={<Icon name="figure.soccer.fill" size="md" color="tint" />}
            title={t('adminDashboard.transferList')}
            subtitle={t('adminDashboard.transferListSubtitle')}
            onPress={() => router.push('/transfer-list')}
          />
          <ListRow
            left={<Icon name="arrow.up.arrow.down" size="md" color="tint" />}
            title={t('adminDashboardExtra.playerLoan')}
            subtitle={t('adminDashboardExtra.playerLoanSubtitle')}
            onPress={() => router.push('/player-loan')}
          />
        </SectionGroup>

        {trialInvites.length > 0 ? (
          <>
            <SectionLabel>{t('adminDashboard.trialInvites')}</SectionLabel>
            <SectionGroup>
              {trialInvites.slice(0, 3).map((invite) => (
                <ListRow
                  key={invite.id}
                  title={invite.team.displayName}
                  subtitle={`${invite.club.name} · ${t(`freeAgent.trialStatus.${invite.status}`)}`}
                  right={
                    <Text variant="footnote" color="secondary" tabular>
                      {formatGermanShortDate(invite.expiresAt)}
                    </Text>
                  }
                />
              ))}
            </SectionGroup>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionLabelWrap}>
      <Text variant="caption2" color="tertiary" tracking="wide">
        {typeof children === 'string' ? children.toUpperCase() : children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: space.md,
    paddingBottom: space['2xl'],
  },
  heroCard: {
    borderRadius: card.heroRadius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.paddingHero,
    marginBottom: space.lg,
    gap: space.xs,
  },
  statsWrap: {
    marginBottom: space.md,
  },
  sectionLabelWrap: {
    marginTop: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
  },
})
