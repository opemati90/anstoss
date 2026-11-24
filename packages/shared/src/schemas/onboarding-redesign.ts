import { z } from 'zod'

/**
 * Onboarding redesign (2026-11) — contract for elements the boards show that
 * the API does not serve yet. The mobile app already sends / reads these
 * shapes; servers without the endpoint answer 404 (or strip the extra keys)
 * and the app degrades quietly. See docs/redesign/BACKEND_GAPS.md.
 */

// ── 03 Anmelden: Sign in with Apple / Google ──────────────────────────────
export const oauthProviderSchema = z.enum(['apple', 'google'])
export type OAuthProvider = z.infer<typeof oauthProviderSchema>

/** POST /auth/oauth/:provider → session or explicit email-link challenge. */
export const oauthSignInSchema = z.object({
  idToken: z.string().min(1).max(8192),
  /** Apple only sends the name on the very first authorisation. */
  fullName: z.string().trim().min(1).max(120).optional(),
  authorizationCode: z.string().min(1).max(4096).optional(),
  nonce: z.string().min(32).max(128).optional(),
})
export type OAuthSignInInput = z.infer<typeof oauthSignInSchema>

export const oauthLinkSchema = z.object({
  ticket: z.string().min(32).max(128),
  code: z.string().regex(/^\d{6}$/),
})
export const oauthTicketSchema = oauthLinkSchema.pick({ ticket: true })

export const oauthSignInResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), token: z.string().min(1).max(8192) }),
  z.object({ kind: z.literal('link_required'), ticket: oauthTicketSchema.shape.ticket,
    email: z.string().email().max(254) }),
])
export type OAuthSignInResult = z.infer<typeof oauthSignInResultSchema>
export const oauthAvailabilitySchema = z.object({ google: z.boolean(), apple: z.boolean() })
export const oauthNonceSchema = z.object({ nonce: z.string().min(32).max(128) })

// ── 04 Zu deinem Verein: claim your roster slot while joining ──────────────
/** GET /public/teams/by-code/:joinCode/roster-slots (unclaimed slots only). */
export const publicRosterSlotSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1).max(120),
  jerseyNumber: z.number().int().min(0).max(999).nullable(),
})
export type PublicRosterSlot = z.infer<typeof publicRosterSlotSchema>

export const publicRosterSlotsResponseSchema = z.object({
  slots: z.array(publicRosterSlotSchema),
})
export type PublicRosterSlotsResponse = z.infer<typeof publicRosterSlotsResponseSchema>

// ── 05 Was machst du bei …?: several roles in one request ──────────────────
export const joinRoleSchema = z.enum(['PLAYER', 'COACH', 'PARENT', 'ADMIN'])
export type JoinRoleKey = z.infer<typeof joinRoleSchema>

/**
 * Optional keys on POST /clubs/:id/join-requests, POST /clubs/:id/staff-access-requests
 * and POST /onboarding/join-team. `additionalRoles` are the other boxes the
 * person ticked (the board confirms them on approval); `rosterSlotId` is the
 * slot claimed on "Ich bin …", linked on approval.
 */
export const joinRequestExtrasSchema = z.object({
  rosterSlotId: z.string().min(1).optional(),
  additionalRoles: z
    .array(joinRoleSchema)
    .max(3)
    .refine((roles) => new Set(roles).size === roles.length, {
      message: 'Roles must be unique',
    })
    .optional(),
})
export type JoinRequestExtras = z.infer<typeof joinRequestExtrasSchema>

// ── 06 Dein Verein: DFB club number, second colour, crest upload ───────────
/** Optional keys on POST /club-claims/first (submitFirstClubClaimSchema). */
export const clubClaimExtrasSchema = z.object({
  /** Vereinsnummer of the DFB / Landesverband, digits only. */
  federationClubNumber: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** Id returned by POST /uploads/club-badge (multipart, PNG or SVG). */
  badgeUploadId: z.string().min(1).optional(),
})
export type ClubClaimExtras = z.infer<typeof clubClaimExtrasSchema>

// ── 07 Hol dein Team rein: a coach's team join code ────────────────────────
/**
 * GET /clubs/:clubId/teams/:teamId/join-code (coaches of the team and admins).
 * Admins keep using invite campaigns; coaches cannot create campaigns today.
 */
export const teamJoinCodeResponseSchema = z.object({
  teamId: z.string().min(1),
  code: z.string().min(4).max(32),
  link: z.string().url(),
  expiresAt: z.string().datetime().nullable(),
})
export type TeamJoinCodeResponse = z.infer<typeof teamJoinCodeResponseSchema>
