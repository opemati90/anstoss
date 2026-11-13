import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ImportedFixture } from '@anstoss/shared'
import { RSVP } from '@anstoss/shared'
import { api, API_URL } from '../../api/client'
import { useEventsSocket, type EventRsvpUpdate } from '../../hooks/useEventsSocket'
import { usePlayerHome, type HomeEvent } from '../../hooks/usePlayerHome'
import { Text } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { space } from '../../theme/tokens'
import { findFixtureForEvent } from '../../lib/matchFixtureLink'
import { Haptics } from '../../utils/haptics'
import { enqueueRsvp, isOfflineError } from '../../lib/rsvpOutbox'
import { NextUpHero, isInCheckInWindow } from './NextUpHero'
import { LiveStatusPill } from '../match'
import { HomeSkeleton } from './HomeSkeleton'
import {
  CountCircle,
  EmptyCard,
  HomeCard,
  HomeRow,
  HomeTag,
  InlineError,
  formatDayTime,
  formatShortDate,
} from './HomeKit'
import { useHomeLocale } from './useHomeLocale'
import { useDutyTasks } from './HomeTasks'
import { formatDues } from '../club/DuesTag'
import type { AbsenceDetail, RsvpStatus } from '../events/RsvpControl'

export type PlayerHomeProps = {
  clubId: string
  teamId: string | null
  /** Bubbles refresh state up to the screen's scroll view. */
  onRefreshStateChange?: (state: { refresh: () => void; refreshing: boolean }) => void
}

/**
 * The player's home screen.
 *
 * Redesign screen 22: the next event as the club hero with the reply
 * segmented inside it, then one group of what is mine: a live score (compact,
 * only while one is on), the events still waiting for my answer, my jobs, my
 * season and the fee I owe.
 */
