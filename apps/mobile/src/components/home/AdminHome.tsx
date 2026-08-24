import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ContributionOverview, EventReadiness, RosterOpsSnapshot } from '@anstoss/shared'

type PendingPause = {
  id: string
  memberUserId: string
  memberName: string
  reason: string
  createdAt: string
  weeks: number
  status: 'PENDING' | 'APPROVED' | 'SNOOZED'
}

import { api, ApiError } from '../../api/client'
import { Icon, Text, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'
import { AnnounceSheet } from './AnnounceSheet'
import { EventReadinessCard } from './EventReadinessCard'
import { SeasonStatsCard } from './SeasonStatsCard'
import {
  buildEventReadinessShareText,
  formatEventReadinessWhen,
} from '../../lib/eventReadinessShareText'

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

type NextEvent = {
  id: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string
  location: string | null
  yesCount: number
  maybeCount: number
  noCount: number
  readiness?: EventReadiness | null
}

export type AdminHomeProps = {
  clubId: string
  teamId?: string | null
}

export function AdminHome({ clubId, teamId }: AdminHomeProps) {
  const c = useClubColors()
  const { t, i18n } = useTranslation()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [statsError, setStatsError] = useState(false)
  const [contributions, setContributions] = useState<ContributionOverview | null>(null)
  const [pendingPauses, setPendingPauses] = useState<PendingPause[]>([])
  const [announceVisible, setAnnounceVisible] = useState(false)
  const [pendingCoachCount, setPendingCoachCount] = useState(0)
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null)
  const [nudgingEventId, setNudgingEventId] = useState<string | null>(null)
  const nudgingRef = useRef(false)

  const load = useCallback(async () => {
    setStatsError(false)
    const eventPath = teamId
      ? `/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming&limit=1`
      : `/clubs/${clubId}/events?scope=upcoming&limit=1`

    const [s, a, contrib, pauses, rosterOps, events] = await Promise.all([
      api<AdminStats>(`/clubs/${clubId}/stats`).catch(() => null),
      api<ActivityItem[]>(`/clubs/${clubId}/activity?limit=5`).catch(() => []),
      api<ContributionOverview>(`/clubs/${clubId}/contributions`).catch(() => null),
      api<PendingPause[]>(`/clubs/${clubId}/contributions/pending-pauses`).catch(() => []),
      teamId
        ? api<RosterOpsSnapshot>(`/clubs/${clubId}/teams/${teamId}/roster-ops`).catch(() => null)
        : Promise.resolve(null),
      api<NextEvent[]>(eventPath).catch(() => []),
    ])
    if (s) setStats(s)
    else setStatsError(true)
    setActivity(a ?? [])
    setContributions(contrib)
    setPendingPauses(Array.isArray(pauses) ? pauses : [])
    setPendingCoachCount(rosterOps?.operations?.pendingCoaches?.length ?? 0)
    setNextEvent(Array.isArray(events) && events.length > 0 ? events[0] : null)
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  const pending = stats?.pendingJoinRequests ?? 0
  const dues = stats?.duesOutstanding ?? 0
  const coachPending = pendingCoachCount
  const rsvpRate = Math.round(stats?.overallRsvpRate ?? 0)
  const pausesPending = pendingPauses.filter((p) => p.status === 'PENDING')
  const nextPause = pausesPending[0] ?? null

  const goToNextEvent = useCallback(() => {
    if (!nextEvent) return
    router.push({
      pathname: '/event-detail',
      params: { eventId: nextEvent.id },
    } as never)
  }, [nextEvent])

  const goToNextEventAttendance = useCallback(() => {
    if (!nextEvent) return
    router.push({
      pathname: '/event-detail',
      params: { eventId: nextEvent.id, attendance: '1' },
    } as never)
  }, [nextEvent])

  const shareNextEventReadiness = useCallback(async () => {
    if (!nextEvent?.readiness) return
    try {
      await Share.share({
        message: buildEventReadinessShareText({
          eventTitle: nextEvent.title,
          whenLabel: formatEventReadinessWhen(nextEvent.date, i18n.language),
          readiness: nextEvent.readiness,
          t,
        }),
      })
    } catch {
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        t('home.readiness.shareError', {
          defaultValue: "Couldn't open the share sheet. Try again.",
        }),
      )
    }
  }, [i18n.language, nextEvent, t])

  const nudgeNextEventReadiness = useCallback(async () => {
    if (!nextEvent?.readiness || nudgingRef.current) return
    nudgingRef.current = true
    setNudgingEventId(nextEvent.id)
    try {
      const result = await api<{ sent: number; nextAvailableAt: string }>(
        `/clubs/${clubId}/events/${nextEvent.id}/remind-rsvp`,
        { method: 'POST' },
      )
      Alert.alert(
        t('home.readiness.nudgeSentTitle', { defaultValue: 'Nudge sent' }),
        t('home.readiness.nudgeSentBody', {
          defaultValue: 'Sent RSVP reminders to {{count}} players.',
          count: result.sent,
        }).replace('{{count}}', String(result.sent)),
      )
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        await load()
        const body = err.data as Record<string, unknown> | null | undefined
        const retryAfter = typeof body?.retryAfter === 'string' ? body.retryAfter : null
        Alert.alert(
          t('home.readiness.nudgeCooldownTitle', {
            defaultValue: 'Nudge already sent',
          }),
          retryAfter
            ? t('home.readiness.nudgeCooldownBody', {
                defaultValue: 'Try again after {{time}}.',
                time: new Intl.DateTimeFormat(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(retryAfter)),
              }).replace(
                '{{time}}',
                new Intl.DateTimeFormat(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(retryAfter)),
              )
            : t('event.rsvpReminderCooldownHint', {
                defaultValue: 'Reminders sent',
              }),
        )
        return
      }
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        t('event.rsvpReminderError', {
          defaultValue: 'Could not send reminders. Please try again.',
        }),
      )
    } finally {
      nudgingRef.current = false
      setNudgingEventId(null)
    }
  }, [clubId, i18n.language, load, nextEvent, t])

  const approvePause = (pause: PendingPause) => {
    Alert.alert(
      t('home.admin.pauseTitle', {
        defaultValue: 'Pause dues for {{name}}?',
        name: pause.memberName,
      }),
      t('home.admin.pauseBody', {
        defaultValue:
          '{{reason}} · pauses {{weeks}} weeks of dues. The Kassenwart can resume early from billing.',
        reason: pause.reason,
        weeks: pause.weeks,
      }),
      [
        {
          text: t('home.admin.pauseSnooze', { defaultValue: 'Snooze 7d' }),
          onPress: async () => {
            try {
              await api(`/clubs/${clubId}/contributions/pending-pauses/${pause.id}/snooze`, {
                method: 'POST',
              })
              load()
            } catch {
              /* tolerated */
            }
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('home.admin.pauseApprove', { defaultValue: 'Pause dues' }),
          style: 'default',
          onPress: async () => {
            try {
              await api(`/clubs/${clubId}/contributions/pending-pauses/${pause.id}/approve`, {
                method: 'POST',
              })
              Alert.alert(
                t('home.admin.pauseDoneTitle', { defaultValue: 'Dues paused' }),
                t('home.admin.pauseDoneBody', {
                  defaultValue: "{{name}} won't be billed for {{weeks}} weeks.",
                  name: pause.memberName,
                  weeks: pause.weeks,
                }),
              )
              load()
            } catch {
              Alert.alert(
                t('common.error'),
                t('home.admin.pauseError', {
                  defaultValue: "Couldn't pause dues. Try again.",
                }),
              )
            }
          },
        },
      ],
    )
  }

  return (
    <View style={styles.root}>
      {/* Next Event hero card */}
      {nextEvent ? <NextEventCard event={nextEvent} onPress={goToNextEvent} t={t} c={c} /> : null}

      {nextEvent?.readiness ? (
        <EventReadinessCard
          readiness={nextEvent.readiness}
          eventTitle={nextEvent.title}
          compact
          onPress={goToNextEvent}
          onAttendance={goToNextEventAttendance}
          onShare={shareNextEventReadiness}
          onNudge={nudgeNextEventReadiness}
          nudgePending={nudgingEventId === nextEvent.id}
        />
      ) : null}

      {/* Status pills — only flag what needs attention */}
      {pending > 0 || dues > 0 || coachPending > 0 ? (
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
          {coachPending > 0 ? (
            <StatusPill
              tone="warning"
              icon="person.badge.key"
              label={t('home.admin.coachPendingPill', {
                defaultValue: '{{count}} coach pending',
                count: coachPending,
              })}
              onPress={() => router.push('/(tabs)/roster' as never)}
            />
          ) : null}
        </View>
      ) : null}

      {/* KPI strip — single dense card with 4 metrics */}
      {statsError && !stats ? (
        <View
          style={[styles.errorCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
        >
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
        <View
          style={[styles.kpiCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('home.admin.dashboard', { defaultValue: 'Overview' }).toUpperCase()}
          </Text>
          <View style={styles.kpiGrid}>
            <Kpi
              label={t('home.admin.members', { defaultValue: 'Members' })}
              value={stats?.memberCount ?? 0}
            />
            <Kpi
              label={t('home.admin.teams', { defaultValue: 'Teams' })}
              value={stats?.teamCount ?? 0}
            />
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

      {/* Beitrag radar — live %paid / %overdue / %pending + 1-tap remind. */}
      {contributions && contributions.summary && contributions.summary.assignedMembers > 0 ? (
        <BeitragRadar clubId={clubId} contributions={contributions} onChanged={load} />
      ) : null}

      {/* Auto-pause prompt — surfaces after a long-term injury is logged. */}
      {nextPause ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => approvePause(nextPause)}
          style={({ pressed }) => [
            styles.pauseCard,
            {
              backgroundColor: withAlpha(c.warning, 0.08),
              borderColor: withAlpha(c.warning, 0.4),
            },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View style={[styles.pauseBubble, { backgroundColor: c.warning }]}>
            <Icon name="pause.fill" size={14} color="inverse" />
          </View>
          <View style={{ flex: 1, gap: space['2xs'] }}>
            <Text style={[styles.pauseEyebrow, { color: c.warning }]}>
              {t('home.admin.pauseEyebrow', {
                defaultValue: 'PAUSE DUES?',
              })}
            </Text>
            <Text variant="footnote" color="primary" weight="semibold" numberOfLines={2}>
              {t('home.admin.pauseHeadline', {
                defaultValue: '{{name}} · {{weeks}} weeks out. Tap to pause dues.',
                name: nextPause.memberName,
                weeks: nextPause.weeks,
              })}
            </Text>
          </View>
          <Icon name="chevron.right" size={14} color="tertiary" />
        </Pressable>
      ) : null}

      {/* Quick actions — MVP shortlist. Compliance / Ehrenamt-Stunden /
          Sportgericht / Voice memos are deferred — admins can still reach
          them from the More tab; they don't earn home-screen real estate
          until usage justifies it. The compliance heads-up banner is also
          gone from home for the same reason. */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.admin.quickActions', { defaultValue: 'Quick actions' }).toUpperCase()}
      </Text>
      <View style={styles.actionGrid}>
        <ActionTile
          icon="plus.circle.fill"
          label={t('home.admin.createEvent', { defaultValue: 'Create event' })}
          onPress={() => router.push('/create-event' as never)}
        />
        <ActionTile
          icon="megaphone"
          label={t('home.announce', { defaultValue: 'Announce' })}
          onPress={() => setAnnounceVisible(true)}
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
        <ActionTile
          icon="magnifyingglass"
          label={t('home.admin.scouting', { defaultValue: 'Scouting' })}
          onPress={() => router.push('/scouting' as never)}
        />
        <ActionTile
          icon="flame"
          label={t('home.admin.streaks', { defaultValue: 'Streaks' })}
          onPress={() => router.push('/streaks' as never)}
        />
      </View>

      {/* Season stats widget — only when a team is in context */}
      {teamId ? <SeasonStatsCard clubId={clubId} teamId={teamId} /> : null}

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
              style={[
                styles.activityRow,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
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

      {/* AnnounceSheet — no teamId: admin posts to club-level channel */}
      <AnnounceSheet
        clubId={clubId}
        visible={announceVisible}
        onClose={() => setAnnounceVisible(false)}
      />
    </View>
  )
}

function Kpi({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <View style={styles.kpi}>
      <Text variant="title2" color="primary" weight="semibold" tabular>
        {String(value)}
        {suffix ? (
          <Text variant="title3" color="secondary">
            {suffix}
          </Text>
        ) : null}
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
  const bg = tone === 'warning' ? withAlpha(c.warning, 0.12) : withAlpha(c.primary, 0.1)
  const fg = tone === 'warning' ? c.warning : c.primary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { backgroundColor: bg }, pressed && { opacity: 0.85 }]}
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
        { backgroundColor: c.surfaceSunken },
        pressed && { opacity: 0.94 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.primary50 }]}>
        <Icon name={icon} size={18} color="tint" />
      </View>
      <Text
        variant="footnote"
        color="primary"
        weight="semibold"
        numberOfLines={2}
        style={styles.actionLabel}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function BeitragRadar({
  clubId,
  contributions,
  onChanged,
}: {
  clubId: string
  contributions: ContributionOverview
  onChanged: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const [reminding, setReminding] = useState(false)

  const { summary } = contributions
  const total = Math.max(1, summary.assignedMembers)
  const paid = summary.paidMembers
  const overdue = summary.overdueMembers
  const pending = Math.max(0, total - paid - overdue)
  const paidPct = Math.round((paid / total) * 100)

  const sendReminders = async () => {
    if (overdue === 0 || reminding) return
    setReminding(true)
    try {
      const result = await api<{ requested: number; sent: number; skipped: number }>(
        `/clubs/${clubId}/contributions/reminders`,
        { method: 'POST' },
      )
      Alert.alert(
        t('home.admin.remindersSentTitle', { defaultValue: 'Reminders sent' }),
        t('home.admin.remindersSentBody', {
          defaultValue: '{{count}} member(s) notified.',
          count: result?.sent ?? overdue,
        }),
      )
      onChanged()
    } catch {
      Alert.alert(
        t('common.error'),
        t('home.admin.remindersError', {
          defaultValue: "Couldn't send reminders. Try again.",
        }),
      )
    } finally {
      setReminding(false)
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/admin-billing' as never)}
      style={({ pressed }) => [
        styles.radarCard,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.96 },
      ]}
    >
      <View style={styles.radarHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('home.admin.beitragEyebrow', { defaultValue: 'BEITRAG RADAR' })}
          </Text>
          <Text variant="title3" color="primary" weight="semibold" tabular>
            {paidPct}%
            <Text variant="footnote" color="secondary">
              {' '}
              {t('home.admin.paidLabel', { defaultValue: 'paid' })}
            </Text>
          </Text>
        </View>
        <Icon name="chevron.right" size={16} color="tertiary" />
      </View>

      <View style={[styles.radarBar, { backgroundColor: c.borderDefault }]}>
        {paid > 0 ? (
          <View style={[styles.radarSegment, { flex: paid, backgroundColor: c.success }]} />
        ) : null}
        {pending > 0 ? (
          <View style={[styles.radarSegment, { flex: pending, backgroundColor: c.warning }]} />
        ) : null}
        {overdue > 0 ? (
          <View style={[styles.radarSegment, { flex: overdue, backgroundColor: c.error }]} />
        ) : null}
      </View>

      <View style={styles.radarLegend}>
        <RadarDot
          color={c.success}
          count={paid}
          label={t('home.admin.paidLabel', { defaultValue: 'paid' })}
        />
        <RadarDot
          color={c.warning}
          count={pending}
          label={t('home.admin.pendingLabel', { defaultValue: 'pending' })}
        />
        <RadarDot
          color={c.error}
          count={overdue}
          label={t('home.admin.overdueLabel', { defaultValue: 'overdue' })}
        />
      </View>

      {overdue > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={(e) => {
            ;(e as unknown as { stopPropagation?: () => void }).stopPropagation?.()
            void sendReminders()
          }}
          disabled={reminding}
          style={({ pressed }) => [
            styles.remindBtn,
            { backgroundColor: c.textPrimary },
            pressed && { opacity: 0.9 },
            reminding && { opacity: 0.6 },
          ]}
        >
          <Icon name="bell.fill" size={12} color="inverse" />
          <Text style={[styles.remindBtnText, { color: c.textInverse }]}>
            {reminding
              ? t('common.sending', { defaultValue: 'Sending…' })
              : t('home.admin.remindOverdue', {
                  defaultValue: 'Remind {{count}} overdue',
                  count: overdue,
                })}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  )
}

function RadarDot({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <View style={styles.radarDotRow}>
      <View style={[styles.radarDot, { backgroundColor: color }]} />
      <Text variant="caption2" color="secondary" tabular>
        {String(count)}
      </Text>
      <Text variant="caption2" color="tertiary">
        {label}
      </Text>
    </View>
  )
}

function NextEventCard({
  event,
  onPress,
  t,
  c,
}: {
  event: NextEvent
  onPress: () => void

  t: (key: string, opts?: any) => string
  c: ReturnType<typeof import('../../context/ClubThemeContext').useClubColors>
}) {
  const typeIcon =
    event.type === 'MATCH' ? 'football' : event.type === 'TRAINING' ? 'figure.soccer' : 'calendar'
  const typeLabel =
    event.type === 'MATCH'
      ? t('event.type.match', { defaultValue: 'Match' })
      : event.type === 'TRAINING'
        ? t('event.type.training', { defaultValue: 'Training' })
        : t('event.type.other', { defaultValue: 'Event' })

  const d = new Date(event.date)
  const dateStr = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)

  const total = event.yesCount + event.maybeCount + event.noCount
  const rsvpStr =
    total > 0
      ? t('home.admin.rsvpSummary', {
          defaultValue: '{{yes}} yes · {{maybe}} maybe · {{no}} no',
          yes: event.yesCount,
          maybe: event.maybeCount,
          no: event.noCount,
        })
      : t('home.admin.noRsvps', { defaultValue: 'No responses yet' })

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.nextEventCard,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.94 },
      ]}
    >
      <View style={styles.nextEventHead}>
        <View style={[styles.nextEventIconWrap, { backgroundColor: withAlpha(c.primary, 0.1) }]}>
          <Icon name={typeIcon as import('../ui').IconName} size={18} color="tint" />
        </View>
        <View style={{ flex: 1, gap: space['2xs'] }}>
          <Text style={[styles.nextEventEyebrow, { color: c.textTertiary }]}>
            {typeLabel.toUpperCase()}
          </Text>
          <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
            {event.title}
          </Text>
        </View>
        <Icon name="chevron.right" size={14} color="tertiary" />
      </View>

      <View style={[styles.nextEventDivider, { backgroundColor: c.borderDefault }]} />

      <View style={styles.nextEventMeta}>
        <View style={styles.nextEventMetaItem}>
          <Icon name="calendar" size={13} color="tertiary" />
          <Text variant="caption1" color="secondary">
            {dateStr}
          </Text>
        </View>
        {event.location ? (
          <View style={styles.nextEventMetaItem}>
            <Icon name="mappin" size={13} color="tertiary" />
            <Text variant="caption1" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {event.location}
            </Text>
          </View>
        ) : null}
        <View style={styles.nextEventMetaItem}>
          <Icon name="person.2.fill" size={13} color="tertiary" />
          <Text variant="caption1" color="secondary">
            {rsvpStr}
          </Text>
        </View>
      </View>
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
  if (h.length === 3)
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  root: { gap: space.lg },

  // Next event hero card
  nextEventCard: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  nextEventHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
  },
  nextEventIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextEventEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  nextEventDivider: { height: hairline, marginHorizontal: space.md },
  nextEventMeta: {
    padding: space.md,
    gap: space.xs + 2,
  },
  nextEventMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 1,
    borderRadius: radius.full,
  },
  pillText: { fontFamily: fonts.label, letterSpacing: 0.3 },

  kpiCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.sm,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.md,
  },
  kpi: {
    width: '50%',
    gap: space['2xs'],
  },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actionLabel: { textAlign: 'center' },
  action: {
    width: '31.5%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    minHeight: 82,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: space.xs,
    marginBottom: -space.xs,
  },
  activityList: { gap: space.sm },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  dot: { width: 6, height: 6, borderRadius: radius.full },
  activityTitle: { flex: 1 },

  empty: {
    padding: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },

  // Beitrag radar — admin home tile with segment bar + remind CTA
  radarCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.sm,
  },
  radarHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  radarBar: { height: 6, borderRadius: radius.full, overflow: 'hidden', flexDirection: 'row' },
  radarSegment: { height: '100%' },
  radarLegend: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  radarDotRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  radarDot: { width: 6, height: 6, borderRadius: radius.full },
  remindBtn: {
    marginTop: space['2xs'],
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs + 2,
  },
  remindBtnText: {
    fontFamily: fonts.label,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Pending dues-pause prompt + compliance heads-up share this layout.
  pauseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  pauseBubble: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  errorCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'flex-start',
  },
  errorBody: { marginBottom: space.sm },
  retryBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignSelf: 'flex-start',
  },
})
