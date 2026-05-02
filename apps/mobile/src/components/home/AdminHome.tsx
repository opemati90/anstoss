/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { SPACING_SM, SPACING_XS, SPACING_MD } from '../../theme/spacing';
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Icon, Text, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'
import { ActionCard } from './ActionCard'

type AdminStats = {
  memberCount: number
  teamCount: number
  upcomingEventCount: number
  overallRsvpRate: number
  pendingJoinRequests?: number
  duesOutstanding?: number
}

type ActivityItem = {
  id: string
  kind: string
  title: string
  occurredAt: string
}

export type AdminHomeProps = {
  clubId: string
}

export function AdminHome({ clubId }: AdminHomeProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [statsError, setStatsError] = useState(false)

  const load = useCallback(async () => {
    setStatsError(false)
    const [s, a] = await Promise.all([
      api<AdminStats>(`/clubs/${clubId}/stats`).catch(() => null),
      api<ActivityItem[]>(`/clubs/${clubId}/activity?limit=5`).catch(() => []),
    ])
    if (s) {
      setStats(s)
    } else {
      setStatsError(true)
    }
    setActivity(a ?? [])
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  const pending = stats?.pendingJoinRequests ?? 0

  return (
    <View style={styles.root}>
      {pending > 0 ? (
        <ActionCard
          eyebrow={t('home.admin.actionNeeded', { defaultValue: 'Action needed' })}
          title={t('home.admin.pendingRequestsTitle', {
            defaultValue: '{{count}} pending join request',
            count: pending,
          })}
          body={t('home.admin.pendingRequestsBody', {
            defaultValue: "Review who's asking to join your club and approve or decline.",
          })}
          icon="person.circle"
          onPress={() => router.push('/pending-requests')}
        />
      ) : null}

      <Text variant="headline" color="primary" weight="semibold" style={pending > 0 ? styles.section : undefined}>
        {t('home.admin.dashboard', { defaultValue: 'Dashboard' })}
      </Text>
      {statsError && !stats ? (
        <View style={[styles.errorCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary" style={{ marginBottom: SPACING_SM }}>
            {t('home.admin.statsLoadError', {
              defaultValue: "Couldn't load dashboard stats.",
            })}
          </Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.retryBtn,
              { borderColor: c.borderDefault },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text variant="footnote" weight="semibold" color="primary">
              {t('home.admin.retry', { defaultValue: 'Try again' })}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.statsRow}>
          <StatTile
            label={t('home.admin.members', { defaultValue: 'Members' })}
            value={stats?.memberCount ?? 0}
          />
          <StatTile
            label={t('home.admin.pending', { defaultValue: 'Pending' })}
            value={stats?.pendingJoinRequests ?? 0}
          />
          <StatTile
            label={t('home.admin.duesOutstanding', { defaultValue: 'Dues outstanding' })}
            value={stats?.duesOutstanding ?? 0}
          />
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        {t('home.admin.recentActivity', { defaultValue: 'Recent activity' })}
      </Text>
      {activity.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            {t('home.admin.noRecentActivity', { defaultValue: 'No recent activity yet.' })}
          </Text>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {activity.map((item) => (
            <View
              key={item.id}
              style={[
                styles.activityRow,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: c.primary }]} />
              <Text
                variant="callout"
                color="primary"
                weight="semibold"
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {item.title}
              </Text>
              <Text variant="caption2" color="secondary" tabular>
                {formatRelative(item.occurredAt)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        {t('home.admin.quickActions', { defaultValue: 'Quick actions' })}
      </Text>
      <View style={styles.actionRow}>
        <ActionTile
          icon="plus.circle.fill"
          label={t('home.admin.createEvent', { defaultValue: 'Create event' })}
          onPress={() => router.push('/create-event')}
        />
        <ActionTile
          icon="person.circle.fill"
          label={t('home.admin.invite', { defaultValue: 'Invite' })}
          onPress={() =>
            router.push({
              pathname: '/invite',
              params: { returnTo: '/(tabs)' },
            } as never)
          }
        />
      </View>
    </View>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  const c = useClubColors()
  return (
    <View style={[styles.statTile, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="dataLarge" color="primary" tabular>
        {String(value)}
      </Text>
      <Text variant="footnote" color="secondary" numberOfLines={2}>
        {label}
      </Text>
    </View>
  )
}

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: IconName
  label: string
  onPress: () => void
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.primary50 }]}>
        <Icon name={icon} size={20} color="tint" />
      </View>
      <Text variant="footnote" color="primary" weight="semibold">
        {label}
      </Text>
    </Pressable>
  )
}

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  const hours = Math.round(delta / 3600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  statsRow: { flexDirection: 'row', gap: space.sm },
  statTile: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  dot: { width: SPACING_SM, height: SPACING_SM, borderRadius: SPACING_XS },
  actionRow: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 64,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: SPACING_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  errorCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  retryBtn: {
    paddingHorizontal: space.md,
    paddingVertical: SPACING_XS,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
})