import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  studioContextSchema,
  type EventDetail,
  type MatchLiveStateDto,
  type StudioContext,
} from '@anstoss/shared'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_PRIMARY } from '../theme/colors'
import { canUseStudio } from '../studio/access'
import type { StudioMatchInput, StudioMatchState } from '../studio/buildGraphicData'

type ClubLike = { id: string; name: string; primaryColor?: string | null; badgeUrl?: string | null }
const HEX = /^#[0-9a-fA-F]{6}$/

class StudioContextMismatchError extends Error {
  constructor() {
    super('Studio context does not match the active selection')
    this.name = 'StudioContextMismatchError'
  }
}

function matchState(event: EventDetail, live: MatchLiveStateDto | null): StudioMatchState {
  if (event.cancelledAt) return 'CANCELLED'
  if (live?.abandonedAt) return 'ABANDONED'
  switch (live?.status) {
    case 'FIRST_HALF':
    case 'HALF_TIME':
    case 'SECOND_HALF':
    case 'FINISHED':
      return live.status
    default:
      return 'SCHEDULED'
  }
}

export function toStudioMatchInput(
  club: ClubLike | null,
  event: EventDetail | null,
  live: MatchLiveStateDto | null,
  consents: StudioContext['consents'],
): StudioMatchInput {
  const base = {
    club: {
      name: club?.name ?? '',
      color:
        club?.primaryColor && HEX.test(club.primaryColor) ? club.primaryColor : DEFAULT_PRIMARY,
      crestUrl: club?.badgeUrl ?? null,
    },
    consents,
  }
  if (!event) {
    return {
      ...base,
      opponent: null,
      homeAway: null,
      date: null,
      venue: null,
      competition: null,
      state: 'SCHEDULED',
      hasLiveData: false,
      goalsFor: 0,
      goalsAgainst: 0,
      events: [],
      lineup: null,
    }
  }
  const opponent = live?.opponent ?? event.opponent ?? null
  const state = matchState(event, live)
  return {
    ...base,
    opponent: opponent ? { name: opponent, color: live?.opponentColor ?? null } : null,
    homeAway: live?.homeAway ?? event.homeAway ?? null,
    date: event.date,
    venue: event.location,
    competition: event.competition
      ? { name: event.competition.name, matchday: event.competition.matchday ?? null }
      : null,
    state,
    hasLiveData: Boolean(live && live.status !== 'NOT_STARTED'),
    goalsFor: live?.goalsFor ?? 0,
    goalsAgainst: live?.goalsAgainst ?? 0,
    halfTime: live?.halfTime ?? null,
    shootout: live?.shootout ?? null,
    events: (live?.events ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      minute: e.minute,
      playerUserId: e.playerUserId,
      playerName: e.playerName,
      relatedUserId: e.relatedUserId,
      ownGoal: e.ownGoal,
      createdAt: e.createdAt,
    })),
    lineup: event.lineup
      ? {
          formation: event.lineup.formation,
          starters: event.lineup.starters.map((p) => ({
            userId: p.userId ?? null,
            name: p.name,
            number: p.number ?? null,
            position: p.position ?? null,
          })),
        }
      : null,
  }
}

/**
 * One atomic snapshot per authenticated club/team/event selection. There is no
 * club-wide fallback when context/consent is unavailable: export must fail closed.
 * This foundation is not exposed in navigation until the server contract exists.
 */
