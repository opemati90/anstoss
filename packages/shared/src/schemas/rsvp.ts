import { z } from 'zod'

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

export const updateRsvpSchema = z.object({
  status: rsvpStatusSchema,
  reason: rsvpReasonSchema.optional(),
  note: rsvpNoteSchema.optional(),
  /**
   * Parents answer for a child. Required when the caller guards more than
   * one child on the event's team; optional with exactly one.
   */
  childUserId: z.string().min(1).optional(),
})

export type UpdateRsvpInput = z.infer<typeof updateRsvpSchema>

export const proxyRsvpSchema = z.object({
  status: rsvpStatusSchema,
  reason: rsvpReasonSchema.optional(),
  note: rsvpNoteSchema.optional(),
  childUserId: z.string().min(1),
})

export type ProxyRsvpInput = z.infer<typeof proxyRsvpSchema>
