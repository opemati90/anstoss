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
import type {
  ClubCapability,
  ClubOperationalRole,
  RegistrationRole,
} from './club-operations'
import type {
  FreeAgentVisibility,
  PlayerPosition,
  PreferredFoot,
  TrialInviteStatus,
} from './marketplace'

export interface User {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  registrationRole: RegistrationRole
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
  operationalRoles: ClubOperationalRole[]
  permissions?: Record<ClubCapability, boolean>
  createdAt: string
}

export interface TeamMember {
  id: string
  teamId: string
  userId: string
  position: string | null
  jerseyNumber: number | null
  operationalStatus: TeamMemberOperationalStatus
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
  loanedFromTeamId: string | null
  loanStartDate: string | null
  loanEndDate: string | null
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
  archivedAt?: string | null
}

export interface EventFeedItem extends Event {
  responseCount: number
  yesCount: number
  maybeCount: number
  noCount: number
  myRsvp: RsvpStatus | null
}

export type TeamMemberOperationalStatus = 'ACTIVE' | 'NEW_PLAYER' | 'INACTIVE'

export type InjuryAvailabilityStatus = 'OUT' | 'DOUBTFUL' | 'DAY_TO_DAY'

export type TeamDutyKind = 'JERSEY_CLEANUP' | 'BIB_CLEANUP'

export type TeamDutyStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED'

export interface InjuryReport {
  id: string
  clubId: string
  teamId: string
  userId: string
  reportedById: string
  title: string
  notes: string | null
  status: InjuryAvailabilityStatus
  expectedReturnAt: string | null
  expectedReturnLabel: string | null
  clearedAt: string | null
  createdAt: string
  updatedAt: string
  user?: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

export interface TeamDutyAssignment {
  id: string
  clubId: string
  teamId: string
  assignedUserId: string
  createdById: string
  kind: TeamDutyKind
  status: TeamDutyStatus
  dueDate: string | null
  notes: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assignedUser?: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

export interface RosterOpsMemberSummary {
  id: string
  userId: string
  name: string
  avatarUrl: string | null
  role: TeamRole
  phase: TeamAccessPhase
  status: TeamAccessStatus
  position: string | null
  jerseyNumber: number | null
  operationalStatus: TeamMemberOperationalStatus
  createdAt: string
  loanedFromTeamId: string | null
  loanedFromTeamName: string | null
}

export interface RosterOpsSnapshot {
  team: {
    id: string
    displayName: string
  }
  squad: RosterOpsMemberSummary[]
  operations: {
    trials: RosterOpsMemberSummary[]
    newPlayers: RosterOpsMemberSummary[]
    inactive: RosterOpsMemberSummary[]
  }
  medic: {
    active: InjuryReport[]
    recentlyCleared: InjuryReport[]
  }
  kit: {
    pending: TeamDutyAssignment[]
    recent: TeamDutyAssignment[]
  }
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

/** ANS-37: Cross-team event for parent portal */
export interface CrossTeamEventItem extends EventFeedItem {
  teamName: string
  teamDisplayName: string
  /** The child's userId this event belongs to (for parent RSVP proxy) */
  childUserId?: string
  /** The child's name (for display in parent schedule) */
  childName?: string
  /** The child's RSVP status (may differ from myRsvp which is the parent's own) */
  childRsvp?: RsvpStatus | null
}

/** ANS-39: Enhanced roster member with position/jersey */
export interface EnhancedRosterMember {
  userId: string
  name: string
  email: string
  avatarUrl: string | null
  role: TeamRole
  phase: TeamAccessPhase
  status: TeamAccessStatus
  position: string | null
  jerseyNumber: number | null
  loanedFromTeamId: string | null
  loanedFromTeamName: string | null
}

/** ANS-41: Club-wide aggregate statistics */
export interface ClubAggregateStats {
  memberCount: number
  teamCount: number
  upcomingEventCount: number
  overallRsvpRate: number
  teams: TeamStats[]
}

export interface TeamStats {
  teamId: string
  teamName: string
  teamDisplayName: string
  memberCount: number
  upcomingEventCount: number
  rsvpRate: number
}

export interface FreeAgentExperienceEntry {
  id: string
  clubName: string
  roleLabel: string
  fromYear: number | null
  toYear: number | null
  sortOrder: number
}

export interface FreeAgentProfile {
  id: string
  userId: string
  position: PlayerPosition | null
  preferredFoot: PreferredFoot | null
  city: string | null
  bio: string | null
  avatarUrl: string | null
  isOnTransferList: boolean
  visibility: FreeAgentVisibility
  experience: FreeAgentExperienceEntry[]
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

export interface FreeAgentListItem {
  id: string
  userId: string
  name: string
  avatarUrl: string | null
  position: PlayerPosition | null
  preferredFoot: PreferredFoot | null
  city: string | null
  experienceCount: number
  visibility: FreeAgentVisibility
  createdAt: string
}

export interface FreeAgentListResponse {
  items: FreeAgentListItem[]
  page: number
  pageSize: number
  total: number
}

export interface TrialInvite {
  id: string
  clubId: string
  freeAgentProfileId: string
  teamId: string
  sentByUserId: string
  message: string | null
  expiresAt: string
  status: TrialInviteStatus
  respondedAt: string | null
  createdAt: string
  club: {
    id: string
    name: string
    badgeUrl: string | null
    primaryColor: string
  }
  team: {
    id: string
    displayName: string
    groupName: string | null
  }
  sender: {
    id: string
    name: string
  }
}