export function useStudioMatch(requestedEventId?: string | null) {
  const { user, token, activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const club = activeClub?.club ?? null
  const clubId = club?.id ?? null
  const teamId = activeTeamId ?? activeTeamAccess?.team.id ?? null
  const teamAccess =
    activeTeamAccess?.status === 'ACTIVE' &&
    activeTeamAccess.team.clubId === clubId &&
    activeTeamAccess.team.id === teamId
      ? activeTeamAccess
      : null
  const allowed = Boolean(user && token && clubId && canUseStudio(activeClub, teamAccess))
  const permissionScope = JSON.stringify([
    activeClub?.role,
    activeClub?.operationalRoles,
    activeClub?.permissions,
    teamAccess?.role,
    teamAccess?.status,
  ])
  // An identity object prevents A -> B -> A from accepting A's earlier request.
  const scope = useMemo(
    () => ({ clubId, teamId, userId: user?.id, token, allowed, requestedEventId, permissionScope }),
    [clubId, teamId, user?.id, token, allowed, requestedEventId, permissionScope],
  )
  const currentScope = useRef(scope)
  currentScope.current = scope
  const mounted = useRef(false)
  const request = useRef(0)
  const saving = useRef(false)
  type Snapshot = {
    scope: typeof scope
    event: EventDetail | null
    live: MatchLiveStateDto | null
    consents: StudioContext['consents']
    loading: boolean
    ready: boolean
    error: boolean
  }
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const currentSnapshot = useRef(snapshot)
  currentSnapshot.current = snapshot

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current += 1
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!mounted.current || currentScope.current !== scope) return
    const ticket = ++request.current
    const isCurrent = () =>
      mounted.current && currentScope.current === scope && ticket === request.current
    if (!scope.allowed || !scope.clubId) {
      setSnapshot(null)
      return
    }
    setSnapshot({
      scope,
      event: null,
      live: null,
      consents: [],
      loading: true,
      ready: false,
      error: false,
    })
    try {
      const query = [
        scope.teamId ? `teamId=${encodeURIComponent(scope.teamId)}` : null,
        scope.requestedEventId ? `eventId=${encodeURIComponent(scope.requestedEventId)}` : null,
      ]
        .filter(Boolean)
        .join('&')
      const base = `/clubs/${encodeURIComponent(scope.clubId)}`
      const context = studioContextSchema.parse(
        await api<unknown>(`${base}/studio/context${query ? `?${query}` : ''}`),
      )
      if (!isCurrent()) return
      if (scope.requestedEventId && context.eventId !== scope.requestedEventId)
        throw new StudioContextMismatchError()
      if (!context.eventId) {
        setSnapshot({
          scope,
          event: null,
          live: null,
          consents: [],
          loading: false,
          ready: true,
          error: false,
        })
        return
      }
      const path = `${base}/events/${encodeURIComponent(context.eventId)}`
      const [event, live] = await Promise.all([
        api<EventDetail>(path),
        api<MatchLiveStateDto | null>(`${path}/live`),
      ])
      if (!isCurrent()) return
      if (
        !event ||
        event.id !== context.eventId ||
        event.clubId !== scope.clubId ||
        event.type !== 'MATCH' ||
        (scope.teamId && event.teamId !== scope.teamId) ||
        (live && live.eventId !== event.id)
      )
        throw new StudioContextMismatchError()
      setSnapshot({
        scope,
        event,
        live,
        consents: context.consents,
        loading: false,
        ready: true,
        error: false,
      })
    } catch {
      if (isCurrent())
        setSnapshot({
          scope,
          event: null,
          live: null,
          consents: [],
          loading: false,
          ready: false,
          error: true,
        })
    }
  }, [scope])

  useEffect(() => {
    void refresh()
  }, [refresh])
  const visible = allowed && snapshot?.scope === scope ? snapshot : null
  const event = visible?.event ?? null
  const live = visible?.live ?? null

  const saveResult = useCallback(
    async (goalsFor: number, goalsAgainst: number) => {
      if (
        saving.current ||
        !mounted.current ||
        currentScope.current !== scope ||
        !scope.allowed ||
        !currentSnapshot.current?.ready ||
        currentSnapshot.current.scope !== scope ||
        !event ||
        !live?.canRecord ||
        !event.viewer.canManage ||
        event.cancelledAt ||
        ![goalsFor, goalsAgainst].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)
      )
        return false
      saving.current = true
      const ticket = ++request.current
      try {
        const next = await api<MatchLiveStateDto>(
          `/clubs/${encodeURIComponent(scope.clubId!)}/events/${encodeURIComponent(event.id)}/live/result`,
          { method: 'PUT', body: { goalsFor, goalsAgainst } },
        )
        if (
          !mounted.current ||
          currentScope.current !== scope ||
          request.current !== ticket ||
          next?.eventId !== event.id ||
          next.status !== 'FINISHED' ||
          next.goalsFor !== goalsFor ||
          next.goalsAgainst !== goalsAgainst
        )
          return false
        setSnapshot((previous) =>
          previous?.scope === scope ? { ...previous, live: next } : previous,
        )
        return true
      } catch {
        return false
      } finally {
        saving.current = false
      }
    },
    [scope, event, live],
  )

  return {
    match: toStudioMatchInput(allowed ? club : null, event, live, visible?.consents ?? []),
    event,
    live,
    loading: allowed && (!visible || visible.loading),
    ready: Boolean(visible?.ready),
    error: Boolean(visible?.error),
    refresh,
    saveResult,
  }
}
