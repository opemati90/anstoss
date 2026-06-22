/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type {
  EventFeedItem,
  EventReadiness,
  ImportedFixture,
  RosterOpsSnapshot,
} from '@anstoss/shared'
import { api, ApiError } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'
import { AnnounceSheet } from './AnnounceSheet'
import { EventReadinessCard } from './EventReadinessCard'
import { SeasonStatsCard } from './SeasonStatsCard'
import {
  buildEventReadinessShareText,
  formatEventReadinessWhen,
} from '../../lib/eventReadinessShareText'
import { findFixtureForEvent } from '../../lib/matchFixtureLink'

type EventItem = {
  id: string
  type: string
  title: string
  date: string
  location?: string | null
  yesCount?: number
  maybeCount?: number
  noCount?: number
  team?: { id: string; name: string } | null
  readiness?: EventReadiness | null
}

type RosterSnapshot = { active: number; trial: number; target: number }

export type CoachHomeProps = {
  clubId: string
  teamId: string | null
}

export function CoachHome({ clubId, teamId }: CoachHomeProps) {
  const c = useClubColors()
  const { t, i18n } = useTranslation()
  const [nextMatch, setNextMatch] = useState<EventItem | null>(null)
  const [nextMatchFixture, setNextMatchFixture] = useState<ImportedFixture | null>(null)
  const [thisWeek, setThisWeek] = useState<EventItem[]>([])
  const [hasUpcomingEvents, setHasUpcomingEvents] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [roster, setRoster] = useState<RosterSnapshot | null>(null)
  const [announceVisible, setAnnounceVisible] = useState(false)
  const [nudgingEventId, setNudgingEventId] = useState<string | null>(null)
  const nudgingRef = useRef(false)

  const load = useCallback(async () => {
    if (!teamId) return
    const base = `/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming`
    const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const [upcoming, ops, fixtures] = await Promise.all([
      api<EventFeedItem[]>(`${base}&limit=10`).catch(() => [] as EventFeedItem[]),
      api<RosterOpsSnapshot>(
        `/clubs/${clubId}/teams/${teamId}/roster-ops`,
      ).catch(() => null),
      api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=upcoming&limit=10`).catch(
        () => [] as ImportedFixture[],
      ),
    ])
    const upcomingEvents = upcoming ?? []
    const weekEvents = upcomingEvents.filter(
      (e) => new Date(e.date) <= new Date(weekEnd),
    )
    const next = upcomingEvents.find((event) => event.type === 'MATCH') ?? null
    setNextMatch(next)
    setNextMatchFixture(
      findFixtureForEvent(
        next ? { ...next, team: next.team ?? { id: teamId } } : null,
        fixtures,
      ),
    )
    setThisWeek(weekEvents)
    setHasUpcomingEvents(upcomingEvents.length > 0)
    setEventsLoaded(true)
    const hasSnapshotShape =
      ops &&
      typeof ops === 'object' &&
      Array.isArray((ops as RosterOpsSnapshot).squad) &&
      (ops as RosterOpsSnapshot).operations &&
      (ops as RosterOpsSnapshot).team
    setRoster(
      hasSnapshotShape
        ? {
            active: (ops as RosterOpsSnapshot).squad.length,
            trial: (ops as RosterOpsSnapshot).operations.trials.length,
            target: (ops as RosterOpsSnapshot).team.squadTarget,
          }
        : null,
    )
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  const squadSize = (roster?.active ?? 0) + (roster?.trial ?? 0)
  const target = roster?.target ?? 13
  const rosterGap = roster ? Math.max(0, target - squadSize) : 0
  const squadPct = roster ? Math.min(1, squadSize / Math.max(1, target)) : 0

  const yes = nextMatch?.yesCount ?? 0
  const maybe = nextMatch?.maybeCount ?? 0
  const no = nextMatch?.noCount ?? 0
  const responded = yes + maybe + no
  const rosterPending = Math.max(0, squadSize - responded)
  const eventPending = nextMatch?.readiness?.metrics.pendingCount ?? rosterPending
  const rsvpTotal = Math.max(1, responded + eventPending)
  const yesPct = yes / rsvpTotal
  const maybePct = maybe / rsvpTotal
  const noPct = no / rsvpTotal

  const coachAction = getCoachActionState({
    eventsLoaded,
    hasUpcomingEvents,
    nextMatch,
    rosterGap,
    pending: eventPending,
    teamId,
  })

  const goToMatch = useCallback(() => {
    if (!nextMatch) return
    router.push({
      pathname: '/event-detail',
      params: { eventId: nextMatch.id },
    } as never)
  }, [nextMatch])

  const goToMatchAttendance = useCallback(() => {
    if (!nextMatch) return
    router.push({
      pathname: '/event-detail',
      params: { eventId: nextMatch.id, attendance: '1' },
    } as never)
  }, [nextMatch])

  const goToCreateEvent = useCallback(() => {
    router.push('/create-event' as never)
  }, [])

  const goToRoster = useCallback(() => {
    router.push('/(tabs)/roster' as never)
  }, [])

  const goToLineupBuilder = useCallback(() => {
    if (!teamId) return
    router.push({
      pathname: '/lineup-builder',
      params: nextMatchFixture
        ? { teamId, fixtureId: nextMatchFixture.id }
        : { teamId },
    } as never)
  }, [nextMatchFixture, teamId])

  const shareNextMatchReadiness = useCallback(async () => {
    if (!nextMatch?.readiness) return
    try {
      await Share.share({
        message: buildEventReadinessShareText({
          eventTitle: nextMatch.title,
          whenLabel: formatEventReadinessWhen(nextMatch.date, i18n.language),
          readiness: nextMatch.readiness,
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
  }, [i18n.language, nextMatch, t])

  const nudgeNextMatchReadiness = useCallback(async () => {
    if (!nextMatch?.readiness || nudgingRef.current) return
    nudgingRef.current = true
    setNudgingEventId(nextMatch.id)
    try {
      const result = await api<{ sent: number; nextAvailableAt: string }>(
        `/clubs/${clubId}/events/${nextMatch.id}/remind-rsvp`,
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
        const retryAfter =
          typeof body?.retryAfter === 'string' ? body.retryAfter : null
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
              }).replace('{{time}}', new Intl.DateTimeFormat(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(retryAfter)))
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
  }, [clubId, i18n.language, load, nextMatch, t])

  const handleCoachAction = useCallback(() => {
    if (!coachAction) return
    if (coachAction.target === 'create-event') {
      goToCreateEvent()
      return
    }
    if (coachAction.target === 'roster') {
      goToRoster()
      return
    }
    if (coachAction.target === 'nudge') {
      void nudgeNextMatchReadiness()
      return
    }
    if (coachAction.target === 'attendance') {
      goToMatchAttendance()
      return
    }
    if (coachAction.target === 'lineup') {
      goToLineupBuilder()
      return
    }
    goToMatch()
  }, [
    coachAction,
    goToCreateEvent,
    goToLineupBuilder,
    goToMatch,
    goToMatchAttendance,
    goToRoster,
    nudgeNextMatchReadiness,
  ])

  return (
    <View style={styles.root}>
      {coachAction ? (
        <View
          style={[
            styles.commandPanel,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <View style={styles.commandHeader}>
            <View
              style={[
                styles.commandIcon,
                { backgroundColor: withAlpha(c.primary, 0.12) },
              ]}
            >
              <Icon name={coachAction.icon} size={16} color="tint" />
            </View>
            <Text style={[styles.commandEyebrow, { color: c.textTertiary }]}>
              {t('home.coach.nextActionEyebrow', { defaultValue: 'COACH NEXT ACTION' })}
            </Text>
          </View>
          <Text
            variant="title3"
            weight="semibold"
            color="primary"
            numberOfLines={2}
            style={styles.commandTitle}
          >
            {t(coachAction.titleKey, coachAction.titleOptions)}
          </Text>
          <Pressable
            onPress={handleCoachAction}
            accessibilityRole="button"
            accessibilityLabel={t(coachAction.ctaKey, coachAction.ctaOptions)}
            accessibilityState={{
              disabled: coachAction.target === 'nudge' && nudgingEventId === nextMatch?.id,
            }}
            disabled={coachAction.target === 'nudge' && nudgingEventId === nextMatch?.id}
            style={({ pressed }) => [
              styles.commandButton,
              { backgroundColor: c.primary },
              pressed && { opacity: 0.86 },
              coachAction.target === 'nudge' &&
                nudgingEventId === nextMatch?.id && { opacity: 0.65 },
            ]}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.commandButtonText, { color: c.textInverse }]}
            >
              {coachAction.target === 'nudge' && nudgingEventId === nextMatch?.id
                ? t('home.readiness.nudging', { defaultValue: 'Sending...' })
                : t(coachAction.ctaKey, coachAction.ctaOptions)}
            </Text>
            <Icon name="chevron.right" size={14} color="inverse" />
          </Pressable>
        </View>
      ) : null}

      {/* Status pills — collapse to nothing when there's nothing to flag */}
      {(rosterGap > 0 || (nextMatch && eventPending > 0)) && teamId ? (
        <View style={styles.pillRow}>
          {rosterGap > 0 ? (
            <StatusPill
              tone="warning"
              icon="person.2.fill"
              label={t('home.coach.rosterPill', {
                defaultValue:
                  rosterGap === 1 ? '{{count}} spot open' : '{{count}} spots open',
                count: rosterGap,
              })}
              onPress={goToRoster}
            />
          ) : null}
          {nextMatch && eventPending > 0 ? (
            <StatusPill
              tone="info"
              icon="clock"
              label={t('home.coach.pendingPill', {
                defaultValue:
                  eventPending === 1 ? '{{count}} awaiting RSVP' : '{{count}} awaiting RSVP',
                count: eventPending,
              })}
              onPress={goToMatch}
            />
          ) : null}
        </View>
      ) : null}

      {nextMatch?.readiness ? (
        <EventReadinessCard
          readiness={nextMatch.readiness}
          eventTitle={nextMatch.title}
          onPress={goToMatch}
          onAttendance={goToMatchAttendance}
          onShare={shareNextMatchReadiness}
          onNudge={nudgeNextMatchReadiness}
          nudgePending={nudgingEventId === nextMatch.id}
        />
      ) : null}

      {/* Hero match card — single source of truth for the next fixture */}
      {nextMatch ? (
        <Pressable
          onPress={goToMatch}
          accessibilityRole="button"
          accessibilityLabel={nextMatch.title}
          style={({ pressed }) => [
            styles.matchCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.96 },
          ]}
        >
          <Text style={[styles.matchEyebrow, { color: c.textTertiary }]}>
            {formatEyebrow(nextMatch.date, i18n.language)}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.matchTitle}>
            {nextMatch.title}
          </Text>
          {nextMatch.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle" size={14} color="tertiary" />
              <Text variant="footnote" color="secondary" numberOfLines={1}>
                {nextMatch.location}
              </Text>
            </View>
          ) : null}

          {responded + eventPending > 0 ? (
            <View style={styles.rsvpBlock}>
              <View style={[styles.rsvpBar, { backgroundColor: c.borderDefault }]}>
                <View
                  style={[styles.rsvpSegment, { flex: yesPct, backgroundColor: c.success }]}
                />
                <View
                  style={[styles.rsvpSegment, { flex: maybePct, backgroundColor: c.warning }]}
                />
                <View
                  style={[styles.rsvpSegment, { flex: noPct, backgroundColor: c.error }]}
                />
              </View>
              <View style={styles.rsvpLegend}>
                <RsvpDot color={c.success} count={yes} />
                <RsvpDot color={c.warning} count={maybe} />
                <RsvpDot color={c.error} count={no} />
                {eventPending > 0 ? (
                  <Text variant="caption2" color="secondary" style={styles.pendingLabel}>
                    {t('home.coach.pendingShort', {
                      defaultValue:
                        eventPending === 1 ? '{{count}} pending' : '{{count}} pending',
                      count: eventPending,
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {coachAction?.target === 'lineup' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.coach.buildLineup', {
                defaultValue: 'Build lineup',
              })}
              onPress={(e) => {
                ;(e as unknown as { stopPropagation?: () => void } | undefined)?.stopPropagation?.()
                goToLineupBuilder()
              }}
              style={({ pressed }) => [
                styles.lineupCta,
                { borderColor: c.borderStrong, backgroundColor: c.surface },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon name="sparkles" size={12} color={c.textPrimary} />
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.lineupCtaText, { color: c.textPrimary }]}
              >
                {t('home.coach.buildLineup', { defaultValue: 'Build lineup' })}
              </Text>
              <Icon name="chevron.right" size={12} color={c.textTertiary} />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.coach.viewMotmArchive', {
              defaultValue: 'MOTM archive',
            })}
            onPress={(e) => {
              ;(e as unknown as { stopPropagation?: () => void } | undefined)?.stopPropagation?.()
              router.push('/motm-archive' as never)
            }}
            style={({ pressed }) => [
              styles.lineupCta,
              { borderColor: c.borderStrong, backgroundColor: c.surface },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Icon name="star.fill" size={12} color={c.textPrimary} />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.lineupCtaText, { color: c.textPrimary }]}
            >
              {t('home.coach.viewMotmArchive', {
                defaultValue: 'MOTM archive →',
              })}
            </Text>
            <Icon name="chevron.right" size={12} color={c.textTertiary} />
          </Pressable>
        </Pressable>
      ) : null}

      {/* Roster summary — compact KPI strip with progress */}
      {roster ? (
        <Pressable
          accessibilityRole="button"
          onPress={goToRoster}
          style={({ pressed }) => [
            styles.squadCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.96 },
          ]}
        >
          <View style={styles.squadHeader}>
            <View style={styles.squadHeaderLeft}>
              <Text variant="caption1" color="secondary" style={styles.squadLabel}>
                {t('home.coach.squadLabel', { defaultValue: 'SQUAD' })}
              </Text>
              <Text variant="title3" color="primary" weight="semibold">
                {t('home.coach.squadCount', {
                  defaultValue: '{{have}} of {{target}}',
                  have: squadSize,
                  target,
                })}
              </Text>
            </View>
            <Icon name="chevron.right" size={16} color="tertiary" />
          </View>
          <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${squadPct * 100}%`, backgroundColor: c.primary },
              ]}
            />
          </View>
          <View style={styles.squadStats}>
            <SquadStat
              label={t('home.coach.rosterActive', { defaultValue: 'Active' })}
              value={roster.active}
            />
            <SquadStat
              label={t('home.coach.rosterTrial', { defaultValue: 'Trial' })}
              value={roster.trial}
            />
            <SquadStat
              label={t('home.coach.rosterOpen', { defaultValue: 'Open' })}
              value={rosterGap}
              dim={rosterGap === 0}
            />
          </View>
        </Pressable>
      ) : null}

      {/* This week — compact rows, day chip on the right */}
      <Text variant="footnote" color="secondary" style={styles.sectionLabel}>
        {t('home.coach.thisWeek', { defaultValue: 'This week' }).toUpperCase()}
      </Text>
      {thisWeek.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">
            {t('home.coach.nothingScheduled', { defaultValue: 'Nothing scheduled yet.' })}
          </Text>
        </View>
      ) : (
        <View style={styles.weekList}>
          {thisWeek.map((ev) => (
            <Pressable
              key={ev.id}
              onPress={() =>
                router.push({
                  pathname: '/event-detail',
                  params: { eventId: ev.id },
                } as never)
              }
              accessibilityRole="button"
              accessibilityLabel={ev.title}
              style={({ pressed }) => [
                styles.weekRow,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
                pressed && { opacity: 0.96 },
              ]}
            >
              <View
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: c.surfaceSunken ?? c.background,
                    borderColor: c.borderDefault,
                  },
                ]}
              >
                <Text variant="caption2" color="secondary" style={styles.dayChipDow}>
                  {formatWeekday(ev.date, i18n.language).toUpperCase()}
                </Text>
                <Text variant="callout" color="primary" weight="semibold" tabular>
                  {String(new Date(ev.date).getDate()).padStart(2, '0')}
                </Text>
              </View>
              <View style={styles.weekRowBody}>
                <Text variant="callout" color="primary" numberOfLines={1}>
                  {ev.title}
                </Text>
                <Text variant="caption2" color="secondary">
                  {formatTime(ev.date, i18n.language)}
                  {ev.location ? ` · ${ev.location}` : ''}
                </Text>
              </View>
              <Icon name="chevron.right" size={14} color="tertiary" />
            </Pressable>
          ))}
        </View>
      )}

      {/* Quick actions grid */}
      <View style={styles.actionRow}>
        <ActionTile
          icon="plus.circle.fill"
          label={t('home.coach.createEvent', { defaultValue: 'Create event' })}
          onPress={goToCreateEvent}
        />
        {/* Only show Announce when a team is selected — posting to
            /teams//channels would 404 without a valid teamId. */}
        {teamId ? (
          <ActionTile
            icon="megaphone"
            label={t('home.announce', { defaultValue: 'Announce' })}
            onPress={() => setAnnounceVisible(true)}
          />
        ) : null}
      </View>
      <View style={styles.actionRow}>
        <ActionTile
          icon="person.circle.fill"
          label={t('home.coach.invite', { defaultValue: 'Invite' })}
          onPress={() =>
            router.push({
              pathname: '/invite',
              params: { returnTo: '/(tabs)' },
            } as never)
          }
        />
        <ActionTile
          icon="figure.walk"
          label={t('home.coach.scouting', { defaultValue: 'Scouting' })}
          onPress={() => router.push('/scouting' as never)}
        />
      </View>

      {/* Season stats widget — hidden when teamId is unknown or no results */}
      {teamId ? (
        <SeasonStatsCard clubId={clubId} teamId={teamId} />
      ) : null}

      {/* Cold-start nudge — only shown after events have loaded to avoid false flash */}
      {eventsLoaded && !hasUpcomingEvents && !nextMatch && thisWeek.length === 0 ? (
        <View
          style={[
            styles.noEventsNudge,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <Text variant="footnote" color="secondary" style={styles.noEventsNudgeText}>
            {t('home.coach.noEvents', {
              defaultValue:
                "No upcoming events yet. Tap 'Create event' to schedule your first training or match.",
            })}
          </Text>
        </View>
      ) : null}

      {/* AnnounceSheet — only mounted when teamId is known */}
      {teamId ? (
        <AnnounceSheet
          clubId={clubId}
          teamId={teamId}
          visible={announceVisible}
          onClose={() => setAnnounceVisible(false)}
        />
      ) : null}
    </View>
  )
}

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: string
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

