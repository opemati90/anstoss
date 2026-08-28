import { z } from 'zod'
import { INVITE } from '../constants/limits'
import {
  InviteDeliveryChannel,
  InviteKind,
  InviteStatus,
  ParentalConsentStatus,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
} from '../types/roles'

export const internalAdminRoleSchema = z.enum(['PLATFORM_ADMIN', 'SUPPORT_AGENT', 'OPERATIONS'])

export const billingProviderSchema = z.enum(['NONE', 'STRIPE', 'GOCARDLESS'])
export const billingPlanSchema = z.enum(['FOUNDATION', 'PREMIUM'])
export const planTierSchema = z.enum(['FREE', 'PRO', 'SCALE'])
export const planIntervalSchema = z.enum(['SIX_MONTHS', 'TWELVE_MONTHS'])
export const entitlementSourceSchema = z.enum(['PAID', 'COMPLIMENTARY', 'TRIAL', 'MIGRATED'])
export const billingSubscriptionStatusSchema = z.enum([
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
])

export const billingConnectStatusSchema = z.enum(['not_started', 'pending', 'active', 'blocked'])

export const contributionCadenceSchema = z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_OFF'])
export const contributionTargetRoleSchema = z.enum(['PLAYER', 'PARENT', 'COACH', 'ADMIN', 'CUSTOM'])
export const contributionStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'PARTIAL',
  'WAIVED',
  'EXEMPT',
  'OVERDUE',
])
export const contributionReminderTriggerSchema = z.enum(['AUTOMATIC', 'MANUAL'])

export const customDomainStatusSchema = z.enum([
  'not_started',
  'pending_verification',
  'verified',
  'failed',
])

export const supportActionTypeSchema = z.enum(['SUPPORT_NOTE'])

export const auditEventTypeSchema = z.enum([
  'club.created',
  'club.claim_approved',
  'club.claim_reviewed',
  'club.claim_withdrawn',
  'club.claim_information_submitted',
  'club.claim_expired',
  'club.staff_access_approved',
  'club.ownership_transfer_started',
  'club.ownership_transfer_accepted',
  'club.ownership_transfer_cancelled',
  'club.ownership_transfer_expired',
  'club.ownership_dispute_opened',
  'club.ownership_dispute_resolved',
  'membership.created',
  'invite.created',
  'invite.redeemed',
  'invite.expired',
  'invite.campaign_expired',
  'event.created',
  'support.action',
  'billing.status_changed',
  'billing.plan_published',
  'billing.entitlement_granted',
  'billing.entitlement_revoked',
  'billing.over_quota_detected',
  'billing.over_quota_resolved',
  'contribution.plan_created',
  'contribution.status_updated',
  'contribution.reminder_sent',
  'contribution.bank_imported',
  'contribution.bank_match_confirmed',
  'contribution.bank_match_reversed',
  'admin.broadcast.sent',
  'admin.broadcast.failed',
  'admin.feature_flag.updated',
  'admin.feature_flag.removed',
  'admin.setting.updated',
  'admin.moderation_report.resolved',
])

export const assetKindSchema = z.enum([
  'club_badge',
  'splash_image',
  'sponsor_logo',
  'player_avatar',
])

export const teamGroupTypeSchema = z.nativeEnum(TeamGroupType)
export const teamRoleSchema = z.nativeEnum(TeamRole)
export const teamAccessPhaseSchema = z.nativeEnum(TeamAccessPhase)
export const teamAccessStatusSchema = z.nativeEnum(TeamAccessStatus)
export const inviteKindSchema = z.nativeEnum(InviteKind)
export const inviteDeliveryChannelSchema = z.nativeEnum(InviteDeliveryChannel)
export const inviteStatusSchema = z.nativeEnum(InviteStatus)
export const parentalConsentStatusSchema = z.nativeEnum(ParentalConsentStatus)

export const sponsorLogoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  url: z.string().url(),
})

