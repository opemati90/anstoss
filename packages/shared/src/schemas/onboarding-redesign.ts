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

/** POST /auth/oauth/:provider → same session payload as POST /auth/otp/verify. */
export const oauthSignInSchema = z.object({
  idToken: z.string().min(1).max(8192),
  /** Apple only sends the name on the very first authorisation. */
  fullName: z.string().trim().min(1).max(120).optional(),
})
export type OAuthSignInInput = z.infer<typeof oauthSignInSchema>

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
