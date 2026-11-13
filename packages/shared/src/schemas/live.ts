import { z } from 'zod'

/**
 * Coach-recorded live match tracking (2026-11 redesign, screen 14 Live-Spiel).
 * Scores are kept from the team's point of view (`for` / `against`); the
 * event's homeAway maps them onto home/away for display.
 */
export const MATCH_LIVE_EVENT_KINDS = ['GOAL', 'CONCEDED', 'YELLOW', 'RED', 'SUB'] as const
export type MatchLiveEventKind = (typeof MATCH_LIVE_EVENT_KINDS)[number]

export const MATCH_LIVE_STATUSES = [
  'NOT_STARTED',
  'FIRST_HALF',
  'HALF_TIME',
  'SECOND_HALF',
  'FINISHED',
] as const
export type MatchLiveStatus = (typeof MATCH_LIVE_STATUSES)[number]

/** Longest regular match plus generous stoppage/extra time. */
export const MATCH_LIVE_MAX_MINUTE = 130

export const recordMatchLiveEventSchema = z
  .object({
    kind: z.enum(MATCH_LIVE_EVENT_KINDS),
    /** Omit to let the server derive the minute from the running clock. */
    minute: z.number().int().min(0).max(MATCH_LIVE_MAX_MINUTE).optional(),
    /** Scorer / booked player / player coming on (SUB). */
    playerUserId: z.string().min(1).max(64).optional(),
    /** Free-text name when the player has no account (roster slot, guest). */
    playerName: z.string().trim().min(1).max(80).optional(),
    /** Assist (GOAL) or player going off (SUB). */
    relatedUserId: z.string().min(1).max(64).optional(),
    relatedName: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => !(v.playerUserId && v.playerName), {
    message: 'Use playerUserId or playerName, not both',
    path: ['playerName'],
  })
  .refine((v) => !(v.relatedUserId && v.relatedName), {
    message: 'Use relatedUserId or relatedName, not both',
    path: ['relatedName'],
  })

export type RecordMatchLiveEvent = z.infer<typeof recordMatchLiveEventSchema>

/** Clock transitions: kick-off, half time, second half, final whistle. */
export const updateMatchLiveStateSchema = z.object({
  status: z.enum(['FIRST_HALF', 'HALF_TIME', 'SECOND_HALF', 'FINISHED']),
})

export type UpdateMatchLiveState = z.infer<typeof updateMatchLiveStateSchema>