export const customDomainSchema = z.object({
  hostname: z.string().min(3).max(255),
  status: customDomainStatusSchema,
  verifiedAt: z.string().datetime().nullable(),
})

export const clubSettingsSchema = z.object({
  clubId: z.string().min(1),
  welcomeText: z.string().max(500).nullable(),
  splashImageUrl: z.string().url().nullable(),
  sponsorLogos: z.array(sponsorLogoSchema),
  customDomain: customDomainSchema.nullable(),
})

export const billingStatusSchema = z.object({
  clubId: z.string().min(1),
  provider: billingProviderSchema,
  plan: billingPlanSchema,
  subscriptionStatus: billingSubscriptionStatusSchema,
  connectStatus: billingConnectStatusSchema,
  currentPeriodEnd: z.string().datetime().nullable(),
  billingContactEmail: z.string().email().nullable(),
})

// Response shape: bank fields are always present (null when unset), matching
// the ContributionSettings type the service returns.
export const contributionSettingsSchema = z.object({
  clubId: z.string().min(1),
  enabled: z.boolean(),
  autoRemindersEnabled: z.boolean(),
  defaultCurrency: z.string().length(3),
  bankAccountHolder: z.string().nullable(),
  bankIban: z.string().nullable(),
  bankReference: z.string().nullable(),
})

// Update payload: bank fields are OPTIONAL (omitted = leave unchanged,
// null/'' = clear). Kept permissive on length only; the service normalizes
// the IBAN and rejects a failed MOD-97 checksum with a clear 400.
export const updateContributionSettingsSchema = z.object({
  enabled: z.boolean(),
  autoRemindersEnabled: z.boolean(),
  defaultCurrency: z.string().length(3),
  bankAccountHolder: z.string().trim().max(120).optional().nullable(),
  bankIban: z.string().trim().max(42).optional().nullable(),
  bankReference: z.string().trim().max(140).optional().nullable(),
})

export const contributionReminderPolicySchema = z.object({
  daysBefore: z.array(z.number().int().min(0).max(60)).max(5),
  daysAfter: z.array(z.number().int().min(0).max(60)).max(5),
})

export const contributionPlanSchema = z.object({
  id: z.string().min(1),
  clubId: z.string().min(1),
  name: z.string().min(2).max(80),
  description: z.string().max(240).nullable(),
  amount: z.number().int().min(0),
  currency: z.string().length(3),
  cadence: contributionCadenceSchema,
  targetRole: contributionTargetRoleSchema,
  dueDay: z.number().int().min(1).max(28),
  dueMonth: z.number().int().min(1).max(12).nullable(),
  graceDays: z.number().int().min(0).max(31),
  reminderPolicy: contributionReminderPolicySchema,
  active: z.boolean(),
  assignedMemberCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const createContributionPlanSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(240).optional(),
  amount: z.number().int().min(0),
  currency: z.string().length(3),
  cadence: contributionCadenceSchema,
  targetRole: contributionTargetRoleSchema,
  dueDay: z.number().int().min(1).max(28),
  dueMonth: z.number().int().min(1).max(12).optional(),
  graceDays: z.number().int().min(0).max(31).default(0),
  reminderPolicy: contributionReminderPolicySchema,
  active: z.boolean().optional(),
  memberUserIds: z.array(z.string().min(1)).max(250).optional(),
})

export const updateContributionPlanSchema = createContributionPlanSchema.partial()

export const updateContributionAssignmentsSchema = z.object({
  planId: z.string().min(1),
  memberUserIds: z.array(z.string().min(1)).max(250),
})

export const contributionMemberRecordSchema = z.object({
  memberUserId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'COACH', 'PLAYER', 'PARENT']),
  planId: z.string().min(1).nullable(),
  planName: z.string().min(1).nullable(),
  cadence: contributionCadenceSchema.nullable(),
  amount: z.number().int().min(0).nullable(),
  currency: z.string().length(3).nullable(),
  dueDate: z.string().datetime().nullable(),
  status: contributionStatusSchema.nullable(),
  paidAmount: z.number().int().min(0).nullable(),
  paidAt: z.string().datetime().nullable(),
  note: z.string().max(500).nullable(),
  lastReminderSentAt: z.string().datetime().nullable(),
})

