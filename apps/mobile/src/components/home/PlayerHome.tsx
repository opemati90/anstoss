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
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { useAuth } from '../../context/AuthContext'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { space } from '../../theme/tokens'
import { findFixtureForEvent } from '../../lib/matchFixtureLink'
import { Haptics } from '../../utils/haptics'
import { NextUpHero, isInCheckInWindow } from './NextUpHero'
import { LiveMatchCard } from './LiveMatchCard'
import { ReplyQueue } from './ReplyQueue'
import { WeekAhead } from './WeekAhead'
import { SeasonStrip } from './SeasonStrip'
import { TeamPulse } from './TeamPulse'
import { PlayerHomeSkeleton } from './PlayerHomeSkeleton'
import type { RsvpStatus } from './RsvpControl'

export type PlayerHomeProps = {
  clubId: string
  teamId: string | null
  /** Bubbles refresh state up to the screen's scroll view. */
  onRefreshStateChange?: (state: { refresh: () => void; refreshing: boolean }) => void
}

/**
 * The player's home screen.
 *
 * Rebuilt 2026-09-11 around a single question — *what do I have to do?* —
 * instead of the previous stack of same-weight cards. The order is the
 * priority order: who you are, the next thing and its decision, everything
 * else you still owe an answer on, your own season, then the team's noise.
 */
export function PlayerHome({ clubId, teamId, onRefreshStateChange }: PlayerHomeProps) {
  const { t } = useTranslation()
  const { user, activeClub, token } = useAuth()
  const locale = getAppLocale(getAppLanguage())

  const { data, loading, refreshing, error, refresh, applyRsvp, applyRsvpCounts } =
    usePlayerHome(clubId, teamId, user?.id ?? null)

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
    onEventUpsert: useCallback(() => refresh(), [refresh]),
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
    heroEvent && (!heroEvent.myRsvp || isInCheckInWindow(heroEvent.date, nowMs)),
  )
  const liveOwnsHero = Boolean(heroIsLive && !heroOwesDecision)

  // Everything past the hero splits in two: what still needs an answer (loud,
  // answerable in place) and what is merely scheduled (quiet, one line). The
  // hero's own event belongs to neither — it is already the hero, or the live
  // card took it over.
  const rest = useMemo(() => data.events.slice(1), [data.events])
  const replyQueue = useMemo(() => rest.filter((event) => !event.myRsvp), [rest])
  const weekAhead = useMemo(
    () =>
      rest.filter(
        (event) => Boolean(event.myRsvp) && fixtureFor(event)?.id !== liveFixture?.id,
      ),
    [fixtureFor, liveFixture?.id, rest],
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
    async (eventId: string, status: RsvpStatus) => {
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
          body: { status },
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

  if (loading && data.events.length === 0 && !error) {
    return <PlayerHomeSkeleton />
  }

  if (error && data.events.length === 0) {
    return (
      <View style={styles.root}>
        <ErrorState
          message={t('states.home.error.title', {
            defaultValue: "Couldn't load your week",
          })}
          hint={t('states.home.error.body', {
            defaultValue: 'Check your connection and pull down to try again.',
          })}
          retryLabel={t('common.retry', { defaultValue: 'Try again' })}
          onRetry={refresh}
        />
      </View>
    )
  }

  return (
    <View style={styles.root}>

      {liveFixture ? (
        <LiveMatchCard
          fixture={liveFixture}
          showOpenAction={!heroOwesDecision || !heroIsLive}
          onPress={() => openMatch(liveFixture)}
        />
      ) : null}

      {heroEvent && !liveOwnsHero ? (
        <NextUpHero
          event={heroEvent}
          locale={locale}
          nowMs={nowMs}
          rsvpPending={Boolean(pendingIds[heroEvent.id])}
          onRsvp={(status) => void onRsvp(heroEvent.id, status)}
          onOpen={() => openEventOrMatch(heroEvent)}
        />
      ) : null}

      {!heroEvent && !liveFixture ? (
        <EmptyState
          icon="calendar"
          illustration="emptyHome"
          title={t('home.welcome.title', {
            defaultValue: 'Welcome to {{clubName}}!',
            clubName: activeClub?.club?.name ?? '',
          })}
          description={t('home.welcome.subtitle', {
            defaultValue:
              'Your upcoming matches will appear here. Ask your coach to schedule your first event.',
          })}
        />
      ) : null}

      <ReplyQueue
        events={replyQueue}
        locale={locale}
        pendingIds={pendingIds}
        onRsvp={(eventId, status) => void onRsvp(eventId, status)}
        onOpen={openEventOrMatch}
      />

      <WeekAhead events={weekAhead} locale={locale} onOpen={openEventOrMatch} />

      <SeasonStrip
        streaks={data.streaks}
        rank={data.streakRank}
        seasonStats={data.seasonStats}
      />

      <TeamPulse channel={data.teamChannel} announcements={data.announcements} />

      {error ? (
        <Text variant="caption1" color="tertiary" style={styles.staleNote}>
          {t('states.home.stale', {
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
