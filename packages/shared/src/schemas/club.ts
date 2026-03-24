import { z } from 'zod'
import {
  InviteDeliveryChannel,
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

export const createInviteSchema = z
  .object({
    teamId: z.string().min(1),
    role: z.nativeEnum(TeamRole),
    phase: z.nativeEnum(TeamAccessPhase).default(TeamAccessPhase.FULL),
    deliveryChannel: z.nativeEnum(InviteDeliveryChannel),
    recipientEmail: z.string().email().optional(),
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
  })

export const trialDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
})

export type CreateClubInput = z.infer<typeof createClubSchema>
export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type CreateTeamGroupInput = z.infer<typeof createTeamGroupSchema>
export type CreateHierarchicalTeamInput = z.infer<typeof createHierarchicalTeamSchema>
export type CreateInviteInput = z.infer<typeof createInviteSchema>
export type TrialDecisionInput = z.infer<typeof trialDecisionSchema>
