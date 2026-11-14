import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  STUDIO_CREDIT_COSTS,
  STUDIO_CREDIT_CURRENCY,
  STUDIO_CREDIT_PACKS,
  STUDIO_MONTHLY_CREDITS,
  type CreateStudioGraphicInput,
  type EventDetail,
  type EventFeedItem,
  type MatchLiveStateDto,
  type StudioAiCaptionInput,
  type StudioAiCaptionResponse,
  type StudioAiTemplateSetResponse,
  type StudioAiVariantsInput,
  type StudioAiVariantsResponse,
  type StudioBrandKit,
  type StudioContext,
  type StudioCreditCheckoutResponse,
  type StudioCredits,
  type StudioGraphic,
  type UpdateStudioBrandKitInput,
} from '@anstoss/shared'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { ACCENT, DEFAULT_PRIMARY, INK } from '../theme/colors'
import { STUDIO_CHALK } from '../theme/studio'
import { canBuyStudioCredits, canUseStudio } from '../studio/access'
import type { StudioMatchInput, StudioMatchState } from '../studio/buildGraphicData'
import { useClubPlan } from './useClubPlan'

/**
 * Matchday Studio data (packages/shared schemas/studio.ts).
 *
 * Every read is stale-while-revalidate over a small module cache, and every
 * read degrades quietly: against a server without the Studio endpoints the
 * brand kit falls back to the club's own colours, the balance to zero and the
 * consent list to empty (which hides every name, see buildGraphicData).
 */

type ClubLike = { id: string; name: string; primaryColor?: string | null; badgeUrl?: string | null }

// ─── Access ─────────────────────────────────────────────────────────────────

export function useStudioAccess() {
  const { activeClub, activeTeamAccess } = useAuth()
  const { plan, loading } = useClubPlan()
  return useMemo(
    () => ({
      /** Role: Vorstand, Teammanager, Kapitän, coach or Medienwart. */
      allowed: canUseStudio(activeClub, activeTeamAccess),
      /** Plan: the `matchdayStudio` feature flag (Verein). */
      unlocked: Boolean(plan?.features?.matchdayStudio),
      loading: loading && !plan,
      canBuy: canBuyStudioCredits(activeClub),
    }),
    [activeClub, activeTeamAccess, plan, loading],
  )
}

// ─── Brand kit ──────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/

export function fallbackBrandKit(club: ClubLike | null): StudioBrandKit {
  return {
    clubId: club?.id ?? '',
    crestUrl: club?.badgeUrl ?? null,
    sponsors: [],
    colors: {
      primary: club?.primaryColor && HEX.test(club.primaryColor) ? club.primaryColor : DEFAULT_PRIMARY,
      accent: ACCENT,
      dark: INK,
      light: STUDIO_CHALK,
    },
    fontPairing: 'CONDENSED',
    handle: null,
    hashtags: [],
    accounts: [
      { channel: 'INSTAGRAM', connected: false, handle: null },
      { channel: 'FACEBOOK', connected: false, handle: null },
    ],
    templateSetAt: null,
  }
}

const kitCache = new Map<string, StudioBrandKit>()
const kitListeners = new Set<(clubId: string, kit: StudioBrandKit) => void>()

function publishKit(clubId: string, kit: StudioBrandKit) {
  kitCache.set(clubId, kit)
  kitListeners.forEach((listener) => listener(clubId, kit))
}

function normalizeKit(raw: Partial<StudioBrandKit> | null | undefined, fallback: StudioBrandKit): StudioBrandKit {
  if (!raw || typeof raw !== 'object') return fallback
  return {
    ...fallback,
    ...raw,
    sponsors: Array.isArray(raw.sponsors) ? raw.sponsors : fallback.sponsors,
    colors: { ...fallback.colors, ...(raw.colors ?? {}) },
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags : fallback.hashtags,
    accounts: Array.isArray(raw.accounts) && raw.accounts.length > 0 ? raw.accounts : fallback.accounts,
  }
}

