import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Icon, Text, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'

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
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [statsError, setStatsError] = useState(false)

  const load = useCallback(async () => {
    setStatsError(false)
    const [s, a] = await Promise.all([
      api<AdminStats>(`/clubs/${clubId}/stats`).catch(() => null),
      api<ActivityItem[]>(`/clubs/${clubId}/activity?limit=5`).catch(() => []),
    ])
    if (s) setStats(s)
    else setStatsError(true)
    setActivity(a ?? [])
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  const pending = stats?.pendingJoinRequests ?? 0
  const dues = stats?.duesOutstanding ?? 0
  const rsvpRate = Math.round(stats?.overallRsvpRate ?? 0)

  return (
    <View style={styles.root}>
      {/* Status pills — only flag what needs attention */}
      {(pending > 0 || dues > 0) ? (
        <View style={styles.pillRow}>
          {pending > 0 ? (
            <StatusPill
              tone="warning"
              icon="person.circle"
              label={t('home.admin.pendingPill', {
                defaultValue: '{{count}} join request',
                count: pending,
              })}
              onPress={() => router.push('/pending-requests' as never)}
            />
          ) : null}
          {dues > 0 ? (
            <StatusPill
              tone="info"
              icon="banknote"
              label={t('home.admin.duesPill', {
                defaultValue: '{{count}} dues open',
                count: dues,
              })}
              onPress={() => router.push('/admin-billing' as never)}
            />
          ) : null}
        </View>
      ) : null}

      {/* KPI strip — single dense card with 4 metrics */}
      {statsError && !stats ? (
        <View style={[styles.errorCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary" style={styles.errorBody}>
            {t('home.admin.statsLoadError', { defaultValue: "Couldn't load dashboard stats." })}
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
        <View style={[styles.kpiCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('home.admin.dashboard', { defaultValue: 'Overview' }).toUpperCase()}
          </Text>
          <View style={styles.kpiGrid}>
            <Kpi label={t('home.admin.members', { defaultValue: 'Members' })} value={stats?.memberCount ?? 0} />
            <Kpi label={t('home.admin.teams', { defaultValue: 'Teams' })} value={stats?.teamCount ?? 0} />
            <Kpi
              label={t('home.admin.rsvpRate', { defaultValue: 'RSVP' })}
              value={rsvpRate}
              suffix="%"
            />
            <Kpi
              label={t('home.admin.upcomingEvents', { defaultValue: 'Upcoming' })}
              value={stats?.upcomingEventCount ?? 0}
            />
          </View>
        </View>
      )}

      {/* Quick actions */}
      <View style={styles.actionRow}>
        <ActionTile
          icon="plus.circle.fill"
          label={t('home.admin.createEvent', { defaultValue: 'Create event' })}
          onPress={() => router.push('/create-event' as never)}
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

      {/* Recent activity — flat list, no big section card */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.admin.recentActivity', { defaultValue: 'Recent activity' }).toUpperCase()}
      </Text>
      {activity.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            {t('home.admin.noRecentActivity', { defaultValue: 'No recent activity yet.' })}
          </Text>
        </View>
      ) : (
        <View style={styles.activityList}>
          {activity.map((item) => (
            <View
              key={item.id}
              style={[styles.activityRow, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            >
              <View style={[styles.dot, { backgroundColor: c.primary }]} />
              <Text
                variant="callout"
                color="primary"
                numberOfLines={1}
                style={styles.activityTitle}
              >
                {item.title}
              </Text>
              <Text variant="caption2" color="secondary" tabular>
                {formatRelative(item.occurredAt, i18n.language)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function Kpi({
  label,
  value,
  suffix,
}: {
  label: string
  value: number
  suffix?: string
}) {
  return (
    <View style={styles.kpi}>
      <Text variant="title2" color="primary" weight="semibold" tabular>
        {String(value)}
        {suffix ? <Text variant="title3" color="secondary">{suffix}</Text> : null}
      </Text>
      <Text variant="caption2" color="secondary">
        {label}
      </Text>
    </View>
  )
}

function StatusPill({
  tone,
  icon,
  label,
  onPress,
}: {
  tone: 'warning' | 'info'
  icon: IconName
  label: string
  onPress: () => void
}) {
  const c = useClubColors()
  const bg = tone === 'warning' ? withAlpha(c.warning, 0.12) : withAlpha(c.primary, 0.10)
  const fg = tone === 'warning' ? c.warning : c.primary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Icon name={icon} size={12} color={fg} />
      <Text variant="caption1" weight="semibold" style={[styles.pillText, { color: fg }]}>
        {label}
      </Text>
    </Pressable>
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
        pressed && { opacity: 0.94 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.primary50 }]}>
        <Icon name={icon} size={18} color="tint" />
      </View>
      <Text variant="footnote" color="primary" weight="semibold">
        {label}
      </Text>
    </Pressable>
  )
}

function formatRelative(iso: string, locale: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(delta / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body)
        .split(',')
        .map((p) => p.trim())
        .slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  root: { gap: space.md },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { fontFamily: fonts.label, letterSpacing: 0.2 },

  kpiCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 12,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.md,
  },
  kpi: {
    width: '50%',
    gap: 2,
  },

  actionRow: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    minHeight: 56,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: space.sm,
    marginBottom: -space.xs,
  },
  activityList: { gap: space.xs },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  activityTitle: { flex: 1 },

  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: hairline },
  errorCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'flex-start',
  },
  errorBody: { marginBottom: space.sm },
  retryBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: 999,
    borderWidth: hairline,
    alignSelf: 'flex-start',
  },
})
