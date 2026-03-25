import { z } from 'zod'
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

export const createPlayerLoanSchema = z.object({
  playerUserId: z.string().min(1, 'Player is required'),
  targetTeamId: z.string().min(1, 'Target team is required'),
  loanEndDate: z.string().optional(),
})

export const updateTeamMemberSchema = z.object({
  position: z.string().max(30).nullable().optional(),
  jerseyNumber: z.number().int().min(0).max(999).nullable().optional(),
})

export type CreateClubInput = z.infer<typeof createClubSchema>
export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type CreateTeamGroupInput = z.infer<typeof createTeamGroupSchema>
export type CreateHierarchicalTeamInput = z.infer<typeof createHierarchicalTeamSchema>
export type UpdateTeamCoachAssignmentsInput = z.infer<
  typeof updateTeamCoachAssignmentsSchema
>
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>
export type CreateInviteInput = z.infer<typeof createInviteSchema>
export type UpdateGuardianRelationshipInput = z.infer<
  typeof updateGuardianRelationshipSchema
>
export type TrialDecisionInput = z.infer<typeof trialDecisionSchema>
export type CreatePlayerLoanInput = z.infer<typeof createPlayerLoanSchema>
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>
