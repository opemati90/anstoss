import { z } from 'zod'

/**
 * Vorschau und Vertretung (redesign 29/31).
 *
 * "Vertretung": a club board member or team manager temporarily acts as a
 * team's coach (e.g. while the coach is on holiday). The server grants
 * coach-level team permissions while the session is unexpired; every start
 * and end is audited and the head coaches are notified.
 *
 * "Vorschau" (view as player / parent, read-only) is client-only.
 */
export const ACTING_SESSION_MIN_MINUTES = 15
export const ACTING_SESSION_MAX_MINUTES = 240
/** Durations the sheet offers. */
export const ACTING_SESSION_DURATIONS = [15, 30, 60] as const

export const ACTING_SESSION_ROLES = ['COACH'] as const
export type ActingSessionRole = (typeof ACTING_SESSION_ROLES)[number]

export const startActingSessionSchema = z.object({
  teamId: z.string().min(1).max(64),
  minutes: z.number().int().min(ACTING_SESSION_MIN_MINUTES).max(ACTING_SESSION_MAX_MINUTES),
  reason: z.string().trim().min(1).max(200).optional(),
})
export type StartActingSessionInput = z.infer<typeof startActingSessionSchema>

export const actingSessionSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  role: z.enum(ACTING_SESSION_ROLES),
  reason: z.string().nullable(),
  startedAt: z.string(),
  expiresAt: z.string(),
  endedAt: z.string().nullable(),
})
export type ActingSessionDto = z.infer<typeof actingSessionSchema>

/** GET /me/acting-session — `session` is null when nothing is running. */
export type CurrentActingSessionResponse = { session: ActingSessionDto | null }

/**
 * GET /clubs/:clubId/acting-sessions/candidates — teams the caller could
 * stand in for, teams whose head coach is away ("Trainer im Urlaub") first.
 */
export const actingCandidateSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  headCoachName: z.string().nullable(),
  /** The head coach is marked AWAY on the roster right now. */
  coachAway: z.boolean(),
})
export type ActingCandidateDto = z.infer<typeof actingCandidateSchema>
export type ActingCandidatesResponse = { items: ActingCandidateDto[] }
