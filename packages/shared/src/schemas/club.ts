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
  name: z.string().min(2, 'Club name must be at least 2 characters').max(100),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #D50000)'),
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

    if (value.headCoachUserId && assistantCoachUserIds.has(value.headCoachUserId)) {
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

export const INVITE_ALLOWED_ROLES = [
  TeamRole.PLAYER,
  TeamRole.HEAD_COACH,
  TeamRole.ASSISTANT_COACH,
  TeamRole.PARENT,
] as const

export type InviteAllowedRole = (typeof INVITE_ALLOWED_ROLES)[number]

export const createInviteSchema = z
  .object({
    teamId: z.string().min(1),
    role: z.enum(
      INVITE_ALLOWED_ROLES as unknown as [string, ...string[]],
    ) as z.ZodType<InviteAllowedRole>,
    phase: z.nativeEnum(TeamAccessPhase).default(TeamAccessPhase.FULL),
    deliveryChannel: z.nativeEnum(InviteDeliveryChannel),
    recipientEmail: z.string().email().optional(),
    linkedPlayerUserId: z.string().min(1).optional(),
    guardianEmail: z.string().email().optional(),
    childName: z.string().max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.deliveryChannel === InviteDeliveryChannel.EMAIL && !value.recipientEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientEmail'],
        message: 'Recipient email is required for email invites',
      })
    }

    const linkedPlayerUserId = value.linkedPlayerUserId?.trim()
    const childName = value.childName?.trim()
    const hasParentContext = Boolean(linkedPlayerUserId || childName)

    if (value.role === TeamRole.PARENT && !hasParentContext) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkedPlayerUserId'],
        message: 'Parent invites require a linked player or child name',
      })
    }

    if (value.role !== TeamRole.PARENT) {
      if (linkedPlayerUserId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linkedPlayerUserId'],
          message: 'Linked player ids are only allowed for parent invites',
        })
      }

      if (value.guardianEmail || childName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['guardianEmail'],
          message: 'Guardian metadata is only allowed for parent invites',
        })
      }
    }
  })

export const updateGuardianRelationshipSchema = z.object({
  playerUserId: z.string().min(1).nullable().optional(),
  childName: z.string().trim().min(1).max(80).nullable().optional(),
})

export const trialDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
})

export const teamMemberOperationalStatusSchema = z.enum(['ACTIVE', 'NEW_PLAYER', 'INACTIVE'])

export const injuryAvailabilityStatusSchema = z.enum(['OUT', 'DOUBTFUL', 'DAY_TO_DAY'])

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
  directoryEntryId: z.string().min(1).optional(),
})

const officialTeamUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine((value) => {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const isOfficialHost = ['fussball.de', 'dfb.de', 'fupa.net'].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      parsed.pathname !== '/' &&
      isOfficialHost
    )
  }, 'Use a direct HTTPS team link from Fussball.de, DFB.de, or FuPa')

export const submitFirstClubClaimSchema = z.object({
  directoryEntryId: z.string().min(1).optional(),
  clubName: z.string().trim().min(2).max(120).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  teamName: z.string().trim().min(2).max(80),
  teamGroupType: z.nativeEnum(TeamGroupType).default(TeamGroupType.SENIOR),
  teamRoles: z
    .array(z.enum(['HEAD_COACH', 'ASSISTANT_COACH', 'PLAYER']))
    .max(3)
    .default([])
    .refine((roles) => new Set(roles).size === roles.length, {
      message: 'Team roles must be unique',
    }),
  externalTeamUrl: officialTeamUrlSchema,
  officialEmail: z.string().email().max(254).optional(),
}).refine((value) => Boolean(value.directoryEntryId || value.clubName), {
  message: 'Choose a directory club or provide the official club name',
})

export const submitStaffAccessRequestSchema = z.object({
  desiredRole: z.enum(['ADMIN', 'COACH']),
  requestedTeamIds: z.array(z.string().min(1)).max(20).default([]),
  teamRoles: z
    .array(z.enum(['HEAD_COACH', 'ASSISTANT_COACH', 'PLAYER']))
    .max(3)
    .default([])
    .refine((roles) => new Set(roles).size === roles.length, {
      message: 'Team roles must be unique',
    }),
  message: z.string().trim().max(500).optional(),
})

export const reviewClubClaimSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'NEEDS_INFO']),
  note: z.string().trim().max(1000).optional(),
})

export const respondClubClaimSchema = z
  .object({
    note: z.string().trim().min(2).max(1000).optional(),
    officialEmail: z.string().trim().email().max(254).optional(),
  })
  .refine((value) => Boolean(value.note || value.officialEmail), {
    message: 'Add a response or your verified account email',
  })

export const createOwnershipTransferSchema = z.object({
  toUserId: z.string().min(1),
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
})

export const requestOwnershipTransferChallengeSchema = z.object({
  toUserId: z.string().min(1),
})

export const verifyOwnershipTransferChallengeSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
})

export const openClubDisputeSchema = z.object({
  clubId: z.string().min(1),
  reason: z.string().trim().min(10).max(2000),
  freezeOwnership: z.boolean().default(true),
})

export const resolveClubDisputeSchema = z.object({
  resolution: z.string().trim().min(10).max(2000),
  newOwnerUserId: z.string().min(1).optional(),
})

