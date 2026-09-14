import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type { ImportedFixture, StreaksResponse } from '@anstoss/shared'
import { api, ApiError } from '../api/client'

export type HomeEvent = {
  id: string
  type: string
  title: string
  date: string
  location?: string | null
  myRsvp: 'YES' | 'MAYBE' | 'NO' | null
  /** Answered before the date moved; asked again until re-confirmed. */
  myRsvpStale?: boolean
  yesCount: number
  maybeCount: number
  noCount: number
  team?: { id: string; name: string } | null
  cancelledAt?: string | null
  cancelReason?: string | null
}

export type HomeAnnouncement = { id: string; title: string; body: string }

export type HomeChannel = {
  id: string
  kind: string
  name: string
  unreadCount: number
  lastMessage: {
    id: string
    senderName: string
    contentPreview: string
    createdAt: string
  } | null
}

export type TeamSeasonStats = {
  played: number
  wins: number
  draws: number
  losses: number
  winRate: number
  goalDifference: number
  recentForm: Array<'W' | 'D' | 'L'>
}

export type PlayerHomeData = {
  events: HomeEvent[]
  fixtures: ImportedFixture[]
  announcements: HomeAnnouncement[]
  teamChannel: HomeChannel | null
  streaks: StreaksResponse['me'] | null
  /** Caller's 1-based rank on the club attendance leaderboard, if ranked. */
  streakRank: number | null
  seasonStats: TeamSeasonStats | null
}

export type UsePlayerHomeResult = {
  data: PlayerHomeData
  loading: boolean
  refreshing: boolean
  error: Error | null
  refresh: () => void
  /** Local optimistic patch for an RSVP reply, reconciled on the next load. */
  applyRsvp: (eventId: string, status: 'YES' | 'MAYBE' | 'NO' | null) => void
  /** Merge live RSVP counts arriving over the events socket. */
  applyRsvpCounts: (
    eventId: string,
    counts: { yesCount: number; maybeCount: number; noCount: number },
  ) => void
}

const EMPTY: PlayerHomeData = {
  events: [],
  fixtures: [],
  announcements: [],
  teamChannel: null,
  streaks: null,
  streakRank: null,
  seasonStats: null,
}

/** Enough to fill the hero plus a reply queue without over-fetching. */
const EVENT_LIMIT = 12

const soft = <T,>(fallback: T) => (): T => fallback

/**
 * Everything the player home screen renders, in one focus-refetched hook.
 *
 * Wave 1 fires every request the common case needs in parallel — the previous
 * implementation resolved events first and only then fetched fixtures, which
 * cost a full round trip before anything could paint. A second wave runs only
 * for players whose events span teams other than the active one, so the
 * single-team case (almost everyone) stays at one wave.
 *
 * Every sub-request degrades softly: a failing announcements call must not
 * blank the screen that holds the player's next match. `error` is raised only
 * when the events request itself fails, because that is the screen's spine.
 */
