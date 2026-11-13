import {
  PLAN_CURRENCY,
  PLAN_PRICES_CENTS,
  PLAN_SALES_EMAIL,
  PLAN_TRIAL_DAYS,
  planFeatureFlags,
  type ClubPlan,
} from '@anstoss/shared'

/**
 * E2E / preview mocks for the club plan contract (packages/shared
 * schemas/plan.ts): GET /clubs/:clubId/plan and POST …/plan/trial.
 *
 * Every persona sees board 35's state: Kostenlos, 1 von 1 Teams (Team-Limit
 * erreicht), 22 von 30 Spieler. Only the club-admin persona (OWNER) can
 * start the trial; a started trial lives in memory until the page reloads.
 */

type Response = { handled: true; ok: boolean; status: number; body?: unknown } | null

const PLAN = /^\/clubs\/([^/]+)\/plan$/
const TRIAL = /^\/clubs\/([^/]+)\/plan\/trial$/
const MANAGERS = new Set(['club-admin'])

let trialEndsAt: string | null = null

function planFor(clubId: string, scenario: string): ClubPlan {
  const tier = trialEndsAt ? 'PRO' : 'FREE'
  return {
    clubId,
    tier,
    source: trialEndsAt ? 'TRIAL' : 'NONE',
    trialEndsAt,
    trialUsed: Boolean(trialEndsAt),
    limits: tier === 'PRO' ? { teams: 5, players: 150 } : { teams: 1, players: 30 },
    usage: { teams: 1, players: 22 },
    prices: {
      monthly: { amountCents: PLAN_PRICES_CENTS.monthly, currency: PLAN_CURRENCY },
      yearly: { amountCents: PLAN_PRICES_CENTS.yearly, currency: PLAN_CURRENCY },
    },
    features: planFeatureFlags(tier),
    canManage: MANAGERS.has(scenario),
    salesEmail: PLAN_SALES_EMAIL,
  }
}

export function handlePlanMock(ctx: { scenario: string; pathname: string; method: string }): Response {
  const read = ctx.method === 'GET' ? PLAN.exec(ctx.pathname) : null
  if (read) return { handled: true, ok: true, status: 200, body: planFor(read[1], ctx.scenario) }
  const start = ctx.method === 'POST' ? TRIAL.exec(ctx.pathname) : null
  if (!start) return null
  if (!MANAGERS.has(ctx.scenario)) {
    return { handled: true, ok: false, status: 403, body: { message: 'Only Vorstand or Kassenwart' } }
  }
  if (trialEndsAt) {
    return { handled: true, ok: false, status: 409, body: { message: 'Trial already used' } }
  }
  trialEndsAt = new Date(Date.now() + PLAN_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  return { handled: true, ok: true, status: 201, body: planFor(start[1], ctx.scenario) }
}

/** Test helper. */
export function resetPlanMock() {
  trialEndsAt = null
}
