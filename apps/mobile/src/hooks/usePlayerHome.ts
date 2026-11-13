import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type {
  ImportedFixture,
  MyContributionSummary,
  RosterOpsSnapshot,
  StreaksResponse,
  TeamDutyAssignment,
} from '@anstoss/shared'
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
  /** Matchday logistics, present when the coach filled them in. */
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  meetingAt?: string | null
  meetingPoint?: string | null
  fixtureId?: string | null
  carpoolEnabled?: boolean
  squadSize?: number
}

/**
 * Money the member still owes, one amount per currency (cents), soonest
 * first. Null when nothing is due.
 */
export type HomeDues = {
  amounts: Array<{ cents: number; currency: string }>
  overdue: boolean
  /** Due date of the earliest owed item ("Beitrag Dezember · fällig 15.12."). */
  dueDate?: string | null
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
  /** The caller's own open team duties (Trikotwäsche, Leibchen) from roster-ops. */
  duties: TeamDutyAssignment[]
  dues: HomeDues | null
}

export type UsePlayerHomeResult = {
  data: PlayerHomeData
  loading: boolean
  refreshing: boolean
  error: Error | null
  refresh: () => void
  /**
   * Quiet re-read of the events list after a realtime change: no spinner,
   * one request, bursts collapsed into one call ~1.5 s after the last edit.
   */
  scheduleSilentRefresh: () => void
  /** When the events list last loaded successfully (ms), for the stale note. */
  updatedAt: number | null
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
  duties: [],
  dues: null,
}

/** Enough to fill the hero plus a reply queue without over-fetching. */
const EVENT_LIMIT = 12

const soft = <T,>(fallback: T) => (): T => fallback

/** Marks a sub-request that failed, so the previous value is kept. */
const FAILED = Symbol('failed')
type Maybe<T> = T | typeof FAILED
const keep = <T,>(promise: Promise<T>): Promise<Maybe<T>> =>
  promise.catch(() => FAILED as typeof FAILED)

export const SILENT_REFRESH_DEBOUNCE_MS = 1500

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
 * blank the screen that holds the player's next match. A failed request keeps
 * what the screen already showed for the same club/team (stale-while-
 * revalidate) instead of wiping it. `error` is raised only when the events
 * request itself fails, because that is the screen's spine; the screen then
 * shows "Letzter Stand von …" under the kept content.
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
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  // Guards against a slow first load resolving after a newer one and
  // overwriting fresher data with stale rows.
  const requestSeq = useRef(0)
  // Whose data is on screen. Kept data is only reused for the same scope; a
  // team switch starts from empty so no row of the old team survives.
  const scopeKey = `${clubId ?? ''}:${teamId ?? ''}:${userId ?? ''}`
  const shownScope = useRef<string | null>(null)
  const silentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAll = useCallback(async () => {
    if (!clubId) {
      setData(EMPTY)
      setError(null)
      setLoading(false)
      setRefreshing(false)
      return
    }
    const seq = ++requestSeq.current

    const [events, announcements, channels, streaks, seasonStats, teamFixtures, rosterOps, dues] =
      await Promise.all([
        keep(
          api<HomeEvent[]>(`/clubs/${clubId}/events?scope=upcoming&mine=1&limit=${EVENT_LIMIT}`),
        ),
        keep(api<HomeAnnouncement[]>(`/clubs/${clubId}/announcements?limit=3`)),
        teamId
          ? keep(api<HomeChannel[]>(`/teams/${teamId}/channels`))
          : Promise.resolve([] as HomeChannel[]),
        keep(api<StreaksResponse>(`/clubs/${clubId}/streaks`)),
        teamId
          ? keep(api<TeamSeasonStats>(`/clubs/${clubId}/teams/${teamId}/season-stats`))
          : Promise.resolve(null),
        teamId ? fetchFixturesForTeams([teamId]) : Promise.resolve([] as ImportedFixture[]),
        teamId
          ? keep(api<RosterOpsSnapshot>(`/clubs/${clubId}/teams/${teamId}/roster-ops`))
          : Promise.resolve(null),
        keep(api<MyContributionSummary>(`/clubs/${clubId}/contributions/my`)),
      ])

    if (seq !== requestSeq.current) return

    const eventsFailed = events === FAILED
    // Coerce every list: a proxy, an older API shape, or an error envelope
    // must degrade to "nothing to show" rather than throw inside render.
    const eventList = eventsFailed ? null : asArray<HomeEvent>(events)

    // Wave 2 — only for events belonging to a team we have no fixtures for.
    const extraTeamIds = Array.from(
      new Set(
        (eventList ?? [])
          .map((event) => event.team?.id)
          .filter((id): id is string => Boolean(id) && id !== teamId),
      ),
    )
    const extraFixtures = extraTeamIds.length ? await fetchFixturesForTeams(extraTeamIds) : []

    if (seq !== requestSeq.current) return

    const sameScope = shownScope.current === scopeKey
    shownScope.current = scopeKey

    setData((current) => {
      const prev = sameScope ? current : EMPTY
      const pick = <T,>(value: Maybe<T>, fallback: T): T => (value === FAILED ? fallback : value)
      const streakRes = pick(streaks, null)
      const leaderboard = asArray<StreaksResponse['leaderboard'][number]>(streakRes?.leaderboard)
      const rankIndex = userId ? leaderboard.findIndex((row) => row.userId === userId) : -1
      const ops = pick(rosterOps, undefined as RosterOpsSnapshot | null | undefined)
      const contributions = pick(dues, undefined as MyContributionSummary | null | undefined)
      return {
        events: eventList ?? prev.events,
        fixtures: eventsFailed && prev.fixtures.length
          ? prev.fixtures
          : dedupeById([...teamFixtures, ...extraFixtures]),
        announcements:
          announcements === FAILED ? prev.announcements : asArray<HomeAnnouncement>(announcements),
        teamChannel:
          channels === FAILED
            ? prev.teamChannel
            : (asArray<HomeChannel>(channels).find((channel) => channel.kind === 'TEAM') ?? null),
        streaks: streaks === FAILED ? prev.streaks : (streakRes?.me ?? null),
        streakRank:
          streaks === FAILED ? prev.streakRank : rankIndex >= 0 ? rankIndex + 1 : null,
        seasonStats: seasonStats === FAILED ? prev.seasonStats : (seasonStats ?? null),
        duties: ops === undefined ? prev.duties : myOpenDuties(ops, userId),
        dues: contributions === undefined ? prev.dues : outstandingDues(contributions),
      }
    })
    if (eventsFailed) {
      setError(new Error('events request failed'))
    } else {
      setError(null)
      setUpdatedAt(Date.now())
    }
    setLoading(false)
    setRefreshing(false)
  }, [clubId, teamId, userId, scopeKey])

  /** Events only, no spinner: what a realtime upsert can have changed. */
  const refetchEventsSilently = useCallback(async () => {
    if (!clubId) return
    const seq = ++requestSeq.current
    const events = await keep(
      api<HomeEvent[]>(`/clubs/${clubId}/events?scope=upcoming&mine=1&limit=${EVENT_LIMIT}`),
    )
    if (seq !== requestSeq.current || events === FAILED) return
    setData((prev) => ({ ...prev, events: asArray<HomeEvent>(events) }))
    setError(null)
    setUpdatedAt(Date.now())
  }, [clubId])

  // A team switch must never paint the previous team's rows: clear at once.
  useEffect(() => {
    if (shownScope.current !== null && shownScope.current !== scopeKey) {
      requestSeq.current += 1
      shownScope.current = null
      setData(EMPTY)
      setError(null)
      setUpdatedAt(null)
      setLoading(true)
    }
  }, [scopeKey])

  useFocusEffect(
    useCallback(() => {
      void fetchAll()
    }, [fetchAll]),
  )

  const refresh = useCallback(() => {
    setRefreshing(true)
    void fetchAll()
  }, [fetchAll])

  const scheduleSilentRefresh = useCallback(() => {
    if (silentTimer.current) clearTimeout(silentTimer.current)
    silentTimer.current = setTimeout(() => {
      silentTimer.current = null
      void refetchEventsSilently()
    }, SILENT_REFRESH_DEBOUNCE_MS)
  }, [refetchEventsSilently])

  useEffect(
    () => () => {
      if (silentTimer.current) clearTimeout(silentTimer.current)
    },
    [],
  )

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

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    scheduleSilentRefresh,
    updatedAt,
    applyRsvp,
    applyRsvpCounts,
  }
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

