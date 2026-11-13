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
  PlayerSearchStatus,
  PreferredFoot,
  TrialInitiator,
  TrialInviteStatus,
  WechselReleaseStatus,
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
  absence?: TeamMemberAbsence
  absenceUntil?: string | null
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
  /** Set when a manager cancelled the event. Cancelled events stay in upcoming
   * feeds until their date passes so the squad can see the change. */
  cancelledAt?: string | null
  cancelReason?: string | null
  /** When the date last moved. Replies older than this are asked for again. */
  rescheduledAt?: string | null
  /** Present when the event is one occurrence of a recurring series. */
  seriesId?: string | null
  /** The rule behind seriesId, when the response carries it. */
  series?: { id: string; intervalWeeks: number; until: string; weekdays?: number[] } | null
  /** Treffpunkt time (before kickoff / start). Visible to everyone on the team. */
  meetingAt?: string | null
  /** Treffpunkt place (e.g. "Parkplatz Vereinsheim"). */
  meetingPoint?: string | null
  /** Match opponent ("SV Babelsberg 03"). Title is derived from it on create. */
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  /** Linked fussball.de fixture (live ticker, table, timeline). */
  fixtureId?: string | null
  /** Coach published the Kader; nominated players were notified. */
  squadPublishedAt?: string | null
  /** The Fahrten (carpool) board is open for this event. */
  carpoolEnabled?: boolean
  /** Length in minutes, when the coach set one (Training default 90). */
  durationMin?: number | null
  /** Remind open replies 24 h before the start (design 12). Absent = server default (on). */
  rsvpAutoReminder?: boolean
  /**
   * The title was derived, not typed: render it in the reader's language
   * ("Heimspiel gegen X", "Training") instead of showing `title`, which then
   * only holds a language-neutral fallback (the opponent, "Training").
   */
  autoTitle?: boolean
}

export interface EventSeries {
  id: string
  clubId: string
  teamId: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  intervalWeeks: number
  /** 0 = Sunday … 6 = Saturday. Empty on single-day series made before 2026-09. */
  weekdays?: number[]
  meetingOffsetMin?: number | null
  startsAt: string
  until: string
  location: string | null
  notes: string | null
  createdAt: string
}

export interface EventFeedItem extends Event {
  responseCount: number
  yesCount: number
  maybeCount: number
  noCount: number
  /** Members who checked in on the day; the attendance outcome for past rows. */
  checkInCount?: number
  /** Active players on the team at read time; the denominator for outcomes. */
  squadSize?: number
  myRsvp: RsvpStatus | null
  /** The reader answered before the date moved; treat as needing a reply. */
  myRsvpStale?: boolean
  /** The reader is in the published Kader. */
  myNominated?: boolean
  readiness?: EventReadiness | null
  /** Present when fetched with mine=1 and no teamId — multi-team home view */
  team?: { id: string; name: string } | null
  /** Redesign 08/22: "Ligaspiel · Heim". Absent on older APIs. */
  matchKind?: import('../schemas/home').MatchKind | null
  /** Redesign 08: "Entwurf 4-2-3-1 · 9 von 11" (coaches only). */
  lineupDraft?: import('../schemas/home').LineupDraftSummary | null
  /** Redesign 25: carpool state for away matches. */
  carpoolSummary?: import('../schemas/home').CarpoolSummary | null
}

export type EventReadinessStatus =
  | 'READY'
  | 'WATCH'
  | 'AT_RISK'
  | 'NEEDS_SETUP'

export type EventReadinessSeverity = 'info' | 'warning' | 'critical'

export type EventReadinessSignalKey =
  | 'no_squad'
  | 'low_confirmations'
  | 'low_response_rate'
  | 'pending_replies'
  | 'availability_risks'
  | 'injury_risks'
  | 'check_in_gap'
  | 'no_show_risk'