function StatusPill({
  tone,
  icon,
  label,
  onPress,
}: {
  tone: 'warning' | 'info'
  icon: string
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

function RsvpDot({ color, count }: { color: string; count: number }) {
  return (
    <View style={styles.rsvpDotRow}>
      <View style={[styles.rsvpDot, { backgroundColor: color }]} />
      <Text variant="caption2" color="secondary" tabular>
        {String(count)}
      </Text>
    </View>
  )
}

function SquadStat({
  label,
  value,
  dim,
}: {
  label: string
  value: number
  dim?: boolean
}) {
  return (
    <View style={styles.squadStat}>
      <Text
        variant="title3"
        weight="semibold"
        color={dim ? 'tertiary' : 'primary'}
        tabular
      >
        {String(value)}
      </Text>
      <Text variant="caption2" color="secondary">
        {label}
      </Text>
    </View>
  )
}

function withAlpha(hex: string, alpha: number): string {
  // Tolerant alpha helper: works for #RGB, #RRGGBB, and rgb()/rgba() inputs.
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
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatWeekday(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short' })
}

function formatEyebrow(iso: string, locale: string): string {
  const d = new Date(iso)
  const dow = d.toLocaleDateString(locale, { weekday: 'short' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return `${dow.toUpperCase()} · ${time}`
}

type CoachActionTarget =
  | 'create-event'
  | 'roster'
  | 'nudge'
  | 'attendance'
  | 'lineup'
  | 'event'

type CoachActionState = {
  target: CoachActionTarget
  icon: string
  titleKey: string
  titleOptions: Record<string, unknown>
  bodyKey: string
  bodyOptions: Record<string, unknown>
  ctaKey: string
  ctaOptions: Record<string, unknown>
}

function getCoachActionState({
  eventsLoaded,
  hasUpcomingEvents,
  nextMatch,
  rosterGap,
  pending,
  teamId,
}: {
  eventsLoaded: boolean
  hasUpcomingEvents: boolean
  nextMatch: EventItem | null
  rosterGap: number
  pending: number
  teamId: string | null
}): CoachActionState | null {
  if (!teamId || !eventsLoaded) return null

  if (!nextMatch) {
    if (hasUpcomingEvents) {
      return {
        target: 'create-event',
        icon: 'calendar.fill',
        titleKey: 'home.coach.actionNoMatchTitle',
        titleOptions: { defaultValue: 'Schedule the next match' },
        bodyKey: 'home.coach.actionNoMatchBody',
        bodyOptions: {
          defaultValue: 'Training is on the calendar, but no match is planned yet.',
        },
        ctaKey: 'home.coach.actionNoMatchCta',
        ctaOptions: { defaultValue: 'Schedule match' },
      }
    }

    return {
      target: 'create-event',
      icon: 'calendar.fill',
      titleKey: 'home.coach.actionCreateTitle',
      titleOptions: { defaultValue: 'Create the next team event' },
      bodyKey: 'home.coach.actionCreateBody',
      bodyOptions: {
        defaultValue: 'Nothing is scheduled yet. Add training or a match so players know what is next.',
      },
      ctaKey: 'home.coach.actionCreateCta',
      ctaOptions: { defaultValue: 'Create event' },
    }
  }

  if (hasCoachAttendanceAction(nextMatch.readiness)) {
    return {
      target: 'attendance',
      icon: 'checkmark.circle.fill',
      titleKey: 'home.coach.actionAttendanceTitle',
      titleOptions: { defaultValue: 'Run arrivals for {{title}}', title: nextMatch.title },
      bodyKey: 'home.coach.actionAttendanceBody',
      bodyOptions: {
        defaultValue: 'Kickoff is close. Open attendance to confirm check-ins and no-shows.',
      },
      ctaKey: 'home.coach.actionAttendanceCta',
      ctaOptions: { defaultValue: 'Open attendance' },
    }
  }

  if (nextMatch.readiness?.nudge?.recommended) {
    const count = nextMatch.readiness.nudge.targetCount
    return {
      target: 'nudge',
      icon: 'bell.fill',
      titleKey: 'home.coach.actionNudgeTitle',
      titleOptions: {
        defaultValue:
          count === 1
            ? 'Chase {{count}} missing reply'
            : 'Chase {{count}} missing replies',
        count,
      },
      bodyKey: 'home.coach.actionNudgeBody',
      bodyOptions: {
        defaultValue: 'Send an RSVP nudge before you lock the squad and lineup.',
      },
      ctaKey: 'home.coach.actionNudgeCta',
      ctaOptions: { defaultValue: 'Send nudge' },
    }
  }

  if (rosterGap > 0) {
    return {
      target: 'roster',
      icon: 'person.2.fill',
      titleKey: 'home.coach.actionRosterTitle',
      titleOptions: {
        defaultValue:
          rosterGap === 1
            ? 'Fill {{count}} squad spot'
            : 'Fill {{count}} squad spots',
        count: rosterGap,
      },
      bodyKey: 'home.coach.actionRosterBody',
      bodyOptions: {
        defaultValue: 'You are short of the target squad size. Open the roster to invite or review players.',
      },
      ctaKey: 'home.coach.actionRosterCta',
      ctaOptions: { defaultValue: 'Open squad' },
    }
  }

  if (hasCoachSetupBlocker(nextMatch.readiness)) {
    return {
      target: 'roster',
      icon: 'person.2.fill',
      titleKey: 'home.coach.actionSetupTitle',
      titleOptions: { defaultValue: 'Set up the squad for {{title}}', title: nextMatch.title },
      bodyKey: 'home.coach.actionSetupBody',
      bodyOptions: {
        defaultValue: 'Readiness needs squad setup before lineup work can start.',
      },
      ctaKey: 'home.coach.actionRosterCta',
      ctaOptions: { defaultValue: 'Open squad' },
    }
  }

  if (hasCoachReviewBlocker(nextMatch.readiness)) {
    return {
      target: 'event',
      icon: 'exclamationmark.triangle.fill',
      titleKey: 'home.coach.actionReviewTitle',
      titleOptions: { defaultValue: 'Review blockers for {{title}}', title: nextMatch.title },
      bodyKey: 'home.coach.actionReviewBody',
      bodyOptions: {
        defaultValue: 'Readiness is at risk. Open the event before lineup work.',
      },
      ctaKey: 'home.coach.actionPendingCta',
      ctaOptions: { defaultValue: 'Open event' },
    }
  }

  if (pending > 0) {
    return {
      target: 'event',
      icon: 'clock',
      titleKey: 'home.coach.actionPendingTitle',
      titleOptions: {
        defaultValue:
          pending === 1
            ? 'Review {{count}} pending reply'
            : 'Review {{count}} pending replies',
        count: pending,
      },
      bodyKey: 'home.coach.actionPendingBody',
      bodyOptions: {
        defaultValue: 'Open the event and resolve availability before lineup work.',
      },
      ctaKey: 'home.coach.actionPendingCta',
      ctaOptions: { defaultValue: 'Open event' },
    }
  }

  return {
    target: 'lineup',
    icon: 'sparkles',
    titleKey: 'home.coach.actionLineupTitle',
    titleOptions: { defaultValue: 'Build the lineup for {{title}}', title: nextMatch.title },
    bodyKey: 'home.coach.actionLineupBody',
    bodyOptions: {
      defaultValue: 'RSVPs are in shape. Move from availability to selection.',
    },
    ctaKey: 'home.coach.actionLineupCta',
    ctaOptions: { defaultValue: 'Build lineup' },
  }
}

function hasCoachAttendanceAction(readiness: EventReadiness | null | undefined): boolean {
  if (!readiness) return false
  return (
    readiness.signals.some(
      (signal) => signal.key === 'check_in_gap' || signal.key === 'no_show_risk',
    ) ||
    readiness.briefing?.key === 'check_in_gap' ||
    readiness.briefing?.key === 'no_show_review' ||
    readiness.briefing?.key === 'event_started'
  )
}

function hasCoachSetupBlocker(readiness: EventReadiness | null | undefined): boolean {
  if (!readiness) return false
  return (
    readiness.status === 'NEEDS_SETUP' ||
    readiness.signals.some((signal) => signal.key === 'no_squad')
  )
}

function hasCoachReviewBlocker(readiness: EventReadiness | null | undefined): boolean {
  if (!readiness || readiness.status === 'READY') return false
  return (
    readiness.status === 'AT_RISK' ||
    readiness.signals.some((signal) =>
      [
        'low_confirmations',
        'low_response_rate',
        'availability_risks',
        'injury_risks',
      ].includes(signal.key),
    )
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  commandPanel: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    gap: space.sm,
  },
  commandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  commandIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  commandTitle: {
    letterSpacing: -0.2,
  },
  commandButton: {
    minHeight: 44,
    marginTop: space['2xs'],
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  commandButtonText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
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

  matchCard: {
    padding: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: space.sm,
  },
  matchEyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  matchTitle: { letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  rsvpBlock: { gap: 8, marginTop: space.xs },
  rsvpBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  rsvpSegment: { height: '100%' },
  rsvpLegend: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rsvpDotRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rsvpDot: { width: 6, height: 6, borderRadius: 3 },
  pendingLabel: { marginLeft: 'auto' },

  lineupCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  lineupCtaText: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  squadCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 12,
  },
  squadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  squadHeaderLeft: { gap: 2 },
  squadLabel: {
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  squadStats: { flexDirection: 'row', gap: space.lg, marginTop: 4 },
  squadStat: { gap: 2 },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: space.sm,
    marginBottom: -space.xs,
  },
  weekList: { gap: space.xs },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  dayChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipDow: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: -2,
  },
  weekRowBody: { flex: 1, gap: 1 },

  actionRow: { flexDirection: 'row', gap: space.sm },
  actionLabel: { flex: 1 },
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

  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: hairline },
  noEventsNudge: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
  },
  noEventsNudgeText: {
    textAlign: 'center',
    lineHeight: 18,
  },
})
