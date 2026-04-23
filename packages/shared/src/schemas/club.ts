import { z } from 'zod'
import { ClubOperationalRole } from '../types/club-operations'
import {
  InviteDeliveryChannel,
  MembershipRole,
  TeamAccessPhase,
  TeamGroupType,
  TeamRole,
} from '../types/roles'

export const createClubSchema = z.object({
  name: z.string().min(2, 'Club name must be at least 2 characters').max(50),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #D50000)'),
})

export const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters').max(50),
  ageGroup: z.string().max(30).optional(),
  squadLabel: z.string().max(20).optional(),
  leagueName: z.string().max(80).optional(),
  seasonStart: z.string().optional(),
})

export const createTeamGroupSchema = z.object({
  type: z.nativeEnum(TeamGroupType),
  displayName: z.string().min(2).max(50),
  sortOrder: z.number().int().min(0).optional(),
})

export const createHierarchicalTeamSchema = z.object({
  name: z.string().min(2).max(50),
  squadLabel: z.string().max(20).optional(),
  leagueName: z.string().max(80).optional(),
  seasonStart: z.string().optional(),
  headCoachUserId: z.string().min(1).optional(),
})

export const updateTeamCoachAssignmentsSchema = z
  .object({
    headCoachUserId: z.string().min(1).nullable().optional(),
    assistantCoachUserIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
    const assistantCoachUserIds = new Set(value.assistantCoachUserIds)

    if (assistantCoachUserIds.size !== value.assistantCoachUserIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assistantCoachUserIds'],
        message: 'Assistant coach assignments must be unique',
      })
    }

    if (
      value.headCoachUserId &&
      assistantCoachUserIds.has(value.headCoachUserId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assistantCoachUserIds'],
        message: 'Head coach cannot also be assigned as assistant coach',
      })
    }
  })

export const updateMembershipRoleSchema = z.object({
  role: z.nativeEnum(MembershipRole),
})

export const updateOperationalRolesSchema = z.object({
  operationalRoles: z
    .array(z.nativeEnum(ClubOperationalRole))
    .max(4, 'Too many operational roles')
    .refine((value) => new Set(value).size === value.length, {
      message: 'Operational roles must be unique',
    }),
})

export const offboardClubMemberSchema = z.object({
  preservePlayerAccess: z.boolean().default(true),
})

export const createInviteSchema = z
  .object({
    teamId: z.string().min(1),
    role: z.nativeEnum(TeamRole),
    phase: z.nativeEnum(TeamAccessPhase).default(TeamAccessPhase.FULL),
    deliveryChannel: z.nativeEnum(InviteDeliveryChannel),
    recipientEmail: z.string().email().optional(),
    linkedPlayerUserId: z.string().min(1).optional(),
    guardianEmail: z.string().email().optional(),
    childName: z.string().max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.deliveryChannel === InviteDeliveryChannel.EMAIL &&
      !value.recipientEmail
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientEmail'],
        message: 'Recipient email is required for email invites',
      })
    }

    if (value.role === TeamRole.PLAYER && value.guardianEmail && !value.recipientEmail) {
      return
    }

    if (value.linkedPlayerUserId && value.role !== TeamRole.PARENT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkedPlayerUserId'],
        message: 'Only parent invites can be linked to an existing child',
      })
    }

    if (value.role === TeamRole.PARENT && !value.linkedPlayerUserId && !value.childName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['childName'],
        message: 'Parent invites need a child assignment or name',
      })
    }
  })

export const updateGuardianRelationshipSchema = z.object({
  playerUserId: z.string().min(1).nullable().optional(),
  childName: z.string().trim().min(1).max(80).nullable().optional(),
})

export const trialDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
})

export const teamMemberOperationalStatusSchema = z.enum([
  'ACTIVE',
  'NEW_PLAYER',
  'INACTIVE',
])

export const injuryAvailabilityStatusSchema = z.enum([
  'OUT',
  'DOUBTFUL',
  'DAY_TO_DAY',
])

export const teamDutyKindSchema = z.enum(['JERSEY_CLEANUP', 'BIB_CLEANUP'])

export const teamDutyStatusSchema = z.enum(['PENDING', 'COMPLETED', 'SKIPPED'])

