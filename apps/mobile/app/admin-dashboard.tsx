import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Share,
  Pressable,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubAggregateStats } from '@anstoss/shared'
import type { TrialInvite } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import {
  Avatar,
  Badge,
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  Text,
} from '../src/components/ui'
import { space, radius, hairline } from '../src/theme/tokens'
import { formatGermanShortDate } from '../src/utils/germanDate'

/**
 * Admin dashboard.
 *
 * Layout, top to bottom:
 *   1. Hero identity strip — club badge + name + role pill + a single
 *      inline stat summary line. One block, no nested cards.
 *   2. Quick actions strip — three prominent pressable chips for the
 *      verbs admins do most often (Invite, Share link, Marketplace).
 *      These were buried in the Growth section before, costing a tap
 *      and visual scanning.
 *   3. Sections (People & access / Teams & events / Finance / Trial
 *      invites) using SectionGroup. Count badges live on rows that
 *      have a number to surface.
 */
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
      <Screen
        header={<ModalHeader title={t('adminDashboard.title')} mode="back" />}
        scroll={false}
        padded={false}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  // Role label: humanise the enum into something the user will read.
  const roleLabel =
    role === MembershipRole.OWNER
      ? t('roles.OWNER', { defaultValue: 'Owner' })
      : role === MembershipRole.ADMIN
        ? t('roles.ADMIN', { defaultValue: 'Admin' })
        : role
          ? t(`roles.${role}`, { defaultValue: role })
          : ''

  return (
    <Screen
      header={<ModalHeader title={t('adminDashboard.title')} />}
      scroll={false}
      padded={false}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero identity strip */}
        <View style={styles.hero}>
          <Avatar size="lg" src={clubBadgeUrl} fallbackText={clubName} />
          <View style={styles.heroText}>
            <Text variant="title1" color="primary" numberOfLines={1}>
              {clubName}
            </Text>
            <View style={styles.heroMetaRow}>
              {roleLabel ? <Badge label={roleLabel} variant="club" /> : null}
              {stats ? (
                <Text variant="footnote" color="secondary">
                  {t('adminDashboard.heroStatSummary', {
                    defaultValue: '{{members}} members · {{teams}} teams',
                    members: stats.memberCount,
                    teams: stats.teamCount,
                  })}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Inline stat strip (RSVP + upcoming) — only when we have data.
            Lives outside the hero block so the hero doesn't get crowded. */}
        {error ? (
          <View style={styles.errorWrap}>
            <ErrorState message={error} onRetry={fetchStats} />
          </View>
        ) : !loading && stats ? (
          <View style={styles.statStrip}>
            <StatPill
              label={t('adminDashboard.upcomingEvents', {
                defaultValue: 'Upcoming',
              })}
              value={String(stats.upcomingEventCount)}
            />
            <StatPill
              label={t('adminDashboard.rsvpRate', { defaultValue: 'RSVP' })}
              value={`${stats.overallRsvpRate}%`}
            />
          </View>
        ) : null}

        {/* Quick actions — promote the most-used verbs out of the Growth
            section to a 3-up strip at the top. */}
        <View style={styles.quickActions}>
          <QuickAction
            icon="person.crop.circle.badge.plus"
            label={t('more.invitePlayers')}
            onPress={() => router.push('/invite')}
            tint={c.primary}
          />
          <QuickAction
            icon="square.and.arrow.up"
            label={t('adminDashboard.shareJoinLink')}
            onPress={shareJoinLink}
            tint={c.primary}
          />
          <QuickAction
            icon="figure.soccer.fill"
            label={t('adminDashboard.transferList')}
            onPress={() => router.push('/transfer-list')}
            tint={c.primary}
          />
        </View>

        {/* People & access */}
        <SectionLabel>{t('adminDashboard.peopleAccess')}</SectionLabel>
        <SectionGroup>
          <ListRow
            left={<Icon name="person.2.fill" size="md" color="tint" />}
            title={t('adminMembers.title')}
            right={
              stats ? <CountBadge value={stats.memberCount} /> : undefined
            }
            showChevron
            onPress={() => router.push('/admin-members')}
          />
          <ListRow
            left={<Icon name="lock.shield.fill" size="md" color="tint" />}
            title={t('more.manageStaff')}
            subtitle={t('more.manageStaffSubtitle')}
            showChevron
            onPress={() => router.push('/club-staff')}
          />
          <ListRow
            left={<Icon name="heart.fill" size="md" color="tint" />}
            title={t('more.manageFamilies')}
            subtitle={t('more.manageFamiliesSubtitle')}
            showChevron
            onPress={() => router.push('/team-families')}
          />
          <ListRow
            left={<Icon name="envelope.fill" size="md" color="tint" />}
            title={t('pendingRequests.title')}
            subtitle={t('pendingRequests.subtitle')}
            showChevron
            onPress={() => router.push('/pending-requests')}
          />
        </SectionGroup>

        {/* Teams & events */}
        <SectionLabel>{t('adminDashboard.teamsEvents')}</SectionLabel>
        <SectionGroup>
          <ListRow
            left={<Icon name="person.2.fill" size="md" color="tint" />}
            title={t('more.manageTeams')}
            right={
              stats ? <CountBadge value={stats.teamCount} /> : undefined
            }
            showChevron
            onPress={() => router.push('/team-management')}
          />
          <ListRow
            left={<Icon name="flag.fill" size="md" color="tint" />}
            title={t('clubStats.title')}
            showChevron
            onPress={() => router.push('/club-stats')}
          />
        </SectionGroup>

        {/* Finance */}
        <SectionLabel>{t('adminDashboard.finance')}</SectionLabel>
        <SectionGroup>
          <ListRow
            left={<Icon name="creditcard.fill" size="md" color="tint" />}
            title={t('adminBilling.title')}
            subtitle={t('adminDashboard.financeSubtitle')}
            showChevron
            onPress={() => router.push('/admin-billing')}
          />
        </SectionGroup>

        {/* Trial invites — only when there's something to show. Defensive
            filter strips rows with deleted club/team relations so a
            single bad row can't crash the screen. */}
        {(() => {
          const validInvites = trialInvites.filter(
            (inv) => inv?.team?.displayName && inv?.club?.name,
          )
          if (validInvites.length === 0) return null
          return (
            <>
              <SectionLabel>{t('adminDashboard.trialInvites')}</SectionLabel>
              <SectionGroup>
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
            </>
          )
        })()}
      </ScrollView>
    </Screen>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionLabelWrap}>
      <Text variant="caption1" color="tertiary" weight="semibold">
        {String(children).toUpperCase()}
      </Text>
    </View>
  )
}

