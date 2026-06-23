import { z } from 'zod'
import { RegistrationRole } from '../types/club-operations'

/**
 * Age gate: Germany GDPR Article 8 threshold is 16.
 * Users under 16 are blocked at registration until parental consent (Sprint 3).
 */
const MIN_AGE = 16

function getAge(dateOfBirth: Date): number {
  const today = new Date()
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--
  }
  return age
}

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  dateOfBirth: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .refine((val) => {
      const age = getAge(new Date(val))
      return age >= MIN_AGE
    }, `You must be at least ${MIN_AGE} years old to register`),
})

export type RegisterInput = z.infer<typeof registerSchema>

export { MIN_AGE, getAge }

const profileSchema = z.object({
  displayName: z.string().min(1).max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .refine(
      (val) => getAge(new Date(val)) >= MIN_AGE,
      `You must be at least ${MIN_AGE} years old`,
    ),
  photoUrl: z.string().url().optional(),
})

const clubCreateSchema = z.object({
  name: z.string().min(2).max(80),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  badgeUrl: z.string().url().optional(),
  welcomeText: z.string().max(500).optional(),
  firstTeamName: z.string().min(1).max(80),
})

const joinSchema = z
  .object({
    inviteCode: z.string().min(4).max(32).optional(),
    clubId: z.string().cuid().optional(),
  })
  .refine(
    (v) => Boolean(v.inviteCode) !== Boolean(v.clubId),
    { message: 'Provide either inviteCode or clubId, not both' },
  )

const freeAgentSchema = z.object({
  position: z.array(z.string()).min(1).max(4),
  experienceYears: z.number().int().min(0).max(50),
  location: z.string().min(1).max(120),
  availableForTrials: z.boolean(),
  bio: z.string().max(500),
})

const parentLinkSchema = z
  .object({
    approvalInviteCode: z.string().min(4).max(32).optional(),
    childEmail: z.string().email().optional(),
  })
  .refine(
    (v) => Boolean(v.approvalInviteCode) || Boolean(v.childEmail),
    { message: 'Parents must provide an approval code or the child email' },
  )

export const completeOnboardingSchema = z.discriminatedUnion('registrationRole', [
  z.object({
    registrationRole: z.literal(RegistrationRole.CLUB_ADMIN),
    profile: profileSchema,
    clubCreate: clubCreateSchema,
  }),
  z.object({
    registrationRole: z.literal(RegistrationRole.COACH),
    profile: profileSchema,
    join: joinSchema,
  }),
  z.object({
    registrationRole: z.literal(RegistrationRole.PLAYER),
    profile: profileSchema,
    join: joinSchema,
  }),
  z.object({
    registrationRole: z.literal(RegistrationRole.PARENT),
    profile: profileSchema,
    parentLink: parentLinkSchema,
  }),
  z.object({
    registrationRole: z.literal(RegistrationRole.FREE_AGENT),
    profile: profileSchema,
    freeAgent: freeAgentSchema,
  }),
])

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>

/**
 * PATCH /me body. Validated on client AND server so the client can no longer
 * push arbitrary/raw fields (e.g. set registrationRole to anything, or send a
 * malformed date). All fields are optional — this is a partial profile update.
 * The first-write-only rule for `registrationRole` and the DOB-read-only rule
 * stay enforced in UsersService (this only constrains shape + types).
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    avatarUrl: z.string().url().max(2048).optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
      .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
      .optional(),
    // Two-letter ISO-639-1 (or a locale tag whose head is one). The service
    // narrows to the supported set; this just bounds the shape.
    preferredLanguage: z.string().trim().min(2).max(16).optional(),
    // Constrained to the enum — the client can no longer send a raw string.
    registrationRole: z.nativeEnum(RegistrationRole).optional(),
  })
  .strict()

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/**
 * Phone supplied by an OTP-authenticated user to claim coach-seeded roster
 * slots. OTP users have no Clerk identity (clerkId = null) and the User model
 * has no phone column, so the phone the coach entered on the slot can't be
 * resolved server-side — the user provides it here and the server matches it
 * (normalized) against unclaimed slots. Knowing the exact phone the coach
 * entered is the match gate; no SMS verification source exists for OTP users.
 */
export const claimPhoneSchema = z.object({
  phone: z.string().trim().min(6).max(32),
})

export type ClaimPhoneInput = z.infer<typeof claimPhoneSchema>

/**
 * Under-16 parent handoff: a child who hits the age gate at sign-up can ask us
 * to email their parent/guardian an invitation to set the account up (the
 * parent later creates a managed sub-profile against a roster slot). No child
 * account is retained — this only triggers one transactional email.
 */
export const parentHandoffSchema = z.object({
  childFirstName: z.string().trim().min(1).max(80),
  // The child's DOB is verified server-side (< 16) before a handoff is minted
  // and the self-created account is removed.
  childDateOfBirth: z.string().datetime(),
  guardianEmail: z.string().trim().email(),
})

export type ParentHandoffInput = z.infer<typeof parentHandoffSchema>

/**
 * Guardian redeems a handoff code to create a managed sub-profile for their
 * child. The child's name + DOB come from the server-side handoff record (not
 * the client) so they can't be tampered with; the guardian only supplies the
 * code + which team/roster slot to place the child in.
 */
export const redeemParentHandoffSchema = z.object({
  code: z.string().trim().min(1).max(64),
  teamJoinCode: z.string().trim().min(1).max(32),
  rosterSlotId: z.string().min(1),
})

export type RedeemParentHandoffInput = z.infer<typeof redeemParentHandoffSchema>