export function PlayerHome({ clubId, teamId, onRefreshStateChange }: PlayerHomeProps) {
  const { t } = useTranslation()
  const { user, token } = useAuth()
  const locale = useHomeLocale()

  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
    scheduleSilentRefresh,
    updatedAt,
    applyRsvp,
    applyRsvpCounts,
  } = usePlayerHome(clubId, teamId, user?.id ?? null)

  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({})
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Countdown copy ("in 3 h") is only honest if the clock advances.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    onRefreshStateChange?.({ refresh, refreshing })
  }, [onRefreshStateChange, refresh, refreshing])

  useEventsSocket({
    teamId,
    token,
    apiUrl: API_URL,
    onRsvpUpdate: useCallback(
      (update: EventRsvpUpdate) => {
        applyRsvpCounts(update.eventId, {
          yesCount: update.yesCount,
          maybeCount: update.maybeCount,
          noCount: update.noCount,
        })
      },
      [applyRsvpCounts],
    ),
    // A coach editing an event must not spin the pull-to-refresh control or
    // fire the whole home's requests per keystroke: one quiet, debounced
    // re-read of the events list.
    onEventUpsert: useCallback(() => scheduleSilentRefresh(), [scheduleSilentRefresh]),
  })

  const withTeam = useCallback(
    (event: HomeEvent): HomeEvent =>
      !event.team && teamId ? { ...event, team: { id: teamId, name: '' } } : event,
    [teamId],
  )

  const fixtureFor = useCallback(
    (event: HomeEvent): ImportedFixture | null =>
      findFixtureForEvent(withTeam(event), data.fixtures) ?? null,
    [data.fixtures, withTeam],
  )

  const heroEvent = data.events[0] ?? null
  const heroFixture = heroEvent ? fixtureFor(heroEvent) : null

  // A live match anywhere in the player's teams outranks the chronological
  // next event — it is the only thing happening right now.
  const liveFixture = useMemo(
    () =>
      (heroFixture?.status === 'live' ? heroFixture : null) ??
      data.fixtures.find((fixture) => fixture.status === 'live') ??
      null,
    [data.fixtures, heroFixture],
  )

  // When the next event's match is already live, the score card carries it —
  // but only once the player has nothing left to decide about it. An
  // unanswered player (or one inside the arrival window) keeps the decision
  // card, so replying never requires chasing the match screen first.
  const heroIsLive = heroFixture?.status === 'live'
  const heroOwesDecision = Boolean(
    heroEvent &&
    (!heroEvent.myRsvp || heroEvent.myRsvpStale || isInCheckInWindow(heroEvent.date, nowMs)),
  )
  const liveOwnsHero = Boolean(heroIsLive && !heroOwesDecision)

  // Everything past the hero is one chronological list ("Diese Woche"); rows
  // carry the reply pills only where an answer is still missing.
  const weekAhead = useMemo(
    () =>
      data.events
        .slice(1)
        .filter((event) => !liveFixture || fixtureFor(event)?.id !== liveFixture.id),
    [data.events, fixtureFor, liveFixture?.id],
  )

  const openEvent = useCallback((event: HomeEvent) => {
    router.push({ pathname: '/event-detail', params: { eventId: event.id } })
  }, [])

  const openMatch = useCallback((fixture: ImportedFixture) => {
    router.push({
      pathname: '/match-detail',
      params: { fixtureId: fixture.id, teamId: fixture.teamId },
    })
  }, [])

  const openEventOrMatch = useCallback(
    (event: HomeEvent) => {
      const fixture = fixtureFor(event)
      if (fixture) openMatch(fixture)
      else openEvent(event)
    },
    [fixtureFor, openEvent, openMatch],
  )

  const onRsvp = useCallback(
    async (eventId: string, status: RsvpStatus, absence?: AbsenceDetail) => {
      if (pendingIds[eventId]) return
      const previous = data.events.find((event) => event.id === eventId)?.myRsvp ?? null
      setPendingIds((prev) => ({ ...prev, [eventId]: true }))
      applyRsvp(eventId, status)
      try {
        // CLAUDE.md: RSVP debounce 500ms + disabled during the call. The id is
        // held in `pendingIds` for the whole request so rapid taps can't
        // overlap.
        await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
        await api(`/clubs/${clubId}/events/${eventId}/rsvp`, {
          method: 'PUT',
          body: { status, ...(status === 'NO' ? absence : {}) },
        })
        Haptics.success()
      } catch (error) {
        // Board 29: no connection — keep the answer and queue it ("Wartet").
        const event = data.events.find((item) => item.id === eventId)
        if (isOfflineError(error) && event) {
          enqueueRsvp({
            key: `${eventId}:me`,
            clubId,
            eventId,
            status,
            reason: status === 'NO' ? absence?.reason : undefined,
            note: status === 'NO' ? absence?.note : undefined,
            title: event.type === 'TRAINING' ? t('homeHub.type.training', { defaultValue: 'Training' }) : event.title,
            date: event.date,
          })
          return
        }
        applyRsvp(eventId, previous)
        Haptics.fail()
        Alert.alert(
          t('event.rsvpFailedTitle', { defaultValue: 'RSVP not saved' }),
          t('event.rsvpFailedBody', {
            defaultValue: 'Could not save your reply. Tap again when you have a connection.',
          }),
        )
      } finally {
        setPendingIds((prev) => {
          const next = { ...prev }
          delete next[eventId]
          return next
        })
      }
    },
    [applyRsvp, clubId, data.events, pendingIds, t],
  )

  const dutyTasks = useDutyTasks(data.duties, locale)

  if (loading && data.events.length === 0 && !error) {
    return <HomeSkeleton variant="player" />
  }

  if (error && data.events.length === 0) {
    return (
      <View style={styles.root}>
        <InlineError
          title={t('states.home.error.title', {
            defaultValue: "Couldn't load your week",
          })}
          body={t('states.home.error.body', {
            defaultValue: 'Check your connection and pull down to try again.',
          })}
          onRetry={refresh}
        />
      </View>
    )
  }

  // While the live match owns the next event, the hero moves on to the one
  // after it; the score itself is one compact row in the group below.
  const shownHero = liveOwnsHero ? (weekAhead[0] ?? null) : heroEvent
  // "Termine warten auf dich": every later event still missing an answer.
  const awaiting = weekAhead.filter(
    (event) =>
      event.id !== shownHero?.id && !event.cancelledAt && (!event.myRsvp || event.myRsvpStale),
  )
  const laterEvents = weekAhead.filter((event) => event.id !== shownHero?.id && !event.cancelledAt)
  const shortLabel = (event: HomeEvent) => {
    const kind =
      event.type === 'MATCH'
        ? event.homeAway === 'AWAY'
          ? t('homeHub.away', { defaultValue: 'Away' })
          : event.homeAway === 'HOME'
            ? t('homeHub.home', { defaultValue: 'Home' })
            : t('homeHub.type.match', { defaultValue: 'Match' })
        : event.type === 'TRAINING'
          ? t('homeHub.type.training', { defaultValue: 'Training' })
          : event.title
    return `${kind} ${formatShortDate(event.date, locale)}`
  }

  const season = data.mySeason
  const seasonDetail = season
    ? t('homeHub.player.seasonLine', {
        defaultValue:
          '{{appearances}} games · {{goals}} goals · {{attended}} of {{total}} trainings',
        appearances: season.appearances,
        goals: season.goals,
        attended: season.trainingsAttended,
        total: season.trainingsTotal,
      })
    : [
        (data.streaks?.attendanceWeeks ?? 0) > 0
          ? t('home.pulse.streakWeeks', {
              defaultValue: '{{count}} weeks in a row',
              count: data.streaks?.attendanceWeeks ?? 0,
            })
          : null,
        data.seasonStats && data.seasonStats.played > 0
          ? t('homeHub.player.teamRecord', {
              defaultValue: 'Team {{wins}}-{{draws}}-{{losses}}',
              wins: data.seasonStats.wins,
              draws: data.seasonStats.draws,
              losses: data.seasonStats.losses,
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

  const dues = data.dues && data.dues.amounts.length > 0 ? data.dues : null
  const duesAmount = dues
    ? dues.amounts.map((entry) => formatDues(entry.cents, entry.currency, locale)).join(' + ')
    : ''

  type GroupRow = { key: string; render: (divider: boolean) => ReactNode }
  const rows: GroupRow[] = []
  if (liveFixture) {
    rows.push({
      key: 'live',
      render: (divider) => (
        <HomeRow
          icon="football"
          leading={<LiveStatusPill status="live" />}
          title={`${liveFixture.homeTeam} ${liveFixture.resultHome ?? 0}:${liveFixture.resultAway ?? 0} ${liveFixture.awayTeam}`}
          accessibilityLabel={t('homeHub.liveA11y', {
            defaultValue: '{{home}} vs {{away}}, live, {{homeScore}} to {{awayScore}}',
            home: liveFixture.homeTeam,
            away: liveFixture.awayTeam,
            homeScore: liveFixture.resultHome ?? 0,
            awayScore: liveFixture.resultAway ?? 0,
          })}
          onPress={() => openMatch(liveFixture)}
          showDivider={divider}
          testID="player-home-live"
        />
      ),
    })
  }
  if (awaiting.length > 0) {
    rows.push({
      key: 'awaiting',
      render: (divider) => (
        <HomeRow
          icon="calendar"
          leading={<CountCircle count={awaiting.length} />}
          title={t('homeHub.player.awaiting', {
            defaultValue: 'Events waiting for you',
            count: awaiting.length,
          })}
          detail={awaiting.slice(0, 2).map(shortLabel).join(' · ')}
          onPress={() => router.push('/(tabs)/events' as never)}
          showDivider={divider}
          testID="player-home-awaiting"
        />
      ),
    })
  } else if (laterEvents.length > 0) {
    rows.push({
      key: 'answered',
      render: (divider) => (
        <HomeRow
          icon="calendar"
          title={t('eventFlow.list.allAnswered', { defaultValue: 'All answered' })}
          detail={laterEvents.slice(0, 2).map(shortLabel).join(' · ')}
          onPress={() => router.push('/(tabs)/events' as never)}
          showDivider={divider}
        />
      ),
    })
  }
  for (const task of dutyTasks) {
    rows.push({
      key: `task-${task.id}`,
      render: (divider) => (
        <HomeRow
          icon={task.icon}
          title={task.title}
          detail={task.detail}
          onPress={task.onPress}
          showDivider={divider}
        />
      ),
    })
  }
  {
    rows.push({
      key: 'season',
      render: (divider) => (
        <HomeRow
          icon="person"
          title={t('home.player.seasonTitle', { defaultValue: 'Your season' })}
          detail={seasonDetail || null}
          onPress={() => router.push('/team-stats' as never)}
          showDivider={divider}
        />
      ),
    })
  }
  if (dues) {
    rows.push({
      key: 'dues',
      render: (divider) => (
        <HomeRow
          icon="creditcard"
          title={
            dues.dueDate
              ? t('homeHub.duesMonth', {
                  defaultValue: 'Fee {{month}}',
                  month: new Intl.DateTimeFormat(locale, { month: 'long' }).format(
                    new Date(dues.dueDate),
                  ),
                })
              : t('homeHub.dues', { defaultValue: 'Membership fee' })
          }
          detail={[
            duesAmount,
            dues.dueDate
              ? t('mydues.dueShort', {
                  defaultValue: 'due {{date}}',
                  date: formatNumericDate(dues.dueDate, locale),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          trailing={
            <HomeTag
              label={t(
                dues.overdue ? 'contributions.status.OVERDUE' : 'contributions.status.PENDING',
              )}
              tone={dues.overdue ? 'alert' : 'neutral'}
            />
          }
          onPress={() => router.push('/my-contributions')}
          showDivider={divider}
          testID="player-home-dues"
        />
      ),
    })
  }

  return (
    <View style={styles.root}>
      {/* 1. Next up, answered in place on the hero (screen 22). */}
      {shownHero ? (
        <NextUpHero
          event={shownHero}
          locale={locale}
          nowMs={nowMs}
          rsvpPending={Boolean(pendingIds[shownHero.id])}
          onRsvp={(status, absence) => void onRsvp(shownHero.id, status, absence)}
          onOpen={() => openEventOrMatch(shownHero)}
        />
      ) : null}

      {!heroEvent && !liveFixture ? (
        <EmptyCard
          icon="calendar"
          title={t('homeHub.player.emptyTitle', { defaultValue: 'No events yet' })}
          body={t('homeHub.player.emptyBody', {
            defaultValue:
              "Your coach is still planning. Trainings and matches appear here as soon as they're set.",
          })}
        />
      ) : null}

      {/* 2. One group: what waits for me, my jobs, my season, my fee. */}
      {rows.length > 0 ? (
        <HomeCard>
          {rows.map((row, index) => (
            <Fragment key={row.key}>{row.render(index > 0)}</Fragment>
          ))}
        </HomeCard>
      ) : null}

      {error ? (
        <Text variant="footnote" color="secondary" style={styles.staleNote}>
          {updatedAt
            ? t('homeHub.staleAt', {
                defaultValue: 'Last updated {{time}}. Pull down to retry.',
                time: formatDayTime(new Date(updatedAt).toISOString(), locale, nowMs),
              })
            : t('states.home.stale', {
                defaultValue: 'Showing your last update — pull down to retry.',
              })}
        </Text>
      ) : null}
    </View>
  )
}

/** "15.12." — day and month, as on the fee row. */
function formatNumericDate(iso: string, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(
    new Date(iso),
  )
  return locale.startsWith('de') && !day.endsWith('.') ? `${day}.` : day
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  staleNote: { textAlign: 'center' },
})