export const createInviteCampaignSchema = z
  .object({
    teamId: z.string().min(1),
    type: z.enum(['IDENTITY_BOUND', 'APPROVAL_REQUIRED']),
    // Shared/batch campaigns are player-only. Parent access must use the
    // existing child-linked guardian invitation and consent flow; a generic
    // campaign cannot prove which child the parent represents.
    role: z.literal('PLAYER').default('PLAYER'),
    recipientEmail: z.string().email().max(254).optional(),
    maxUses: z.number().int().min(1).max(500).default(1),
    expiresInDays: z.number().int().min(1).max(30).default(7),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'IDENTITY_BOUND' && !value.recipientEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientEmail'],
        message: 'Identity-bound campaigns require a recipient email',
      })
    }
    if (value.type === 'IDENTITY_BOUND' && value.maxUses !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxUses'],
        message: 'Identity-bound campaigns can only be redeemed once',
      })
    }
  })

export const updateClubSchema = z
  .object({
    name: z.string().min(2, 'Club name must be at least 2 characters').max(100).optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #D50000)')
      .optional(),
    badgeUrl: z.string().url().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export type UpdateClubInput = z.infer<typeof updateClubSchema>
export type CreateClubInput = z.infer<typeof createClubSchema>
export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type CreateTeamGroupInput = z.infer<typeof createTeamGroupSchema>
export type CreateHierarchicalTeamInput = z.infer<typeof createHierarchicalTeamSchema>
export type UpdateTeamCoachAssignmentsInput = z.infer<typeof updateTeamCoachAssignmentsSchema>
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>
export type UpdateOperationalRolesInput = z.infer<typeof updateOperationalRolesSchema>
export type CreateInviteInput = z.infer<typeof createInviteSchema>
export type UpdateGuardianRelationshipInput = z.infer<typeof updateGuardianRelationshipSchema>
export type TrialDecisionInput = z.infer<typeof trialDecisionSchema>
export type CreatePlayerLoanInput = z.infer<typeof createPlayerLoanSchema>
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>
export type CreateInjuryReportInput = z.infer<typeof createInjuryReportSchema>
export type UpdateInjuryReportInput = z.infer<typeof updateInjuryReportSchema>
export type RotateTeamDutyInput = z.infer<typeof rotateTeamDutySchema>
export type UpdateTeamDutyInput = z.infer<typeof updateTeamDutySchema>
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>
export type ClubSetupInput = z.infer<typeof clubSetupSchema>
export type SubmitFirstClubClaimInput = z.infer<typeof submitFirstClubClaimSchema>
export type SubmitStaffAccessRequestInput = z.infer<typeof submitStaffAccessRequestSchema>
export type ReviewClubClaimInput = z.infer<typeof reviewClubClaimSchema>
export type RespondClubClaimInput = z.infer<typeof respondClubClaimSchema>
export type CreateOwnershipTransferInput = z.infer<typeof createOwnershipTransferSchema>
export type RequestOwnershipTransferChallengeInput = z.infer<
  typeof requestOwnershipTransferChallengeSchema
>
export type VerifyOwnershipTransferChallengeInput = z.infer<
  typeof verifyOwnershipTransferChallengeSchema
>
export type OpenClubDisputeInput = z.infer<typeof openClubDisputeSchema>
export type ResolveClubDisputeInput = z.infer<typeof resolveClubDisputeSchema>
export type CreateInviteCampaignInput = z.infer<typeof createInviteCampaignSchema>
export type OffboardClubMemberInput = z.infer<typeof offboardClubMemberSchema>

export const createJoinRequestSchema = z.object({
  teamId: z.string().optional(),
  role: z.enum(['PLAYER', 'PARENT']).default('PLAYER'),
  message: z.string().max(500).optional(),
})

export const reviewJoinRequestSchema = z.object({
  revision: z.number().int().positive(),
  reason: z.string().max(500).optional(),
})

export type CreateJoinRequestInput = z.infer<typeof createJoinRequestSchema>
export type ReviewJoinRequestInput = z.infer<typeof reviewJoinRequestSchema>

export const clubSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search query must be at least 2 characters').max(80),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(200).optional(),
})

const clubSearchResultBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  badgeUrl: z.string().url().nullable(),
  primaryColor: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable().optional(),
  association: z.string().nullable().optional(),
  memberCount: z.number().int().min(0),
})

const clubDirectorySourceSchema = z.enum(['DFBNET', 'FUSSBALL_DE', 'CSV_IMPORT', 'MANUAL'])

export const clubSearchResultSchema = z.discriminatedUnion('isActive', [
  clubSearchResultBaseSchema.extend({
    activeClubId: z.string().min(1),
    directoryEntryId: z.string().min(1).nullable(),
    source: z.literal('ANSTOSS'),
    isActive: z.literal(true),
  }),
  clubSearchResultBaseSchema.extend({
    activeClubId: z.null(),
    directoryEntryId: z.string().min(1),
    source: clubDirectorySourceSchema,
    isActive: z.literal(false),
  }),
])

export const clubSearchResponseSchema = z.object({
  results: z.array(clubSearchResultSchema),
  nextCursor: z.string().nullable(),
})

export type ClubSearchQuery = z.infer<typeof clubSearchQuerySchema>
export type ClubSearchResult = z.infer<typeof clubSearchResultSchema>
export type ClubSearchResponse = z.infer<typeof clubSearchResponseSchema>
