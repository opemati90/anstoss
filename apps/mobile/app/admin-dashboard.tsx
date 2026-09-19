import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  RefreshControl,
  Share,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats, ContributionOverview, TrialInvite } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { useEntitlements } from '../src/hooks/useEntitlements'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { PaywallSheet } from '../src/components/billing/PaywallSheet'
import {
  Avatar,
  Badge,
  ListRow,
  Screen,
  SectionGroup,
  SettingsIcon,
  SettingsIconTint,
  Text,
} from '../src/components/ui'
import { space } from '../src/theme/tokens'

type TeamGroupRow = {
  teams?: Array<{ coachAssignments?: { headCoach?: unknown | null } | null }>
}
import { formatGermanShortDate } from '../src/utils/germanDate'

/**
 * The club workspace — iOS Settings doctrine, with the numbers on the door.
 *
 * Three sections (people, structure, money). Every row that can have
 * something waiting carries its count, so the screen answers "what needs
 * me" before anything is tapped: pending join requests, teams without a
 * head coach, overdue dues. The counts come from the same endpoints the
 * target screens read, so they never disagree with what opens.
 */
export default function AdminDashboardScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const entitlements = useEntitlements()
  const [stats, setStats] = useState<ClubAggregateStats | null>(null)
  const [trialInvites, setTrialInvites] = useState<TrialInvite[]>([])
  const [pendingRequests, setPendingRequests] = useState(0)
  const [teamsWithoutCoach, setTeamsWithoutCoach] = useState(0)
  const [dues, setDues] = useState<ContributionOverview['summary'] | null>(null)
  const [, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paywallFeature, setPaywallFeature] = useState<string | null>(null)

  const clubId = activeClub?.club.id
  const clubName = activeClub?.club.name
  const clubBadgeUrl = activeClub?.club.badgeUrl ?? null
  const role = activeClub?.role
  const isAdmin =
    role === MembershipRole.OWNER || role === MembershipRole.ADMIN

  const shareJoinLink = () => {
    const slug = activeClub?.club.slug
    if (!slug) return
    const url = `https://anstoss.io/join/${slug}`
    void Share.share({
      message: t('adminDashboard.shareJoinMessage', { clubName, url }),
      url,
    })
  }

  const fetchStats = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ClubAggregateStats>(`/clubs/${clubId}/stats`)
      setStats(data)
      const invites = await api<TrialInvite[]>(`/clubs/${clubId}/trial-invites`)
      setTrialInvites(Array.isArray(invites) ? invites : [])
      setError(null)
      // Counts are garnish: each degrades to nothing on its own.
      const [requests, groups, contributions] = await Promise.all([
        api<unknown[]>(`/clubs/${clubId}/join-requests`).catch(() => []),
        api<TeamGroupRow[]>(`/clubs/${clubId}/team-groups`).catch(() => []),
        api<ContributionOverview>(`/clubs/${clubId}/contributions`).catch(() => null),
      ])
      setPendingRequests(Array.isArray(requests) ? requests.length : 0)
      setTeamsWithoutCoach(
        Array.isArray(groups)
          ? groups
              .flatMap((group) => (Array.isArray(group?.teams) ? group.teams : []))
              .filter((team) => !team?.coachAssignments?.headCoach).length
          : 0,
      )
      setDues(
        contributions && typeof contributions === 'object' && contributions.summary
          ? contributions.summary
          : null,
      )
    } catch {
      setError(t('errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [clubId, t])

  useEffect(() => {
    void fetchStats()
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
      <Screen
        header={<ModalHeader title={t('adminDashboard.title')} mode="back" />}
        scroll={false}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  const roleLabel =
    role === MembershipRole.OWNER
      ? t('roles.OWNER', { defaultValue: 'Owner' })
      : role === MembershipRole.ADMIN
        ? t('roles.ADMIN', { defaultValue: 'Admin' })
        : role
          ? t(`roles.${role}`, { defaultValue: role })
          : ''

  const statSummary = stats
    ? t('adminDashboard.heroStatSummary', {
        defaultValue: '{{members}} members · {{teams}} teams · {{rsvp}}% RSVP',
        members: stats.memberCount,
        teams: stats.teamCount,
        rsvp: stats.overallRsvpRate,
      })
    : null

  const validInvites = trialInvites.filter(
    (inv) => inv?.team?.displayName && inv?.club?.name,
  )

  return (
    <Screen
      header={<ModalHeader title={t('adminDashboard.title')} />}
      scroll
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
      contentStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Identity strip — stacked so the stats line never truncates. */}
      <View style={styles.identity}>
        <Avatar size="lg" src={clubBadgeUrl} fallbackText={clubName} />
        <View style={styles.identityCopy}>
          <Text variant="title3" color="primary" numberOfLines={1}>
            {clubName}
          </Text>
          {roleLabel ? (
            <Text
              variant="caption2"
              color="tertiary"
              tracking="wide"
              numberOfLines={1}
              style={styles.eyebrow}
            >
              {roleLabel}
            </Text>
          ) : null}
          {statSummary ? (
            <Text variant="footnote" color="tertiary" numberOfLines={2}>
              {statSummary}
            </Text>
          ) : null}
        </View>
      </View>

      {error ? (
        <View style={styles.errorWrap}>
          <ErrorState message={error} onRetry={fetchStats} />
        </View>
      ) : null}

      <SectionGroup
        header={t('adminDashboard.peopleAccess')}
        style={styles.section}
      >
        <ListRow
          left={<SettingsIcon name="person.2.fill" tint={SettingsIconTint.gray} />}
          title={t('adminMembers.title')}
          right={stats ? <RowValue value={stats.memberCount} /> : undefined}
          showChevron
          onPress={() => router.push('/admin-members')}
        />
        <ListRow
          left={
            <SettingsIcon name="envelope.fill" tint={SettingsIconTint.gray} />
          }
          title={t('pendingRequests.title')}
          accessibilityLabel={
            pendingRequests > 0
              ? `${t('pendingRequests.title')}, ${pendingRequests}`
              : t('pendingRequests.title')
          }
          right={pendingRequests > 0 ? <CountBadge value={pendingRequests} /> : undefined}
          showChevron
          onPress={() => router.push('/pending-requests')}
        />
        <ListRow
          left={
            <SettingsIcon name="lock.shield.fill" tint={SettingsIconTint.gray} />
          }
          title={t('more.manageStaff')}
          showChevron
          onPress={() => router.push('/club-staff')}
        />
        <ListRow
          left={<SettingsIcon name="heart.fill" tint={SettingsIconTint.gray} />}
          title={t('more.manageFamilies')}
          showChevron
          onPress={() => router.push('/team-families')}
        />
        <ListRow
          left={
            <SettingsIcon
              name="person.crop.circle.badge.plus"
              tint={SettingsIconTint.gray}
            />
          }
          title={t('more.invitePlayers')}
          showChevron
          onPress={() => router.push('/invite')}
        />
        <ListRow
          left={
            <SettingsIcon
              name="square.and.arrow.up"
              tint={SettingsIconTint.gray}
            />
          }
          title={t('adminDashboard.shareJoinLink')}
          showChevron
          onPress={shareJoinLink}
        />
      </SectionGroup>

      <SectionGroup
        header={t('adminDashboard.teamsEvents')}
        style={styles.section}
      >
        <ListRow
          left={<SettingsIcon name="person.3" tint={SettingsIconTint.gray} />}
          title={t('more.manageTeams')}
          subtitle={
            teamsWithoutCoach > 0
              ? t('adminDashboard.noHeadCoach', {
                  defaultValue: '{{count}} without a head coach',
                  count: teamsWithoutCoach,
                })
              : undefined
          }
          accessibilityLabel={
            teamsWithoutCoach > 0
              ? `${t('more.manageTeams')}, ${t('adminDashboard.noHeadCoach', {
                  defaultValue: '{{count}} without a head coach',
                  count: teamsWithoutCoach,
                })}`
              : t('more.manageTeams')
          }
          right={
            teamsWithoutCoach > 0 ? (
              <CountBadge value={teamsWithoutCoach} />
            ) : stats ? (
              <RowValue value={stats.teamCount} />
            ) : undefined
          }
          showChevron
          onPress={() => router.push('/team-management')}
        />
        <ListRow
          left={<SettingsIcon name="chart.bar.fill" tint={SettingsIconTint.gray} />}
          title={t('clubStats.title')}
          showChevron
          onPress={() => router.push('/club-stats')}
        />
        <ListRow
          left={<SettingsIcon name="link" tint={SettingsIconTint.gray} />}
          title={t('more.fussballLink', { defaultValue: 'Official team link' })}
          showChevron
          onPress={() => router.push('/fussball-link')}
        />
        <ListRow
          left={
            <SettingsIcon name="figure.soccer.fill" tint={SettingsIconTint.gray} />
          }
          title={t('adminDashboard.transferList')}
          showChevron
          onPress={() => {
            if (!entitlements.has('scouting_marketplace')) {
              setPaywallFeature('scouting_marketplace')
              return
            }
            router.push('/transfer-list')
          }}
        />
      </SectionGroup>

      <SectionGroup
        header={t('adminDashboard.finance')}
        style={styles.section}
      >
        <ListRow
          left={
            <SettingsIcon name="creditcard.fill" tint={SettingsIconTint.gray} />
          }
          title={t('adminBilling.title')}
          subtitle={
            dues && dues.assignedMembers > 0
              ? t('adminDashboard.duesSummary', {
                  defaultValue: '{{paid}} paid · {{pending}} pending · {{overdue}} overdue',
                  paid: dues.paidMembers,
                  pending: Math.max(
                    0,
                    dues.assignedMembers - dues.paidMembers - dues.overdueMembers,
                  ),
                  overdue: dues.overdueMembers,
                })
              : undefined
          }
          accessibilityLabel={
            dues && dues.overdueMembers > 0
              ? `${t('adminBilling.title')}, ${dues.overdueMembers}`
              : t('adminBilling.title')
          }
          right={dues && dues.overdueMembers > 0 ? <CountBadge value={dues.overdueMembers} /> : undefined}
          showChevron
          onPress={() => router.push('/admin-billing')}
        />
        <ListRow
          left={<SettingsIcon name="photo.fill" tint={SettingsIconTint.gray} />}
          title={t('adminDashboard.manageSponsors')}
          showChevron
          onPress={() => {
            if (!entitlements.has('sponsor_logos')) {
              setPaywallFeature('sponsor_logos')
              return
            }
            router.push('/admin-sponsors')
          }}
        />
      </SectionGroup>

      <SectionGroup
        header={t('adminDashboard.governance', { defaultValue: 'Governance' })}
        style={styles.section}
      >
        <ListRow
          left={<SettingsIcon name="checkmark.shield" tint={SettingsIconTint.gray} />}
          title={t('chatRetention.title', { defaultValue: 'Chat retention' })}
          subtitle={t('chatRetention.dashboardSubtitle', {
            defaultValue: 'Set cleanup windows for messages and attachments.',
          })}
          showChevron
          onPress={() => router.push('/admin-chat-retention')}
        />
      </SectionGroup>

      {validInvites.length > 0 ? (
        <SectionGroup
          header={t('adminDashboard.trialInvites')}
          style={styles.section}
        >
          {validInvites.slice(0, 3).map((invite) => (
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
      ) : null}

      <PaywallSheet
        visible={!!paywallFeature}
        onClose={() => setPaywallFeature(null)}
        triggerFeature={paywallFeature ?? undefined}
        onUpgradeStarted={() => void entitlements.refresh()}
      />
    </Screen>
  )
}

/** A count that asks for something: pending, missing, overdue. */
function CountBadge({ value }: { value: number }) {
  return <Badge label={String(value)} variant="club" />
}

/** Right-aligned count in iOS Settings tone. */
function RowValue({ value }: { value: number }) {
  return (
    <Text variant="body" color="secondary" tabular>
      {value}
    </Text>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md + space.xs,
    paddingVertical: space.sm,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: space['2xs'],
  },
  eyebrow: {
    textTransform: 'uppercase',
  },
  errorWrap: {
    paddingHorizontal: space.md,
  },
  section: {
    paddingHorizontal: space.md,
  },
})
