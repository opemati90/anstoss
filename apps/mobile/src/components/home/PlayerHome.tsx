import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { NextUpHero, isInCheckInWindow } from './NextUpHero'
import { LiveMatchCard } from './LiveMatchCard'
import { WeekAhead } from './WeekAhead'
import { TeamPulse } from './TeamPulse'
import { HomeSkeleton } from './HomeSkeleton'
import { EmptyCard, HomeSection, InlineError, formatDayTime } from './HomeKit'
import { useHomeLocale } from './useHomeLocale'
import { DuesRow, TasksSection, useDutyTasks } from './HomeTasks'
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
 * Built around one question, *what do I have to do?*, in priority order: a
 * live match if one is on, the next event and its reply, my duties, the rest
 * of the week, money owed, the team's news, and my season last.
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

  const openMatch = useCallback(
    (fixture: ImportedFixture) => {
      router.push({
        pathname: '/match-detail',
        params: { fixtureId: fixture.id, teamId: fixture.teamId },
      })
    },
    [],
  )

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
      } catch {
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

  return (
    <View style={styles.root}>
      {/* 1. Live strip: only while a match is actually being played. */}
      {liveFixture ? (
        <LiveMatchCard
          fixture={liveFixture}
          showOpenAction={!heroOwesDecision || !heroIsLive}
          onPress={() => openMatch(liveFixture)}
        />
      ) : null}

      {/* 2. Next up: what, when to be there, and am I coming. */}
      {heroEvent && !liveOwnsHero ? (
        <HomeSection title={t('homeHub.nextUp', { defaultValue: 'Next up' })}>
          <NextUpHero
            event={heroEvent}
            locale={locale}
            nowMs={nowMs}
            rsvpPending={Boolean(pendingIds[heroEvent.id])}
            onRsvp={(status, absence) => void onRsvp(heroEvent.id, status, absence)}
            onOpen={() => openEventOrMatch(heroEvent)}
          />
        </HomeSection>
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

      {/* 3. My tasks this week (Trikotwäsche and friends). */}
      <TasksSection tasks={dutyTasks} />

      {/* 4. The rest of the week; reply pills only where an answer is missing. */}
      <WeekAhead
        events={weekAhead}
        locale={locale}
        pendingIds={pendingIds}
        nowMs={nowMs}
        onRsvp={(eventId, status, absence) => void onRsvp(eventId, status, absence)}
        onOpen={openEventOrMatch}
      />

      {/* 5. Money, only while some is owed. */}
      <DuesRow dues={data.dues} locale={locale} />

      {/* 6. What the team is saying. */}
      <TeamPulse channel={data.teamChannel} announcements={data.announcements} />

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

const styles = StyleSheet.create({
  root: { gap: space.lg },
  staleNote: { textAlign: 'center' },
})