export const contributionSummarySchema = z.object({
  assignedMembers: z.number().int().min(0),
  paidMembers: z.number().int().min(0),
  overdueMembers: z.number().int().min(0),
  outstandingMembers: z.number().int().min(0),
  expectedAmount: z.number().int().min(0),
  collectedAmount: z.number().int().min(0),
})

export const contributionOverviewSchema = z.object({
  settings: contributionSettingsSchema,
  summary: contributionSummarySchema,
  plans: z.array(contributionPlanSchema),
  members: z.array(contributionMemberRecordSchema),
})

export const updateContributionMemberStatusSchema = z.object({
  planId: z.string().min(1),
  status: contributionStatusSchema.exclude(['OVERDUE']),
  paidAmount: z.number().int().min(0).optional(),
  note: z.string().max(500).optional(),
})

export const sendContributionReminderSchema = z.object({
  memberUserIds: z.array(z.string().min(1)).max(250).optional(),
  planId: z.string().min(1).optional(),
  onlyOverdue: z.boolean().optional(),
})

export const contributionReminderDispatchResultSchema = z.object({
  requested: z.number().int().min(0),
  sent: z.number().int().min(0),
  skipped: z.number().int().min(0),
})

export const myContributionItemSchema = z.object({
  planId: z.string().min(1),
  planName: z.string().min(1),
  amount: z.number().int().min(0),
  currency: z.string().length(3),
  cadence: contributionCadenceSchema,
  dueDate: z.string().datetime(),
  status: contributionStatusSchema,
  paidAmount: z.number().int().min(0).nullable(),
  paidAt: z.string().datetime().nullable(),
  paymentReported: z.boolean(),
})

export const contributionBankTransferSchema = z.object({
  accountHolder: z.string().min(1),
  iban: z.string().min(1),
  reference: z.string().nullable(),
})

export const myContributionSummarySchema = z.object({
  items: z.array(myContributionItemSchema),
  hasContributions: z.boolean(),
  bankTransfer: contributionBankTransferSchema.nullable(),
})

export const toggleEventReminderSchema = z.object({
  enabled: z.boolean(),
})

export const publicInvitePayloadSchema = z.object({
  code: z.string().length(INVITE.CODE_LENGTH),
  expiresAt: z.string().datetime(),
  kind: inviteKindSchema,
  role: teamRoleSchema,
  phase: teamAccessPhaseSchema,
  status: inviteStatusSchema,
  club: z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(100),
    badgeUrl: z.string().url().nullable(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color'),
  }),
  team: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    squadLabel: z.string().nullable(),
    leagueName: z.string().nullable(),
    group: z.object({
      id: z.string().min(1),
      displayName: z.string().min(1),
      type: teamGroupTypeSchema,
    }),
  }),
  installUrls: z.object({
    ios: z.string().url(),
    android: z.string().url(),
  }),
})

export const parentalConsentSchema = z.object({
  playerUserId: z.string().min(1),
  teamId: z.string().min(1),
  guardianEmail: z.string().email(),
  guardianUserId: z.string().min(1).nullable().optional(),
  status: parentalConsentStatusSchema,
})

export const supportActionSchema = z.object({
  action: supportActionTypeSchema,
  clubId: z.string().min(1),
  note: z.string().max(500).optional(),
})

export const createEntitlementGrantSchema = z
  .object({
    tier: planTierSchema.exclude(['FREE']),
    interval: planIntervalSchema,
    source: z.enum(['COMPLIMENTARY', 'TRIAL']),
    reason: z.string().trim().min(3).max(500),
    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime(),
  })
  .superRefine((value, ctx) => {
    if (
      value.expiresAt &&
      new Date(value.expiresAt).getTime() <=
        (value.startsAt ? new Date(value.startsAt).getTime() : Date.now())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Expiry must be after the start date',
      })
    }
  })

