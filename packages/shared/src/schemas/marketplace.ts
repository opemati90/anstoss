import { z } from 'zod'
import { RegistrationRole } from '../types/club-operations'
import {
  FreeAgentVisibility,
  LEAGUE_LEVELS,
  PlayerPosition,
  PlayerSearchStatus,
  PreferredFoot,
  TrialInviteStatus,
} from '../types/marketplace'

/** German Postleitzahl: exactly five digits. */
const postalCodeSchema = z.string().trim().regex(/^\d{5}$/, 'Postal code must have 5 digits')
/** Calendar date without time, YYYY-MM-DD. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
const leagueLevelSchema = z.enum(LEAGUE_LEVELS)

export const freeAgentExperienceEntrySchema = z.object({
  id: z.string().min(1).optional(),
  clubName: z.string().trim().min(1).max(100),
  roleLabel: z.string().trim().min(1).max(80),
  fromYear: z.number().int().min(1950).max(2100).nullable().optional(),
  toYear: z.number().int().min(1950).max(2100).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const freeAgentMediaTypeSchema = z.enum(['PHOTO', 'VIDEO'])

export const createFreeAgentMediaSchema = z.object({
  type: freeAgentMediaTypeSchema,
  url: z.string().url().max(500),
  thumbnailUrl: z.string().url().max(500).nullable().optional(),
})

export const presignFreeAgentMediaSchema = z.object({
  type: freeAgentMediaTypeSchema,
  contentType: z.string().min(3).max(120),
  filename: z.string().max(120).optional(),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
})

export const freeAgentProfileWriteSchema = z.object({
  position: z.nativeEnum(PlayerPosition).nullable().optional(),
  preferredFoot: z.nativeEnum(PreferredFoot).nullable().optional(),
  city: z.string().trim().min(2).max(80).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  isOnTransferList: z.boolean().optional(),
  visibility: z.nativeEnum(FreeAgentVisibility).optional(),
  experience: z.array(freeAgentExperienceEntrySchema).max(10).optional(),
  postalCode: postalCodeSchema.nullable().optional(),
  searchRadiusKm: z.number().int().min(5).max(100).nullable().optional(),
  highestLeague: leagueLevelSchema.nullable().optional(),
  currentClubName: z.string().trim().min(2).max(100).nullable().optional(),
  availableFrom: isoDateSchema.nullable().optional(),
})

export const freeAgentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  position: z.nativeEnum(PlayerPosition).optional(),
  preferredFoot: z.nativeEnum(PreferredFoot).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  query: z.string().trim().max(80).optional(),
  // PLZ of the searching club/player; combined with radiusKm into a
  // postal-prefix match (see postalPrefixForRadius).
  postalCode: postalCodeSchema.optional(),
  radiusKm: z.coerce.number().int().min(5).max(100).optional(),
  league: leagueLevelSchema.optional(),
  // 'recent' is the mobile-side label for "newest first" — keep both for
  // back-compat with anything that still sends 'newest' or 'city'.
  sort: z
    .enum(['recent', 'newest', 'experience', 'name', 'city'])
    .default('recent'),
})

const sessionEventIdsSchema = z.array(z.string().min(1)).min(1).max(3)

export const createTrialInviteSchema = z.object({
  freeAgentProfileId: z.string().min(1),
  teamId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
  // Optional: defaults to the first session (an invite for a past
  // session is meaningless) capped at 14 days.
  expiresAt: z.string().datetime().optional(),
  sessionEventIds: sessionEventIdsSchema,
  playerSearchId: z.string().min(1).optional(),
})

/** Player-side answer on /trial-invites/:id. */
export const respondToTrialInviteSchema = z.object({
  status: z.enum([
    TrialInviteStatus.ACCEPTED,
    TrialInviteStatus.DECLINED,
    TrialInviteStatus.WITHDRAWN,
    'ACCEPT_OFFER',
  ]),
})

/** Club-side pipeline step on /clubs/:clubId/trial-invites/:id. */
export const clubTrialActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('invite'),
    sessionEventIds: sessionEventIdsSchema,
    message: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('feedback'),
    rating: z.number().int().min(1).max(5),
    feedback: z.string().trim().max(1000).optional(),
    attended: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('offer'),
    message: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('reject'),
    message: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('revoke'),
  }),
])

export const createTrialRequestSchema = z.object({
  message: z.string().trim().max(500).optional(),
})

export const createPlayerSearchSchema = z.object({
  teamId: z.string().min(1),
  positions: z.array(z.nativeEnum(PlayerPosition)).min(1).max(4),
  note: z.string().trim().max(500).optional(),
  expiresAt: isoDateSchema.optional(),
})

export const updatePlayerSearchSchema = z
  .object({
    status: z.nativeEnum(PlayerSearchStatus).optional(),
    positions: z.array(z.nativeEnum(PlayerPosition)).min(1).max(4).optional(),
    note: z.string().trim().max(500).nullable().optional(),
    expiresAt: isoDateSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update')

export const playerSearchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  position: z.nativeEnum(PlayerPosition).optional(),
  postalCode: postalCodeSchema.optional(),
  radiusKm: z.coerce.number().int().min(5).max(100).optional(),
})

export const updateRegistrationRoleSchema = z.object({
  registrationRole: z.nativeEnum(RegistrationRole),
})

export type CreateFreeAgentMediaInput = z.infer<typeof createFreeAgentMediaSchema>
export type PresignFreeAgentMediaInput = z.infer<typeof presignFreeAgentMediaSchema>
export type FreeAgentProfileWriteInput = z.infer<
  typeof freeAgentProfileWriteSchema
>
export type FreeAgentListQueryInput = z.infer<typeof freeAgentListQuerySchema>
export type CreateTrialInviteInput = z.infer<typeof createTrialInviteSchema>
export type RespondToTrialInviteInput = z.infer<
  typeof respondToTrialInviteSchema
>
export type ClubTrialActionInput = z.infer<typeof clubTrialActionSchema>
export type CreateTrialRequestInput = z.infer<typeof createTrialRequestSchema>
export type CreatePlayerSearchInput = z.infer<typeof createPlayerSearchSchema>
export type UpdatePlayerSearchInput = z.infer<typeof updatePlayerSearchSchema>
export type PlayerSearchListQueryInput = z.infer<typeof playerSearchListQuerySchema>
export type UpdateRegistrationRoleInput = z.infer<
  typeof updateRegistrationRoleSchema
>
