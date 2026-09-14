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
import { elevation, fonts, hairline, radius, space } from '../../theme/tokens'
import { AnnounceSheet } from './AnnounceSheet'
import { EventReadinessCard } from './EventReadinessCard'
import { SeasonStatsCard } from './SeasonStatsCard'
import { TeamPulse } from './TeamPulse'
import { WeekRows } from './WeekRows'
import type { HomeAnnouncement, HomeChannel } from '../../hooks/usePlayerHome'
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
  const [teamChannel, setTeamChannel] = useState<HomeChannel | null>(null)
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([])
  const [announceVisible, setAnnounceVisible] = useState(false)
  const [nudgingEventId, setNudgingEventId] = useState<string | null>(null)
  const nudgingRef = useRef(false)

  const load = useCallback(async () => {
    if (!teamId) return
    const base = `/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming`
    const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const [upcoming, ops, fixtures, channels, anns] = await Promise.all([
      api<EventFeedItem[]>(`${base}&limit=10`).catch(() => [] as EventFeedItem[]),
      api<RosterOpsSnapshot>(
        `/clubs/${clubId}/teams/${teamId}/roster-ops`,
      ).catch(() => null),
      api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=upcoming&limit=10`).catch(
        () => [] as ImportedFixture[],
      ),
      api<HomeChannel[]>(`/teams/${teamId}/channels`).catch(() => [] as HomeChannel[]),
      api<HomeAnnouncement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(
        () => [] as HomeAnnouncement[],
      ),
    ])
    const channelList = Array.isArray(channels) ? channels : []
    setTeamChannel(
      channelList.find((ch) => ch.kind === 'TEAM') ?? channelList[0] ?? null,
    )
    setAnnouncements(Array.isArray(anns) ? anns : [])
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
    router.push({ pathname: '/(tabs)/roster', params: { returnTo: '/(tabs)' } } as never)
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

  const actionBusy = coachAction?.target === 'nudge' && nudgingEventId === nextMatch?.id
  const actionLabel = coachAction
    ? actionBusy
      ? t('home.readiness.nudging', { defaultValue: 'Sending...' })
      : t(coachAction.ctaKey, coachAction.ctaOptions)
    : ''

  // The action strip lives inside the hero. It used to be a separate
  // "Do this next" card above a separate match card above a readiness card,
  // three loud surfaces about one match. Now the match is the hero and the
  // one thing to do about it is its button.
  const actionStrip = coachAction ? (
    <View style={[styles.actionStrip, { borderTopColor: c.borderSubtle ?? c.borderDefault }]}>
      <View style={styles.actionCopy}>
        <View style={[styles.actionIconWell, { backgroundColor: withAlpha(c.primary, 0.12) }]}>
          <Icon name={coachAction.icon} size={14} color="tint" />
        </View>
        <Text variant="callout" weight="semibold" color="primary" numberOfLines={2} style={styles.actionTitle}>
          {t(coachAction.titleKey, coachAction.titleOptions)}
        </Text>
      </View>
      <Pressable
        onPress={handleCoachAction}
        accessibilityRole="button"
        accessibilityLabel={t(coachAction.ctaKey, coachAction.ctaOptions)}
        accessibilityState={{ disabled: actionBusy }}
        disabled={actionBusy}
        style={({ pressed }) => [
          styles.commandButton,
          { backgroundColor: c.primary },
          pressed && { opacity: 0.86 },
          actionBusy && { opacity: 0.65 },
        ]}
      >
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.commandButtonText, { color: c.textInverse }]}>
          {actionLabel}
        </Text>
        <Icon name="chevron.right" size={14} color="inverse" />
      </Pressable>
    </View>
  ) : null

  const readinessFlagged = Boolean(
    nextMatch?.readiness && nextMatch.readiness.status !== 'READY',
  )

  return (
    <View style={styles.root}>
      {/* Hero: the next match, with the one thing to do about it inline. */}
      {nextMatch ? (
        <View
          style={[
            styles.matchCard,
            elevation.hero,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <Pressable
            onPress={goToMatch}
            accessibilityRole="button"
            accessibilityLabel={nextMatch.title}
            style={({ pressed }) => [styles.matchBody, pressed && { opacity: 0.96 }]}
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
                    style={[styles.rsvpSegment, { flex: yesPct, backgroundColor: c.primary }]}
                  />
                  <View
                    style={[
                      styles.rsvpSegment,
                      { flex: maybePct, backgroundColor: withAlpha(c.primary, 0.4) },
                    ]}
                  />
                  <View
                    style={[styles.rsvpSegment, { flex: noPct, backgroundColor: c.borderStrong }]}
                  />
                </View>
                <View style={styles.rsvpCounts}>
                  {/* The squad split is one proportion, not three alerts. */}
                  <RsvpCount color={c.primary} count={yes} />
                  <RsvpCount color={c.textSecondary} count={maybe} />
                  <RsvpCount color={c.textTertiary} count={no} />
                  {eventPending > 0 ? (
                    <Text variant="caption2" color="tertiary" style={styles.pendingLabel} tabular>
                      {t('home.coach.pendingPill', {
                        defaultValue: '{{count}} awaiting RSVP',
                        count: eventPending,
                      })}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
          </Pressable>

          {actionStrip}

          {nextMatch.readiness ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home.readiness.shareBriefing', { defaultValue: 'Share briefing' })}
              onPress={() => void shareNextMatchReadiness()}
              style={({ pressed }) => [
                styles.secondaryRow,
                { borderTopColor: c.borderSubtle ?? c.borderDefault },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Icon name="square.and.arrow.up" size={15} color="tint" />
              <Text variant="footnote" color="primary" weight="medium" style={styles.secondaryRowText}>
                {t('home.readiness.shareBriefing', { defaultValue: 'Share briefing' })}
              </Text>
              <Icon name="chevron.right" size={13} color="tertiary" />
            </Pressable>
          ) : null}
        </View>
      ) : coachAction ? (
        <View
          style={[
            styles.commandPanel,
            elevation.card,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <View style={styles.commandHeader}>
            <View style={[styles.commandIcon, { backgroundColor: withAlpha(c.primary, 0.12) }]}>
              <Icon name={coachAction.icon} size={16} color="tint" />
            </View>
            <Text style={[styles.commandEyebrow, { color: c.textTertiary }]}>
              {t('home.coach.nextActionEyebrow', { defaultValue: 'DO THIS NEXT' })}
            </Text>
          </View>
          <Text variant="title3" weight="semibold" color="primary" numberOfLines={2} style={styles.commandTitle}>
            {t(coachAction.titleKey, coachAction.titleOptions)}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={2}>
            {t(coachAction.bodyKey, coachAction.bodyOptions)}
          </Text>
          <Pressable
            onPress={handleCoachAction}
            accessibilityRole="button"
            accessibilityLabel={t(coachAction.ctaKey, coachAction.ctaOptions)}
            style={({ pressed }) => [
              styles.commandButton,
              { backgroundColor: c.primary },
              pressed && { opacity: 0.86 },
            ]}
          >
            <Text numberOfLines={1} style={[styles.commandButtonText, { color: c.textInverse }]}>
              {t(coachAction.ctaKey, coachAction.ctaOptions)}
            </Text>
            <Icon name="chevron.right" size={14} color="inverse" />
          </Pressable>
        </View>
      ) : null}

      {/* Readiness only speaks when it has something to flag; a READY match
          is already said by the hero. */}
      {nextMatch?.readiness && readinessFlagged ? (
        <EventReadinessCard
          readiness={nextMatch.readiness}
          eventTitle={nextMatch.title}
          compact
          onPress={goToMatch}
          onAttendance={goToMatchAttendance}
          onShare={shareNextMatchReadiness}
          onNudge={nudgeNextMatchReadiness}
          nudgePending={nudgingEventId === nextMatch.id}
        />
      ) : null}

      {teamId ? (
        <WeekRows
          events={thisWeek}
          locale={i18n.language}
          squadSize={roster ? roster.active + roster.trial : null}
          onCreate={goToCreateEvent}
          emptyLabel={t('home.coach.nothingScheduled', { defaultValue: 'Nothing scheduled yet.' })}
        />
      ) : null}

      <TeamPulse channel={teamChannel} announcements={announcements} />

      {/* One quiet row of tools instead of a grid of tiles. */}
      <View style={styles.toolRow}>
        <ToolChip
          icon="megaphone"
          label={t('home.announce', { defaultValue: 'Announce' })}
          disabled={!teamId}
          onPress={() => setAnnounceVisible(true)}
        />
        <ToolChip
          icon="person.badge.plus"
          label={t('home.coach.invite', { defaultValue: 'Invite' })}
          onPress={() =>
            router.push({ pathname: '/invite', params: { returnTo: '/(tabs)' } } as never)
          }
        />
        <ToolChip
          icon="figure.walk"
          label={t('home.coach.scouting', { defaultValue: 'Scouting' })}
          onPress={() => router.push('/scouting' as never)}
        />
        <ToolChip
          icon="star.fill"
          label={t('home.coach.motmShort', { defaultValue: 'MOTM' })}
          onPress={() => router.push('/motm-archive' as never)}
        />
      </View>

      {/* Season stats — ambient, so last. */}
      {teamId ? <SeasonStatsCard clubId={clubId} teamId={teamId} /> : null}

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

function ToolChip({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: string
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.tool,
        { backgroundColor: c.surfaceSunken },
        pressed && { opacity: 0.9 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={16} color="tint" />
      <Text variant="caption1" color="primary" weight="semibold" style={styles.toolLabel}>
        {label}
      </Text>
    </Pressable>
  )
}

function RsvpCount({ color, count }: { color: string; count: number }) {
  return (
    <Text variant="caption2" tabular style={[styles.rsvpCount, { color }]}>
      {String(count)}
    </Text>
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
  root: { gap: space.lg },

  // Shared editorial eyebrow — quiet uppercase tertiary label.
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

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
    gap: space.sm,
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
    letterSpacing: 1.4,
  },
  commandTitle: {
    letterSpacing: -0.2,
    marginTop: space['2xs'],
  },
  commandButton: {
    minHeight: 46,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  commandButtonText: {
    flexShrink: 1,
    fontFamily: fonts.label,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
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

  matchCard: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  matchBody: { padding: space.md, gap: space.sm },
  actionStrip: {
    borderTopWidth: hairline,
    paddingHorizontal: space.md,
    paddingTop: space.sm + 2,
    paddingBottom: space.md,
    gap: space.sm,
  },
  actionCopy: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actionIconWell: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { flex: 1 },
  toolRow: { flexDirection: 'row', gap: space.sm },
  toolLabel: { textAlign: 'center' },
  tool: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['2xs'] + 2,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space['2xs'],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    minHeight: 60,
  },
  matchEyebrow: {
    fontFamily: fonts.data,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  matchTitle: { letterSpacing: -0.3, marginTop: space['2xs'] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },

  rsvpBlock: { gap: space.sm, marginTop: space.xs },
  rsvpBar: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  rsvpSegment: { height: '100%' },
  rsvpCounts: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rsvpCount: { fontWeight: '700' },
  pendingLabel: { flex: 1, textAlign: 'right' },

  matchDivider: {
    height: hairline,
    marginTop: space.xs,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderTopWidth: hairline,
  },
  secondaryRowText: { flex: 1 },

  squadCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.md,
  },
  squadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  squadHeaderLeft: { gap: space['2xs'] },
  squadCount: { letterSpacing: -0.3 },
  progressTrack: {
    height: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.full },
  squadStats: { flexDirection: 'row', gap: space.lg, marginTop: space['2xs'] },
  squadStat: { gap: space['2xs'] },

  sectionLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    marginTop: space.xs,
    marginBottom: -space.xs,
  },
  weekList: { gap: space.sm },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
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

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actionLabel: { textAlign: 'center', flexShrink: 1 },
  action: {
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    minHeight: 92,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
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