export function useStudioBrandKit() {
  const { activeClub } = useAuth()
  const club = activeClub?.club ?? null
  const clubId = club?.id ?? null
  const fallback = useMemo(() => fallbackBrandKit(club), [club])
  const [kit, setKit] = useState<StudioBrandKit>(() => (clubId && kitCache.get(clubId)) || fallback)
  const [loading, setLoading] = useState(Boolean(clubId && !kitCache.has(clubId)))

  const refresh = useCallback(async () => {
    if (!clubId) return
    try {
      const raw = await api<Partial<StudioBrandKit>>(`/clubs/${clubId}/studio/brand-kit`)
      publishKit(clubId, normalizeKit(raw, fallback))
    } catch {
      if (!kitCache.has(clubId)) setKit(fallback)
    } finally {
      setLoading(false)
    }
  }, [clubId, fallback])

  useEffect(() => {
    if (!clubId) return
    const onUpdate = (id: string, next: StudioBrandKit) => {
      if (id === clubId) setKit(next)
    }
    kitListeners.add(onUpdate)
    setKit(kitCache.get(clubId) ?? fallback)
    void refresh()
    return () => {
      kitListeners.delete(onUpdate)
    }
  }, [clubId, fallback, refresh])

  /** PUT …/studio/brand-kit. Optimistic; a failed save keeps the local choice. */
  const save = useCallback(
    async (patch: UpdateStudioBrandKitInput) => {
      if (!clubId) return
      const current = kitCache.get(clubId) ?? fallback
      publishKit(clubId, { ...current, ...patch } as StudioBrandKit)
      try {
        const raw = await api<Partial<StudioBrandKit>>(`/clubs/${clubId}/studio/brand-kit`, {
          method: 'PUT',
          body: patch,
        })
        publishKit(clubId, normalizeKit(raw, fallback))
      } catch {
        // Offline or no backend yet: the choice stays for this session.
      }
    },
    [clubId, fallback],
  )

  return { kit, loading, refresh, save }
}

// ─── Credits ────────────────────────────────────────────────────────────────

export function fallbackCredits(clubId: string, canBuy: boolean): StudioCredits {
  const now = new Date()
  return {
    clubId,
    balance: 0,
    monthlyAllowance: STUDIO_MONTHLY_CREDITS,
    monthlyRemaining: 0,
    purchasedRemaining: 0,
    resetsAt: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    costs: { ...STUDIO_CREDIT_COSTS },
    packs: STUDIO_CREDIT_PACKS.map((pack) => ({ ...pack, currency: STUDIO_CREDIT_CURRENCY })),
    canBuy,
    ledger: [],
  }
}

const creditsCache = new Map<string, StudioCredits>()
const creditsListeners = new Set<(clubId: string, credits: StudioCredits) => void>()

function publishCredits(clubId: string, credits: StudioCredits) {
  creditsCache.set(clubId, credits)
  creditsListeners.forEach((listener) => listener(clubId, credits))
}

/** An AI response carries the new balance; every chip updates at once. */
function publishBalance(clubId: string, balance: number | undefined) {
  const current = creditsCache.get(clubId)
  if (!current || typeof balance !== 'number') return
  publishCredits(clubId, { ...current, balance })
}

export function useStudioCredits() {
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const canBuy = canBuyStudioCredits(activeClub)
  const [credits, setCredits] = useState<StudioCredits | null>(
    clubId ? (creditsCache.get(clubId) ?? null) : null,
  )

  const refresh = useCallback(async () => {
    if (!clubId) return
    const fallback = fallbackCredits(clubId, canBuy)
    try {
      const raw = await api<Partial<StudioCredits>>(`/clubs/${clubId}/studio/credits`)
      publishCredits(clubId, {
        ...fallback,
        ...raw,
        costs: { ...fallback.costs, ...(raw?.costs ?? {}) },
        packs: Array.isArray(raw?.packs) && raw.packs.length > 0 ? raw.packs : fallback.packs,
        ledger: Array.isArray(raw?.ledger) ? raw.ledger : [],
      })
    } catch {
      if (!creditsCache.has(clubId)) publishCredits(clubId, fallback)
    }
  }, [clubId, canBuy])

  useEffect(() => {
    if (!clubId) return
    const onUpdate = (id: string, next: StudioCredits) => {
      if (id === clubId) setCredits(next)
    }
    creditsListeners.add(onUpdate)
    setCredits(creditsCache.get(clubId) ?? null)
    void refresh()
    return () => {
      creditsListeners.delete(onUpdate)
    }
  }, [clubId, refresh])

  /** POST …/studio/credits/checkout → website checkout URL (never in-app purchase). */
  const checkout = useCallback(
    async (packId: string) => {
      if (!clubId) return null
      const res = await api<StudioCreditCheckoutResponse>(`/clubs/${clubId}/studio/credits/checkout`, {
        method: 'POST',
        body: { packId },
      })
      return res?.url ?? null
    },
    [clubId],
  )

  return { credits, balance: credits?.balance ?? 0, loading: credits === null, refresh, checkout }
}

// ─── AI actions and archive ─────────────────────────────────────────────────

