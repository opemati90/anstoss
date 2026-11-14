import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PLAN_CURRENCY,
  PLAN_PRICES_CENTS,
  PLAN_SALES_EMAIL,
  clubPlanSchema,
  planFeatureFlags,
  type ClubPlan,
  type PlanFeature,
} from '@anstoss/shared'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

/** No club-only cache: permission-bearing plans belong to the current session. */
const listeners = new Set<(scopeKey: string, plan: ClubPlan) => void>()

const FREE_LIMITS = { teams: 1, players: 30 }
const PLAN_MANAGER_ROLES = new Set(['OWNER', 'ADMIN'])
const PLAN_MANAGER_OFFICES = new Set(['TREASURER', 'BOARD_MEMBER'])

type MembershipLike =
  { role?: string | null; operationalRoles?: string[] | null } | null | undefined

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

class ClubPlanUnavailableError extends Error {
  constructor() {
    super('Club plan is unavailable for this session')
    this.name = 'ClubPlanUnavailableError'
  }
}

function confirmedPlan(raw: unknown, clubId: string): ClubPlan {
  const parsed = clubPlanSchema.safeParse(raw)
  if (!parsed.success || parsed.data.clubId !== clubId) throw new ClubPlanUnavailableError()
  return parsed.data as ClubPlan
}

export function useClubPlan() {
  const { user, token, activeClub } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const canManageLocal = canManageClubPlan(activeClub)
  const permissions = JSON.stringify([activeClub?.role, activeClub?.operationalRoles])
  const scope = useMemo(
    () => ({
      clubId,
      allowed: Boolean(user?.id && token && clubId),
      canManageLocal,
      key: JSON.stringify([user?.id, token, clubId, permissions]),
    }),
    [user?.id, token, clubId, permissions, canManageLocal],
  )
  type Snapshot = { scope: typeof scope; plan: ClubPlan | null; loading: boolean; error: boolean }
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const latest = useRef(snapshot)
  latest.current = snapshot
  const current = useRef(scope)
  current.current = scope
  const mounted = useRef(false)
  const sequence = useRef(0)
  const pendingTrial = useRef<typeof scope | null>(null)

  const refresh = useCallback(async () => {
    if (
      !mounted.current ||
      current.current !== scope ||
      !scope.allowed ||
      !scope.clubId ||
      pendingTrial.current === scope
    )
      return null
    const ticket = ++sequence.current
    const previous = latest.current?.scope === scope ? latest.current.plan : null
    setSnapshot({ scope, plan: previous, loading: true, error: false })
    const isCurrent = () =>
      mounted.current && current.current === scope && ticket === sequence.current
    try {
      const plan = confirmedPlan(
        await api<unknown>(`/clubs/${encodeURIComponent(scope.clubId)}/plan`),
        scope.clubId,
      )
      if (!isCurrent()) return null
      setSnapshot({ scope, plan, loading: false, error: false })
      return plan
    } catch {
      if (isCurrent()) setSnapshot({ scope, plan: null, loading: false, error: true })
      return null
    }
  }, [scope])

  useEffect(() => {
    mounted.current = true
    const onUpdate = (scopeKey: string, plan: ClubPlan) => {
      if (current.current !== scope || scopeKey !== scope.key) return
      sequence.current += 1
      setSnapshot({ scope, plan, loading: false, error: false })
    }
    listeners.add(onUpdate)
    void refresh()
    return () => {
      mounted.current = false
      sequence.current += 1
      listeners.delete(onUpdate)
    }
  }, [scope, refresh])

  const startTrial = useCallback(async () => {
    const visible = latest.current
    if (
      !mounted.current ||
      current.current !== scope ||
      !scope.allowed ||
      !scope.clubId ||
      !scope.canManageLocal ||
      visible?.scope !== scope ||
      !visible.plan?.canManage ||
      visible.loading ||
      pendingTrial.current === scope
    )
      throw new ClubPlanUnavailableError()
    pendingTrial.current = scope
    const ticket = ++sequence.current
    try {
      const raw = await api<unknown>(`/clubs/${encodeURIComponent(scope.clubId)}/plan/trial`, {
        method: 'POST',
        body: {},
      })
      const plan = confirmedPlan(raw, scope.clubId)
      if (
        plan.source !== 'TRIAL' ||
        plan.tier === 'FREE' ||
        !plan.trialEndsAt ||
        !Number.isFinite(Date.parse(plan.trialEndsAt)) ||
        Date.parse(plan.trialEndsAt) <= Date.now() ||
        !plan.trialUsed
      )
        throw new ClubPlanUnavailableError()
      if (!mounted.current || current.current !== scope || ticket !== sequence.current)
        throw new ClubPlanUnavailableError()
      listeners.forEach((listener) => listener(scope.key, plan))
      return plan
    } finally {
      if (pendingTrial.current === scope) pendingTrial.current = null
    }
  }, [scope])

  const visible = scope.allowed && snapshot?.scope === scope ? snapshot : null
  const plan = visible?.plan ?? null
  const has = useCallback((feature: PlanFeature) => Boolean(plan?.features?.[feature]), [plan])
  return {
    plan,
    loading: scope.allowed && (!visible || visible.loading),
    error: visible?.error ?? false,
    refresh,
    startTrial,
    has,
  }
}
