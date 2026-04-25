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
