import { z } from 'zod'
import { planTierSchema } from './platform'
import type { PlanTier } from '../types/platform'

/**
 * Club plan ("Abo") contract — REVAMP_HANDOFF.md "Plans and pricing".
 *
 * Free access plus three paid team-capacity packages. Store products and the
 * public website must match this catalogue. A price definition does not enable
 * checkout: native billing must be integrated and verified before paid launch.
 */

/** Feature flags gated by `ClubEntitlementsService`. All unlock with Verein. */
export const PLAN_FEATURES = [
  'clubColors',
  'liveTicker',
  'lineupSharing',
  'autoReminders',
  'fixtureImport',
  'duesTracking',
  'chatTranslation',
  'actingSessions',
] as const
export const planFeatureSchema = z.enum(PLAN_FEATURES)
export type PlanFeature = z.infer<typeof planFeatureSchema>
export type PlanFeatureFlags = Record<PlanFeature, boolean>

/** Child consent and safety features are never gated; listed for reviewers. */
export const NEVER_GATED_FEATURES = [
  'childConsent',
  'guardianApproval',
  'safeguardingReports',
  'moderation',
  'ageGate',
] as const

/** 30 days of Verein, no card. Afterwards the club drops to Kostenlos. */
export const PLAN_TRIAL_DAYS = 30

/** Int32 sentinel: no commercial team/player cap, not an allocation size. */
export const UNLIMITED_PLAN_LIMIT = 2_147_483_647
/** Germany/EUR prices in cents, incl. VAT. Annual prices use approved store price points. */
export const PLAN_PACKAGES = [
  { key: 'TEAM', teams: 1, players: 30, monthly: 1299, yearly: 12900 },
  { key: 'CLUB_3', teams: 3, players: 90, monthly: 2999, yearly: 29900 },
  { key: 'UNLIMITED', teams: UNLIMITED_PLAN_LIMIT, players: UNLIMITED_PLAN_LIMIT, monthly: 3999, yearly: 39900 },
] as const
export const PLAN_PRICES_CENTS = { monthly: PLAN_PACKAGES[0].monthly, yearly: PLAN_PACKAGES[0].yearly } as const
export const PLAN_CURRENCY = 'EUR'
export const PLAN_SALES_EMAIL = 'kontakt@anstoss.io'

export const planPriceSchema = z.object({
  /** Gross amount in cents (VAT included). */
  amountCents: z.number().int().min(0),
  currency: z.string().length(3),
})
export type PlanPrice = z.infer<typeof planPriceSchema>

const countsSchema = z.object({
  teams: z.number().int().min(0),
  players: z.number().int().min(0),
})

export const PLAN_SOURCES = ['NONE', 'TRIAL', 'PAID', 'COMPLIMENTARY', 'MIGRATED'] as const

/** GET /clubs/:clubId/plan — readable by every member of the club. */
export const clubPlanSchema = z.object({
  clubId: z.string(),
  tier: planTierSchema,
  /** How the current tier is held; NONE on Kostenlos. */
  source: z.enum(PLAN_SOURCES),
  /** ISO end of the running trial, null when no trial is active. */
  trialEndsAt: z.string().nullable(),
  /** True once the club has used its one trial. */
  trialUsed: z.boolean(),
  limits: countsSchema,
  usage: countsSchema,
  prices: z.object({ monthly: planPriceSchema, yearly: planPriceSchema }),
  features: z.record(planFeatureSchema, z.boolean()),
  /** Vorstand (OWNER/ADMIN/BOARD_MEMBER) or Kassenwart (TREASURER). */
  canManage: z.boolean(),
  salesEmail: z.string().email().optional(),
})
export type ClubPlan = z.infer<typeof clubPlanSchema> & { features: PlanFeatureFlags }

/** POST /clubs/:clubId/plan/trial — empty body; responds with the new ClubPlan. */
export const startPlanTrialSchema = z.object({}).strict()
export type StartPlanTrialInput = z.infer<typeof startPlanTrialSchema>

/** Every flag on for PRO/SCALE, off for FREE. */
export function planFeatureFlags(tier: PlanTier): PlanFeatureFlags {
  const on = tier !== 'FREE'
  return Object.fromEntries(PLAN_FEATURES.map((f) => [f, on && f !== 'chatTranslation' && f !== 'actingSessions'])) as PlanFeatureFlags
}
