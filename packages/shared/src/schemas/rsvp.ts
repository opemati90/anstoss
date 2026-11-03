import { z } from 'zod'
import { LAUNCH_FEATURES } from '../constants/launch-features'

export const rsvpStatusSchema = z.enum(['YES', 'MAYBE', 'NO'])

/**
 * Why a player can't make it. `injury` was the pre-2026-09 spelling and is
 * still accepted from older app builds; it is stored as `injured`.
 */
export const RSVP_REASONS = [
  'injured',
  'sick',
  'work',
  'vacation',
  'personal',
  'suspended',
  'other',
] as const
export type RsvpReason = (typeof RSVP_REASONS)[number]

export const rsvpReasonSchema = z.preprocess(
  (value) => (value === 'injury' ? 'injured' : value),
  z.enum(RSVP_REASONS),
)

export const rsvpNoteSchema = z.string().trim().max(200)

// Retain legacy parsing above for exports/history, but do not collect health
// reasons or free-text explanations in the first public release.
const launchReason = LAUNCH_FEATURES.healthReporting ? rsvpReasonSchema : z.never()
const launchNote = LAUNCH_FEATURES.healthReporting ? rsvpNoteSchema : z.string().trim().max(0)

export const updateRsvpSchema = z.object({
  status: rsvpStatusSchema,
  reason: launchReason.optional(),
  note: launchNote.optional(),
  /**
   * Parents answer for a child. Required when the caller guards more than
   * one child on the event's team; optional with exactly one.
   */
  childUserId: z.string().min(1).optional(),
})

export type UpdateRsvpInput = z.infer<typeof updateRsvpSchema>

export const proxyRsvpSchema = z.object({
  status: rsvpStatusSchema,
  reason: launchReason.optional(),
  note: launchNote.optional(),
  childUserId: z.string().min(1),
})

export type ProxyRsvpInput = z.infer<typeof proxyRsvpSchema>

export const updateAvailabilityPolicySchema = z.object({
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  locked: z.boolean().optional(),
}).strict().refine((value) => value.deadline !== undefined || value.locked !== undefined, 'No policy changes supplied')

export type UpdateAvailabilityPolicyInput = z.infer<typeof updateAvailabilityPolicySchema>
