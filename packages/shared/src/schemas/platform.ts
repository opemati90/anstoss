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

export const internalAdminRoleSchema = z.enum([
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
  'OPERATIONS',
])

export const billingProviderSchema = z.enum(['NONE', 'STRIPE', 'GOCARDLESS'])
export const billingPlanSchema = z.enum(['FOUNDATION', 'PREMIUM'])
export const billingSubscriptionStatusSchema = z.enum([
  'inactive',
  'trialing',
  'active',
  'past_due',
  'canceled',
])

export const billingConnectStatusSchema = z.enum([
  'not_started',
  'pending',
  'active',
  'blocked',
])

export const customDomainStatusSchema = z.enum([
  'not_started',
  'pending_verification',
  'verified',
  'failed',
])

export const supportActionTypeSchema = z.enum([
  'IMPERSONATE',
  'RESET_INVITE',
  'SUSPEND_CLUB',
  'RESTORE_CLUB',
  'RESEND_BILLING_LINK',
])

export const auditEventTypeSchema = z.enum([
  'club.created',
  'membership.created',
  'invite.created',
  'invite.redeemed',
  'event.created',
  'support.action',
  'billing.status_changed',
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
    primaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color'),
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
})

export const assetPresignResponseSchema = z.object({
  enabled: z.boolean(),
  objectKey: z.string().min(1),
  uploadUrl: z.string().url().nullable(),
  publicUrl: z.string().url().nullable(),
})

export type ClubSettingsInput = z.infer<typeof clubSettingsSchema>
export type BillingStatusInput = z.infer<typeof billingStatusSchema>
export type PublicInvitePayloadInput = z.infer<typeof publicInvitePayloadSchema>
export type ParentalConsentInput = z.infer<typeof parentalConsentSchema>
export type SupportActionInput = z.infer<typeof supportActionSchema>
export type AuditEventInput = z.infer<typeof auditEventSchema>
export const registerPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android', 'web']),
})

export const unregisterPushTokenSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
})

export type AssetPresignRequestInput = z.infer<typeof assetPresignRequestSchema>
export type AssetPresignResponseInput = z.infer<typeof assetPresignResponseSchema>
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>