export const publishPlanDefinitionSchema = z.object({
  tier: planTierSchema.exclude(['FREE']),
  interval: planIntervalSchema,
  priceCents: z.number().int().min(100).max(1_000_000),
  currency: z.string().length(3).default('eur'),
  teamLimit: z.number().int().min(1).max(100),
  playerLimit: z.number().int().min(1).max(10_000),
  features: z.array(z.string().trim().min(1).max(80)).max(100),
  stripePriceId: z.string().trim().min(1).max(255).nullable().optional(),
})

export const createBankImportSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  format: z.enum(['CSV', 'CAMT053']),
  contentBase64: z.string().min(1).max(14_000_000),
})

export const confirmContributionMatchSchema = z.object({
  transactionId: z.string().min(1),
  recordId: z.string().min(1),
  amount: z.number().int().positive(),
})

export const reverseContributionMatchSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

export const auditEventSchema = z.object({
  id: z.string().min(1),
  type: auditEventTypeSchema,
  actorType: z.enum(['system', 'user', 'admin']),
  actorId: z.string().nullable(),
  actorLabel: z.string().nullable(),
  clubId: z.string().nullable(),
  createdAt: z.string().datetime(),
  summary: z.string().min(1).max(500),
})

export const assetPresignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  kind: assetKindSchema,
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
})

export const assetPresignResponseSchema = z.object({
  enabled: z.boolean(),
  objectKey: z.string().min(1),
  uploadUrl: z.string().url().nullable(),
  publicUrl: z.string().url().nullable(),
})

export type ClubSettingsInput = z.infer<typeof clubSettingsSchema>
export type BillingStatusInput = z.infer<typeof billingStatusSchema>
export type ContributionSettingsInput = z.infer<typeof contributionSettingsSchema>
export type UpdateContributionSettingsInput = z.infer<typeof updateContributionSettingsSchema>
export type ContributionPlanInput = z.infer<typeof contributionPlanSchema>
export type CreateContributionPlanInput = z.infer<typeof createContributionPlanSchema>
export type UpdateContributionPlanInput = z.infer<typeof updateContributionPlanSchema>
export type UpdateContributionAssignmentsInput = z.infer<typeof updateContributionAssignmentsSchema>
export type ContributionMemberRecordInput = z.infer<typeof contributionMemberRecordSchema>
export type ContributionOverviewInput = z.infer<typeof contributionOverviewSchema>
export type UpdateContributionMemberStatusInput = z.infer<
  typeof updateContributionMemberStatusSchema
>
export type SendContributionReminderInput = z.infer<typeof sendContributionReminderSchema>
export type ContributionReminderDispatchResultInput = z.infer<
  typeof contributionReminderDispatchResultSchema
>
export type PublicInvitePayloadInput = z.infer<typeof publicInvitePayloadSchema>
export type ParentalConsentInput = z.infer<typeof parentalConsentSchema>
export type SupportActionInput = z.infer<typeof supportActionSchema>
export type CreateEntitlementGrantInput = z.infer<typeof createEntitlementGrantSchema>
export type PublishPlanDefinitionInput = z.infer<typeof publishPlanDefinitionSchema>
export type CreateBankImportInput = z.infer<typeof createBankImportSchema>
export type ConfirmContributionMatchInput = z.infer<typeof confirmContributionMatchSchema>
export type ReverseContributionMatchInput = z.infer<typeof reverseContributionMatchSchema>
export type AuditEventInput = z.infer<typeof auditEventSchema>
export const registerPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android', 'web']),
})

export const unregisterPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
})

export type MyContributionItemInput = z.infer<typeof myContributionItemSchema>
export type MyContributionSummaryInput = z.infer<typeof myContributionSummarySchema>
export type ToggleEventReminderInput = z.infer<typeof toggleEventReminderSchema>
export type AssetPresignRequestInput = z.infer<typeof assetPresignRequestSchema>
export type AssetPresignResponseInput = z.infer<typeof assetPresignResponseSchema>
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>
