import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PLAN_CURRENCY,
  PLAN_PRICES_CENTS,
  PLAN_SALES_EMAIL,
  planFeatureFlags,
  type ClubPlan,
  type PlanFeature,
} from '@anstoss/shared'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

/**
 * Club plan ("Abo") — GET /clubs/:clubId/plan (packages/shared schemas/plan.ts).
 *
 * Stale-while-revalidate: a cached plan renders at once and refreshes in the
 * background. Against a server without the endpoint the hook degrades quietly
 * to Kostenlos with empty usage, never an error state.
 */

const STALE_MS = 5 * 60 * 1000
const cache = new Map<string, { data: ClubPlan; fetchedAt: number }>()
const listeners = new Set<(clubId: string, plan: ClubPlan) => void>()

const FREE_LIMITS = { teams: 1, players: 30 }
const PLAN_MANAGER_ROLES = new Set(['OWNER', 'ADMIN'])
const PLAN_MANAGER_OFFICES = new Set(['TREASURER', 'BOARD_MEMBER'])

type MembershipLike = { role?: string | null; operationalRoles?: string[] | null } | null | undefined

/** Vorstand (OWNER/ADMIN or BOARD_MEMBER office) or Kassenwart (TREASURER office). */
export function canManageClubPlan(membership: MembershipLike): boolean {
  if (!membership) return false
  if (membership.role && PLAN_MANAGER_ROLES.has(membership.role)) return true
  return (membership.operationalRoles ?? []).some((office) => PLAN_MANAGER_OFFICES.has(office))
}

export function fallbackClubPlan(clubId: string, canManage: boolean): ClubPlan {
  return {
    clubId,
    tier: 'FREE',
    source: 'NONE',
    trialEndsAt: null,
    trialUsed: false,
    limits: FREE_LIMITS,
    usage: { teams: 0, players: 0 },
    prices: {
      monthly: { amountCents: PLAN_PRICES_CENTS.monthly, currency: PLAN_CURRENCY },
      yearly: { amountCents: PLAN_PRICES_CENTS.yearly, currency: PLAN_CURRENCY },
    },
    features: planFeatureFlags('FREE'),
    canManage,
    salesEmail: PLAN_SALES_EMAIL,
  }
}

/** Merge a possibly partial server response over the fallback. */
function normalize(raw: Partial<ClubPlan> | null | undefined, fallback: ClubPlan): ClubPlan {
  if (!raw || typeof raw !== 'object') return fallback
  const tier = raw.tier ?? fallback.tier
  return {
    ...fallback,
    ...raw,
    tier,
    limits: raw.limits ?? fallback.limits,
    usage: raw.usage ?? fallback.usage,
    prices: raw.prices ?? fallback.prices,
    features: { ...planFeatureFlags(tier), ...(raw.features ?? {}) },
    canManage: typeof raw.canManage === 'boolean' ? raw.canManage : fallback.canManage,
  }
}

function safeUseAuth(): { activeClub: (MembershipLike & { club: { id: string } }) | null } {
  try {
    return useAuth()
  } catch {
    return { activeClub: null }
  }
}

export function useClubPlan() {
  const { activeClub } = safeUseAuth()
  const clubId = activeClub?.club.id ?? null
  const canManageLocal = canManageClubPlan(activeClub)
  const [plan, setPlan] = useState<ClubPlan | null>(clubId ? (cache.get(clubId)?.data ?? null) : null)
  const [loading, setLoading] = useState(Boolean(clubId && !cache.has(clubId)))

  const refresh = useCallback(async () => {
    if (!clubId) return null
    const fallback = fallbackClubPlan(clubId, canManageLocal)
    let next: ClubPlan
    try {
      next = normalize(await api<Partial<ClubPlan>>(`/clubs/${clubId}/plan`), fallback)
    } catch {
      next = cache.get(clubId)?.data ?? fallback
    }
    cache.set(clubId, { data: next, fetchedAt: Date.now() })
    listeners.forEach((listener) => listener(clubId, next))
    setLoading(false)
    return next
  }, [clubId, canManageLocal])

  useEffect(() => {
    if (!clubId) {
      setPlan(null)
      setLoading(false)
      return
    }
    const onUpdate = (id: string, next: ClubPlan) => {
      if (id === clubId) setPlan(next)
    }
    listeners.add(onUpdate)
    const cached = cache.get(clubId)
    setPlan(cached?.data ?? null)
    if (!cached || Date.now() - cached.fetchedAt >= STALE_MS) void refresh()
    else setLoading(false)
    return () => {
      listeners.delete(onUpdate)
    }
  }, [clubId, refresh])

  /** POST /clubs/:clubId/plan/trial. Throws so the screen can show its own error. */
  const startTrial = useCallback(async () => {
    if (!clubId) return null
    const raw = await api<Partial<ClubPlan>>(`/clubs/${clubId}/plan/trial`, {
      method: 'POST',
      body: {},
    })
    const next = normalize(raw, fallbackClubPlan(clubId, canManageLocal))
    cache.set(clubId, { data: next, fetchedAt: Date.now() })
    listeners.forEach((listener) => listener(clubId, next))
    return next
  }, [clubId, canManageLocal])

  const has = useCallback(
    (feature: PlanFeature) => Boolean(plan?.features?.[feature]),
    [plan],
  )

  return useMemo(
    () => ({ plan, loading, refresh, startTrial, has }),
    [plan, loading, refresh, startTrial, has],
  )
}

/** Test helper: forget cached plans between specs. */
export function __resetClubPlanCache() {
  cache.clear()
}