export interface EventReadinessSignal {
  key: EventReadinessSignalKey
  severity: EventReadinessSeverity
  count?: number
  target?: number
}

export type EventReadinessNudgeReason =
  | 'none'
  | 'pending_replies'
  | 'low_response_rate'
  | 'low_confirmations'
  | 'cooldown'
  | 'event_started'

export type EventReadinessNudgeUrgency = 'low' | 'medium' | 'high'

export interface EventReadinessNudge {
  recommended: boolean
  reason: EventReadinessNudgeReason
  targetCount: number
  urgency: EventReadinessNudgeUrgency
  nextAvailableAt?: string | null
}

export type EventReadinessBriefingKey =
  | 'needs_setup'
  | 'event_closed'
  | 'no_show_review'
  | 'event_started'
  | 'private_availability_review'
  | 'low_confirmations'
  | 'check_in_gap'
  | 'ready_clear'
  | 'ready_pending'
  | 'ready_availability'
  | 'ready_followups'
  | 'pending_nudge'
  | 'pending_monitor'
  | 'availability_review'
  | 'final_count'

export type EventReadinessBriefingParamValue =
  | string
  | number
  | boolean
  | null

export interface EventReadinessBriefing {
  key: EventReadinessBriefingKey
  params?: Record<string, EventReadinessBriefingParamValue>
  fallback: string
}

export interface EventReadiness {
  status: EventReadinessStatus
  score: number
  briefing?: EventReadinessBriefing | null
  metrics: {
    squadSize: number
    responseCount: number
    yesCount: number
    maybeCount: number
    noCount: number
    pendingCount: number
    responseRate: number
    confirmedRate: number
    checkInCount: number
    injuryRiskCount: number
    suspensionRiskCount: number
  }
  signals: EventReadinessSignal[]
  nudge?: EventReadinessNudge | null
}

export type TeamMemberOperationalStatus = 'ACTIVE' | 'NEW_PLAYER' | 'INACTIVE'

/** Kader revamp: availability that is neither injury nor inactivity. */
export type TeamMemberAbsence = 'NONE' | 'SUSPENDED' | 'AWAY'

export type InjuryAvailabilityStatus = 'OUT' | 'DOUBTFUL' | 'DAY_TO_DAY'

export type TeamDutyKind = 'JERSEY_CLEANUP' | 'BIB_CLEANUP' | 'LOCKER_ROOM'

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
  /** roster-ops only: the duty is the viewer's own, or their linked child's (M2). */
  viewerRelation?: 'SELF' | 'CHILD' | null
}

// ── Kader adversarial fixes (team agent, 2026-09-24) ───────────────────────
/**
 * Roster absence as the viewer sees it. UNAVAILABLE is response-only: in a
 * youth team a Sperre is shown to non-managers as a neutral "Nicht verfügbar"
 * (M5). It is never accepted as input.
 */
export type RosterAbsence = TeamMemberAbsence | 'UNAVAILABLE'

/** Why the viewer cannot open a private chat with this member (H2). */
export type RosterMessageBlockReason =
  | 'SELF'
  | 'AGE_UNVERIFIED'
  | 'MINOR_BLOCKED'
  | 'NEEDS_GUARDIAN_LINK'
  | 'BLOCKED'

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
  /** Holiday / suspension. An expired absenceUntil is already reported as NONE. */
  absence: RosterAbsence
  absenceUntil: string | null
  createdAt: string
  loanedFromTeamId: string | null
  loanedFromTeamName: string | null
  /** Active loan from THIS team to another one: where the player is and until when (L5). */
  loanedOutToTeamName?: string | null
  loanedOutUntil?: string | null
  /**
   * Whether the viewer may open a private chat with this member, decided with
   * the same safeguarding rule the DM API enforces. Absent on older APIs.
   */
  canMessage?: boolean
  messageBlockedReason?: RosterMessageBlockReason | null
}