/** Pending duties assigned to this user, soonest first. */
export function myOpenDuties(
  ops: RosterOpsSnapshot | null | undefined,
  userId: string | null,
): TeamDutyAssignment[] {
  if (!userId) return []
  const pending = asArray<TeamDutyAssignment>(ops?.kit?.pending)
  return pending
    .filter((duty) => duty.assignedUserId === userId && duty.status === 'PENDING')
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
}

const DUE_SOON_MS = 14 * 24 * 60 * 60 * 1000

/**
 * What the member owes right now: overdue and part-paid plans, plus pending
 * ones due within two weeks. A payment the member already reported is with
 * the Kassenwart, so it does not count as owed. Amounts in different
 * currencies are never added together; each currency is its own total.
 */
export function outstandingDues(
  summary: MyContributionSummary | null | undefined,
  nowMs = Date.now(),
): HomeDues | null {
  const items = asArray<MyContributionSummary['items'][number]>(summary?.items)
  const byCurrency = new Map<string, number>()
  let overdue = false
  let earliest: number | null = null
  for (const item of items) {
    if (item.paymentReported) continue
    const due = new Date(item.dueDate).getTime()
    const owed =
      item.status === 'OVERDUE' ||
      item.status === 'PARTIAL' ||
      (item.status === 'PENDING' && Number.isFinite(due) && due - nowMs <= DUE_SOON_MS)
    if (!owed) continue
    const remaining = Math.max(0, item.amount - (item.paidAmount ?? 0))
    if (remaining === 0) continue
    const currency = (item.currency || 'EUR').toUpperCase()
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + remaining)
    if (item.status === 'OVERDUE') overdue = true
    if (Number.isFinite(due) && (earliest === null || due < earliest)) earliest = due
  }
  if (byCurrency.size === 0) return null
  return {
    amounts: Array.from(byCurrency, ([currency, cents]) => ({ cents, currency })),
    overdue,
    dueDate: earliest === null ? null : new Date(earliest).toISOString(),
  }
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