export function useStudioActions() {
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id ?? null

  const post = useCallback(
    async <T extends { balance?: number }>(path: string, body: unknown): Promise<T> => {
      if (!clubId) throw new Error('No active club')
      const res = await api<T>(`/clubs/${clubId}/studio/${path}`, { method: 'POST', body })
      publishBalance(clubId, res?.balance)
      return res
    },
    [clubId],
  )

  return useMemo(
    () => ({
      variants: (input: StudioAiVariantsInput) => post<StudioAiVariantsResponse>('ai/variants', input),
      caption: (input: StudioAiCaptionInput) => post<StudioAiCaptionResponse>('ai/caption', input),
      templateSet: async () => {
        const res = await post<StudioAiTemplateSetResponse>('ai/template-set', {})
        if (clubId && res?.templateSetAt) {
          const current = kitCache.get(clubId)
          if (current) publishKit(clubId, { ...current, templateSetAt: res.templateSetAt })
        }
        return res
      },
      /** Archive (and direct post on connected channels). */
      saveGraphic: (input: CreateStudioGraphicInput) => post<StudioGraphic & { balance?: number }>('graphics', input),
      connectAccount: (channel: 'INSTAGRAM' | 'FACEBOOK') =>
        post<{ url: string; balance?: number }>(`accounts/${channel.toLowerCase()}/connect`, {}),
    }),
    [post, clubId],
  )
}

// ─── Match binding ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** Without the context endpoint: the match that just ran, else the next one. */
async function pickMatchEventId(clubId: string): Promise<string | null> {
  const feeds = await Promise.all(
    ['past', 'upcoming'].map((scope) =>
      api<EventFeedItem[]>(`/clubs/${clubId}/events?scope=${scope}&limit=20`).catch(() => []),
    ),
  )
  const matches = feeds
    .flat()
    .filter((e) => e && e.type === 'MATCH' && !e.archivedAt)
    .sort((a, b) => a.date.localeCompare(b.date))
  const now = Date.now()
  const recent = [...matches].reverse().find((e) => {
    const at = new Date(e.date).getTime()
    return at <= now && now - at < DAY_MS
  })
  const next = matches.find((e) => new Date(e.date).getTime() > now)
  return (recent ?? next ?? null)?.id ?? null
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
      color: club?.primaryColor && HEX.test(club.primaryColor) ? club.primaryColor : DEFAULT_PRIMARY,
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
 * The match the Studio binds to: the event record, the coach-recorded live
 * state (existing endpoints) and the consent list. `eventId` pins a match
 * (Lineup and LiveMatch entry points); without it the server's context picks
 * the one that is "jetzt dran".
 */
export function useStudioMatch(requestedEventId?: string | null) {
  const { activeClub, activeTeamAccess } = useAuth()
  const club = activeClub?.club ?? null
  const clubId = club?.id ?? null
  const teamId = activeTeamAccess?.team?.id ?? null
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [live, setLive] = useState<MatchLiveStateDto | null>(null)
  const [consents, setConsents] = useState<StudioContext['consents']>([])
  const [loading, setLoading] = useState(Boolean(clubId))

  const refresh = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    const query = [teamId ? `teamId=${teamId}` : null, requestedEventId ? `eventId=${requestedEventId}` : null]
      .filter(Boolean)
      .join('&')
    const context = await api<StudioContext>(`/clubs/${clubId}/studio/context${query ? `?${query}` : ''}`).catch(
      () => null,
    )
    setConsents(Array.isArray(context?.consents) ? context.consents : [])
    const eventId =
      requestedEventId ?? context?.eventId ?? (await pickMatchEventId(clubId).catch(() => null))
    if (!eventId) {
      setEvent(null)
      setLive(null)
      setLoading(false)
      return
    }
    const base = `/clubs/${clubId}/events/${eventId}`
    const [detail, state] = await Promise.all([
      api<EventDetail>(base).catch(() => null),
      api<MatchLiveStateDto>(`${base}/live`).catch(() => null),
    ])
    setEvent(detail && detail.type === 'MATCH' ? detail : null)
    setLive(detail ? state : null)
    setLoading(false)
  }, [clubId, teamId, requestedEventId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** "Ergebnis eintragen": write the typed score back to the match. */
  const saveResult = useCallback(
    async (goalsFor: number, goalsAgainst: number) => {
      if (!clubId || !event) return false
      try {
        const next = await api<MatchLiveStateDto>(`/clubs/${clubId}/events/${event.id}/live/result`, {
          method: 'PUT',
          body: { goalsFor, goalsAgainst },
        })
        if (next) setLive(next)
        return true
      } catch {
        return false
      }
    },
    [clubId, event],
  )

  const match = useMemo(() => toStudioMatchInput(club, event, live, consents), [club, event, live, consents])

  return { match, event, live, loading, refresh, saveResult }
}

/** Test helper: forget cached Studio data between specs. */
export function __resetStudioCache() {
  kitCache.clear()
  creditsCache.clear()
}
