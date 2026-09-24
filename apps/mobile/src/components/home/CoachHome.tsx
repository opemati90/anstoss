import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Share, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type {
  EventFeedItem,
  ImportedFixture,
  RosterOpsSnapshot,
} from '@anstoss/shared'
import { api, ApiError, API_URL } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useEventsSocket } from '../../hooks/useEventsSocket'
import { SILENT_REFRESH_DEBOUNCE_MS } from '../../hooks/usePlayerHome'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, space } from '../../theme/tokens'
import { AnnounceSheet } from './AnnounceSheet'
import { CoachMatchCard, type RsvpSplit } from './CoachMatchCard'
import { SeasonStatsCard } from './SeasonStatsCard'
import { TeamPulse } from './TeamPulse'
import { WeekRows } from './WeekRows'
import { HomeSkeleton } from './HomeSkeleton'
import {
  EmptyCard,
  HomeCard,
  HomeRow,
  HomeSection,
  InlineError,
  formatDayTime,
  formatShortDate,
} from './HomeKit'
import { useHomeLocale } from './useHomeLocale'
import { isInCheckInWindow } from './NextUpHero'
import type { HomeAnnouncement, HomeChannel } from '../../hooks/usePlayerHome'
import {
  buildEventReadinessShareText,
  formatEventReadinessWhen,
} from '../../lib/eventReadinessShareText'
import { findFixtureForEvent } from '../../lib/matchFixtureLink'

type EventItem = EventFeedItem

export type CoachHomeProps = {
  clubId: string
  teamId: string | null
  /** Bubbles refresh state up to the screen's scroll view. */
  onRefreshStateChange?: (state: { refresh: () => void; refreshing: boolean }) => void
}

type AttentionItem = {
  key: string
  icon: string
  tone: 'warning' | 'error' | 'accent'
  title: string
  detail?: string | null
  onPress: () => void
}

/**
 * The coach's home: the next match and whether there is a team for it, what
 * needs the coach's attention, this week's sessions with their reply counts,
 * the team channel, and the season last and folded away.
 */
