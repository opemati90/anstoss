import { z } from 'zod'

/**
 * Home-screen contract additions of the 2026-11 redesign (screens 08, 22, 25,
 * 26). All fields are optional on the wire: the app renders the design with
 * empty values until the API serves them (docs/redesign/BACKEND_GAPS.md,
 * "Contract for backend").
 */

/** "Ligaspiel", "Pokalspiel", "Testspiel", "Turnier" on the match hero. */
export const MATCH_KINDS = ['LEAGUE', 'CUP', 'FRIENDLY', 'TOURNAMENT'] as const
export const matchKindSchema = z.enum(MATCH_KINDS)
export type MatchKind = z.infer<typeof matchKindSchema>

/** Coach home lineup row: "Entwurf 4-2-3-1 · 9 von 11". */
export const lineupDraftSummarySchema = z.object({
  formation: z.string().min(1).max(16),
  filled: z.number().int().min(0),
  slots: z.number().int().min(1),
  /** True once the coach published the lineup to the team. */
  published: z.boolean().optional(),
  /** The reader's own shirt/slot in the draft ("Du stehst selbst auf der 9"). */
  mySlot: z.string().max(8).nullable().optional(),
})
export type LineupDraftSummary = z.infer<typeof lineupDraftSummarySchema>

/** Parent home carpool row: "2 Kinder suchen noch eine Mitfahrt". */
export const carpoolSummarySchema = z.object({
  /** Children/players on the event still without a seat. */
  seeking: z.number().int().min(0),
  /** Free seats across all offered rides. */
  seatsFree: z.number().int().min(0),
  /** Seats the reader offers, null when they do not drive. */
  myRideSeats: z.number().int().min(0).nullable(),
})
export type CarpoolSummary = z.infer<typeof carpoolSummarySchema>

/** Parent home: the child's photo consent for team pictures on the club site. */
export const PHOTO_CONSENT_STATUSES = ['GRANTED', 'PENDING', 'DECLINED'] as const
export const photoConsentStatusSchema = z.enum(PHOTO_CONSENT_STATUSES)
export type PhotoConsentStatus = z.infer<typeof photoConsentStatusSchema>

/**
 * GET /clubs/:clubId/teams/:teamId/my-season — the reader's own season on
 * the player home ("9 Einsätze · 6 Tore · 7 von 8 Trainings").
 */
export const mySeasonSummarySchema = z.object({
  season: z.string().max(16).nullable(),
  appearances: z.number().int().min(0),
  goals: z.number().int().min(0),
  trainingsAttended: z.number().int().min(0),
  trainingsTotal: z.number().int().min(0),
})
export type MySeasonSummary = z.infer<typeof mySeasonSummarySchema>

/** How a dues payment reached the club ("Überweisung", "Bar beim Training"). */
export const CONTRIBUTION_PAYMENT_METHODS = ['TRANSFER', 'CASH', 'SEPA', 'OTHER'] as const
export const contributionPaymentMethodSchema = z.enum(CONTRIBUTION_PAYMENT_METHODS)
export type ContributionPaymentMethod = z.infer<typeof contributionPaymentMethodSchema>

/** One paid period on Meine Beiträge ("November · Bar beim Training · 03.11."). */
export const contributionHistoryEntrySchema = z.object({
  planId: z.string().min(1),
  planName: z.string(),
  /** "2026-11" */
  period: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().int().min(0),
  currency: z.string().length(3),
  paidAt: z.string(),
  method: contributionPaymentMethodSchema.nullable(),
})
export type ContributionHistoryEntry = z.infer<typeof contributionHistoryEntrySchema>