export interface RosterOpsSnapshot {
  team: {
    id: string
    displayName: string
    squadTarget: number
  }
  /**
   * The one squad number: players (role PLAYER), phase FULL, access ACTIVE,
   * operationalStatus not INACTIVE. Coaches, trialists and inactive players
   * are excluded. Event squadSize uses the same definition.
   */
  squadCount: number
  squad: RosterOpsMemberSummary[]
  operations: {
    trials: RosterOpsMemberSummary[]
    newPlayers: RosterOpsMemberSummary[]
    inactive: RosterOpsMemberSummary[]
    pendingCoaches: RosterOpsMemberSummary[]
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
  /** One of RSVP_REASONS; only returned to event managers and the player. */
  reason?: string | null
  note?: string | null
  nominated?: boolean
  updatedAt: string
}

/** A reply in the event detail, with the person it belongs to. */
export interface EventRsvpEntry {
  id: string
  userId: string
  status: RsvpStatus
  reason?: string | null
  note?: string | null
  nominated?: boolean
  updatedAt: string
  user: { id: string; name: string; avatarUrl?: string | null }
}

/** An active player on the event's team (used for "Offen" and the Kader). */
export interface EventSquadMember {
  userId: string
  name: string
  avatarUrl?: string | null
  jerseyNumber?: number | null
  position?: string | null
}

/** A child a parent answers for, as seen on one event. */
export interface EventGuardedChild {
  userId: string
  name: string
  teamName: string | null
  rsvp: RsvpStatus | null
  reason?: string | null
  note?: string | null
  nominated?: boolean
}

/** GET /clubs/:clubId/events/:eventId */
export interface EventDetail extends Event {
  team: { id: string; name: string } | null
  rsvps: EventRsvpEntry[]
  myRsvp: RsvpStatus | null
  myRsvpReason?: string | null
  myRsvpNote?: string | null
  myRsvpStale?: boolean
  myNominated?: boolean
  myCheckInAt?: string | null
  reminderEnabled?: boolean
  lastRsvpReminderAt?: string | null
  teamMemberCount?: number | null
  readiness?: EventReadiness | null
  /** Active players on the team; lets every viewer see who hasn't replied. */
  members: EventSquadMember[]
  /** Children the viewer guards on this team (parents). */
  children: EventGuardedChild[]
  viewer: {
    canManage: boolean
    isPlayer: boolean
    isGuardian: boolean
  }
  /** Saved Aufstellung, when the coach built one. */
  lineup?: EventLineup | null
  carpoolRideCount?: number
}

export interface EventLineupPlayer {
  userId?: string | null
  number?: number | null
  name: string
  position?: string | null
  slotId?: string | null
}

export interface EventLineup {
  formation: string
  starters: EventLineupPlayer[]
  bench: EventLineupPlayer[]
}

/** GET/PUT /clubs/:clubId/events/:eventId/squad */
export interface EventSquad {
  eventId: string
  publishedAt: string | null
  /** Only ids that are still candidates: a reply of Absage or leaving the team drops a nomination. */
  nominatedUserIds: string[]
  candidates: Array<EventSquadMember & { rsvp: RsvpStatus | null; reason?: string | null }>
  /**
   * Players who were in the Kader and dropped out since (answered Absage, or
   * left the team). Shown to the coach until the Kader is saved again.
   */
  dropouts?: Array<{
    userId: string
    name: string
    cause: 'declined' | 'left'
    reason?: string | null
    at: string | null
  }>
}

/** GET /clubs/:clubId/events/:eventId/carpool */
export interface CarpoolRideItem {
  id: string
  eventId: string
  driver: { id: string; name: string; avatarUrl?: string | null }
  seats: number
  departFrom: string | null
  departAt: string | null
  note: string | null
  passengers: Array<{ userId: string; name: string }>
  /** The viewer drives this ride. */
  isMine: boolean
  createdAt: string
}

export interface CarpoolBoard {
  eventId: string
  rides: CarpoolRideItem[]
}

export type MessageType =
  | 'TEXT'
  | 'VOICE'
  | 'IMAGE'
  | 'VIDEO'
  | 'FILE'
  | 'POLL'
  | 'RSVP_POLL'
  | 'LINEUP'
  | 'SYSTEM'

export interface MessageAttachmentMeta {
  /** Voice notes: duration in milliseconds */
  durationMs?: number
  /** Voice notes: pre-computed amplitude peaks for waveform rendering */
  waveform?: number[]
  /** Image/video: pixel dimensions */
  width?: number
  height?: number
  /** File: MIME type and original filename */
  mimeType?: string
  fileName?: string
  /** File: size in bytes (shown on the file card) */
  sizeBytes?: number
  /** Lineup: tied fixture id so the bubble can deep-link to match-detail */
  fixtureId?: string
  /** RSVP poll / lineup card: tied event id */
  eventId?: string
  /** Lineup card: formation ("4-4-2") and named positions */
  formation?: string
  slots?: Array<{ position: string; playerName: string }>
  /** Lineup card in a DM: an event's saved Aufstellung or a drawn formation */
  lineupSource?: 'EVENT' | 'FORMATION'
  /** Lineup card: event title / date / opponent, or the formation card title */
  title?: string | null
  eventDate?: string | null
  opponent?: string | null
}

export interface Message {
  id: string
  teamId: string
  clubId: string
  channelId: string | null
  senderId: string | null
  content: string
  messageType: MessageType
  attachmentUrl: string | null
  attachmentMeta: MessageAttachmentMeta | null
  replyToId: string | null
  isAnnouncement: boolean
  isPinned: boolean
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
}

export interface MessageReaction {
  emoji: string
  userIds: string[]
  count: number
}

export interface ChatMessage extends Message {
  senderName: string | null
  senderAvatar: string | null
  reactions: MessageReaction[]
  /** True when the current user has an entry in MessageReadReceipt for this message */
  readByMe: boolean
  /** Total distinct users (excluding sender) that have read receipts */
  readCount: number
  /** Quoted preview of the message this replies to, if any */
  replyTo: {
    id: string
    senderName: string
    contentPreview: string
    messageType: MessageType
  } | null
}

export type PinnedMessage = ChatMessage

export type ChannelKind =
  | 'TEAM'
  | 'COACHES'
  | 'PARENTS'
  | 'ANNOUNCEMENTS'
  | 'CLUB_NEWS'
  | 'CUSTOM'

export type ChannelVisibility =
  | 'MEMBERS'
  | 'COACHES_ONLY'
  | 'PARENTS_ONLY'
  | 'ADMINS_ONLY'

export interface Channel {
  id: string
  clubId: string
  teamId: string | null
  slug: string
  kind: ChannelKind
  name: string
  description: string | null
  visibility: ChannelVisibility
  /** Set on the API side based on the calling user's role on the team/club */
  canWrite: boolean
  /** Unread message count for the calling user */
  unreadCount: number
  /** Last message preview (or null if channel is empty) */
  lastMessage: {
    id: string
    senderName: string
    contentPreview: string
    messageType: MessageType
    createdAt: string
  } | null
  createdAt: string
  updatedAt: string
}

// ─── Chat inbox (revamp) ────────────────────────────────
export type InboxItemType = 'CHANNEL' | 'DM'

export interface InboxItem {
  type: InboxItemType
  /** channelId or conversationId */
  id: string
  /** Channel's team; null for club-level channels and DMs */
  teamId: string | null
  teamName: string | null
  kind: ChannelKind | 'DM'
  /** Raw channel name or DM peer name; clients localize non-CUSTOM kinds */
  title: string
  avatarUrl: string | null
  otherUserId: string | null
  canWrite: boolean
  muted: boolean
  mutedUntil: string | null
  unreadCount: number
  lastMessage: {
    senderId: string | null
    senderName: string | null
    preview: string
    type: MessageType
    createdAt: string
  } | null
  /** lastMessage.createdAt, else the conversation's creation time */
  activityAt: string
}

/**
 * MINOR_ADULT: adult↔under-16 without a guardian link.
 * MINOR_MINOR: two under-16s (never private; use the team group).
 */
export type ChatContactIneligibleReason = 'MINOR_ADULT' | 'MINOR_MINOR' | 'AGE_UNVERIFIED' | 'BLOCKED'

export interface ChatContact {
  userId: string
  name: string
  avatarUrl: string | null
  role: string
  canMessage: boolean
  reason: ChatContactIneligibleReason | null
}

export interface ChatContactGroup {
  /** null = club staff not listed under one of the caller's teams */
  teamId: string | null
  teamName: string
  contacts: ChatContact[]
}

export interface ChatChannelDetail extends Channel {
  teamName: string | null
  memberCount: number
  muted: boolean
  mutedUntil: string | null
  canManageMembers: boolean
}

export interface ChatConversationDetail {
  id: string
  clubId: string
  otherUser: { id: string; name: string; avatarUrl: string | null } | null
  muted: boolean
  mutedUntil: string | null
  canMessage: boolean
  blockedByMe: boolean
  /** The peer's read watermark (✓✓ on own messages at or before it). */
  peerLastReadAt: string | null
  /** The peer left the club: history stays readable, sending is closed. */
  peerLeftClub: boolean
}

// ─── Direct messages with attachments (chat revamp) ─────
export interface DirectMessageItem {
  id: string
  conversationId: string
  senderId: string
  content: string
  messageType: MessageType
  attachmentUrl: string | null
  attachmentMeta: MessageAttachmentMeta | null
  replyToId: string | null
  replyTo: {
    id: string
    senderName: string | null
    contentPreview: string
    messageType: MessageType
  } | null
  sourceLanguage: string | null
  translation: { content: string; sourceLanguage: string } | null
  deletedAt: string | null
  createdAt: string
  sender: { id: string; name: string; avatarUrl: string | null } | null
  reactions: MessageReaction[]
}

/** GET /clubs/:clubId/conversations/:id/messages */
export interface DirectMessagePage {
  messages: DirectMessageItem[]
  hasMore: boolean
  peerLastReadAt: string | null
}

export type ChatMediaTab = 'media' | 'files' | 'links'

/** Info screen media grid (channel or DM). */
export interface ChatMediaItem {
  id: string
  messageType: MessageType
  attachmentUrl: string | null
  attachmentMeta: MessageAttachmentMeta | null
  /** For links: the extracted URL; otherwise the caption. */
  content: string
  url: string | null
  senderName: string | null
  createdAt: string
}

/** An event with a saved Aufstellung the caller may share into a DM. */
export interface DmLineupOption {
  eventId: string
  title: string
  date: string
  opponent: string | null
  teamName: string
  formation: string
  starterCount: number
}

export interface ChatChannelMember {
  userId: string
  name: string
  email: string | null
  avatarUrl: string | null
  role: string
  isMember: boolean
}

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

// ── home revamp: GET /me/children-overview?clubId= (parent home) ──
/** A guardian-linked child and every team they are active on in the club. */
export interface ChildOverviewChild {
  userId: string | null
  name: string
  teams: Array<{ id: string; name: string; displayName: string }>
  /** Redesign 25: photo consent for team pictures; absent on older APIs. */
  photoConsent?: import('../schemas/home').PhotoConsentStatus | null
}

/** A pending team duty for the parent or one of their children. */
export interface ChildOverviewDuty extends TeamDutyAssignment {
  teamName: string
  /** The child the duty belongs to; null when it is the parent's own. */
  childUserId: string | null
}

/** Latest post from the children's team or club ANNOUNCEMENTS channels. */
export interface ChildOverviewAnnouncement {
  id: string
  title: string
  body: string
  createdAt: string
  teamId: string | null
  teamName: string | null
}

export interface ChildrenOverview {
  children: ChildOverviewChild[]
  duties: ChildOverviewDuty[]
  announcements: ChildOverviewAnnouncement[]
}
// ── end home revamp ──

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

export type FreeAgentMediaType = 'PHOTO' | 'VIDEO'

export interface FreeAgentMediaEntry {
  id: string
  type: FreeAgentMediaType
  url: string
  thumbnailUrl: string | null
  sortOrder: number
  createdAt: string
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
  /**
   * Wechselbörse search fields (2026-09). postalCode is returned to the
   * owner only; everyone else gets postalRegion (the first two digits).
   */
  postalCode: string | null
  postalRegion: string | null
  searchRadiusKm: number | null
  highestLeague: string | null
  currentClubName: string | null
  availableFrom: string | null
  /** Derived from the user's date of birth; null when unknown or a minor. */
  age: number | null
  /** 16–17: shown as "U18", no exact age, no media, CLUB_ONLY. */
  isMinor: boolean
  experience: FreeAgentExperienceEntry[]
  media: FreeAgentMediaEntry[]
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
  /** Always null in listings; see postalRegion. */
  postalCode: string | null
  postalRegion: string | null
  highestLeague: string | null
  currentClubName: string | null
  availableFrom: string | null
  /** Null when unknown or a minor (then isMinor is true: show "U18"). */
  age: number | null
  isMinor: boolean
  createdAt: string
  /**
   * Redesign 22 ("zuletzt Kreisliga B · 3 km"): straight-line distance from the
   * searching club's ground, rounded to whole km. Absent on older APIs.
   */
  distanceKm?: number | null
}

export interface FreeAgentListResponse {
  items: FreeAgentListItem[]
  page: number
  pageSize: number
  total: number
}

export interface TrialSession {
  id: string
  title: string
  date: string
  location: string | null
  cancelledAt: string | null
}

export interface TrialJoinRequestSummary {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
  revision: number
  createdAt: string
  previousClubName: string | null
  releaseStatus: WechselReleaseStatus | null
  passApplicationAt: string | null
  eligibleFrom: string | null
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
  initiatedBy: TrialInitiator
  playerSearchId: string | null
  sessionEventIds: string[]
  /** Upcoming and past sessions the invite covers, in date order. */
  sessions: TrialSession[]
  /** Club-internal. Only present on club-side reads. */
  feedback?: string | null
  rating?: number | null
  attended?: boolean | null
  /** Message shown to the player with an offer or a rejection. */
  decisionMessage: string | null
  decidedAt: string | null
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
    leagueName?: string | null
  }
  /** Null when the staff member who opened the thread deleted their account. */
  sender: {
    id: string
    name: string
  } | null
  player: {
    profileId: string
    userId: string
    name: string
    avatarUrl: string | null
    position: PlayerPosition | null
    preferredFoot: PreferredFoot | null
    highestLeague: string | null
    /** Null when unknown or a minor (then isMinor is true: show "U18"). */
    age: number | null
    isMinor: boolean
  }
  joinRequest: TrialJoinRequestSummary | null
}

export interface PlayerSearch {
  id: string
  clubId: string
  teamId: string
  positions: PlayerPosition[]
  note: string | null
  status: PlayerSearchStatus
  expiresAt: string | null
  createdAt: string
  club: {
    id: string
    name: string
    badgeUrl: string | null
    primaryColor: string
    city: string | null
  }
  team: {
    id: string
    displayName: string
    leagueName: string | null
    ageGroup: string | null
  }
  /** Club-side only: open requests + invites linked to this Gesuch. */
  openTrialCount?: number
  /** Player-side only: the caller's own open trial for this Gesuch, if any. */
  myTrialInviteId?: string | null
}

export interface PlayerSearchListResponse {
  items: PlayerSearch[]
  page: number
  pageSize: number
  total: number
}