/** Compact pill showing `<value>` next to a `<label>` — used for the
 *  RSVP / Upcoming strip directly under the hero. Tabular nums so the
 *  number column is steady. */
function StatPill({ label, value }: { label: string; value: string }) {
  const c = useClubColors()
  return (
    <View
      style={[
        styles.statPill,
        { backgroundColor: c.surfaceSunken, borderColor: c.borderDefault },
      ]}
    >
      <Text variant="title3" color="primary" tabular>
        {value}
      </Text>
      <Text variant="footnote" color="secondary">
        {label}
      </Text>
    </View>
  )
}

/** Square-ish pressable used in the 3-up quick-actions row. Visual: an
 *  icon-in-tinted-circle + a 1-line label. Tap target is the full chip
 *  via Pressable; no row chevrons (the icon is the affordance). */
function QuickAction({
  icon,
  label,
  onPress,
  tint,
}: {
  icon: string
  label: string
  onPress: () => void
  tint: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: c.surface,
          borderColor: c.borderDefault,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.quickActionIcon,
          { backgroundColor: c.primary50 ?? c.surfaceSunken },
        ]}
      >
        <Icon name={icon} size="md" color={tint} />
      </View>
      <Text
        variant="footnote"
        color="primary"
        weight="medium"
        numberOfLines={2}
        align="center"
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** Right-aligned numeric badge for ListRow. Used so the row title
 *  scans as `Members  126  >` rather than burying the count in a
 *  subtitle. */
function CountBadge({ value }: { value: number }) {
  return (
    <Text variant="footnote" color="secondary" tabular>
      {value}
    </Text>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space['2xl'],
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xs,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: space['2xs'],
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  errorWrap: {
    marginTop: space.sm,
  },
  statStrip: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  statPill: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    justifyContent: 'center',
    gap: 2,
  },
  quickActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.md,
    paddingHorizontal: space.xs,
  },
  quickAction: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 92,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.sm,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabelWrap: {
    marginTop: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.xs,
  },
})
