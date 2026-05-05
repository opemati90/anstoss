import { z } from 'zod'
import { RegistrationRole } from '../types/club-operations'
import {
  FreeAgentVisibility,
  PlayerPosition,
  PreferredFoot,
  TrialInviteStatus,
} from '../types/marketplace'

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
})

export const freeAgentProfileWriteSchema = z.object({
  position: z.nativeEnum(PlayerPosition).nullable().optional(),
  preferredFoot: z.nativeEnum(PreferredFoot).nullable().optional(),
  city: z.string().trim().min(2).max(80).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  isOnTransferList: z.boolean().optional(),
  visibility: z.nativeEnum(FreeAgentVisibility).optional(),
  experience: z.array(freeAgentExperienceEntrySchema).max(10).optional(),
})

export const freeAgentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  position: z.nativeEnum(PlayerPosition).optional(),
  preferredFoot: z.nativeEnum(PreferredFoot).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  query: z.string().trim().max(80).optional(),
  // 'recent' is the mobile-side label for "newest first" — keep both for
  // back-compat with anything that still sends 'newest' or 'city'.
  sort: z
    .enum(['recent', 'newest', 'experience', 'name', 'city'])
    .default('recent'),
})

export const createTrialInviteSchema = z.object({
  freeAgentProfileId: z.string().min(1),
  teamId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime(),
})

export const respondToTrialInviteSchema = z.object({
  status: z.enum([TrialInviteStatus.ACCEPTED, TrialInviteStatus.DECLINED]),
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
export type UpdateRegistrationRoleInput = z.infer<
  typeof updateRegistrationRoleSchema
>