export function usePlayerHome(
  clubId: string | null,
  teamId: string | null,
  userId: string | null,
): UsePlayerHomeResult {
  const [data, setData] = useState<PlayerHomeData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // Guards against a slow first load resolving after a newer one and
  // overwriting fresher data with stale rows.
  const requestSeq = useRef(0)

  const fetchAll = useCallback(async () => {
    if (!clubId) {
      setData(EMPTY)
      setError(null)
      setLoading(false)
      setRefreshing(false)
      return
    }
    const seq = ++requestSeq.current

    const [events, announcements, channels, streaks, seasonStats, teamFixtures] =
      await Promise.all([
        api<HomeEvent[]>(
          `/clubs/${clubId}/events?scope=upcoming&mine=1&limit=${EVENT_LIMIT}`,
        ).catch((err: unknown) => {
          if (seq === requestSeq.current) {
            setError(err instanceof Error ? err : new Error(String(err)))
          }
          return null
        }),
        api<HomeAnnouncement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(soft([])),
        teamId
          ? api<HomeChannel[]>(`/teams/${teamId}/channels`).catch(soft([]))
          : Promise.resolve([] as HomeChannel[]),
        api<StreaksResponse>(`/clubs/${clubId}/streaks`).catch(soft(null)),
        teamId
          ? api<TeamSeasonStats>(`/clubs/${clubId}/teams/${teamId}/season-stats`).catch(
              soft(null),
            )
          : Promise.resolve(null),
        teamId ? fetchFixturesForTeams([teamId]) : Promise.resolve([] as ImportedFixture[]),
      ])

    if (seq !== requestSeq.current) return

    // Coerce every list: a proxy, an older API shape, or an error envelope
    // must degrade to "nothing to show" rather than throw inside render.
    const eventList = asArray<HomeEvent>(events)
    if (events !== null) setError(null)

    // Wave 2 — only for events belonging to a team we have no fixtures for.
    const extraTeamIds = Array.from(
      new Set(
        eventList
          .map((event) => event.team?.id)
          .filter((id): id is string => Boolean(id) && id !== teamId),
      ),
    )
    const extraFixtures = extraTeamIds.length
      ? await fetchFixturesForTeams(extraTeamIds)
      : []

    if (seq !== requestSeq.current) return

    const leaderboard = asArray<StreaksResponse['leaderboard'][number]>(streaks?.leaderboard)
    const rankIndex = userId ? leaderboard.findIndex((row) => row.userId === userId) : -1

    setData({
      events: eventList,
      fixtures: dedupeById([...teamFixtures, ...extraFixtures]),
      announcements: asArray<HomeAnnouncement>(announcements),
      teamChannel:
        asArray<HomeChannel>(channels).find((channel) => channel.kind === 'TEAM') ?? null,
      streaks: streaks?.me ?? null,
      streakRank: rankIndex >= 0 ? rankIndex + 1 : null,
      seasonStats: seasonStats ?? null,
    })
    setLoading(false)
    setRefreshing(false)
  }, [clubId, teamId, userId])

  useFocusEffect(
    useCallback(() => {
      void fetchAll()
    }, [fetchAll]),
  )

  const refresh = useCallback(() => {
    setRefreshing(true)
    void fetchAll()
  }, [fetchAll])

  const applyRsvp = useCallback(
    (eventId: string, status: 'YES' | 'MAYBE' | 'NO' | null) => {
      setData((prev) => ({
        ...prev,
        events: prev.events.map((event) =>
          event.id === eventId ? { ...event, myRsvp: status, myRsvpStale: false } : event,
        ),
      }))
    },
    [],
  )

  const applyRsvpCounts = useCallback(
    (
      eventId: string,
      counts: { yesCount: number; maybeCount: number; noCount: number },
    ) => {
      setData((prev) => ({
        ...prev,
        events: prev.events.map((event) =>
          event.id === eventId ? { ...event, ...counts } : event,
        ),
      }))
    },
    [],
  )

  return { data, loading, refreshing, error, refresh, applyRsvp, applyRsvpCounts }
}

async function fetchFixturesForTeams(teamIds: string[]): Promise<ImportedFixture[]> {
  const groups = await Promise.all(
    teamIds.flatMap((id) => [
      api<ImportedFixture[]>(`/teams/${id}/fixtures?scope=upcoming&limit=5`).catch(
        soft([] as ImportedFixture[]),
      ),
      api<ImportedFixture[]>(`/teams/${id}/fixtures?scope=recent&limit=5`).catch(
        soft([] as ImportedFixture[]),
      ),
    ]),
  )
  return dedupeById(groups.flatMap((group) => asArray<ImportedFixture>(group)))
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function dedupeById(fixtures: ImportedFixture[]): ImportedFixture[] {
  const seen = new Set<string>()
  return fixtures.filter((fixture) => {
    if (seen.has(fixture.id)) return false
    seen.add(fixture.id)
    return true
  })
}

/** A 403/404 from a club-scoped read means "not a member yet", not a failure. */
export function isMissingAccess(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 403 || err.status === 404)
}
