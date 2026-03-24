/**
 * Data model types shared between API and mobile.
 *
 * Club hierarchy model:
 *   User (global) → Membership (club) → TeamGroup (umbrella) → Team (squad)
 *   Team access is handled separately from roster metadata.
 */
import type {
  InviteDeliveryChannel,
  InviteKind,
  InviteStatus,
  MembershipRole,
  ParentalConsentStatus,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
} from './roles'

export interface User {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  dateOfBirth: string // ISO date — used for age gate
  createdAt: string
  updatedAt: string
}

export interface Club {
  id: string
  name: string
  slug: string
  badgeUrl: string | null
  primaryColor: string // hex, e.g. #D50000
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  clubId: string
  groupId: string
  name: string
  displayName: string
  ageGroup: string | null
  squadLabel: string | null
  leagueName: string | null
  seasonStart: string | null
  createdAt: string
  group: TeamGroup
}

export interface TeamGroup {
  id: string
  clubId: string
  type: TeamGroupType
  displayName: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Membership {
  id: string
  userId: string
  clubId: string
  role: MembershipRole
  createdAt: string
}

export interface TeamMember {
  id: string
  teamId: string
  userId: string
  position: string | null
  jerseyNumber: number | null
}

export interface TeamAccess {
  id: string
  clubId: string
  teamId: string
  userId: string
  role: TeamRole
  phase: TeamAccessPhase
  status: TeamAccessStatus
  createdAt: string
  updatedAt: string
  team: Team
}

export type RsvpStatus = 'YES' | 'MAYBE' | 'NO'

export interface Event {
  id: string
  teamId: string
  clubId: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string // ISO datetime
  location: string | null
  notes: string | null
  createdById: string
  createdAt: string
}

export interface EventFeedItem extends Event {
  responseCount: number
  myRsvp: RsvpStatus | null
}

export interface Rsvp {
  id: string
  eventId: string
  userId: string
  status: RsvpStatus
  updatedAt: string
}

export interface Message {
  id: string
  teamId: string
  clubId: string
  senderId: string
  content: string
  isAnnouncement: boolean
  isPinned: boolean
  createdAt: string
}

export interface ChatMessage extends Message {
  senderName: string
}

export type PinnedMessage = ChatMessage

export interface Invite {
  id: string
  clubId: string
  teamId: string
  code: string
  kind: InviteKind
  role: TeamRole
  phase: TeamAccessPhase
  deliveryChannel: InviteDeliveryChannel
  recipientEmail: string | null
  linkedPlayerUserId: string | null
  guardianEmail: string | null
  childName: string | null
  status: InviteStatus
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface GuardianRelationship {
  id: string
  clubId: string
  teamId: string | null
  parentUserId: string
  playerUserId: string | null
  childName: string | null
  createdAt: string
  updatedAt: string
}

export interface TeamFamilyUserSummary {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface TeamFamilyPlayerSummary {
  id: string
  name: string
  avatarUrl: string | null
}

export interface TeamFamilyRelationship {
  id: string
  teamId: string | null
  childName: string | null
  createdAt: string
  updatedAt: string
  parent: TeamFamilyUserSummary
  player: TeamFamilyPlayerSummary | null
  parentAccess: {
    id: string
    phase: TeamAccessPhase
    status: TeamAccessStatus
  } | null
}

export interface TeamFamilyConsentSummary {
  id: string
  guardianEmail: string
  status: ParentalConsentStatus
  requestedAt: string
  approvedAt: string | null
  player: TeamFamilyPlayerSummary
  guardianUser: TeamFamilyUserSummary | null
}

export interface TeamFamilyAccessSnapshot {
  team: {
    id: string
    displayName: string
    group: {
      id: string
      displayName: string
    }
  }
  players: TeamFamilyPlayerSummary[]
  relationships: TeamFamilyRelationship[]
  pendingConsents: TeamFamilyConsentSummary[]
}

export interface ParentalConsent {
  id: string
  clubId: string
  teamId: string
  playerUserId: string
  guardianEmail: string
  guardianUserId: string | null
  status: ParentalConsentStatus
  requestedAt: string
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AgeGateStatus =
  | 'CLEARED'
  | 'PENDING_PARENT_APPROVAL'
  | 'BLOCKED'

export interface AgeGateState {
  isUnder16: boolean
  status: AgeGateStatus
  guardianEmail: string | null
  message: string | null
}