export function CoachHome({ clubId, teamId, onRefreshStateChange }: CoachHomeProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const locale = useHomeLocale()
  const { token, activeClub, activeTeamAccess } = useAuth()

  const [upcoming, setUpcoming] = useState<EventItem[]>([])
  const [fixtures, setFixtures] = useState<ImportedFixture[]>([])
  const [ops, setOps] = useState<RosterOpsSnapshot | null>(null)
  const [teamChannel, setTeamChannel] = useState<HomeChannel | null>(null)
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([])
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [announceVisible, setAnnounceVisible] = useState(false)
  const [nudging, setNudging] = useState(false)
  const nudgingRef = useRef(false)

  // Every response is tagged with the request that asked for it; anything
  // that resolves after a newer request (or after a team switch) is dropped,
  // so one team's counts can never land on another team's card.
  const requestSeq = useRef(0)
  const silentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A team switch clears the card at once instead of showing the old team
  // until the new one answers (the reminder button would target its match).
  const shownTeam = useRef(teamId)
  useEffect(() => {
    if (shownTeam.current === teamId) return
    shownTeam.current = teamId
    requestSeq.current += 1
    setUpcoming([])
    setFixtures([])
    setOps(null)
    setTeamChannel(null)
    setAnnouncements([])
    setError(false)
    setLoaded(false)
  }, [teamId])

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    if (!teamId) {
      setLoaded(true)
      setRefreshing(false)
      return
    }
    const base = `/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming`
    const [events, snapshot, fixtureList, channels, anns] = await Promise.all([
      api<EventFeedItem[]>(`${base}&limit=10`).catch(() => null),
      api<RosterOpsSnapshot>(`/clubs/${clubId}/teams/${teamId}/roster-ops`).catch(() => null),
      api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=upcoming&limit=10`).catch(
        () => null,
      ),
      api<HomeChannel[]>(`/teams/${teamId}/channels`).catch(() => null),
      api<HomeAnnouncement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(() => null),
    ])
    if (seq !== requestSeq.current) return
    // A failed sub-request keeps what is on screen (stale-while-revalidate).
    if (channels !== null) {
      const channelList = Array.isArray(channels) ? channels : []
      setTeamChannel(channelList.find((ch) => ch.kind === 'TEAM') ?? channelList[0] ?? null)
    }
    if (anns !== null) setAnnouncements(Array.isArray(anns) ? anns : [])
    if (fixtureList !== null) setFixtures(Array.isArray(fixtureList) ? fixtureList : [])
    if (snapshot !== null) setOps(isSnapshot(snapshot) ? snapshot : null)
    if (events === null) {
      setError(true)
    } else {
      setError(false)
      setUpcoming(Array.isArray(events) ? events : [])
    }
    setLoaded(true)
    setRefreshing(false)
  }, [clubId, teamId])

  // Refetch whenever the tab comes back into focus, not only on mount.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const refresh = useCallback(() => {
    setRefreshing(true)
    void load()
  }, [load])

  // Realtime changes re-read quietly: no spinner, one call per burst.
  const scheduleSilentLoad = useCallback(() => {
    if (silentTimer.current) clearTimeout(silentTimer.current)
    silentTimer.current = setTimeout(() => {
      silentTimer.current = null
      void load()
    }, SILENT_REFRESH_DEBOUNCE_MS)
  }, [load])

  useEffect(
    () => () => {
      if (silentTimer.current) clearTimeout(silentTimer.current)
    },
    [],
  )

  useEventsSocket({
    teamId,
    token,
    apiUrl: API_URL,
    onRsvpUpdate: scheduleSilentLoad,
    onEventUpsert: scheduleSilentLoad,
  })

  useEffect(() => {
    onRefreshStateChange?.({ refresh, refreshing })
  }, [onRefreshStateChange, refresh, refreshing])

  const weekEndMs = Date.now() + 7 * 24 * 60 * 60 * 1000
  const thisWeek = useMemo(
    () => upcoming.filter((event) => new Date(event.date).getTime() <= weekEndMs),
    // weekEndMs changes every render; the list only needs to follow the data.
    [upcoming],
  )
  const nextMatch = useMemo(
    () => upcoming.find((event) => event.type === 'MATCH' && !event.cancelledAt) ?? null,
    [upcoming],
  )
  const nextFixture = useMemo(
    () =>
      nextMatch
        ? findFixtureForEvent(
            { ...nextMatch, team: nextMatch.team ?? (teamId ? { id: teamId } : null) },
            fixtures,
          )
        : null,
    [fixtures, nextMatch, teamId],
  )

  // One squad number for the whole screen: the roster-ops squadCount, the
  // event's own squadSize when the feed carries it, or readiness as a last
  // resort. Never a count computed here.
  const squadCount = ops?.squadCount ?? null
  const squadTarget = ops?.team.squadTarget ?? null

  const split: RsvpSplit | null = useMemo(() => {
    if (!nextMatch) return null
    const yes = nextMatch.yesCount ?? 0
    const maybe = nextMatch.maybeCount ?? 0
    const no = nextMatch.noCount ?? 0
    const squad =
      nextMatch.readiness?.metrics.squadSize ?? nextMatch.squadSize ?? squadCount ?? 0
    const open =
      nextMatch.readiness?.metrics.pendingCount ?? Math.max(0, squad - yes - maybe - no)
    return { yes, maybe, no, open }
  }, [nextMatch, squadCount])

  // ─── Navigation ──────────────────────────────────────────────────────────

  const openEvent = useCallback((eventId: string, attendance = false) => {
    router.push({
      pathname: '/event-detail',
      params: attendance ? { eventId, attendance: '1' } : { eventId },
    } as never)
  }, [])

  const goToSquad = useCallback(() => {
    router.push('/(tabs)/squad' as never)
  }, [])

  const goToCreateEvent = useCallback(() => {
    router.push('/create-event' as never)
  }, [])

  const goToLineup = useCallback(() => {
    if (!teamId) return
    router.push({
      pathname: '/lineup-builder',
      params: nextFixture ? { teamId, fixtureId: nextFixture.id } : { teamId },
    } as never)
  }, [nextFixture, teamId])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const shareBriefing = useCallback(async () => {
    if (!nextMatch?.readiness) return
    try {
      await Share.share({
        message: buildEventReadinessShareText({
          eventTitle: nextMatch.title,
          whenLabel: formatEventReadinessWhen(nextMatch.date, locale),
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
  }, [locale, nextMatch, t])

  const remind = useCallback(async () => {
    if (!nextMatch || nudgingRef.current) return
    nudgingRef.current = true
    setNudging(true)
    try {
      const result = await api<{ sent: number; nextAvailableAt: string }>(
        `/clubs/${clubId}/events/${nextMatch.id}/remind-rsvp`,
        { method: 'POST' },
      )
      Alert.alert(
        t('home.readiness.nudgeSentTitle', { defaultValue: 'Nudge sent' }),
        t('home.readiness.nudgeSentBody', {
          defaultValue: 'Sent RSVP reminders to {{count}} players.',
          count: result?.sent ?? 0,
        }),
      )
      await load()
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        await load()
        const body = err.data as Record<string, unknown> | null | undefined
        const retryAfter = typeof body?.retryAfter === 'string' ? body.retryAfter : null
        Alert.alert(
          t('home.readiness.nudgeCooldownTitle', { defaultValue: 'Nudge already sent' }),
          retryAfter
            ? t('home.readiness.nudgeCooldownBody', {
                defaultValue: 'Try again after {{time}}.',
                time: formatDayTime(retryAfter, locale),
              })
            : t('event.rsvpReminderCooldownHint', { defaultValue: 'Reminders sent' }),
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
      setNudging(false)
    }
  }, [clubId, load, locale, nextMatch, t])

  // ─── Match card actions ──────────────────────────────────────────────────

  const nudge = nextMatch?.readiness?.nudge ?? null
  const cooldownUntil =
    nudge?.reason === 'cooldown' && nudge.nextAvailableAt ? nudge.nextAvailableAt : null
  const openCount = split?.open ?? 0
  const inArrival = nextMatch ? isInCheckInWindow(nextMatch.date, Date.now()) : false

  const lineupLabel = t('homeHub.coach.lineup', { defaultValue: 'Lineup' })
  const splitTotal = split ? split.yes + split.maybe + split.no + split.open : 0
  const matchActions = (() => {
    if (!nextMatch) return null
    // No one in the squad yet: nobody can reply until players are invited.
    if (splitTotal === 0 && (squadCount ?? 0) === 0) {
      return {
        primary: {
          label: t('home.actionInvite', { defaultValue: 'Invite players' }),
          onPress: () => router.push('/invite' as never),
        },
        secondary: {
          label: t('homeHub.coach.openEvent', { defaultValue: 'Details' }),
          onPress: () => openEvent(nextMatch.id),
        },
        note: null,
      }
    }
    if (inArrival) {
      return {
        primary: {
          label: t('home.coach.actionAttendanceCta', { defaultValue: 'Open attendance' }),
          onPress: () => openEvent(nextMatch.id, true),
        },
        secondary: { label: lineupLabel, onPress: goToLineup },
        note: null,
      }
    }
    if (openCount > 0 && !cooldownUntil) {
      return {
        primary: {
          label: t('homeHub.coach.remind', {
            defaultValue: 'Remind {{count}} players',
            count: openCount,
          }),
          onPress: () => void remind(),
          loading: nudging,
        },
        secondary: { label: lineupLabel, onPress: goToLineup },
        note: null,
      }
    }
    return {
      primary: { label: lineupLabel, onPress: goToLineup },
      secondary: {
        label: t('homeHub.coach.openEvent', { defaultValue: 'Details' }),
        onPress: () => openEvent(nextMatch.id),
      },
      note: cooldownUntil
        ? t('homeHub.coach.remindCooldown', {
            defaultValue: 'Reminder sent. You can send the next one from {{time}}.',
            time: formatDayTime(cooldownUntil, locale),
          })
        : null,
    }
  })()

  // ─── Attention: only things the loaded data proves need the coach ───────

  const canApproveCoaches =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = []
    if (!ops) return items
    const injured = ops.medic?.active ?? []
    if (injured.length > 0) {
      items.push({
        key: 'injured',
        icon: 'exclamationmark.triangle',
        tone: 'error',
        title: t('homeHub.coach.injured', {
          defaultValue: '{{count}} injured',
          count: injured.length,
        }),
        detail: injured
          .slice(0, 3)
          .map((report) => report.user?.name ?? report.title)
          .join(', '),
        onPress: goToSquad,
      })
    }
    // Trikotwäsche is only chased for teams that actually run the duty rota
    // (any duty assigned or done), and a wash already done counts as covered.
    const kitDuties = [...(ops.kit?.pending ?? []), ...(ops.kit?.recent ?? [])]
    if (nextMatch && kitDuties.length > 0) {
      const covered = kitWashCovered(kitDuties, nextMatch.date)
      if (!covered) {
        items.push({
          key: 'duty',
          icon: 'shirt',
          tone: 'warning',
          title: t('homeHub.coach.dutyMissing', {
            defaultValue: 'No one on kit wash for {{date}}',
            date: formatShortDate(nextMatch.date, locale),
          }),
          detail: t('homeHub.coach.dutyMissingBody', {
            defaultValue: 'Assign someone so the kit is clean for the match.',
          }),
          // The Aufgaben screen holds "assign next" for each duty kind.
          onPress: () => router.push('/aufgaben' as never),
        })
      }
    }
    const trials = ops.operations?.trials ?? []
    if (trials.length > 0) {
      items.push({
        key: 'trials',
        icon: 'person.badge.plus',
        tone: 'accent',
        title: t('homeHub.coach.trials', {
          defaultValue: '{{count}} trial players to review',
          count: trials.length,
        }),
        detail: trials
          .slice(0, 3)
          .map((m) => m.name)
          .join(', '),
        // Probetraining players are decided in the Wechselbörse.
        onPress: () =>
          router.push({ pathname: '/wechselboerse', params: { tab: 'probetraining' } } as never),
      })
    }
    // Pending coaches are approved in the Kader tab's requests sheet, which
    // any coach of the team or club admin can act on (server:
    // assertManageAccess). Anyone else would land on a dead end.
    const coaches = canApproveCoaches ? (ops.operations?.pendingCoaches ?? []) : []
    if (coaches.length > 0) {
      items.push({
        key: 'coaches',
        icon: 'person.2',
        tone: 'accent',
        title: t('homeHub.coach.pendingCoaches', {
          defaultValue: '{{count}} coaches waiting for approval',
          count: coaches.length,
        }),
        detail: coaches
          .slice(0, 3)
          .map((m) => m.name)
          .join(', '),
        onPress: goToSquad,
      })
    }
    if (squadCount != null && squadTarget != null && squadCount < squadTarget) {
      items.push({
        key: 'short',
        icon: 'person.2',
        tone: 'warning',
        title: t('homeHub.coach.squadShort', {
          defaultValue: 'Squad: {{count}} of {{target}}',
          count: squadCount,
          target: squadTarget,
        }),
        detail: t('homeHub.coach.squadShortBody', {
          defaultValue: "You're {{missing}} players short of your target squad. Invite new players.",
          missing: squadTarget - squadCount,
          count: squadTarget - squadCount,
        }),
        onPress: goToSquad,
      })
    }
    return items
  }, [canApproveCoaches, goToSquad, locale, nextMatch, ops, squadCount, squadTarget, t])

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!loaded) return <HomeSkeleton variant="coach" />

  if (error && upcoming.length === 0) {
    return (
      <View style={styles.root}>
        <InlineError
          title={t('homeHub.coach.loadError', { defaultValue: "Couldn't load your team's week" })}
          body={t('states.home.error.body', {
            defaultValue: 'Check your connection and pull down to try again.',
          })}
          onRetry={refresh}
        />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {/* 1. Next match readiness. */}
      {nextMatch && split && matchActions ? (
        <HomeSection title={t('homeHub.coach.nextMatch', { defaultValue: 'Next match' })}>
          <CoachMatchCard
            event={nextMatch}
            locale={locale}
            split={split}
            primary={matchActions.primary}
            secondary={matchActions.secondary}
            note={matchActions.note}
            onOpen={() => openEvent(nextMatch.id)}
            onShare={nextMatch.readiness ? () => void shareBriefing() : undefined}
          />
        </HomeSection>
      ) : teamId ? (
        <EmptyCard
          icon="calendar"
          title={
            upcoming.length > 0
              ? t('home.coach.actionNoMatchTitle', { defaultValue: 'Schedule the next match' })
              : t('homeHub.coach.emptyTitle', { defaultValue: 'Nothing planned yet' })
          }
          body={
            upcoming.length > 0
              ? t('home.coach.actionNoMatchBody', {
                  defaultValue: 'Training is on the calendar, but no match is planned yet.',
                })
              : t('homeHub.coach.emptyBody', {
                  defaultValue:
                    'Add a training or a match. Your team sees it straight away and can reply.',
                })
          }
          actionLabel={
            upcoming.length > 0
              ? t('home.coach.actionNoMatchCta', { defaultValue: 'Schedule match' })
              : t('home.coach.actionCreateCta', { defaultValue: 'Create event' })
          }
          onAction={goToCreateEvent}
        />
      ) : null}

      {/* 2. Needs attention. */}
      {attention.length > 0 ? (
        <HomeSection title={t('homeHub.coach.attention', { defaultValue: 'Needs attention' })}>
          <HomeCard>
            {attention.map((item, index) => (
              <HomeRow
                key={item.key}
                icon={item.icon}
                tone={item.tone}
                title={item.title}
                detail={item.detail}
                showDivider={index > 0}
                onPress={item.onPress}
              />
            ))}
          </HomeCard>
        </HomeSection>
      ) : null}

      {/* 3. This week. */}
      {teamId ? (
        <WeekRows
          events={thisWeek}
          locale={locale}
          squadSize={squadCount}
          onCreate={goToCreateEvent}
          emptyLabel={t('homeHub.coach.weekEmpty', {
            defaultValue: 'Nothing planned this week. Add a training so the team can reply.',
          })}
        />
      ) : null}

      {/* 4. Team pulse + announce. */}
      <TeamPulse
        channel={teamChannel}
        announcements={announcements}
        onAnnounce={teamId ? () => setAnnounceVisible(true) : undefined}
      />

      {/* 5. Season, folded away. */}
      {teamId ? <SeasonStatsCard clubId={clubId} teamId={teamId} collapsible /> : null}

      {error ? (
        <PressableScale
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel={t('homeHub.retry', { defaultValue: 'Try again' })}
          style={[styles.stale, { borderTopColor: c.borderSubtle }]}
        >
          <Icon name="arrow.clockwise" size={14} color="secondary" />
          <Text variant="footnote" color="secondary">
            {t('states.home.stale', {
              defaultValue: 'Showing your last update — pull down to retry.',
            })}
          </Text>
        </PressableScale>
      ) : null}

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

/**
 * True when a Trikotwäsche is assigned or already done around the match
 * (from a day before kick-off to four days after). An undated pending wash
 * counts as covering the next match.
 */
export function kitWashCovered(
  duties: Array<{ kind: string; status: string; dueDate: string | null; completedAt?: string | null }>,
  matchIso: string,
): boolean {
  const matchMs = new Date(matchIso).getTime()
  const from = matchMs - 24 * 3600_000
  const to = matchMs + 4 * 24 * 3600_000
  return duties.some((duty) => {
    if (duty.kind !== 'JERSEY_CLEANUP') return false
    if (duty.status === 'SKIPPED') return false
    const when = duty.dueDate ?? (duty.status === 'COMPLETED' ? duty.completedAt : null)
    if (!when) return duty.status === 'PENDING'
    const ms = new Date(when).getTime()
    return ms >= from && ms <= to
  })
}

function isSnapshot(value: unknown): value is RosterOpsSnapshot {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as RosterOpsSnapshot).squad) &&
      (value as RosterOpsSnapshot).operations &&
      (value as RosterOpsSnapshot).team,
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    minHeight: 44,
    borderTopWidth: hairline,
  },
})