export const createPlayerLoanSchema = z.object({
  playerUserId: z.string().min(1, 'Player is required'),
  targetTeamId: z.string().min(1, 'Target team is required'),
  loanEndDate: z.string().optional(),
})

export const updateTeamMemberSchema = z.object({
  position: z.string().max(30).nullable().optional(),
  jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
  operationalStatus: teamMemberOperationalStatusSchema.nullable().optional(),
})

export const createInjuryReportSchema = z.object({
  userId: z.string().min(1),
  title: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(500).optional(),
  status: injuryAvailabilityStatusSchema.default('OUT'),
  expectedReturnAt: z.string().optional(),
  expectedReturnLabel: z.string().trim().max(80).optional(),
})

export const updateInjuryReportSchema = z.object({
  title: z.string().trim().min(2).max(100).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: injuryAvailabilityStatusSchema.optional(),
  expectedReturnAt: z.string().nullable().optional(),
  expectedReturnLabel: z.string().trim().max(80).nullable().optional(),
  cleared: z.boolean().optional(),
})

export const rotateTeamDutySchema = z.object({
  kind: teamDutyKindSchema,
  dueDate: z.string().optional(),
  notes: z.string().trim().max(200).optional(),
})

export const updateTeamDutySchema = z.object({
  status: teamDutyStatusSchema,
  notes: z.string().trim().max(200).nullable().optional(),
})

export const redeemInviteSchema = z.object({
  guardianEmail: z.string().email().optional(),
  childName: z.string().max(80).optional(),
})

export const clubSetupSchema = z.object({
  club: createClubSchema,
  team: createTeamSchema,
})

export type CreateClubInput = z.infer<typeof createClubSchema>
export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type CreateTeamGroupInput = z.infer<typeof createTeamGroupSchema>
export type CreateHierarchicalTeamInput = z.infer<typeof createHierarchicalTeamSchema>
export type UpdateTeamCoachAssignmentsInput = z.infer<
  typeof updateTeamCoachAssignmentsSchema
>
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>
export type UpdateOperationalRolesInput = z.infer<
  typeof updateOperationalRolesSchema
>
export type CreateInviteInput = z.infer<typeof createInviteSchema>
export type UpdateGuardianRelationshipInput = z.infer<
  typeof updateGuardianRelationshipSchema
>
export type TrialDecisionInput = z.infer<typeof trialDecisionSchema>
export type CreatePlayerLoanInput = z.infer<typeof createPlayerLoanSchema>
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>
export type CreateInjuryReportInput = z.infer<typeof createInjuryReportSchema>
export type UpdateInjuryReportInput = z.infer<typeof updateInjuryReportSchema>
export type RotateTeamDutyInput = z.infer<typeof rotateTeamDutySchema>
export type UpdateTeamDutyInput = z.infer<typeof updateTeamDutySchema>
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>
export type ClubSetupInput = z.infer<typeof clubSetupSchema>
export type OffboardClubMemberInput = z.infer<typeof offboardClubMemberSchema>

export const createJoinRequestSchema = z.object({
  teamId: z.string().optional(),
  role: z.enum(['PLAYER', 'PARENT']).default('PLAYER'),
  message: z.string().max(500).optional(),
})

export const reviewJoinRequestSchema = z.object({
  reason: z.string().max(500).optional(),
})

export type CreateJoinRequestInput = z.infer<typeof createJoinRequestSchema>
export type ReviewJoinRequestInput = z.infer<typeof reviewJoinRequestSchema>

export const clubSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters').max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(200).optional(),
})

export const clubSearchResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  badgeUrl: z.string().url().nullable(),
  primaryColor: z.string(),
  city: z.string().nullable(),
  memberCount: z.number().int().min(0),
})

export const clubSearchResponseSchema = z.object({
  results: z.array(clubSearchResultSchema),
  nextCursor: z.string().nullable(),
})

export type ClubSearchQuery = z.infer<typeof clubSearchQuerySchema>
export type ClubSearchResult = z.infer<typeof clubSearchResultSchema>
export type ClubSearchResponse = z.infer<typeof clubSearchResponseSchema>
