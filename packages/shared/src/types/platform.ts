export type InternalAdminRole =
  | 'PLATFORM_ADMIN'
  | 'SUPPORT_AGENT'
  | 'OPERATIONS'

export type BillingProvider = 'NONE' | 'STRIPE' | 'GOCARDLESS'
export type BillingPlan = 'FOUNDATION' | 'PREMIUM'
export type BillingSubscriptionStatus =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'

export type BillingConnectStatus =
  | 'not_started'
  | 'pending'
  | 'active'
  | 'blocked'

export type ContributionCadence = 'MONTHLY' | 'YEARLY'
export type ContributionTargetRole =
  | 'PLAYER'
  | 'PARENT'
  | 'COACH'
  | 'ADMIN'
  | 'CUSTOM'
export type ContributionStatus =
  | 'PENDING'
  | 'PAID'
  | 'PARTIAL'
  | 'WAIVED'
  | 'EXEMPT'
  | 'OVERDUE'
export type ContributionReminderTrigger = 'AUTOMATIC' | 'MANUAL'

export type CustomDomainStatus =
  | 'not_started'
  | 'pending_verification'
  | 'verified'
  | 'failed'

export type SupportActionType =
  | 'IMPERSONATE'
  | 'RESET_INVITE'
  | 'SUSPEND_CLUB'
  | 'RESTORE_CLUB'
  | 'RESEND_BILLING_LINK'

export type AuditEventType =
  | 'club.created'
  | 'membership.created'
  | 'invite.created'
  | 'invite.redeemed'
  | 'event.created'
  | 'support.action'
  | 'billing.status_changed'
  | 'contribution.plan_created'
  | 'contribution.status_updated'
  | 'contribution.reminder_sent'
  | 'join_request.created'
  | 'join_request.approved'
  | 'join_request.rejected'

export type AssetKind =
  | 'club_badge'
  | 'splash_image'
  | 'sponsor_logo'
  | 'player_avatar'

export type ActorType = 'system' | 'user' | 'admin'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: InternalAdminRole
}

export interface SponsorLogo {
  id: string
  name: string
  url: string
}

export interface CustomDomain {
  hostname: string
  status: CustomDomainStatus
  verifiedAt: string | null
}

export interface ClubSettings {
  clubId: string
  welcomeText: string | null
  splashImageUrl: string | null
  sponsorLogos: SponsorLogo[]
  customDomain: CustomDomain | null
}

export interface BillingStatus {
  clubId: string
  provider: BillingProvider
  plan: BillingPlan
  subscriptionStatus: BillingSubscriptionStatus
  connectStatus: BillingConnectStatus
  currentPeriodEnd: string | null
  billingContactEmail: string | null
}

export interface ContributionSettings {
  clubId: string
  enabled: boolean
  autoRemindersEnabled: boolean
  defaultCurrency: string
}

export interface ContributionReminderPolicy {
  daysBefore: number[]
  daysAfter: number[]
}

export interface ContributionPlan {
  id: string
  clubId: string
  name: string
  description: string | null
  amount: number
  currency: string
  cadence: ContributionCadence
  targetRole: ContributionTargetRole
  dueDay: number
  dueMonth: number | null
  graceDays: number
  reminderPolicy: ContributionReminderPolicy
  active: boolean
  assignedMemberCount: number
  createdAt: string
  updatedAt: string
}

export interface ContributionMemberRecord {
  memberUserId: string
  name: string
  email: string
  avatarUrl: string | null
  role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
  planId: string | null
  planName: string | null
  cadence: ContributionCadence | null
  amount: number | null
  currency: string | null
  dueDate: string | null
  status: ContributionStatus | null
  paidAmount: number | null
  paidAt: string | null
  note: string | null
  lastReminderSentAt: string | null
}

export interface ContributionSummary {
  assignedMembers: number
  paidMembers: number
  overdueMembers: number
  outstandingMembers: number
  expectedAmount: number
  collectedAmount: number
}

export interface ContributionOverview {
  settings: ContributionSettings
  summary: ContributionSummary
  plans: ContributionPlan[]
  members: ContributionMemberRecord[]
}

export interface ContributionReminderDispatchResult {
  requested: number
  sent: number
  skipped: number
}

export interface MyContributionItem {
  planId: string
  planName: string
  amount: number
  currency: string
  cadence: ContributionCadence
  dueDate: string
  status: ContributionStatus
  paidAmount: number | null
  paidAt: string | null
}

export interface MyContributionSummary {
  items: MyContributionItem[]
  hasContributions: boolean
}

export interface PublicInvitePayload {
  code: string
  expiresAt: string
  kind: 'MEMBER_INVITE' | 'PARENT_APPROVAL'
  role: 'HEAD_COACH' | 'ASSISTANT_COACH' | 'PLAYER' | 'PARENT'
  phase: 'FULL' | 'TRIAL'
  status: 'PENDING' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
  club: {
    id: string
    name: string
    slug: string
    badgeUrl: string | null
    primaryColor: string
  }
  team: {
    id: string
    displayName: string
    squadLabel: string | null
    leagueName: string | null
    group: {
      id: string
      displayName: string
      type: 'SENIOR' | 'YOUTH' | 'MINI' | 'CUSTOM'
    }
  }
  installUrls: {
    ios: string
    android: string
  }
}

export interface ParentalConsentRecord {
  userId: string
  guardianName: string
  guardianEmail: string
  status: 'required' | 'pending' | 'approved' | 'rejected'
}

export interface SupportAction {
  action: SupportActionType
  clubId: string
  note: string | null
}

export interface AuditEvent {
  id: string
  type: AuditEventType
  actorType: ActorType
  actorId: string | null
  actorLabel: string | null
  clubId: string | null
  createdAt: string
  summary: string
}

export interface AssetPresignRequest {
  filename: string
  contentType: string
  kind: AssetKind
}

export interface AssetPresignResponse {
  enabled: boolean
  objectKey: string
  uploadUrl: string | null
  publicUrl: string | null
}
