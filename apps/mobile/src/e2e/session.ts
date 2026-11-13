import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  buildClubPermissionMap,
  ClubCapability,
  createInviteSchema,
  ExternalTeamLinkStatus,
  FreeAgentVisibility,
  InviteKind,
  InviteStatus,
  MembershipRole,
  PlayerPosition,
  PreferredFoot,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  type CarpoolBoard,
  type CarpoolRideItem,
  type ClubAggregateStats,
  type CrossTeamEventItem,
  type EventDetail,
  type EventFeedItem,
  type EventGuardedChild,
  type EventLineup,
  type EventRsvpEntry,
  type EventSquad,
  type EventSquadMember,
  type ExternalTeamLink,
  type FreeAgentProfile,
  type ImportedFixture,
  type RosterOpsSnapshot,
} from '@anstoss/shared'
// ── chat revamp: inbox, conversations, members, contacts, polls ──
import { handleInboxLiveMock, resetInboxLiveMocks } from './inboxLiveMocks'
import { handleE2EChatRequest } from './chatMocks'
// ── club-admin revamp: consistent club-admin world + missing shared mocks ──
import {
  createClubAdminContributionMembers,
  handleClubAdminWorldRequest,
  resetClubAdminWorld,
  type ClubAdminWorldSession,
} from './clubAdminWorld'
// ── end club-admin revamp ──

// Wechselbörse revamp: Gesuche, Spielersuche, Probetraining, Aufnahmeantrag mocks
import { handleWechselMock } from './wechselMocks'

export const E2E_SESSION_KEY = 'anstoss:e2e:session'
const STRICT_E2E_MOCKS = process.env.EXPO_PUBLIC_E2E_MOCK_STRICT === '1'

export type E2EScenarioName =
  | 'signed-out'
  | 'player'
  | 'parent'
  | 'coach'
  | 'club-admin'
  | 'free-agent'
  | 'signup-player'
  | 'signup-parent'
  | 'signup-coach'
  | 'signup-club-admin'
  | 'signup-free-agent'

type E2EAuthUser = {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  registrationRole: RegistrationRole
  dateOfBirth?: string
  /** onboarding revamp: 16+ self-declaration (coach/parent/admin). */
  adultConfirmedAt?: string
}

type E2EAuthMembership = {
  id: string
  role: MembershipRole
  operationalRoles: string[]
  permissions: Record<ClubCapability, boolean>
  club: {
    id: string
    name: string
    slug: string
    badgeUrl: string | null
    primaryColor: string
  }
}

type E2EAuthTeamMember = {
  id: string
  role: TeamRole
  phase: TeamAccessPhase
  status: TeamAccessStatus
  loanedFromTeamId: string | null
  loanStartDate: string | null
  loanEndDate: string | null
  team: {
    id: string
    name: string
    displayName: string
    clubId: string
    ageGroup: string | null
  }
}

// ─── Events revamp (2026-09): per-event replies, Kader, Aufstellung, Fahrten ──
// Lazily initialised (see ensureEventFlow) so persisted sessions from older
// builds pick it up without a migration.
type E2EEventReply = {
  userId: string
  status: 'YES' | 'MAYBE' | 'NO'
  reason: string | null
  note: string | null
  nominated: boolean
  updatedAt: string
}

type E2EEventRide = {
  id: string
  driverId: string
  driverName: string
  seats: number
  departFrom: string | null
  departAt: string | null
  note: string | null
  passengers: Array<{ userId: string; name: string }>
  createdAt: string
}

type E2EEventFlowState = {
  replies: Record<string, E2EEventReply[]>
  squadPublishedAt: Record<string, string | null>
  lineups: Record<string, EventLineup | null>
  rides: Record<string, E2EEventRide[]>
}
// ─── /Events revamp ──────────────────────────────────────────────────────────

type E2EApiState = {
  events: EventFeedItem[]
  /** Events revamp mock state; created on first use. */
  eventFlow?: E2EEventFlowState
  parentEvents: CrossTeamEventItem[]
  conversations: E2EConversationItem[]
  fixtures: ImportedFixture[]
  linkedTeams: ExternalTeamLink[]
  clubStats: ClubAggregateStats | null
  rosterOps: RosterOpsSnapshot | null
  joinRequests: Array<{
    id: string
    role: string
    message: string | null
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
    revision: number
    createdAt: string
    user: { id: string; name: string; email: string; dateOfBirth?: string | null }
    // club-admin review fixes: Aufnahmeantrag fields when the request came from a trial
    trialInviteId?: string | null
    trialInvite?: { id: string; team: { id: string; displayName: string } | null } | null
    street?: string | null
    postalCode?: string | null
    city?: string | null
    phone?: string | null
    nationality?: string | null
    previousClubName?: string | null
    lastMatchDate?: string | null
    sepaConsentAt?: string | null
    parentalConsentAt?: string | null
    releaseStatus?: 'PENDING' | 'GRANTED' | 'REFUSED' | 'NOT_NEEDED' | null
    passApplicationAt?: string | null
    eligibleFrom?: string | null
  }>
  freeAgentProfile: FreeAgentProfile | null
  myContributions: {
    items: Array<{
      planId: string
      planName: string
      amount: number
      currency: string
      cadence: 'MONTHLY' | 'YEARLY'
      dueDate: string
      status: 'PENDING' | 'PAID' | 'PARTIAL' | 'WAIVED' | 'EXEMPT' | 'OVERDUE'
      paidAmount: number | null
      paidAt: string | null
    }>
    hasContributions: boolean
    bankTransfer: {
      accountHolder: string
      iban: string
      reference: string | null
    } | null
    /** 2026-11 redesign home contract (schemas/home.ts). */
    history?: ContributionHistoryEntry[]
  }
  voiceMemos: Array<{
    id: string
    fromUserId: string
    fromUserName: string
    toUserId: string
    toUserName: string
    /** Mocked URL — points to a tiny placeholder mp3 in the demo. */
    audioUrl: string
    durationSec: number
    /** Pre-computed waveform peaks (0..1). */
    peaks: number[]
    title: string | null
    tags: Array<'tactical' | 'praise' | 'fix' | 'set-piece'>
    listened: boolean
    fixtureId: string | null
    createdAt: string
  }>
  streaks: {
    me: {
      attendanceWeeks: number
      attendanceLongest: number
      motmWeeks: number
      motmLongest: number
      lastActivityAt: string
    }
    leaderboard: Array<{
      userId: string
      name: string
      attendanceWeeks: number
      motmWeeks: number
    }>
  }
  compliance: Array<{
    id: string
    memberUserId: string
    memberName: string
    role: 'PLAYER' | 'COACH' | 'PARENT' | 'ADMIN'
    kind:
      | 'SPIELERPASS'
      | 'FUEHRUNGSZEUGNIS'
      | 'MEDICAL_CHECK'
      | 'VACCINATION_TETANUS'
      | 'FIRST_AID_CERT'
    expiresAt: string
    /** ISO date when the doc was issued / last renewed. */
    issuedAt: string | null
    /** Optional file/scan URL — null if missing entirely. */
    documentUrl: string | null
    note: string | null
  }>
  pendingDuesPauses: Array<{
    id: string
    memberUserId: string
    memberName: string
    reason: string
    createdAt: string
    weeks: number
    status: 'PENDING' | 'APPROVED' | 'SNOOZED'
  }>
  liveMatches: Record<
    string,
    {
      status: 'scheduled' | 'live' | 'final'
      minute: number
      scoreHome: number
      scoreAway: number
      events: Array<{
        id: string
        minute: number
        kind: 'goal' | 'sub' | 'yellow' | 'red' | 'pen' | 'own_goal'
        player: string
        detail?: string
        side: 'home' | 'away'
      }>
      lastTickedAt: number
    }
  >
  motm: Record<
    string,
    {
      fixtureId: string
      totalVotes: number
      results: Array<{ userId: string; name: string; votes: number; pct: number }>
      myVoteUserId: string | null
      closesAt: string | null
    }
  >
  photos: Record<
    string,
    Array<{
      id: string
      uploaderId: string
      uploaderName: string
      uploadedAt: string
      imageUrl: string
      caption?: string | null
      votes: number
      myVoted: boolean
    }>
  >
  childrenAgenda: {
    kids: Array<{ userId: string; name: string; teamName: string }>
    events: Array<{
      id: string
      kidId: string
      title: string
      date: string
      durationMin?: number
      location?: string | null
      rsvp: 'YES' | 'MAYBE' | 'NO' | 'PENDING'
    }>
  }
  squadStats: Array<{
    userId: string
    name: string
    jerseyNumber: number | null
    position: 'GK' | 'DEF' | 'MID' | 'ATT'
    attendance: number
    minutesShare: number
    unavailable: boolean
  }>
  channelMembership: Record<
    string,
    Array<{
      userId: string
      name: string
      email: string | null
      avatarUrl: string | null
      role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
      isMember: boolean
    }>
  >
  adminContributions: {
    settings: {
      clubId: string
      enabled: boolean
      autoRemindersEnabled: boolean
      defaultCurrency: string
      bankAccountHolder: string | null
      bankIban: string | null
      bankReference: string | null
    }
    summary: {
      assignedMembers: number
      paidMembers: number
      overdueMembers: number
      outstandingMembers: number
      expectedAmount: number
      collectedAmount: number
    }
    plans: Array<{
      id: string
      clubId: string
      name: string
      description: string | null
      amount: number
      currency: string
      cadence: 'MONTHLY' | 'YEARLY'
      targetRole: 'PLAYER' | 'PARENT' | 'COACH' | 'ADMIN' | 'CUSTOM'
      dueDay: number
      dueMonth: number | null
      graceDays: number
      reminderPolicy: { daysBefore: number[]; daysAfter: number[] }
      active: boolean
      assignedMemberCount: number
      createdAt: string
      updatedAt: string
    }>
    members: Array<{
      memberUserId: string
      name: string
      email: string | null
      avatarUrl: string | null
      role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
      planId: string | null
      planName: string | null
      cadence: 'MONTHLY' | 'YEARLY' | null
      amount: number | null
      currency: string | null
      dueDate: string | null
      status: 'PENDING' | 'PAID' | 'PARTIAL' | 'WAIVED' | 'EXEMPT' | 'OVERDUE' | null
      paidAmount: number | null
      paidAt: string | null
      note: string | null
      lastReminderSentAt: string | null
    }>
  }
}

export type E2ESessionSnapshot = {
  scenario: Exclude<E2EScenarioName, 'signed-out'>
  user: E2EAuthUser
  memberships: E2EAuthMembership[]
  teamMembers: E2EAuthTeamMember[]
  ageGate: {
    isUnder16: boolean
    status: 'CLEARED' | 'PENDING_PARENT_APPROVAL' | 'BLOCKED' | 'DOB_REQUIRED'
    guardianEmail: string | null
  } | null
  needsOnboarding: boolean
  api: E2EApiState
}

type E2EConversationItem = {
  id: string
  otherUser: { id: string; name: string; avatarUrl: string | null } | null
  lastMessage: { content: string; senderId: string; createdAt: string } | null
  unreadCount: number
  updatedAt: string
}

export type E2EApiResponse =
  | {
      handled: false
    }
  | {
      handled: true
      ok: boolean
      status: number
      body?: unknown
      code?: string
      message?: string
    }

const CLUB_ID = 'club-e2e-sv-albatros'
const TEAM_ID = 'team-e2e-senior-1'

// Mutable in-memory team structure for the Team Management e2e flow, so
// create-group / add-team / assign-coaches actually persist within a session
// (the real app hits the live API; the demo build had no mock for these).
type E2ECoach = { userId: string; name: string; avatarUrl: string | null }
type E2ETeamRow = {
  id: string
  displayName: string
  squadLabel: string | null
  leagueName: string | null
  memberCount: number
  coachAssignments: { headCoach: E2ECoach | null; assistants: E2ECoach[] }
}
type E2ETeamGroupRow = {
  id: string
  displayName: string
  type: string
  teams: E2ETeamRow[]
}
let e2eTeamGroups: E2ETeamGroupRow[] = []

// Team-groups are seeded per scenario. This MUST run on hydrate too (not just
// on activation) — otherwise after an app reload the module-level array resets
// to [] and screens reading /team-groups (e.g. create-event) wrongly show
// "No squad available" even though the squad exists in the persisted snapshot.
function seedTeamGroupsFor(
  name: E2EScenarioName | E2ESessionSnapshot['scenario'] | undefined,
): E2ETeamGroupRow[] {
  if (name !== 'club-admin' && name !== 'coach') return []
  return [
    {
      id: 'group-e2e-senior',
      displayName: 'Senior',
      type: 'COMPETITIVE',
      teams: [
        {
          id: TEAM_ID,
          displayName: TEAM_DISPLAY_NAME,
          squadLabel: '1. Mannschaft',
          leagueName: null,
          memberCount: 22,
          coachAssignments: { headCoach: null, assistants: [] },
        },
      ],
    },
  ]
}
// Superset member shape so the single GET /clubs/:id/members mock satisfies
// every caller: team-management staff chips (id/userId/role/user.name),
// my-team (top-level name), dm-new (user.email), invite/roster/loans.
function e2eMember(id: string, name: string, role: 'ADMIN' | 'COACH' | 'PLAYER') {
  const userId = `user-${id}`
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@sv-albatros.example`
  return {
    id: `mem-${id}`,
    userId,
    role,
    name,
    user: { id: userId, name, email, avatarUrl: null },
  }
}
const E2E_STAFF = [
  e2eMember('e2e-admin', 'Lukas Weber', 'ADMIN'),
  e2eMember('e2e-coach', 'Mara Schulz', 'COACH'),
  e2eMember('e2e-p1', 'Jonas Krüger', 'PLAYER'),
  e2eMember('e2e-p2', 'Felix Bauer', 'PLAYER'),
  e2eMember('e2e-p3', 'Noah Schmidt', 'PLAYER'),
]
let e2eRemovedMemberUserIds = new Set<string>()
function e2eResolveCoach(userId: string | null | undefined): E2ECoach | null {
  if (!userId) return null
  const m = E2E_STAFF.find((s) => s.userId === userId)
  return m
    ? { userId: m.userId, name: m.user.name, avatarUrl: null }
    : { userId, name: 'Coach', avatarUrl: null }
}
const TEAM_DISPLAY_NAME = 'Senior Team'
const CLUB_PRIMARY = '#1B4F9C'

let currentSession: E2ESessionSnapshot | null = null
// Pending club claim created by the club-admin onboarding wizard.
let e2eClaim: {
  id: string
  status: 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'
  reviewNote: string | null
  expiresAt: string
  escalatesAt: string | null
  directoryEntry: { name: string; city: string | null; badgeUrl: string | null }
  /** onboarding revamp: coach requests are STAFF_CLAIMs on an active club. */
  kind?: 'FIRST_CLAIM' | 'STAFF_CLAIM'
  club?: { id: string; name: string; badgeUrl: string | null } | null
} | null = null
const listeners = new Set<(session: E2ESessionSnapshot | null) => void>()
let e2eInviteCounter = 0

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowIso(offsetDays = 0, hour = 18, minute = 0) {
  const value = new Date()
  value.setDate(value.getDate() + offsetDays)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

/** Next occurrence (at least tomorrow) of a weekday (0 = Sun … 6 = Sat), plus whole weeks. */
function nextWeekdayIso(weekday: number, hour: number, minute = 0, weeksAhead = 0) {
  const value = new Date()
  const delta = ((weekday - value.getDay() + 7) % 7) || 7
  value.setDate(value.getDate() + delta + weeksAhead * 7)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

function minutesBefore(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() - minutes * 60000).toISOString()
}

/** Logistics defaults every feed item carries (events revamp contract). */
const EVENT_LOGISTICS_DEFAULTS = {
  meetingAt: null,
  meetingPoint: null,
  opponent: null,
  homeAway: null,
  fixtureId: null,
  squadPublishedAt: null,
  carpoolEnabled: false,
  durationMin: null,
  myNominated: false,
} satisfies Partial<EventFeedItem>

const E2E_TRAINING_SERIES_ID = 'series-e2e-training'

function slugifyClubName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'club'
}

function createE2EInviteCode() {
  e2eInviteCounter += 1
  return `E2E${e2eInviteCounter.toString(36).toUpperCase().padStart(5, '0').slice(-5)}`
}

function buildE2EInviteLink(clubSlug: string, code: string) {
  return `https://anstoss.io/join/${encodeURIComponent(clubSlug)}/${encodeURIComponent(code)}`
}

function createClub(overrides: Partial<E2EAuthMembership['club']> = {}) {
  return {
    id: CLUB_ID,
    name: 'SV Albatros',
    slug: 'sv-albatros',
    badgeUrl: null,
    primaryColor: CLUB_PRIMARY,
    ...overrides,
  }
}

function createMembership(
  role: MembershipRole,
  club: E2EAuthMembership['club'] = createClub(),
): E2EAuthMembership {
  return {
    id: `membership-${role.toLowerCase()}`,
    role,
    operationalRoles: [],
    permissions: buildClubPermissionMap({
      membershipRole: role,
    }),
    club,
  }
}

function createTeamMember(
  role: TeamRole,
  team: Partial<E2EAuthTeamMember['team']> = {},
): E2EAuthTeamMember {
  return {
    id: `team-access-${role.toLowerCase()}`,
    role,
    phase: TeamAccessPhase.FULL,
    status: TeamAccessStatus.ACTIVE,
    loanedFromTeamId: null,
    loanStartDate: null,
    loanEndDate: null,
    team: {
      id: TEAM_ID,
      name: TEAM_DISPLAY_NAME,
      displayName: TEAM_DISPLAY_NAME,
      clubId: CLUB_ID,
      ageGroup: 'Senior',
      ...team,
    },
  }
}

function createEvents(): EventFeedItem[] {
  const homeKickoff = nowIso(3, 14, 0)
  const awayKickoff = nextWeekdayIso(0, 15, 0)
  const trainingSeries = {
    id: E2E_TRAINING_SERIES_ID,
    intervalWeeks: 1,
    until: nextWeekdayIso(2, 23, 0, 20),
    weekdays: [2, 4],
  }
  const trainingBase = {
    teamId: TEAM_ID,
    clubId: CLUB_ID,
    type: 'TRAINING' as const,
    location: 'Sportplatz Am Wald',
    notes: null,
    createdById: 'coach-1',
    archivedAt: null,
    ...EVENT_LOGISTICS_DEFAULTS,
    durationMin: 90,
    seriesId: E2E_TRAINING_SERIES_ID,
    series: trainingSeries,
  }
  return [
    // ─── Upcoming ─────────────────────────────────────────────
    // Home match with a published Kader (the player persona is nominated).
    // Title and id are load-bearing for Maestro flows + chat seed.
    {
      id: 'event-match-next',
      teamId: TEAM_ID,
      clubId: CLUB_ID,
      title: 'vs. SV Babelsberg 03',
      type: 'MATCH',
      date: homeKickoff,
      location: 'Albatros Hauptplatz, Am Wald 1',
      notes: null,
      createdById: 'coach-1',
      createdAt: nowIso(-4, 9, 0),
      archivedAt: null,
      responseCount: 17,
      yesCount: 13,
      maybeCount: 1,
      noCount: 3,
      myRsvp: 'YES',
      ...EVENT_LOGISTICS_DEFAULTS,
      opponent: 'SV Babelsberg 03',
      homeAway: 'HOME',
      meetingAt: minutesBefore(homeKickoff, 30),
      meetingPoint: 'Kabine 2',
      fixtureId: 'fixture-1',
      squadPublishedAt: nowIso(-1, 20, 0),
      durationMin: 105,
      // 2026-11 redesign home contract (schemas/home.ts)
      matchKind: 'LEAGUE',
      lineupDraft: { formation: '4-3-3', filled: 11, slots: 11, published: true },
    },
    // Away match with the Fahrten board open.
    {
      id: 'event-match-away',
      teamId: TEAM_ID,
      clubId: CLUB_ID,
      title: '@ FC Stahl Brandenburg',
      type: 'MATCH',
      date: awayKickoff,
      location: 'Stadion am Quenz, Brandenburg an der Havel',
      notes: 'Schwarze Auswärtstrikots mitbringen.',
      createdById: 'coach-1',
      createdAt: nowIso(-3, 9, 0),
      archivedAt: null,
      responseCount: 11,
      yesCount: 8,
      maybeCount: 2,
      noCount: 1,
      myRsvp: null,
      ...EVENT_LOGISTICS_DEFAULTS,
      opponent: 'FC Stahl Brandenburg',
      homeAway: 'AWAY',
      meetingAt: minutesBefore(awayKickoff, 60),
      meetingPoint: 'Parkplatz Vereinsheim',
      carpoolEnabled: true,
      durationMin: 105,
      // 2026-11 redesign home contract (schemas/home.ts)
      matchKind: 'LEAGUE',
      lineupDraft: { formation: '4-2-3-1', filled: 9, slots: 11 },
      carpoolSummary: { seeking: 2, seatsFree: 1, myRideSeats: null },
    },
    // Training series Di + Do 19:00. "Tuesday session" is referenced by
    // Maestro flows, so the first occurrence keeps that title.
    {
      ...trainingBase,
      id: 'event-training-later',
      title: 'Tuesday session',
      date: nextWeekdayIso(2, 19, 0),
      createdAt: nowIso(-2, 11, 0),
      responseCount: 16,
      yesCount: 12,
      maybeCount: 2,
      noCount: 2,
      myRsvp: 'MAYBE',
      // Answered before the coach moved it: home and schedule ask again.
      rescheduledAt: nowIso(0, 9, 0),
      myRsvpStale: true,
    },
    {
      ...trainingBase,
      id: 'event-training-thu',
      title: 'Training',
      date: nextWeekdayIso(4, 19, 0),
      createdAt: nowIso(-2, 11, 0),
      responseCount: 9,
      yesCount: 7,
      maybeCount: 1,
      noCount: 1,
      myRsvp: null,
    },
    {
      ...trainingBase,
      id: 'event-training-tue-2',
      title: 'Training',
      date: nextWeekdayIso(2, 19, 0, 1),
      createdAt: nowIso(-2, 11, 0),
      responseCount: 3,
      yesCount: 3,
      maybeCount: 0,
      noCount: 0,
      myRsvp: null,
    },
    // ─── Past (within the 3-day window) ──────────────────────
    {
      id: 'event-training-yesterday',
      teamId: TEAM_ID,
      clubId: CLUB_ID,
      title: 'Monday training',
      type: 'TRAINING',
      date: nowIso(-1, 19, 0),
      location: 'Pitch 1',
      notes: null,
      createdById: 'coach-1',
      createdAt: nowIso(-5, 9, 0),
      archivedAt: null,
      responseCount: 15,
      yesCount: 11,
      checkInCount: 9,
      squadSize: 18,
      maybeCount: 2,
      noCount: 2,
      myRsvp: 'YES',
      ...EVENT_LOGISTICS_DEFAULTS,
      durationMin: 90,
    },
    {
      id: 'event-match-past',
      teamId: TEAM_ID,
      clubId: CLUB_ID,
      title: 'vs. FC Energie Cottbus II',
      type: 'MATCH',
      date: nowIso(-2, 14, 0),
      location: 'Albatros Hauptplatz',
      notes: null,
      createdById: 'coach-1',
      createdAt: nowIso(-9, 9, 0),
      archivedAt: null,
      responseCount: 18,
      yesCount: 15,
      checkInCount: 13,
      squadSize: 18,
      maybeCount: 2,
      noCount: 1,
      myRsvp: 'YES',
      ...EVENT_LOGISTICS_DEFAULTS,
      opponent: 'FC Energie Cottbus II',
      homeAway: 'HOME',
      meetingAt: nowIso(-2, 13, 30),
    },
    // ─── Older trainings (outside the 3-day window) ──────────
    // Only reachable with type=TRAINING&scope=past: the Kader attendance
    // bars and the member profile's "Training · letzte 8" read these.
    ...[4, 6, 8, 11, 13, 15, 18].map((daysAgo, index) => ({
      id: `event-training-past-${daysAgo}`,
      teamId: TEAM_ID,
      clubId: CLUB_ID,
      title: 'Training',
      type: 'TRAINING' as const,
      date: nowIso(-daysAgo, 19, 0),
      location: 'Sportplatz Am Wald',
      notes: null,
      createdById: 'coach-1',
      createdAt: nowIso(-daysAgo - 5, 9, 0),
      archivedAt: null,
      responseCount: 16,
      yesCount: [14, 12, 15, 13, 14, 11, 15][index],
      checkInCount: 12,
      squadSize: 18,
      maybeCount: 0,
      noCount: 2,
      myRsvp: 'YES' as const,
      ...EVENT_LOGISTICS_DEFAULTS,
      durationMin: 90,
    })),
  ]
}

/** Parent persona children (both on the senior mock team). */
const E2E_PARENT_KIDS = [
  { userId: 'child-1', name: 'Leo Becker' },
  { userId: 'child-2', name: 'Mia Becker' },
] as const

// ── privacy: guardian consent withdrawal (app/child-consent.tsx) ──
type E2EGuardianConsent = {
  id: string
  status: 'APPROVED' | 'PENDING' | 'WITHDRAWN'
  requestedAt: string
  approvedAt: string | null
  withdrawnAt: string | null
  club: { id: string; name: string; badgeUrl: string | null }
  team: { id: string; displayName: string }
  player: { id: string; name: string; avatarUrl: string | null }
}
const e2eGuardianConsents = new WeakMap<object, E2EGuardianConsent[]>()

function guardianConsentsFor(session: object): E2EGuardianConsent[] {
  let rows = e2eGuardianConsents.get(session)
  if (!rows) {
    const club = { id: CLUB_ID, name: 'SV Albatros', badgeUrl: null }
    const team = { id: TEAM_ID, displayName: 'U15 I' }
    rows = E2E_PARENT_KIDS.map((kid, index) => ({
      id: `consent-e2e-${kid.userId}`,
      status: 'APPROVED' as const,
      requestedAt: nowIso(-60 - index * 7, 18, 0),
      approvedAt: nowIso(-59 - index * 7, 19, 30),
      withdrawnAt: null,
      club,
      team,
      player: { id: kid.userId, name: kid.name, avatarUrl: null },
    }))
    e2eGuardianConsents.set(session, rows)
  }
  return rows
}

function handleGuardianConsentRequest(
  session: E2ESessionSnapshot,
  method: string,
  pathname: string,
): E2EApiResponse | null {
  if (method === 'GET' && pathname === '/consent/mine') {
    const rows = session.scenario === 'parent' ? guardianConsentsFor(session) : []
    return { handled: true, ok: true, status: 200, body: clone(rows) }
  }
  const withdraw = pathname.match(/^\/consent\/([^/]+)\/withdraw$/)
  if (method === 'POST' && withdraw) {
    const row = session.scenario === 'parent'
      ? guardianConsentsFor(session).find((c) => c.id === withdraw[1])
      : undefined
    if (!row) return { handled: true, ok: false, status: 404, body: { message: 'Consent record not found' } }
    if (row.status !== 'WITHDRAWN') {
      row.status = 'WITHDRAWN'
      row.withdrawnAt = new Date().toISOString()
    }
    return { handled: true, ok: true, status: 200, body: clone(row) }
  }
  return null
}
// ── end privacy ──

function createParentEvents(): CrossTeamEventItem[] {
  const events = createEvents()
  const byId = (id: string) => events.find((event) => event.id === id)!
  // ── home revamp: Leo plays U15, Mia plays U11, so the parent home shows
  // one card per child with that child's own team ("Leo · U15", "Mia · U11").
  const KID_TEAM: Record<string, { teamName: string; teamDisplayName: string }> = {
    [E2E_PARENT_KIDS[0].userId]: { teamName: 'U15', teamDisplayName: 'U15 I' },
    [E2E_PARENT_KIDS[1].userId]: { teamName: 'U11', teamDisplayName: 'U11 I' },
  }
  const row = (
    event: EventFeedItem,
    kid: (typeof E2E_PARENT_KIDS)[number],
    childRsvp: CrossTeamEventItem['childRsvp'] = null,
  ): CrossTeamEventItem => ({
    ...event,
    myRsvp: null,
    ...KID_TEAM[kid.userId],
    childUserId: kid.userId,
    childName: kid.name,
    childRsvp,
  })
  const u11 = (id: string, overrides: Partial<EventFeedItem>): EventFeedItem => ({
    ...byId('event-training-thu'),
    id,
    teamId: 'team-u11',
    seriesId: null,
    series: null,
    location: 'Albatros Platz 2',
    yesCount: 9,
    maybeCount: 1,
    noCount: 0,
    responseCount: 10,
    ...overrides,
  })
  // ── end home revamp ──
  return [
    row(byId('event-match-next'), E2E_PARENT_KIDS[0]),
    row(
      u11('event-u11-training', {
        title: 'Training',
        date: nextWeekdayIso(4, 17, 0),
        durationMin: 75,
      }),
      E2E_PARENT_KIDS[1],
    ),
    row(
      u11('event-u11-match', {
        title: 'vs. FC Stern Marienfelde',
        type: 'MATCH',
        date: nextWeekdayIso(6, 10, 0),
        opponent: 'FC Stern Marienfelde',
        homeAway: 'HOME',
        meetingAt: minutesBefore(nextWeekdayIso(6, 10, 0), 45),
        meetingPoint: 'Kabine 3',
        durationMin: 60,
      }),
      E2E_PARENT_KIDS[1],
      'YES',
    ),
    row(byId('event-match-away'), E2E_PARENT_KIDS[0]),
    {
      ...row(byId('event-training-later'), E2E_PARENT_KIDS[0]),
      id: 'event-parent-second',
      title: 'Saturday away match',
      type: 'MATCH',
      date: nowIso(7, 11, 0),
      seriesId: null,
      series: null,
      durationMin: 90,
      opponent: 'SV Grün-Weiß Brieselang',
      homeAway: 'AWAY',
      meetingAt: nowIso(7, 10, 0),
      meetingPoint: 'Parkplatz Vereinsheim',
      carpoolEnabled: true,
      location: 'Sportplatz Brieselang',
    },
  ]
}

function createFixtures(): ImportedFixture[] {
  return [
    {
      id: 'fixture-1',
      clubId: CLUB_ID,
      teamId: TEAM_ID,
      teamLinkId: 'link-1',
      provider: 'api_fussball',
      externalMatchId: 'match-42',
      competition: 'League match',
      season: '2025/26',
      kickoffAt: nowIso(0, 14, 0),
      status: 'live',
      homeTeam: 'SV Albatros',
      awayTeam: 'SV Babelsberg 03',
      homeLogo: null,
      awayLogo: null,
      venueName: 'Karl-Liebknecht-Stadion',
      pitchAddress: 'Karl-Liebknecht-Stadion',
      resultHome: 2,
      resultAway: 1,
      tableSnapshot: null,
      sourceConfidence: 'official_partner',
      rawPayload: {},
      lastSeenAt: nowIso(-1, 8, 30),
      createdAt: nowIso(-7, 8, 30),
      updatedAt: nowIso(-1, 8, 30),
      overlay: null,
      eventId: 'event-match-next',
    },
  ]
}

function createLinkedTeams(status: ExternalTeamLinkStatus = 'ACTIVE'): ExternalTeamLink[] {
  return [
    {
      id: 'link-1',
      clubId: CLUB_ID,
      teamId: TEAM_ID,
      provider: 'api_fussball',
      externalTeamId: 'team-42',
      externalClubId: 'club-42',
      externalUrl: 'https://fussball.de/team/sv-albatros',
      widgetId: null,
      widgetType: null,
      label: 'SV Albatros I',
      status,
      lastSyncedAt: nowIso(-1, 8, 0),
      createdAt: nowIso(-10, 8, 0),
      updatedAt: nowIso(-1, 8, 0),
      capabilities: { canManualSync: true, canImportRoster: true },
    },
  ]
}

function createConversations(): E2EConversationItem[] {
  return [
    {
      id: 'conversation-e2e-team',
      otherUser: {
        id: 'coach-1',
        name: 'Coach Albrecht',
        avatarUrl: null,
      },
      lastMessage: {
        content: 'Please confirm availability for the next match.',
        senderId: 'coach-1',
        createdAt: nowIso(0, 9, 15),
      },
      unreadCount: 0,
      updatedAt: nowIso(0, 9, 15),
    },
  ]
}

function createClubStats(): ClubAggregateStats {
  return {
    memberCount: 126,
    teamCount: 8,
    upcomingEventCount: 11,
    overallRsvpRate: 84,
    teams: [
      {
        teamId: TEAM_ID,
        teamName: TEAM_DISPLAY_NAME,
        teamDisplayName: TEAM_DISPLAY_NAME,
        memberCount: 24,
        upcomingEventCount: 3,
        rsvpRate: 84,
      },
    ],
  }
}

// ── Kader revamp (team agent) ────────────────────────────────────────────
// One consistent squad for every persona: the 18 players of createSquadStats
// (same ids, names and numbers the event flow uses for RSVPs), two coaches,
// one inactive player and two trial requests. 18 in the squad: 15 fit,
// Niklas gesperrt, Anna and Tobias im Urlaub. Hendrik is a new player
// (still counted). squadCount is recomputed on every GET so PATCHes stay
// consistent. The medic feature is switched off for release (no injury
// data leaves the API), so Anna is on leave instead of injured.
const E2E_KADER_POSITIONS: Record<string, string> = {
  'user-player-1': 'TW',
  'user-player-2': 'RV',
  'user-player-3': 'IV',
  'user-player-4': 'IV',
  'user-player-5': 'LV',
  'user-player-6': 'IV',
  'user-player-7': 'ZM',
  'user-player-8': 'OM',
  'user-player-9': 'DM',
  'user-player-10': 'ZM',
  'user-player-11': 'LM',
  'user-player-12': 'ST',
  'user-player-13': 'RA',
  'user-player-14': 'LA',
  'user-player-15': 'TW',
  'user-player-16': 'IV',
  'user-player-17': 'ZM',
  'user-player-18': 'ST',
}
const E2E_KADER_ABSENCE: Record<string, { absence: 'SUSPENDED' | 'AWAY'; untilDays: number }> = {
  'user-player-6': { absence: 'SUSPENDED', untilDays: 10 },
  'user-player-11': { absence: 'AWAY', untilDays: 8 },
  'user-player-4': { absence: 'AWAY', untilDays: 21 },
}
const E2E_KADER_NEW_PLAYER_ID = 'user-player-16'

/** Players who should answer NO in seeded RSVPs: injured, suspended, away. */
function e2eUnavailableSquadIds(): string[] {
  const ops = currentSession?.api.rosterOps
  if (!ops) return Object.keys(E2E_KADER_ABSENCE)
  const injured = ops.medic.active.map((injury) => injury.userId)
  const absent = [...ops.squad, ...ops.operations.newPlayers]
    .filter((member) => member.absence !== 'NONE')
    .map((member) => member.userId)
  return Array.from(new Set([...injured, ...absent]))
}

/** The NO reason that matches a player's Kader status, if they have one. */
function e2eKaderReplyReason(userId: string): { reason: string; note: string | null } | null {
  const ops = currentSession?.api.rosterOps
  if (ops?.medic.active.some((injury) => injury.userId === userId)) {
    return { reason: 'injured', note: null }
  }
  const member = ops
    ? [...ops.squad, ...ops.operations.newPlayers].find((m) => m.userId === userId)
    : null
  if (member?.absence === 'SUSPENDED') return { reason: 'suspended', note: 'Rote Karte' }
  if (member?.absence === 'AWAY') return { reason: 'vacation', note: null }
  return null
}

function e2eRosterCount(ops: RosterOpsSnapshot): number {
  return new Set(
    [...ops.squad, ...ops.operations.newPlayers]
      .filter((member) => member.role === TeamRole.PLAYER && member.phase === TeamAccessPhase.FULL)
      .map((member) => member.userId),
  ).size
}

function kaderMember(
  userId: string,
  name: string,
  overrides: Partial<RosterOpsSnapshot['squad'][number]> = {},
): RosterOpsSnapshot['squad'][number] {
  return {
    id: `roster-${userId}`,
    userId,
    name,
    avatarUrl: null,
    role: TeamRole.PLAYER,
    phase: TeamAccessPhase.FULL,
    status: TeamAccessStatus.ACTIVE,
    position: E2E_KADER_POSITIONS[userId] ?? null,
    jerseyNumber: null,
    operationalStatus: 'ACTIVE',
    absence: 'NONE',
    absenceUntil: null,
    createdAt: nowIso(-200, 10, 0),
    loanedFromTeamId: null,
    loanedFromTeamName: null,
    // Kader fixes (H2, L5): the adult personas may DM each other; nobody is
    // loaned out unless a scenario says so.
    loanedOutToTeamName: null,
    loanedOutUntil: null,
    canMessage: true,
    messageBlockedReason: null,
    ...overrides,
  }
}

function createRosterOps(): RosterOpsSnapshot {
  const players = createSquadStats().map((player) => {
    const absence = E2E_KADER_ABSENCE[player.userId]
    return kaderMember(player.userId, player.name, {
      jerseyNumber: player.jerseyNumber,
      operationalStatus: player.userId === E2E_KADER_NEW_PLAYER_ID ? 'NEW_PLAYER' : 'ACTIVE',
      absence: absence?.absence ?? 'NONE',
      absenceUntil: absence ? nowIso(absence.untilDays, 23, 59) : null,
      createdAt: player.userId === E2E_KADER_NEW_PLAYER_ID ? nowIso(-9, 10, 0) : nowIso(-200, 10, 0),
    })
  })
  const coaches = [
    kaderMember('user-coach-1', 'Coach Albrecht', { role: TeamRole.HEAD_COACH, position: null }),
    kaderMember('user-coach-2', 'Markus Brandt', { role: TeamRole.ASSISTANT_COACH, position: null }),
  ]
  const ops: RosterOpsSnapshot = {
    team: {
      id: TEAM_ID,
      displayName: TEAM_DISPLAY_NAME,
      squadTarget: 20,
    },
    squadCount: 0,
    squad: [...coaches, ...players.filter((p) => p.operationalStatus === 'ACTIVE')],
    operations: {
      trials: [
        kaderMember('user-trial-1', 'Ben Schulz', {
          id: 'trial-access-1',
          phase: TeamAccessPhase.TRIAL,
          status: TeamAccessStatus.PENDING,
          position: 'ZM',
          createdAt: nowIso(-2, 18, 30),
        }),
        kaderMember('user-trial-2', 'Mehmet Yılmaz', {
          id: 'trial-access-2',
          phase: TeamAccessPhase.TRIAL,
          status: TeamAccessStatus.ACTIVE,
          position: 'ST',
          createdAt: nowIso(-5, 19, 0),
        }),
      ],
      newPlayers: players.filter((p) => p.operationalStatus === 'NEW_PLAYER'),
      inactive: [
        kaderMember('user-player-inactive-1', 'Lukas Meyer', {
          position: 'TW',
          jerseyNumber: 31,
          operationalStatus: 'INACTIVE',
          createdAt: nowIso(-400, 10, 0),
        }),
      ],
      pendingCoaches: [],
    },
    medic: {
      // Medic kill switch: the API returns no injury data for release.
      active: [],
      recentlyCleared: [],
    },
    kit: {
      pending: [
        {
          id: 'duty-1',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          assignedUserId: 'user-player-1',
          createdById: 'user-coach-1',
          kind: 'BIB_CLEANUP',
          status: 'PENDING',
          dueDate: nowIso(2, 18, 0),
          notes: null,
          completedAt: null,
          createdAt: nowIso(-1, 21, 0),
          updatedAt: nowIso(-1, 21, 0),
          assignedUser: { id: 'user-player-1', name: 'Julian Becker', avatarUrl: null },
        },
        {
          id: 'duty-2',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          assignedUserId: 'user-player-8',
          createdById: 'user-coach-1',
          kind: 'JERSEY_CLEANUP',
          status: 'PENDING',
          dueDate: nowIso(4, 12, 0),
          notes: null,
          completedAt: null,
          createdAt: nowIso(-2, 16, 0),
          updatedAt: nowIso(-2, 16, 0),
          assignedUser: { id: 'user-player-8', name: 'Paul Schäfer', avatarUrl: null },
        },
      ],
      recent: [
        {
          id: 'duty-3',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          assignedUserId: 'user-player-7',
          createdById: 'user-coach-1',
          kind: 'JERSEY_CLEANUP',
          status: 'COMPLETED',
          dueDate: nowIso(-3, 12, 0),
          notes: null,
          completedAt: nowIso(-4, 20, 15),
          createdAt: nowIso(-9, 16, 0),
          updatedAt: nowIso(-4, 20, 15),
          assignedUser: { id: 'user-player-7', name: 'Jonas Krüger', avatarUrl: null },
        },
        {
          id: 'duty-4',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          assignedUserId: 'user-player-9',
          createdById: 'user-coach-1',
          kind: 'BIB_CLEANUP',
          status: 'COMPLETED',
          dueDate: nowIso(-6, 18, 0),
          notes: null,
          completedAt: nowIso(-6, 21, 40),
          createdAt: nowIso(-8, 21, 0),
          updatedAt: nowIso(-6, 21, 40),
          assignedUser: { id: 'user-player-9', name: 'Leon Fischer', avatarUrl: null },
        },
      ],
    },
  }
  ops.squadCount = e2eRosterCount(ops)
  return ops
}
// ── end Kader revamp ─────────────────────────────────────────────────────

function createJoinRequests(): E2EApiState['joinRequests'] {
  // Two PENDING join requests so the admin Pending-requests screen shows
  // rows. Approving / rejecting removes the matching row from this list
  // so the UI visibly updates after the action.
  return [
    {
      id: 'join-request-1',
      role: 'PLAYER',
      message: 'Hi, I played for TSV Linden last season and would love to join.',
      status: 'PENDING',
      revision: 1,
      createdAt: nowIso(-1, 17, 30),
      user: {
        id: 'join-user-1',
        name: 'Erik Brandt',
        email: 'erik.brandt@sv-albatros.example',
      },
      // club-admin review fixes: Aufnahmeantrag after a Probetraining (Wechsel).
      trialInviteId: 'trial-e2e-erik',
      trialInvite: { id: 'trial-e2e-erik', team: { id: 'team-herren-1', displayName: 'Herren I' } },
      street: 'Lindenstraße 12',
      postalCode: '14467',
      city: 'Potsdam',
      phone: '0171 2345678',
      nationality: null,
      previousClubName: 'TSV Linden',
      lastMatchDate: '2026-06-07',
      sepaConsentAt: nowIso(-1, 17, 25),
      parentalConsentAt: null,
      releaseStatus: 'PENDING',
      passApplicationAt: null,
      eligibleFrom: null,
    },
    {
      id: 'join-request-2',
      role: 'PLAYER',
      message: null,
      status: 'PENDING',
      revision: 1,
      createdAt: nowIso(-2, 11, 0),
      user: {
        id: 'join-user-2',
        name: 'Sami Haddad',
        email: 'sami.haddad@sv-albatros.example',
      },
    },
  ]
}

function createFreeAgentProfile(): FreeAgentProfile {
  return {
    id: 'free-agent-profile-1',
    userId: 'free-agent-1',
    position: PlayerPosition.MID,
    preferredFoot: PreferredFoot.RIGHT,
    city: 'Berlin',
    bio: 'Ball-progressing midfielder open to trial sessions.',
    isOnTransferList: true,
    visibility: FreeAgentVisibility.CLUB_ONLY,
    avatarUrl: null,
    postalCode: '14482',
    // Wechselbörse review fixes: region for viewers, U18 flag.
    postalRegion: '14',
    searchRadiusKm: 25,
    highestLeague: 'BEZIRKSLIGA',
    currentClubName: null,
    availableFrom: null,
    age: 28,
    isMinor: false,
    createdAt: nowIso(-30, 10, 0),
    updatedAt: nowIso(-1, 10, 0),
    user: {
      id: 'free-agent-1',
      name: 'Amir Kaya',
      avatarUrl: null,
    },
    experience: [
      {
        id: 'experience-1',
        clubName: 'TSV Linden',
        roleLabel: 'Central midfield',
        fromYear: 2022,
        toYear: 2025,
        sortOrder: 0,
      },
    ],
    media: [],
  }
}

function createMyContributions(): E2EApiState['myContributions'] {
  // 2026-11 redesign (screen 26): this month's fee open, the yearly kit levy
  // and the last three months paid, with how each payment came in.
  const today = new Date()
  const dueSoon = new Date(today.getFullYear(), today.getMonth(), 28).toISOString()
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 5).toISOString()
  const monthStart = (back: number, day: number) =>
    new Date(today.getFullYear(), today.getMonth() - back, day, 12).toISOString()
  const period = (back: number) => monthStart(back, 1).slice(0, 7)
  return {
    hasContributions: true,
    items: [
      {
        planId: 'plan-monthly',
        planName: 'Mitgliedsbeitrag',
        amount: 2500,
        currency: 'EUR',
        cadence: 'MONTHLY',
        dueDate: dueSoon,
        status: 'PENDING',
        paidAmount: null,
        paidAt: null,
      },
      {
        planId: 'plan-trikot',
        planName: 'Trikotumlage',
        amount: 4500,
        currency: 'EUR',
        cadence: 'YEARLY',
        dueDate: lastMonth,
        status: 'PAID',
        paidAmount: 4500,
        paidAt: lastMonth,
      },
    ],
    bankTransfer: {
      accountHolder: 'SV Albatros e.V.',
      iban: 'DE89370400440532013000',
      reference: 'Beitrag Julian Becker',
    },
    history: [
      { planId: 'plan-monthly', planName: 'Mitgliedsbeitrag', period: period(1), amount: 2500, currency: 'EUR', paidAt: monthStart(1, 3), method: 'CASH' },
      { planId: 'plan-monthly', planName: 'Mitgliedsbeitrag', period: period(2), amount: 2500, currency: 'EUR', paidAt: monthStart(2, 2), method: 'TRANSFER' },
      { planId: 'plan-monthly', planName: 'Mitgliedsbeitrag', period: period(3), amount: 2500, currency: 'EUR', paidAt: monthStart(3, 1), method: 'TRANSFER' },
    ],
  }
}

function createVoiceMemos(): E2EApiState['voiceMemos'] {
  // 4 seeded memos so each scenario lands with content. Mock uses a
  // public placeholder mp3 (small bell tone) — real flow will swap in
  // an R2-signed url. Peaks are deterministic-feel sine fills so the
  // waveform renders nicely without an audio decoder.
  const ago = (mins: number) => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - mins)
    return d.toISOString()
  }
  const peaks = (n: number, seed: number) => {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const x = Math.sin((i + seed) / 1.7) * 0.5 + 0.5
      const y = Math.sin((i + seed) / 0.9) * 0.3 + 0.7
      out.push(Math.max(0.15, Math.min(1, (x + y) / 2)))
    }
    return out
  }
  const audioUrl = 'https://www.kozco.com/tech/piano2-CoolEdit.mp3' // 24s placeholder
  return [
    {
      id: 'vm-1',
      fromUserId: 'user-coach-1',
      fromUserName: 'Markus Hoffmann',
      toUserId: 'user-player-3',
      toUserName: 'Lukas Hoffmann',
      audioUrl,
      durationSec: 28,
      peaks: peaks(40, 1),
      title: 'Push higher on the second phase',
      tags: ['tactical', 'fix'],
      listened: false,
      fixtureId: 'fixture-1',
      createdAt: ago(15),
    },
    {
      id: 'vm-2',
      fromUserId: 'user-coach-1',
      fromUserName: 'Markus Hoffmann',
      toUserId: 'user-player-8',
      toUserName: 'Paul Schäfer',
      audioUrl,
      durationSec: 22,
      peaks: peaks(40, 5),
      title: 'Free kick was clinical',
      tags: ['praise'],
      listened: true,
      fixtureId: 'fixture-1',
      createdAt: ago(45),
    },
    {
      id: 'vm-3',
      fromUserId: 'user-coach-1',
      fromUserName: 'Markus Hoffmann',
      toUserId: 'user-player-1',
      toUserName: 'Julian Becker',
      audioUrl,
      durationSec: 19,
      peaks: peaks(40, 9),
      title: 'Communicate earlier on crosses',
      tags: ['fix'],
      listened: false,
      fixtureId: 'fixture-1',
      createdAt: ago(60),
    },
    {
      id: 'vm-4',
      fromUserId: 'user-coach-1',
      fromUserName: 'Markus Hoffmann',
      toUserId: 'user-player-12',
      toUserName: 'David Köhler',
      audioUrl,
      durationSec: 34,
      peaks: peaks(40, 13),
      title: 'Set-piece routine for next week',
      tags: ['set-piece', 'tactical'],
      listened: false,
      fixtureId: 'fixture-1',
      createdAt: ago(120),
    },
  ]
}

function createStreaks(): E2EApiState['streaks'] {
  // Personal stats high enough that the demo lands ("8-week attendance
  // streak — best of the season!"). Leaderboard shows the top helpers
  // for community feel.
  return {
    me: {
      attendanceWeeks: 8,
      attendanceLongest: 8,
      motmWeeks: 2,
      motmLongest: 3,
      lastActivityAt: new Date().toISOString(),
    },
    leaderboard: [
      { userId: 'user-player-12', name: 'David Köhler', attendanceWeeks: 14, motmWeeks: 4 },
      { userId: 'user-player-8', name: 'Paul Schäfer', attendanceWeeks: 12, motmWeeks: 3 },
      { userId: 'user-player-1', name: 'Julian Becker', attendanceWeeks: 8, motmWeeks: 2 },
      { userId: 'user-player-2', name: 'Tim Weber', attendanceWeeks: 7, motmWeeks: 1 },
      { userId: 'user-player-3', name: 'Lukas Hoffmann', attendanceWeeks: 6, motmWeeks: 1 },
      { userId: 'user-player-9', name: 'Leon Fischer', attendanceWeeks: 5, motmWeeks: 1 },
    ],
  }
}

function createCompliance(): E2EApiState['compliance'] {
  // A spread of compliance docs across players + coaches with realistic
  // expiry windows so the dashboard tells a layered story: 2 expiring in
  // < 14 days (red), 2 in 30-60 days (warning), the rest fine.
  const inDays = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return d.toISOString()
  }
  return [
    {
      id: 'cmp-1',
      memberUserId: 'user-coach-1',
      memberName: 'Markus Hoffmann',
      role: 'COACH',
      kind: 'FUEHRUNGSZEUGNIS',
      expiresAt: inDays(8),
      issuedAt: inDays(-(365 * 5 - 8)),
      documentUrl: 'https://example.com/fzg.pdf',
      note: null,
    },
    {
      id: 'cmp-2',
      memberUserId: 'user-player-3',
      memberName: 'Lukas Hoffmann',
      role: 'PLAYER',
      kind: 'SPIELERPASS',
      expiresAt: inDays(12),
      issuedAt: inDays(-(365 * 3 - 12)),
      documentUrl: 'https://example.com/pass.pdf',
      note: 'Renewal form submitted — awaiting BFV.',
    },
    {
      id: 'cmp-3',
      memberUserId: 'user-coach-1',
      memberName: 'Markus Hoffmann',
      role: 'COACH',
      kind: 'FIRST_AID_CERT',
      expiresAt: inDays(45),
      issuedAt: inDays(-(365 * 2 - 45)),
      documentUrl: null,
      note: null,
    },
    {
      id: 'cmp-4',
      memberUserId: 'user-player-2',
      memberName: 'Tim Weber',
      role: 'PLAYER',
      kind: 'MEDICAL_CHECK',
      expiresAt: inDays(58),
      issuedAt: inDays(-(365 - 58)),
      documentUrl: 'https://example.com/med.pdf',
      note: null,
    },
    {
      id: 'cmp-5',
      memberUserId: 'user-player-1',
      memberName: 'Julian Becker',
      role: 'PLAYER',
      kind: 'SPIELERPASS',
      expiresAt: inDays(220),
      issuedAt: inDays(-(365 * 3 - 220)),
      documentUrl: 'https://example.com/pass.pdf',
      note: null,
    },
    {
      id: 'cmp-6',
      memberUserId: 'user-player-7',
      memberName: 'Jonas Krüger',
      role: 'PLAYER',
      kind: 'VACCINATION_TETANUS',
      expiresAt: inDays(310),
      issuedAt: inDays(-(365 * 10 - 310)),
      documentUrl: null,
      note: null,
    },
    {
      id: 'cmp-7',
      memberUserId: 'user-admin-1',
      memberName: 'Franziska Vogel',
      role: 'ADMIN',
      kind: 'FUEHRUNGSZEUGNIS',
      expiresAt: inDays(-3),
      issuedAt: inDays(-(365 * 5 + 3)),
      documentUrl: null,
      note: 'Waiting on Polizei appointment.',
    },
  ]
}

function createPendingDuesPauses(): E2EApiState['pendingDuesPauses'] {
  // One seeded pending pause so the admin AdminHome banner lands
  // immediately on first open. Backed by a long-term injury (Lukas's
  // hamstring, 8 weeks) that's already on the medic board.
  return [
    {
      id: 'pause-1',
      memberUserId: 'user-player-3',
      memberName: 'Lukas Hoffmann',
      reason: 'Hamstring tear · expected return 8 weeks',
      createdAt: new Date().toISOString(),
      weeks: 8,
      status: 'PENDING',
    },
  ]
}

function createLiveMatches(): E2EApiState['liveMatches'] {
  // Fixture-1 seeded as a live match at minute 67, score 2-1. Five
  // earlier events build the story; refetching advances the clock and
  // (occasionally) injects a new event so the demo feels alive.
  return {
    'fixture-1': {
      status: 'live',
      minute: 67,
      scoreHome: 2,
      scoreAway: 1,
      events: [
        {
          id: 'evt-1',
          minute: 12,
          kind: 'goal',
          player: 'David Köhler',
          detail: 'Assist: Paul Schäfer',
          side: 'home',
        },
        {
          id: 'evt-2',
          minute: 23,
          kind: 'yellow',
          player: 'Tim Weber',
          detail: 'Tactical foul',
          side: 'home',
        },
        {
          id: 'evt-3',
          minute: 38,
          kind: 'goal',
          player: 'M. Schneider',
          detail: 'Header from corner',
          side: 'away',
        },
        {
          id: 'evt-4',
          minute: 41,
          kind: 'goal',
          player: 'Paul Schäfer',
          detail: 'Free kick',
          side: 'home',
        },
        {
          id: 'evt-5',
          minute: 56,
          kind: 'sub',
          player: 'Erik Walter',
          detail: 'Off: Moritz Vogel',
          side: 'home',
        },
      ],
      lastTickedAt: Date.now(),
    },
  }
}

function createMotmTallies(): E2EApiState['motm'] {
  // Live MOTM open for fixture-1 — votes already coming in. Candidates are
  // the match-day squad (any squad member can be voted MOTM), so the userIds
  // MUST match the seeded roster squad (player-1, player-2, …) — otherwise
  // MotmSheet, which renders one row per squad member and merges votes by
  // userId, shows every candidate at 0 while the header total disagrees.
  // Per-candidate votes are seeded to SUM to the header total so the sheet
  // is internally consistent. Julian leads with the brace; Tim close behind.
  const results = [
    { userId: 'user-player-12', name: 'David Köhler', votes: 8, pct: 0 },
    { userId: 'user-player-8', name: 'Paul Schäfer', votes: 6, pct: 0 },
  ]
  const totalVotes = results.reduce((sum, r) => sum + r.votes, 0)
  const seeded = results.map((r) => ({
    ...r,
    pct: Math.round((r.votes / totalVotes) * 100),
  }))
  return {
    'fixture-1': {
      fixtureId: 'fixture-1',
      totalVotes,
      results: seeded,
      myVoteUserId: null,
      closesAt: nowIso(0, 22, 0),
    },
  }
}

function createPhotos(): E2EApiState['photos'] {
  // Six seeded photos with vote counts; uses Picsum seeded URLs so the
  // grid renders something attractive without needing real uploads.
  // Picsum returns a stable image for `${seed}` on each call.
  const u = (seed: string, w = 800, h = 600) => `https://picsum.photos/seed/${seed}/${w}/${h}`
  return {
    'fixture-1': [
      {
        id: 'photo-1',
        uploaderId: 'user-coach-1',
        uploaderName: 'Markus Hoffmann',
        uploadedAt: nowIso(0, 18, 12),
        imageUrl: u('anstoss-team-huddle'),
        caption: 'Pre-match huddle. Squad locked in.',
        votes: 12,
        myVoted: false,
      },
      {
        id: 'photo-2',
        uploaderId: 'user-player-8',
        uploaderName: 'Paul Schäfer',
        uploadedAt: nowIso(0, 18, 45),
        imageUrl: u('anstoss-celebration'),
        caption: '2-1! What a free kick.',
        votes: 23,
        myVoted: false,
      },
      {
        id: 'photo-3',
        uploaderId: 'user-parent-1',
        uploaderName: 'Nina Becker',
        uploadedAt: nowIso(0, 17, 5),
        imageUrl: u('anstoss-stand'),
        caption: 'Standing room only on the away end.',
        votes: 5,
        myVoted: false,
      },
      {
        id: 'photo-4',
        uploaderId: 'user-player-13',
        uploaderName: 'Erik Walter',
        uploadedAt: nowIso(0, 19, 0),
        imageUrl: u('anstoss-pitch'),
        caption: 'Pitch view from the bench.',
        votes: 3,
        myVoted: false,
      },
      {
        id: 'photo-5',
        uploaderId: 'user-admin-1',
        uploaderName: 'Franziska Vogel',
        uploadedAt: nowIso(0, 17, 30),
        imageUrl: u('anstoss-flag'),
        caption: null,
        votes: 8,
        myVoted: false,
      },
      {
        id: 'photo-6',
        uploaderId: 'user-player-12',
        uploaderName: 'David Köhler',
        uploadedAt: nowIso(0, 19, 12),
        imageUrl: u('anstoss-goal'),
        caption: 'Got the opener!',
        votes: 17,
        myVoted: false,
      },
    ],
  }
}

function createChildrenAgenda(): E2EApiState['childrenAgenda'] {
  // Two kids on different teams with one head-to-head conflict on the
  // weekend (Anna's Wed training overlaps Lukas's away match — no, both
  // are Saturday) plus a clear evening that should pass through without
  // alert. Demonstrates the scanner's "1 conflict in 3 days" hero state.
  return {
    kids: [
      { userId: 'kid-anna', name: 'Anna', teamName: 'U13' },
      { userId: 'kid-lukas', name: 'Lukas', teamName: 'U15' },
    ],
    events: [
      // Conflict pair — same Saturday, overlapping kickoff windows.
      {
        id: 'child-evt-1',
        kidId: 'kid-anna',
        title: 'U13 home match vs FC Nord',
        date: nowIso(3, 11, 0),
        durationMin: 90,
        location: 'Albatros Platz 2',
        rsvp: 'YES',
      },
      {
        id: 'child-evt-2',
        kidId: 'kid-lukas',
        title: 'U15 away match vs SV Süd',
        date: nowIso(3, 12, 0),
        durationMin: 90,
        location: 'SV Süd Sportpark',
        rsvp: 'YES',
      },
      // Non-conflicting events later in the week
      {
        id: 'child-evt-3',
        kidId: 'kid-anna',
        title: 'U13 training',
        date: nowIso(5, 17, 30),
        durationMin: 75,
        location: 'Albatros Platz 1',
        rsvp: 'PENDING',
      },
      {
        id: 'child-evt-4',
        kidId: 'kid-lukas',
        title: 'U15 training',
        date: nowIso(6, 18, 0),
        durationMin: 90,
        location: 'Albatros Platz 1',
        rsvp: 'YES',
      },
      // A second conflict 9 days out (info tone)
      {
        id: 'child-evt-5',
        kidId: 'kid-anna',
        title: 'U13 training (Wed)',
        date: nowIso(9, 17, 0),
        durationMin: 75,
        location: 'Albatros Platz 1',
        rsvp: 'PENDING',
      },
      {
        id: 'child-evt-6',
        kidId: 'kid-lukas',
        title: 'U15 friendly',
        date: nowIso(9, 17, 30),
        durationMin: 90,
        location: 'SV Ost Pitch B',
        rsvp: 'PENDING',
      },
    ],
  }
}

function createSquadStats(): E2EApiState['squadStats'] {
  // 18-player squad with attendance + minutes shares engineered so the
  // fairness suggestion has a real story to tell — Lukas (GK) is high
  // attendance / low minutes (perfect rotation candidate), Tim is the
  // opposite (always plays), Anna is unavailable.
  return [
    {
      userId: 'user-player-1',
      name: 'Julian Becker',
      jerseyNumber: 1,
      position: 'GK',
      attendance: 0.92,
      minutesShare: 0.85,
      unavailable: false,
    },
    {
      userId: 'user-player-2',
      name: 'Tim Weber',
      jerseyNumber: 2,
      position: 'DEF',
      attendance: 0.95,
      minutesShare: 0.92,
      unavailable: false,
    },
    {
      userId: 'user-player-3',
      name: 'Lukas Hoffmann',
      jerseyNumber: 5,
      position: 'DEF',
      attendance: 0.88,
      minutesShare: 0.32,
      unavailable: false,
    },
    {
      userId: 'user-player-4',
      name: 'Anna Schmidt',
      jerseyNumber: 4,
      position: 'DEF',
      attendance: 0.45,
      minutesShare: 0.4,
      unavailable: true,
    },
    {
      userId: 'user-player-5',
      name: 'Felix Bauer',
      jerseyNumber: 3,
      position: 'DEF',
      attendance: 0.82,
      minutesShare: 0.78,
      unavailable: false,
    },
    {
      userId: 'user-player-6',
      name: 'Niklas Wagner',
      jerseyNumber: 6,
      position: 'DEF',
      attendance: 0.78,
      minutesShare: 0.55,
      unavailable: false,
    },
    {
      userId: 'user-player-7',
      name: 'Jonas Krüger',
      jerseyNumber: 8,
      position: 'MID',
      attendance: 0.9,
      minutesShare: 0.88,
      unavailable: false,
    },
    {
      userId: 'user-player-8',
      name: 'Paul Schäfer',
      jerseyNumber: 10,
      position: 'MID',
      attendance: 0.94,
      minutesShare: 0.9,
      unavailable: false,
    },
    {
      userId: 'user-player-9',
      name: 'Leon Fischer',
      jerseyNumber: 14,
      position: 'MID',
      attendance: 0.86,
      minutesShare: 0.42,
      unavailable: false,
    },
    {
      userId: 'user-player-10',
      name: 'Max Hoffmann',
      jerseyNumber: 7,
      position: 'MID',
      attendance: 0.7,
      minutesShare: 0.6,
      unavailable: false,
    },
    {
      userId: 'user-player-11',
      name: 'Tobias Lang',
      jerseyNumber: 11,
      position: 'MID',
      attendance: 0.83,
      minutesShare: 0.66,
      unavailable: false,
    },
    {
      userId: 'user-player-12',
      name: 'David Köhler',
      jerseyNumber: 9,
      position: 'ATT',
      attendance: 0.96,
      minutesShare: 0.94,
      unavailable: false,
    },
    {
      userId: 'user-player-13',
      name: 'Erik Walter',
      jerseyNumber: 17,
      position: 'ATT',
      attendance: 0.84,
      minutesShare: 0.51,
      unavailable: false,
    },
    {
      userId: 'user-player-14',
      name: 'Moritz Vogel',
      jerseyNumber: 19,
      position: 'ATT',
      attendance: 0.72,
      minutesShare: 0.28,
      unavailable: false,
    },
    {
      userId: 'user-player-15',
      name: 'Simon Klein',
      jerseyNumber: 22,
      position: 'GK',
      attendance: 0.65,
      minutesShare: 0.12,
      unavailable: false,
    },
    {
      userId: 'user-player-16',
      name: 'Hendrik Maier',
      jerseyNumber: 13,
      position: 'DEF',
      attendance: 0.6,
      minutesShare: 0.2,
      unavailable: false,
    },
    {
      userId: 'user-player-17',
      name: 'Yannick Roth',
      jerseyNumber: 15,
      position: 'MID',
      attendance: 0.58,
      minutesShare: 0.18,
      unavailable: false,
    },
    {
      userId: 'user-player-18',
      name: 'Kai Berger',
      jerseyNumber: 20,
      position: 'ATT',
      attendance: 0.5,
      minutesShare: 0.08,
      unavailable: false,
    },
  ]
}

function createChannelMembership(): E2EApiState['channelMembership'] {
  // Seeded membership for the default team channel. Other channels lazily
  // initialize from this roster via the GET handler — newly created
  // channels start with everyone enrolled.
  const roster: E2EApiState['channelMembership'][string] = [
    {
      userId: 'user-player-1',
      name: 'Julian Becker',
      email: 'julian@anstoss.dev',
      avatarUrl: null,
      role: 'PLAYER',
      isMember: true,
    },
    {
      userId: 'user-player-2',
      name: 'Tim Weber',
      email: 'tim@anstoss.dev',
      avatarUrl: null,
      role: 'PLAYER',
      isMember: true,
    },
    {
      userId: 'user-player-3',
      name: 'Lukas Hoffmann',
      email: 'lukas@anstoss.dev',
      avatarUrl: null,
      role: 'PLAYER',
      isMember: true,
    },
    {
      userId: 'user-coach-1',
      name: 'Markus Hoffmann',
      email: 'markus@anstoss.dev',
      avatarUrl: null,
      role: 'COACH',
      isMember: true,
    },
    {
      userId: 'user-admin-1',
      name: 'Franziska Vogel',
      email: 'franziska@anstoss.dev',
      avatarUrl: null,
      role: 'ADMIN',
      isMember: false,
    },
    {
      userId: 'user-parent-1',
      name: 'Nina Becker',
      email: 'nina@anstoss.dev',
      avatarUrl: null,
      role: 'PARENT',
      isMember: false,
    },
  ]
  return { default: roster }
}

function createAdminContributions(): E2EApiState['adminContributions'] {
  // Three plans on the admin side: monthly subscription dues (active),
  // a yearly kit levy (active), and a paused tournament fee. Members
  // include the seeded club roster so admins can exercise assignment.
  const now = new Date().toISOString()
  return {
    settings: {
      clubId: CLUB_ID,
      enabled: true,
      autoRemindersEnabled: true,
      defaultCurrency: 'EUR',
      bankAccountHolder: 'SV Albatros e.V.',
      bankIban: 'DE89370400440532013000',
      bankReference: 'Mitgliedsbeitrag',
    },
    summary: {
      assignedMembers: 18,
      paidMembers: 12,
      overdueMembers: 4,
      outstandingMembers: 6,
      expectedAmount: 45000,
      collectedAmount: 30000,
    },
    plans: [
      {
        id: 'plan-monthly',
        clubId: CLUB_ID,
        name: 'Mitgliedsbeitrag',
        description: 'Monthly membership dues',
        amount: 2500,
        currency: 'EUR',
        cadence: 'MONTHLY',
        targetRole: 'PLAYER',
        dueDay: 5,
        dueMonth: null,
        graceDays: 7,
        reminderPolicy: { daysBefore: [7, 1], daysAfter: [3, 14] },
        active: true,
        assignedMemberCount: 14,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'plan-trikot',
        clubId: CLUB_ID,
        name: 'Trikotumlage',
        description: 'Annual jersey contribution',
        amount: 4500,
        currency: 'EUR',
        cadence: 'YEARLY',
        targetRole: 'PLAYER',
        dueDay: 15,
        dueMonth: 9,
        graceDays: 14,
        reminderPolicy: { daysBefore: [14, 3], daysAfter: [7, 21] },
        active: true,
        assignedMemberCount: 12,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'plan-turnier',
        clubId: CLUB_ID,
        name: 'Turnier-Anmeldung',
        description: 'Tournament registration (paused)',
        amount: 1500,
        currency: 'EUR',
        cadence: 'YEARLY',
        targetRole: 'PLAYER',
        dueDay: 1,
        dueMonth: 6,
        graceDays: 0,
        reminderPolicy: { daysBefore: [], daysAfter: [] },
        active: false,
        assignedMemberCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    members: [
      {
        memberUserId: 'user-player-1',
        name: 'Julian Becker',
        email: 'julian@anstoss.dev',
        avatarUrl: null,
        role: 'PLAYER',
        planId: 'plan-monthly',
        planName: 'Mitgliedsbeitrag',
        cadence: 'MONTHLY',
        amount: 2500,
        currency: 'EUR',
        dueDate: nowIso(20, 12, 0),
        status: 'PENDING',
        paidAmount: null,
        paidAt: null,
        note: null,
        lastReminderSentAt: null,
      },
      {
        memberUserId: 'user-player-2',
        name: 'Tim Weber',
        email: 'tim@anstoss.dev',
        avatarUrl: null,
        role: 'PLAYER',
        planId: 'plan-monthly',
        planName: 'Mitgliedsbeitrag',
        cadence: 'MONTHLY',
        amount: 2500,
        currency: 'EUR',
        dueDate: nowIso(-10, 12, 0),
        status: 'OVERDUE',
        paidAmount: null,
        paidAt: null,
        note: null,
        lastReminderSentAt: null,
      },
      {
        memberUserId: 'user-player-3',
        name: 'Lukas Hoffmann',
        email: 'lukas@anstoss.dev',
        avatarUrl: null,
        role: 'PLAYER',
        planId: 'plan-monthly',
        planName: 'Mitgliedsbeitrag',
        cadence: 'MONTHLY',
        amount: 2500,
        currency: 'EUR',
        dueDate: nowIso(-30, 12, 0),
        status: 'PAID',
        paidAmount: 2500,
        paidAt: nowIso(-25, 12, 0),
        note: null,
        lastReminderSentAt: null,
      },
      {
        memberUserId: 'user-player-4',
        name: 'Anna Schmidt',
        email: 'anna@anstoss.dev',
        avatarUrl: null,
        role: 'PLAYER',
        planId: null,
        planName: null,
        cadence: null,
        amount: null,
        currency: null,
        dueDate: null,
        status: null,
        paidAmount: null,
        paidAt: null,
        note: null,
        lastReminderSentAt: null,
      },
    ],
  }
}

function createApiState(overrides?: Partial<E2EApiState>): E2EApiState {
  return {
    events: createEvents(),
    parentEvents: [],
    conversations: createConversations(),
    fixtures: createFixtures(),
    linkedTeams: [],
    clubStats: null,
    rosterOps: null,
    joinRequests: createJoinRequests(),
    freeAgentProfile: null,
    myContributions: createMyContributions(),
    adminContributions: createAdminContributions(),
    channelMembership: createChannelMembership(),
    squadStats: createSquadStats(),
    childrenAgenda: createChildrenAgenda(),
    liveMatches: createLiveMatches(),
    motm: createMotmTallies(),
    photos: createPhotos(),
    compliance: createCompliance(),
    pendingDuesPauses: createPendingDuesPauses(),
    streaks: createStreaks(),
    voiceMemos: createVoiceMemos(),
    ...overrides,
  }
}

function buildPlayerSession(): E2ESessionSnapshot {
  return {
    scenario: 'player',
    user: {
      id: 'user-player-1',
      clerkId: 'e2e-player-1',
      email: 'player@anstoss.dev',
      name: 'Julian Becker',
      avatarUrl: null,
      registrationRole: RegistrationRole.PLAYER,
    },
    memberships: [createMembership(MembershipRole.PLAYER)],
    teamMembers: [createTeamMember(TeamRole.PLAYER)],
    ageGate: {
      isUnder16: false,
      status: 'CLEARED',
      guardianEmail: null,
    },
    needsOnboarding: false,
    // Players see the same roster their coach does; the Team tab lists it.
    api: createApiState({ rosterOps: createRosterOps() }),
  }
}

function buildParentSession(): E2ESessionSnapshot {
  return {
    scenario: 'parent',
    user: {
      id: 'user-parent-1',
      clerkId: 'e2e-parent-1',
      email: 'parent@anstoss.dev',
      name: 'Nina Becker',
      avatarUrl: null,
      registrationRole: RegistrationRole.PARENT,
    },
    memberships: [createMembership(MembershipRole.PARENT)],
    teamMembers: [createTeamMember(TeamRole.PARENT)],
    ageGate: {
      isUnder16: false,
      status: 'CLEARED',
      guardianEmail: null,
    },
    needsOnboarding: false,
    api: createApiState({
      parentEvents: createParentEvents(),
      // Kader revamp: parents see the squad their child plays in.
      rosterOps: createRosterOps(),
    }),
  }
}

function buildCoachSession(): E2ESessionSnapshot {
  return {
    scenario: 'coach',
    user: {
      id: 'user-coach-1',
      clerkId: 'e2e-coach-1',
      email: 'coach@anstoss.dev',
      name: 'Coach Albrecht',
      avatarUrl: null,
      registrationRole: RegistrationRole.COACH,
    },
    memberships: [createMembership(MembershipRole.COACH)],
    teamMembers: [createTeamMember(TeamRole.HEAD_COACH)],
    ageGate: {
      isUnder16: false,
      status: 'CLEARED',
      guardianEmail: null,
    },
    needsOnboarding: false,
    api: createApiState({
      linkedTeams: createLinkedTeams(),
      rosterOps: createRosterOps(),
    }),
  }
}

function buildClubAdminSession(): E2ESessionSnapshot {
  return {
    scenario: 'club-admin',
    user: {
      id: 'user-admin-1',
      clerkId: 'e2e-admin-1',
      email: 'admin@anstoss.dev',
      name: 'Mara Schulte',
      avatarUrl: null,
      registrationRole: RegistrationRole.CLUB_ADMIN,
    },
    memberships: [createMembership(MembershipRole.OWNER)],
    teamMembers: [createTeamMember(TeamRole.HEAD_COACH)],
    ageGate: {
      isUnder16: false,
      status: 'CLEARED',
      guardianEmail: null,
    },
    needsOnboarding: false,
    api: createApiState({
      linkedTeams: createLinkedTeams(),
      clubStats: createClubStats(),
      rosterOps: createRosterOps(),
      // club-admin revamp: 4 overdue dues totalling 150 € + a passive plan.
      adminContributions: (() => {
        const base = createAdminContributions()
        const passivePlan = {
          ...base.plans[0],
          id: 'plan-passive',
          name: 'Fördermitgliedschaft',
          description: 'Passive Mitglieder und Förderer',
          amount: 7500,
          cadence: 'YEARLY' as const,
          targetRole: 'CUSTOM' as const,
          assignedMemberCount: 14,
        }
        return {
          ...base,
          plans: [...base.plans, passivePlan],
          summary: {
            assignedMembers: 118,
            paidMembers: 102,
            overdueMembers: 4,
            outstandingMembers: 16,
            expectedAmount: 295000,
            collectedAmount: 255000,
          },
          members: createClubAdminContributionMembers(),
        }
      })(),
    }),
  }
}

function buildFreeAgentSession(): E2ESessionSnapshot {
  return {
    scenario: 'free-agent',
    user: {
      id: 'user-free-agent-1',
      clerkId: 'e2e-free-agent-1',
      email: 'freeagent@anstoss.dev',
      name: 'Amir Kaya',
      avatarUrl: null,
      registrationRole: RegistrationRole.FREE_AGENT,
      // An established free agent has completed onboarding, so they have a DOB.
      // Without it, needsRegistration=true (memberships=0 + no DOB) and index.tsx
      // resumes onboarding instead of routing to /free-agent/profile.
      dateOfBirth: '1998-05-15',
    },
    memberships: [],
    teamMembers: [],
    ageGate: {
      isUnder16: false,
      status: 'CLEARED',
      guardianEmail: null,
    },
    needsOnboarding: false,
    api: createApiState({
      freeAgentProfile: createFreeAgentProfile(),
    }),
  }
}

type E2EPrimaryScenarioName = Exclude<E2EScenarioName, 'signed-out'>

function buildPostSignupSession(registrationRole: RegistrationRole): E2ESessionSnapshot {
  const scenarioByRole: Record<RegistrationRole, E2ESessionSnapshot['scenario']> = {
    [RegistrationRole.PLAYER]: 'signup-player',
    [RegistrationRole.PARENT]: 'signup-parent',
    [RegistrationRole.COACH]: 'signup-coach',
    [RegistrationRole.CLUB_ADMIN]: 'signup-club-admin',
    [RegistrationRole.FREE_AGENT]: 'signup-free-agent',
  }

  const emailPrefixByRole: Record<RegistrationRole, string> = {
    [RegistrationRole.PLAYER]: 'player-signup',
    [RegistrationRole.PARENT]: 'parent-signup',
    [RegistrationRole.COACH]: 'coach-signup',
    [RegistrationRole.CLUB_ADMIN]: 'club-admin-signup',
    [RegistrationRole.FREE_AGENT]: 'free-agent-signup',
  }

  const nameByRole: Record<RegistrationRole, string> = {
    [RegistrationRole.PLAYER]: 'Julian Becker',
    [RegistrationRole.PARENT]: 'Nina Becker',
    [RegistrationRole.COACH]: 'Coach Albrecht',
    [RegistrationRole.CLUB_ADMIN]: 'Mara Schulte',
    [RegistrationRole.FREE_AGENT]: 'Amir Kaya',
  }

  return {
    scenario: scenarioByRole[registrationRole],
    user: {
      id: `user-${emailPrefixByRole[registrationRole]}`,
      clerkId: `e2e-${emailPrefixByRole[registrationRole]}`,
      email: `${emailPrefixByRole[registrationRole]}@anstoss.dev`,
      name: nameByRole[registrationRole],
      avatarUrl: null,
      registrationRole,
      dateOfBirth: '1998-05-15',
    },
    memberships: [],
    teamMembers: [],
    ageGate: {
      isUnder16: false,
      status: 'CLEARED',
      guardianEmail: null,
    },
    needsOnboarding: false,
    api: createApiState(),
  }
}

function buildScenario(name: E2EPrimaryScenarioName) {
  switch (name) {
    case 'player':
      return buildPlayerSession()
    case 'parent':
      return buildParentSession()
    case 'coach':
      return buildCoachSession()
    case 'club-admin':
      return buildClubAdminSession()
    case 'free-agent':
      return buildFreeAgentSession()
    case 'signup-player':
      return buildPostSignupSession(RegistrationRole.PLAYER)
    case 'signup-parent':
      return buildPostSignupSession(RegistrationRole.PARENT)
    case 'signup-coach':
      return buildPostSignupSession(RegistrationRole.COACH)
    case 'signup-club-admin':
      return buildPostSignupSession(RegistrationRole.CLUB_ADMIN)
    case 'signup-free-agent':
      return buildPostSignupSession(RegistrationRole.FREE_AGENT)
  }
}

function emitSession(session: E2ESessionSnapshot | null) {
  currentSession = session ? clone(session) : null

  listeners.forEach((listener) => {
    listener(currentSession ? clone(currentSession) : null)
  })
}

export function isE2ESupported() {
  return __DEV__ === true
}

export function getE2ESession() {
  return currentSession ? clone(currentSession) : null
}

export function subscribeToE2ESession(listener: (session: E2ESessionSnapshot | null) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function hydrateStoredE2ESession() {
  if (!isE2ESupported()) {
    return null
  }

  if (currentSession) {
    return clone(currentSession)
  }

  const raw = await AsyncStorage.getItem(E2E_SESSION_KEY).catch(() => null)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as E2ESessionSnapshot
    // Fill in any newer api state fields that didn't exist when the
    // session was first persisted. Without this merge, code updates that
    // add new mock state (adminContributions, duties, etc.) would crash
    // the request handler with `Cannot read property … of undefined`.
    const defaults = createApiState()
    parsed.api = {
      ...defaults,
      ...parsed.api,
      myContributions: parsed.api?.myContributions ?? defaults.myContributions,
      joinRequests: parsed.api?.joinRequests ?? defaults.joinRequests,
      adminContributions: parsed.api?.adminContributions ?? defaults.adminContributions,
      channelMembership: parsed.api?.channelMembership ?? defaults.channelMembership,
      squadStats: parsed.api?.squadStats ?? defaults.squadStats,
      childrenAgenda: parsed.api?.childrenAgenda ?? defaults.childrenAgenda,
      liveMatches: parsed.api?.liveMatches ?? defaults.liveMatches,
      motm: parsed.api?.motm ?? defaults.motm,
      photos: parsed.api?.photos ?? defaults.photos,
      compliance: parsed.api?.compliance ?? defaults.compliance,
      pendingDuesPauses: parsed.api?.pendingDuesPauses ?? defaults.pendingDuesPauses,
      streaks: parsed.api?.streaks ?? defaults.streaks,
      voiceMemos: parsed.api?.voiceMemos ?? defaults.voiceMemos,
    }
    currentSession = parsed
    // Re-seed scenario-scoped mock state that lives outside the snapshot so it
    // survives a reload (otherwise /team-groups is empty → "No squad available").
    e2eTeamGroups = seedTeamGroupsFor(parsed.scenario)
    e2eRemovedMemberUserIds = new Set()
    e2eInviteCounter = 0
    return clone(parsed)
  } catch {
    await AsyncStorage.removeItem(E2E_SESSION_KEY).catch(() => {})
    return null
  }
}

export async function activateE2EScenario(name: E2EPrimaryScenarioName) {
  if (!isE2ESupported()) {
    return null
  }

  const scenario = buildScenario(name)
  resetClubAdminWorld() // club-admin revamp
  resetInboxLiveMocks() // redesign: inbox + live match mocks
  e2eClaim = null // onboarding revamp: claims never leak across personas
  e2eTeamGroups = seedTeamGroupsFor(name)
  e2eRemovedMemberUserIds = new Set()
  e2eInviteCounter = 0
  emitSession(scenario)
  void AsyncStorage.setItem(E2E_SESSION_KEY, JSON.stringify(scenario)).catch(() => {})
  return clone(scenario)
}

export async function activateE2EPostSignupRole(registrationRole: RegistrationRole) {
  if (!isE2ESupported()) {
    return null
  }

  const scenario = buildPostSignupSession(registrationRole)
  resetInboxLiveMocks() // redesign: inbox + live match mocks
  e2eClaim = null // onboarding revamp
  e2eTeamGroups = seedTeamGroupsFor(scenario.scenario)
  e2eRemovedMemberUserIds = new Set()
  e2eInviteCounter = 0
  emitSession(scenario)
  void AsyncStorage.setItem(E2E_SESSION_KEY, JSON.stringify(scenario)).catch(() => {})
  return clone(scenario)
}

export async function clearE2ESession() {
  await AsyncStorage.removeItem(E2E_SESSION_KEY).catch(() => {})
  e2eClaim = null // onboarding revamp
  e2eTeamGroups = []
  e2eRemovedMemberUserIds = new Set()
  e2eInviteCounter = 0
  emitSession(null)
}

function persistCurrentSession() {
  if (!currentSession) return
  void AsyncStorage.setItem(E2E_SESSION_KEY, JSON.stringify(currentSession)).catch(() => {})
}

// ── onboarding revamp ──────────────────────────────────────────────────────
// Team code printed on the SV Albatros "Senior Team" poster in e2e flows.
export const E2E_TEAM_JOIN_CODE = 'SVAB2345HX'

/** Mirrors /me's pendingJoinRequest / pendingClubClaim for e2e personas. */
export function getE2EPendingState(session: E2ESessionSnapshot | null): {
  pendingJoinRequest: { id: string; clubId: string } | null
  pendingClubClaim: { id: string; status: 'SUBMITTED' | 'NEEDS_INFO' } | null
} {
  if (!session) return { pendingJoinRequest: null, pendingClubClaim: null }
  const request = (session.api?.joinRequests ?? []).find(
    (row) => row.user.id === session.user.id && row.status === 'PENDING',
  )
  const claim =
    e2eClaim && (e2eClaim.status === 'SUBMITTED' || e2eClaim.status === 'NEEDS_INFO')
      ? { id: e2eClaim.id, status: e2eClaim.status }
      : null
  return {
    pendingJoinRequest: request ? { id: request.id, clubId: CLUB_ID } : null,
    pendingClubClaim: claim,
  }
}

function createOnboardingJoinRequest(role: 'PLAYER' | 'PARENT') {
  const session = currentSession
  if (!session) return null
  const existing = session.api.joinRequests.find((r) => r.user.id === session.user.id)
  const request = {
    id: existing?.id ?? `join-request-${session.user.id}`,
    role,
    message: null,
    status: 'PENDING' as const,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: new Date().toISOString(),
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
  }
  if (existing) Object.assign(existing, request)
  else session.api.joinRequests.unshift(request)
  persistCurrentSession()
  emitSession(session)
  return request
}

function createOnboardingStaffClaim() {
  const club = createClub()
  e2eClaim = {
    id: 'claim-e2e-staff-1',
    status: 'SUBMITTED',
    reviewNote: null,
    expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    escalatesAt: null,
    directoryEntry: { name: club.name, city: 'Berlin', badgeUrl: null },
    kind: 'STAFF_CLAIM',
    club: { id: CLUB_ID, name: club.name, badgeUrl: null },
  }
  if (currentSession) emitSession(currentSession)
  return e2eClaim
}

function handleOnboardingRequest(
  method: string,
  pathname: string,
  rawBody: unknown,
): E2EApiResponse | null {
  if (!currentSession) return null
  const body = (rawBody || {}) as Record<string, unknown>

  if (method === 'PATCH' && pathname === '/me') {
    const user = currentSession.user
    // onboarding review fixes: mirror the server's age rules (B1/M3). New
    // accounts give a DOB; under 13 is refused, 13-15 go to the handoff.
    if (body.confirmAdult === true && !user.adultConfirmedAt) {
      return { handled: true, ok: false, status: 400, code: 'DOB_REQUIRED', message: 'A date of birth is required' }
    }
    if (typeof body.dateOfBirth === 'string' && !user.dateOfBirth) {
      const age = e2eAgeFrom(body.dateOfBirth)
      const isMember = (currentSession.memberships ?? []).length > 0
      if (age < 13) {
        return { handled: true, ok: false, status: 403, code: 'UNDER_13', message: 'Under 13' }
      }
      if (age < 16 && !isMember) {
        return { handled: true, ok: false, status: 403, code: 'UNDER_16_HANDOFF', message: 'Under 16' }
      }
    }
    if (typeof body.name === 'string') user.name = body.name
    if (typeof body.dateOfBirth === 'string') user.dateOfBirth = body.dateOfBirth
    if (typeof body.registrationRole === 'string') {
      user.registrationRole = body.registrationRole as RegistrationRole
    }
    persistCurrentSession()
    emitSession(currentSession)
    return { handled: true, ok: true, status: 200, body: clone(user) }
  }

  const byCode = pathname.match(/^\/teams\/by-code\/([^/]+)$/)
  if (method === 'GET' && byCode) {
    if (byCode[1].toUpperCase() !== E2E_TEAM_JOIN_CODE) {
      return { handled: true, ok: false, status: 404, message: 'Team not found for this code' }
    }
    const club = createClub()
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        team: { id: TEAM_ID, name: TEAM_DISPLAY_NAME, displayName: TEAM_DISPLAY_NAME, clubId: CLUB_ID },
        club: { id: CLUB_ID, name: club.name, badgeUrl: null, primaryColor: CLUB_PRIMARY },
      },
    }
  }

  if (method === 'POST' && pathname === '/onboarding/join-team') {
    if (String(body.joinCode ?? '').toUpperCase() !== E2E_TEAM_JOIN_CODE) {
      return { handled: true, ok: false, status: 404, message: 'Team not found for this code' }
    }
    if (body.role === 'COACH') createOnboardingStaffClaim()
    else createOnboardingJoinRequest('PLAYER')
    return {
      handled: true,
      ok: true,
      status: 201,
      body: { ok: true, clubId: CLUB_ID, teamId: TEAM_ID, status: 'PENDING' },
    }
  }

  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/join-requests`) {
    const role = body.role === 'PARENT' ? 'PARENT' : 'PLAYER'
    const request = createOnboardingJoinRequest(role)
    return {
      handled: true,
      ok: true,
      status: 201,
      body: { id: request?.id, clubId: CLUB_ID, status: 'PENDING' },
    }
  }

  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/staff-access-requests`) {
    const claim = createOnboardingStaffClaim()
    return { handled: true, ok: true, status: 201, body: { id: claim.id } }
  }

  if (method === 'GET' && pathname === '/me/join-requests/active') {
    const session = currentSession
    const request = session.api.joinRequests.find(
      (row) => row.user.id === session.user.id && row.status === 'PENDING',
    )
    const club = createClub()
    // M2: the last decision once nothing is pending (declined with a reason).
    const decided = request
      ? null
      : session.api.joinRequests.find(
          (row) =>
            row.user.id === session.user.id &&
            (row.status === 'REJECTED' || row.status === 'APPROVED'),
        )
    const lastDecision = decided
      ? {
          id: decided.id,
          clubId: CLUB_ID,
          status: decided.status,
          reason:
            decided.status === 'REJECTED'
              ? 'Der Kader der Herren ist gerade voll. Komm gern zum Probetraining im Sommer.'
              : null,
          decidedAt: new Date().toISOString(),
          club: { id: CLUB_ID, name: club.name, badgeUrl: null, primaryColor: CLUB_PRIMARY },
        }
      : null
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        lastDecision,
        request: request
          ? {
              id: request.id,
              clubId: CLUB_ID,
              status: request.status,
              role: request.role,
              createdAt: request.createdAt,
              club: {
                id: CLUB_ID,
                name: club.name,
                slug: club.slug,
                badgeUrl: null,
                primaryColor: CLUB_PRIMARY,
              },
            }
          : null,
      },
    }
  }

  if (method === 'POST' && pathname === '/me/parent-handoff') {
    const guardian = String(body.guardianEmail ?? '').trim().toLowerCase()
    if (guardian && guardian === String(currentSession.user.email ?? '').toLowerCase()) {
      return { handled: true, ok: false, status: 400, code: 'GUARDIAN_IS_CHILD', message: 'Own email' }
    }
    return { handled: true, ok: true, status: 201, body: { sent: true, code: null } }
  }

  // H5: a guardian's setup code (E2E code AB23CD45), with and without a team.
  const handoffTeam = pathname.match(/^\/parent-handoff\/([^/]+)\/team\/([^/]+)$/)
  const handoffPreview = pathname.match(/^\/parent-handoff\/([^/]+)$/)
  if (method === 'GET' && (handoffTeam || handoffPreview)) {
    const code = (handoffTeam ?? handoffPreview)![1].toUpperCase()
    if (code !== 'AB23CD45') {
      return { handled: true, ok: false, status: 404, message: 'Invalid setup code' }
    }
    const club = createClub()
    const teamPreview = {
      team: { id: TEAM_ID, clubId: CLUB_ID, name: TEAM_DISPLAY_NAME, displayName: TEAM_DISPLAY_NAME },
      club: { id: CLUB_ID, name: club.name, badgeUrl: null, primaryColor: CLUB_PRIMARY },
      rosterSlots: [{ id: 'slot-e2e-lena', fullName: 'Lena Weber', position: 'MID', jerseyNumber: 14 }],
    }
    if (handoffTeam) {
      return handoffTeam[2].toUpperCase() === E2E_TEAM_JOIN_CODE
        ? { handled: true, ok: true, status: 200, body: teamPreview }
        : { handled: true, ok: false, status: 404, message: 'Team not found for this code' }
    }
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { childFirstName: 'Lena', childDateOfBirth: '2012-05-14T00:00:00.000Z', team: teamPreview },
    }
  }

  if (method === 'GET' && pathname === '/clubs/lookup') {
    const club = createClub()
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        id: CLUB_ID,
        name: club.name,
        slug: club.slug,
        badgeUrl: null,
        primaryColor: CLUB_PRIMARY,
        teams: [
          { id: TEAM_ID, name: TEAM_DISPLAY_NAME, displayName: TEAM_DISPLAY_NAME },
          { id: 'team-e2e-u17', name: 'B-Jugend (U17)', displayName: 'B-Jugend (U17)' },
        ],
      },
    }
  }

  return null
}
function e2eAgeFrom(iso: string): number {
  const dob = new Date(iso)
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1
  return age
}
// ── end onboarding revamp ──────────────────────────────────────────────────

function createClubSearchRows() {
  return [
    {
      id: CLUB_ID,
      activeClubId: CLUB_ID,
      directoryEntryId: null,
      source: 'ANSTOSS',
      isActive: true,
      name: 'SV Albatros',
      slug: 'sv-albatros',
      badgeUrl: null,
      primaryColor: CLUB_PRIMARY,
      city: 'Berlin',
      state: 'Berlin',
      association: 'Berliner FV',
      memberCount: 126,
    },
    {
      id: 'dir-e2e-tsv-linden',
      activeClubId: null,
      directoryEntryId: 'dir-e2e-tsv-linden',
      source: 'FUSSBALL_DE',
      isActive: false,
      name: 'TSV Linden 1899',
      slug: 'tsv-linden-1899',
      badgeUrl: null,
      primaryColor: '#1E3A5F',
      city: 'Potsdam',
      state: 'Brandenburg',
      association: 'FLB',
      memberCount: 0,
    },
    {
      id: 'dir-e2e-fc-neukoelln',
      activeClubId: null,
      directoryEntryId: 'dir-e2e-fc-neukoelln',
      source: 'DFBNET',
      isActive: false,
      name: 'FC Neukolln Amateure',
      slug: 'fc-neukoelln-amateure',
      badgeUrl: null,
      primaryColor: '#C4372C',
      city: 'Berlin',
      state: 'Berlin',
      association: 'Berliner FV',
      memberCount: 0,
    },
  ]
}

function createPublicClub(slug: string) {
  const club = createClubSearchRows().find((row) => row.slug === slug)
  if (!club) return null
  return {
    ...club,
    id: club.isActive ? club.activeClubId : club.id,
    teamCount: club.isActive ? 3 : 0,
  }
}

function createPublicInvite(code: string) {
  const club = createClub()
  return {
    code,
    expiresAt: nowIso(14, 23, 59),
    kind: 'MEMBER_INVITE',
    role: 'PLAYER',
    phase: code.toUpperCase().includes('TRIAL') ? 'TRIAL' : 'FULL',
    status: 'PENDING',
    club,
    team: {
      id: TEAM_ID,
      displayName: TEAM_DISPLAY_NAME,
      squadLabel: '1. Mannschaft',
      leagueName: null,
      group: {
        id: 'group-e2e-senior',
        displayName: 'Senior',
        type: 'SENIOR',
      },
    },
    installUrls: {
      ios: 'https://apps.apple.com/app/anstoss',
      android: 'https://play.google.com/store/apps/details?id=com.renuirug.anstoss',
    },
  }
}

function activateMembershipFromSetup(input: {
  clubName: string
  primaryColor: string
  teamName: string
  ageGroup: string
}) {
  if (!currentSession) return
  const club = createClub({
    name: input.clubName,
    slug: slugifyClubName(input.clubName),
    primaryColor: input.primaryColor,
  })
  const team = {
    id: TEAM_ID,
    name: input.teamName,
    displayName: input.teamName,
    clubId: CLUB_ID,
    ageGroup: input.ageGroup,
  }

  currentSession.user = {
    ...currentSession.user,
    registrationRole: RegistrationRole.CLUB_ADMIN,
    dateOfBirth: currentSession.user.dateOfBirth ?? '1995-05-15',
  }
  currentSession.memberships = [createMembership(MembershipRole.OWNER, club)]
  currentSession.teamMembers = [createTeamMember(TeamRole.HEAD_COACH, team)]
  currentSession.needsOnboarding = false
  currentSession.api.linkedTeams = createLinkedTeams()
  currentSession.api.clubStats = createClubStats()
  currentSession.api.rosterOps = createRosterOps()
  e2eTeamGroups = [
    {
      id: 'group-e2e-senior',
      displayName: input.ageGroup || 'Senior',
      type: 'COMPETITIVE',
      teams: [
        {
          id: TEAM_ID,
          displayName: input.teamName,
          squadLabel: input.teamName,
          leagueName: null,
          memberCount: 1,
          coachAssignments: {
            headCoach: {
              userId: currentSession.user.id,
              name: currentSession.user.name,
              avatarUrl: currentSession.user.avatarUrl,
            },
            assistants: [],
          },
        },
      ],
    },
  ]
  emitSession(currentSession)
  persistCurrentSession()
}

function activateMembershipFromInvite() {
  if (!currentSession) return null
  const club = createClub()
  const membership = createMembership(MembershipRole.PLAYER, club)
  const teamAccess = createTeamMember(TeamRole.PLAYER)
  currentSession.user = {
    ...currentSession.user,
    registrationRole: currentSession.user.registrationRole ?? RegistrationRole.PLAYER,
    dateOfBirth: currentSession.user.dateOfBirth ?? '1998-05-15',
  }
  currentSession.memberships = [membership]
  currentSession.teamMembers = [teamAccess]
  currentSession.needsOnboarding = false
  emitSession(currentSession)
  persistCurrentSession()
  return { membership, teamAccess, club, team: teamAccess.team }
}

// ─── Events revamp mocks (2026-09) ──────────────────────────────────────────
// One block owns the event flow: feed (with logistics), detail (EventDetail
// contract), RSVP incl. reasons/notes/child answers, Kader, Aufstellung and
// Fahrten keyed by event. Runs before the older generic handlers below.

const E2E_REPLY_REASONS: Array<{ reason: string; note: string | null }> = [
  { reason: 'injured', note: 'Knie zwickt noch' },
  { reason: 'work', note: 'Spätschicht' },
  { reason: 'vacation', note: null },
  { reason: 'sick', note: null },
  { reason: 'suspended', note: '5. Gelbe' },
  { reason: 'personal', note: null },
]

function ensureEventFlow(): E2EEventFlowState {
  const api = currentSession!.api
  if (!api.eventFlow) {
    api.eventFlow = { replies: {}, squadPublishedAt: {}, lineups: {}, rides: {} }
    const away = api.events.find((event) => event.id === 'event-match-away')
    if (away) {
      const meetingMs = new Date(away.meetingAt ?? away.date).getTime()
      api.eventFlow.rides[away.id] = [
        {
          id: 'e2e-ride-thomas',
          driverId: 'user-driver-thomas',
          driverName: 'Thomas Hoffmann',
          seats: 3,
          departFrom: 'Vereinsheim',
          departAt: new Date(meetingMs - 15 * 60000).toISOString(),
          note: 'Kombi, Platz für Taschen.',
          passengers: [{ userId: 'user-player-2', name: 'Tim Weber' }],
          createdAt: nowIso(-1, 18, 0),
        },
        {
          id: 'e2e-ride-sabine',
          driverId: 'user-driver-sabine',
          driverName: 'Sabine Becker',
          seats: 2,
          departFrom: 'Kaufland-Parkplatz',
          departAt: new Date(meetingMs - 20 * 60000).toISOString(),
          note: null,
          passengers: [],
          createdAt: nowIso(-1, 19, 0),
        },
      ]
    }
  }
  return api.eventFlow
}

function eventFlowMembers(): EventSquadMember[] {
  const squad = currentSession!.api.squadStats.map((player) => ({
    userId: player.userId,
    name: player.name,
    avatarUrl: null,
    jerseyNumber: player.jerseyNumber,
    position: player.position,
  }))
  if (currentSession!.scenario !== 'parent') return squad
  return [
    ...squad,
    ...E2E_PARENT_KIDS.map((kid) => ({
      userId: kid.userId,
      name: kid.name,
      avatarUrl: null,
      jerseyNumber: null,
      position: null,
    })),
  ]
}

function findFlowEvent(eventId: string): EventFeedItem | null {
  const api = currentSession!.api
  return (
    api.events.find((event) => event.id === eventId) ??
    (api.parentEvents.find((event) => event.id === eventId) as EventFeedItem | undefined) ??
    null
  )
}

/** Seed replies for an event from its feed counts; the persona's own answer wins. */
function ensureReplies(event: EventFeedItem): E2EEventReply[] {
  const flow = ensureEventFlow()
  const existing = flow.replies[event.id]
  if (existing) return existing

  const selfId = currentSession!.user.id
  const members = eventFlowMembers().filter(
    (member) => member.userId !== selfId && !E2E_PARENT_KIDS.some((kid) => kid.userId === member.userId),
  )
  // Anna is injured all season: she leads the NO bucket when there is one.
  const ordered = [...members].sort((a, b) =>
    a.userId === 'user-player-4' ? 1 : b.userId === 'user-player-4' ? -1 : 0,
  )
  let yes = event.yesCount ?? 0
  let maybe = event.maybeCount ?? 0
  let no = event.noCount ?? 0
  if (event.myRsvp && eventFlowMembers().some((member) => member.userId === selfId)) {
    if (event.myRsvp === 'YES') yes = Math.max(0, yes - 1)
    if (event.myRsvp === 'MAYBE') maybe = Math.max(0, maybe - 1)
    if (event.myRsvp === 'NO') no = Math.max(0, no - 1)
  }
  const updatedAt = event.createdAt ?? nowIso(-1, 12, 0)
  const replies: E2EEventReply[] = []
  // Kader revamp: everyone the Kader marks verletzt / gesperrt / Urlaub
  // leads the NO bucket, so RSVPs agree with the squad's availability.
  const unavailable = new Set(e2eUnavailableSquadIds())
  const noPool = ordered.filter((member) => unavailable.has(member.userId))
  const rest = ordered.filter((member) => !unavailable.has(member.userId))
  const noMembers = [...noPool, ...rest.slice(rest.length - Math.max(0, no - noPool.length))].slice(0, no)
  const others = rest.filter((member) => !noMembers.includes(member))
  others.slice(0, yes).forEach((member) =>
    replies.push({ userId: member.userId, status: 'YES', reason: null, note: null, nominated: false, updatedAt }),
  )
  others.slice(yes, yes + maybe).forEach((member) =>
    replies.push({
      userId: member.userId,
      status: 'MAYBE',
      reason: null,
      note: 'Komme evtl. später',
      nominated: false,
      updatedAt,
    }),
  )
  noMembers.forEach((member, index) => {
    const reason =
      e2eKaderReplyReason(member.userId) ?? E2E_REPLY_REASONS[index % E2E_REPLY_REASONS.length]
    replies.push({
      userId: member.userId,
      status: 'NO',
      reason: reason.reason,
      note: reason.note,
      nominated: false,
      updatedAt,
    })
  })
  // The persona's own answer (players are on the squad list).
  if (event.myRsvp && eventFlowMembers().some((member) => member.userId === selfId)) {
    replies.push({ userId: selfId, status: event.myRsvp, reason: null, note: null, nominated: false, updatedAt })
  }
  // Parent persona children: take the seeded child answers from the parent feed.
  for (const row of currentSession!.api.parentEvents) {
    if (row.id === event.id && row.childUserId && row.childRsvp) {
      replies.push({
        userId: row.childUserId,
        status: row.childRsvp,
        reason: null,
        note: null,
        nominated: false,
        updatedAt,
      })
    }
  }
  // A published Kader: every YES plus the persona player, capped at 16.
  if (event.squadPublishedAt) {
    flow.squadPublishedAt[event.id] = event.squadPublishedAt
    replies
      .filter((reply) => reply.status === 'YES')
      .slice(0, 16)
      .forEach((reply) => {
        reply.nominated = true
      })
    const self = replies.find((reply) => reply.userId === selfId)
    if (self) self.nominated = true
  }
  flow.replies[event.id] = replies
  return replies
}

function syncFeedCounts(eventId: string) {
  const api = currentSession!.api
  const replies = ensureEventFlow().replies[eventId] ?? []
  const selfId = currentSession!.user.id
  const self = replies.find((reply) => reply.userId === selfId)
  const apply = (event: EventFeedItem) => {
    event.yesCount = replies.filter((reply) => reply.status === 'YES').length
    event.maybeCount = replies.filter((reply) => reply.status === 'MAYBE').length
    event.noCount = replies.filter((reply) => reply.status === 'NO').length
    event.responseCount = replies.length
    if (self) event.myRsvp = self.status
    event.myNominated = Boolean(self?.nominated)
    event.squadPublishedAt = ensureEventFlow().squadPublishedAt[eventId] ?? event.squadPublishedAt ?? null
  }
  api.events.filter((event) => event.id === eventId).forEach(apply)
  api.parentEvents.filter((event) => event.id === eventId).forEach((row) => {
    apply(row)
    row.myRsvp = null
    const child = replies.find((reply) => reply.userId === row.childUserId)
    row.childRsvp = child?.status ?? null
  })
}

function withEventLogistics<T extends EventFeedItem>(event: T): T {
  return { ...EVENT_LOGISTICS_DEFAULTS, ...event }
}

function buildCarpoolBoard(eventId: string): CarpoolBoard {
  const selfId = currentSession!.user.id
  const rides = ensureEventFlow().rides[eventId] ?? []
  return {
    eventId,
    rides: rides.map(
      (ride): CarpoolRideItem => ({
        id: ride.id,
        eventId,
        driver: { id: ride.driverId, name: ride.driverName, avatarUrl: null },
        seats: ride.seats,
        departFrom: ride.departFrom,
        departAt: ride.departAt,
        note: ride.note,
        passengers: clone(ride.passengers),
        isMine: ride.driverId === selfId,
        createdAt: ride.createdAt,
      }),
    ),
  }
}

function buildEventSquad(event: EventFeedItem): EventSquad {
  const replies = ensureReplies(event)
  const members = eventFlowMembers()
  return {
    eventId: event.id,
    publishedAt: ensureEventFlow().squadPublishedAt[event.id] ?? null,
    // Events review (H1): an Absage drops the nomination; the coach sees why.
    nominatedUserIds: replies
      .filter((reply) => reply.nominated && reply.status !== 'NO')
      .map((reply) => reply.userId),
    candidates: members.flatMap((member) => {
      const reply = replies.find((entry) => entry.userId === member.userId)
      return reply && (reply.status === 'YES' || reply.status === 'MAYBE')
        ? [{ ...member, rsvp: reply.status, reason: reply.reason }]
        : []
    }),
    dropouts: replies
      .filter((reply) => reply.nominated && reply.status === 'NO')
      .map((reply) => ({
        userId: reply.userId,
        name: members.find((member) => member.userId === reply.userId)?.name ?? '',
        cause: 'declined' as const,
        reason: reply.reason ?? null,
        at: null,
      })),
  }
}

function buildEventDetail(event: EventFeedItem): EventDetail {
  const session = currentSession!
  const replies = ensureReplies(event)
  syncFeedCounts(event.id)
  const members = eventFlowMembers()
  const selfId = session.user.id
  const canManage = session.scenario === 'coach' || session.scenario === 'club-admin'
  const isGuardian = session.scenario === 'parent'
  const nameOf = (userId: string) =>
    members.find((member) => member.userId === userId)?.name ??
    (userId === selfId ? session.user.name : 'Spieler')
  const kidIds = new Set<string>(E2E_PARENT_KIDS.map((kid) => kid.userId))
  const rsvps: EventRsvpEntry[] = replies.map((reply) => {
    const visible = canManage || reply.userId === selfId || (isGuardian && kidIds.has(reply.userId))
    return {
      id: `rsvp-${event.id}-${reply.userId}`,
      userId: reply.userId,
      status: reply.status,
      reason: visible ? reply.reason : null,
      note: visible ? reply.note : null,
      nominated: reply.nominated,
      updatedAt: reply.updatedAt,
      user: { id: reply.userId, name: nameOf(reply.userId), avatarUrl: null },
    }
  })
  const children: EventGuardedChild[] = isGuardian
    ? session.api.parentEvents
        .filter((row) => row.id === event.id && row.childUserId)
        .map((row) => {
          const reply = replies.find((entry) => entry.userId === row.childUserId)
          return {
            userId: row.childUserId!,
            name: row.childName ?? '',
            teamName: row.teamDisplayName || row.teamName || null,
            rsvp: reply?.status ?? null,
            reason: reply?.reason ?? null,
            note: reply?.note ?? null,
            nominated: reply?.nominated ?? false,
          }
        })
    : []
  const self = replies.find((reply) => reply.userId === selfId)
  const feed = withEventLogistics(event)
  return {
    ...feed,
    team: { id: event.teamId, name: TEAM_DISPLAY_NAME },
    rsvps,
    myRsvp: self?.status ?? (isGuardian ? null : event.myRsvp),
    myRsvpReason: self?.reason ?? null,
    myRsvpNote: self?.note ?? null,
    myRsvpStale: Boolean(event.myRsvpStale),
    myNominated: Boolean(self?.nominated),
    myCheckInAt: null,
    reminderEnabled: false,
    lastRsvpReminderAt: null,
    teamMemberCount: members.length,
    readiness: event.readiness ?? null,
    squadPublishedAt: ensureEventFlow().squadPublishedAt[event.id] ?? null,
    members,
    children,
    viewer: {
      canManage,
      isPlayer: session.scenario === 'player',
      isGuardian,
    },
    lineup: ensureEventFlow().lineups[event.id] ?? null,
    carpoolRideCount: (ensureEventFlow().rides[event.id] ?? []).length,
  }
}

type E2EEventLogisticsBody = {
  title?: string | null
  type?: EventFeedItem['type']
  date?: string
  teamId?: string
  location?: string | null
  notes?: string | null
  meetingAt?: string | null
  meetingPoint?: string | null
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  carpoolEnabled?: boolean
  durationMin?: number | null
  scope?: 'this' | 'following'
  repeat?: { intervalWeeks?: number; until?: string; weekdays?: number[] }
}

function logisticsFromBody(body: E2EEventLogisticsBody) {
  return {
    meetingAt: body.meetingAt ?? null,
    meetingPoint: body.meetingPoint ?? null,
    opponent: body.opponent ?? null,
    homeAway: body.homeAway ?? null,
    carpoolEnabled: body.carpoolEnabled ?? false,
    durationMin: body.durationMin ?? null,
  }
}

function newFeedEvent(body: E2EEventLogisticsBody, id: string, date: string): EventFeedItem {
  return {
    ...EVENT_LOGISTICS_DEFAULTS,
    id,
    teamId: body.teamId ?? TEAM_ID,
    clubId: CLUB_ID,
    // Derived titles (events review L7/M6): no typed title = autoTitle.
    title: body.title?.trim() || body.opponent?.trim() || 'Training',
    autoTitle: !body.title?.trim(),
    type: body.type ?? 'TRAINING',
    date,
    location: body.location ?? null,
    notes: body.notes ?? null,
    createdById: currentSession!.user.id,
    createdAt: new Date().toISOString(),
    archivedAt: null,
    responseCount: 0,
    yesCount: 0,
    maybeCount: 0,
    noCount: 0,
    myRsvp: null,
    ...logisticsFromBody(body),
  }
}

function applyLogisticsPatch(target: EventFeedItem, body: E2EEventLogisticsBody, meetingOffsetMs: number | null) {
  if (body.meetingPoint !== undefined) target.meetingPoint = body.meetingPoint
  if (body.opponent !== undefined) target.opponent = body.opponent
  if (body.homeAway !== undefined) target.homeAway = body.homeAway
  if (body.carpoolEnabled !== undefined) target.carpoolEnabled = body.carpoolEnabled
  if (body.durationMin !== undefined) target.durationMin = body.durationMin
  if (body.meetingAt === null) target.meetingAt = null
  else if (meetingOffsetMs !== null) {
    target.meetingAt = new Date(new Date(target.date).getTime() - meetingOffsetMs).toISOString()
  }
}

function handleEventFlowRequest(
  method: string,
  pathname: string,
  query: URLSearchParams | null,
  options: { method: string; body?: unknown },
): E2EApiResponse | null {
  const session = currentSession
  if (!session) return null
  const api = session.api
  const base = `/clubs/${CLUB_ID}/events`

  // Parent feed: one row per (event, child), childRsvp read from the replies.
  if (method === 'GET' && pathname === '/me/children-events') {
    const rows = api.parentEvents.map((row) => {
      const flow = ensureEventFlow()
      const replies = flow.replies[row.id]
      const child = replies?.find((reply) => reply.userId === row.childUserId)
      return withEventLogistics({ ...row, childRsvp: replies ? child?.status ?? null : row.childRsvp })
    })
    return { handled: true, ok: true, status: 200, body: clone(rows) }
  }

  // home revamp: parent home overview, same shape as GET /me/children-overview
  // (ChildrenOverview). Leo plays U15 (and the senior team's event), Mia U11;
  // duties are TeamDutyAssignment rows, one of them the parent's own.
  if (method === 'GET' && pathname === '/me/children-overview') {
    const stamp = nowIso(-2, 12, 0)
    const dutyRow = (
      id: string,
      teamId: string,
      teamName: string,
      assigned: { id: string; name: string },
      kind: 'JERSEY_CLEANUP' | 'LOCKER_ROOM' | 'BIB_CLEANUP',
      dueDate: string,
      childUserId: string | null,
    ) => ({
      id,
      clubId: CLUB_ID,
      teamId,
      assignedUserId: assigned.id,
      createdById: 'user-coach-1',
      kind,
      status: 'PENDING' as const,
      dueDate,
      notes: null,
      completedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
      assignedUser: { id: assigned.id, name: assigned.name, avatarUrl: null },
      teamName,
      childUserId,
    })
    const [leo, mia] = E2E_PARENT_KIDS
    const body = {
      children: [
        // photoConsent: 2026-11 redesign home contract (schemas/home.ts)
        { userId: leo.userId, name: leo.name, teams: [{ id: TEAM_ID, name: 'U15', displayName: 'U15 I' }], photoConsent: 'PENDING' as const },
        { userId: mia.userId, name: mia.name, teams: [{ id: 'team-u11', name: 'U11', displayName: 'U11 I' }], photoConsent: 'GRANTED' as const },
      ],
      duties: [
        dutyRow('duty-parent-kit', TEAM_ID, 'U15 I', { id: session.user.id, name: session.user.name }, 'JERSEY_CLEANUP', nowIso(3, 18, 0), null),
        dutyRow('duty-mia-locker', 'team-u11', 'U11 I', { id: mia.userId, name: mia.name }, 'LOCKER_ROOM', nowIso(5, 19, 0), mia.userId),
      ],
      announcements: [
        {
          id: 'ann-parent-1',
          title: 'Elternabend U15 am Donnerstag',
          body: 'Wir besprechen die Fahrgemeinschaften für die Rückrunde. 19 Uhr im Vereinsheim.',
          createdAt: nowIso(-1, 20, 0),
          teamId: TEAM_ID,
          teamName: 'U15 I',
        },
        {
          id: 'ann-parent-2',
          title: 'Sommerfest SV Albatros',
          body: 'Samstag ab 14 Uhr, Kuchenspenden gern gesehen.',
          createdAt: nowIso(-3, 10, 0),
          teamId: null,
          teamName: null,
        },
      ],
    }
    return { handled: true, ok: true, status: 200, body: clone(body) }
  }

  // Feed with type + limit (create-event prefills from the last training).
  if (method === 'GET' && pathname === base) {
    const scope = query?.get('scope') ?? 'upcoming'
    const typeFilter = query?.get('type') ?? null
    const limit = Number.parseInt(query?.get('limit') ?? '', 10)
    const now = new Date()
    const archiveCutoff = new Date(now)
    archiveCutoff.setDate(archiveCutoff.getDate() - 3)
    let filtered = api.events.filter((event) => {
      const eventDate = new Date(event.date)
      return scope === 'past'
        ? eventDate < now && (typeFilter === 'TRAINING' || eventDate >= archiveCutoff)
        : eventDate >= now
    })
    if (typeFilter) filtered = filtered.filter((event) => event.type === typeFilter)
    filtered.sort((a, b) =>
      scope === 'past'
        ? new Date(b.date).getTime() - new Date(a.date).getTime()
        : new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    if (Number.isFinite(limit) && limit > 0) filtered = filtered.slice(0, limit)
    filtered.forEach((event) => {
      ensureReplies(event)
      syncFeedCounts(event.id)
    })
    return { handled: true, ok: true, status: 200, body: clone(filtered.map(withEventLogistics)) }
  }

  // Recurring: one row per chosen weekday per week (Mon-based weeks).
  if (method === 'POST' && pathname === `${base}/series`) {
    const body = (options.body ?? {}) as E2EEventLogisticsBody
    const seriesId = `series-e2e-${Date.now().toString(36)}`
    const first = new Date(body.date ?? nowIso(1, 19, 0))
    const until = new Date(body.repeat?.until ?? first.toISOString())
    const interval = body.repeat?.intervalWeeks === 2 ? 2 : 1
    const weekdays = Array.from(new Set(body.repeat?.weekdays?.length ? body.repeat.weekdays : [first.getDay()])).sort()
    const meetingOffsetMs = body.meetingAt ? first.getTime() - new Date(body.meetingAt).getTime() : null
    const weekStart = new Date(first)
    weekStart.setDate(first.getDate() - ((first.getDay() + 6) % 7))
    const created: EventFeedItem[] = []
    for (let week = 0; created.length < 20 && week < 60; week += interval) {
      for (const weekday of weekdays) {
        const at = new Date(weekStart)
        at.setDate(weekStart.getDate() + week * 7 + ((weekday + 6) % 7))
        at.setHours(first.getHours(), first.getMinutes(), 0, 0)
        if (at < first || at > until || created.length >= 20) continue
        const event = newFeedEvent(body, `event-e2e-${seriesId}-${created.length}`, at.toISOString())
        event.seriesId = seriesId
        event.series = { id: seriesId, intervalWeeks: interval, until: until.toISOString(), weekdays }
        event.meetingAt =
          meetingOffsetMs !== null ? new Date(at.getTime() - meetingOffsetMs).toISOString() : null
        created.push(event)
      }
      const nextWeek = new Date(weekStart)
      nextWeek.setDate(weekStart.getDate() + (week + interval) * 7)
      if (nextWeek > until) break
    }
    api.events.unshift(...created)
    return { handled: true, ok: true, status: 201, body: { seriesId, events: clone(created) } }
  }

  if (method === 'POST' && pathname === base) {
    const body = (options.body ?? {}) as E2EEventLogisticsBody
    const created = newFeedEvent(body, `event-e2e-${Date.now().toString(36)}`, body.date ?? nowIso(1, 18, 0))
    api.events.unshift(created)
    return { handled: true, ok: true, status: 201, body: clone(created) }
  }

  const detailMatch = pathname.match(new RegExp(`^${base}/([^/]+)$`))
  if (method === 'GET' && detailMatch) {
    const event = findFlowEvent(detailMatch[1])
    if (!event) return { handled: true, ok: false, status: 404, message: 'Event not found in mock data' }
    return { handled: true, ok: true, status: 200, body: clone(buildEventDetail(event)) }
  }

  if (method === 'PATCH' && detailMatch) {
    const event = api.events.find((entry) => entry.id === detailMatch[1])
    if (!event) return { handled: true, ok: false, status: 404, message: 'Event not found' }
    const body = (options.body ?? {}) as E2EEventLogisticsBody
    const nextDate = body.date ?? event.date
    const meetingOffsetMs =
      body.meetingAt ? new Date(nextDate).getTime() - new Date(body.meetingAt).getTime() : null
    if (body.scope === 'following' && event.seriesId) {
      const shift = body.date !== undefined ? new Date(body.date).getTime() - new Date(event.date).getTime() : 0
      api.events
        .filter((e) => e.seriesId === event.seriesId && e.id !== event.id && new Date(e.date) > new Date(event.date))
        .forEach((e) => {
          if (body.title !== undefined) {
            e.title = body.title ?? e.opponent ?? 'Training'
            e.autoTitle = body.title === null
          }
          if (body.location !== undefined) e.location = body.location
          if (body.notes !== undefined) e.notes = body.notes
          if (shift !== 0) {
            e.date = new Date(new Date(e.date).getTime() + shift).toISOString()
            e.rescheduledAt = new Date().toISOString()
          }
          applyLogisticsPatch(e, body, meetingOffsetMs)
        })
    }
    if (body.title !== undefined) {
      event.title = body.title ?? event.opponent ?? 'Training'
      event.autoTitle = body.title === null
    }
    if (body.type !== undefined) event.type = body.type
    if (body.date !== undefined && body.date !== event.date) {
      event.date = body.date
      event.rescheduledAt = new Date().toISOString()
      event.myRsvpStale = Boolean(event.myRsvp)
    }
    if (body.location !== undefined) event.location = body.location ?? null
    if (body.notes !== undefined) event.notes = body.notes ?? null
    applyLogisticsPatch(event, body, meetingOffsetMs)
    return { handled: true, ok: true, status: 200, body: clone(withEventLogistics(event)) }
  }

  // RSVP (self or a child) and the older rsvp-proxy route.
  const rsvpMatch = pathname.match(new RegExp(`^${base}/([^/]+)/(rsvp|rsvp-proxy)$`))
  if (method === 'PUT' && rsvpMatch) {
    const event = findFlowEvent(rsvpMatch[1])
    if (!event) return { handled: true, ok: false, status: 404, message: 'Event not found' }
    if (event.cancelledAt) {
      return { handled: true, ok: false, status: 400, message: 'Cannot RSVP to a cancelled event' }
    }
    const body = (options.body ?? {}) as {
      status?: 'YES' | 'MAYBE' | 'NO'
      reason?: string
      note?: string
      childUserId?: string
    }
    if (!body.status) return { handled: true, ok: false, status: 400, message: 'status is required' }
    const kids = session.scenario === 'parent' ? api.parentEvents.filter((row) => row.id === event.id) : []
    if (session.scenario === 'parent' && !body.childUserId && kids.length > 1) {
      return { handled: true, ok: false, status: 400, message: 'childUserId is required' }
    }
    const userId = body.childUserId ?? (kids.length === 1 ? kids[0].childUserId! : session.user.id)
    const replies = ensureReplies(event)
    const reason = body.status === 'NO' ? (body.reason === 'injury' ? 'injured' : body.reason ?? null) : null
    const note = body.note?.trim() ? body.note.trim() : null
    const existing = replies.find((reply) => reply.userId === userId)
    if (existing) {
      existing.status = body.status
      existing.reason = reason
      existing.note = note
      existing.updatedAt = new Date().toISOString()
    } else {
      replies.push({ userId, status: body.status, reason, note, nominated: false, updatedAt: new Date().toISOString() })
    }
    if (userId === session.user.id) {
      api.events.filter((e) => e.id === event.id).forEach((e) => {
        e.myRsvp = body.status!
        e.myRsvpStale = false
      })
    }
    syncFeedCounts(event.id)
    return { handled: true, ok: true, status: 200, body: { eventId: event.id, userId, status: body.status } }
  }

  // Kader: candidates are YES/MAYBE replies; publish stamps publishedAt.
  const squadMatch = pathname.match(new RegExp(`^${base}/([^/]+)/squad$`))
  if (squadMatch && (method === 'GET' || method === 'PUT')) {
    const event = findFlowEvent(squadMatch[1])
    if (!event) return { handled: true, ok: false, status: 404, message: 'Event not found' }
    if (method === 'PUT') {
      const body = (options.body ?? {}) as { userIds?: string[]; publish?: boolean }
      const ids = new Set(body.userIds ?? [])
      const candidateIds = new Set(buildEventSquad(event).candidates.map((c) => c.userId))
      const invalid = [...ids].filter((id) => !candidateIds.has(id))
      if (invalid.length > 0) {
        return { handled: true, ok: false, status: 400, message: 'Only players who replied yes or maybe can be nominated' }
      }
      ensureReplies(event).forEach((reply) => {
        reply.nominated = ids.has(reply.userId)
      })
      if (body.publish) ensureEventFlow().squadPublishedAt[event.id] = new Date().toISOString()
      syncFeedCounts(event.id)
    }
    return { handled: true, ok: true, status: 200, body: clone(buildEventSquad(event)) }
  }

  // Aufstellung keyed by event.
  const lineupMatch = pathname.match(new RegExp(`^${base}/([^/]+)/lineup$`))
  if (lineupMatch && (method === 'GET' || method === 'PUT')) {
    const eventId = lineupMatch[1]
    if (!findFlowEvent(eventId)) return { handled: true, ok: false, status: 404, message: 'Event not found' }
    if (method === 'PUT') {
      const body = (options.body ?? {}) as Partial<EventLineup>
      ensureEventFlow().lineups[eventId] = {
        formation: body.formation ?? '4-3-3',
        starters: body.starters ?? [],
        bench: body.bench ?? [],
      }
    }
    return { handled: true, ok: true, status: 200, body: clone(ensureEventFlow().lineups[eventId] ?? null) }
  }

  // Fahrten keyed by event.
  const carpoolMatch = pathname.match(new RegExp(`^${base}/([^/]+)/carpool(?:/([^/]+))?(?:/(seat))?$`))
  if (carpoolMatch) {
    const [, eventId, rideId, seat] = carpoolMatch
    const event = findFlowEvent(eventId)
    if (!event) return { handled: true, ok: false, status: 404, message: 'Event not found' }
    const flow = ensureEventFlow()
    const rides = (flow.rides[eventId] ??= [])
    const selfId = session.user.id

    if (!rideId && method === 'GET') {
      return { handled: true, ok: true, status: 200, body: clone(buildCarpoolBoard(eventId)) }
    }
    if (!rideId && method === 'POST') {
      if (rides.some((ride) => ride.driverId === selfId)) {
        return { handled: true, ok: false, status: 409, message: 'You already offer a ride for this event' }
      }
      const body = (options.body ?? {}) as {
        seats?: number
        departFrom?: string | null
        departAt?: string | null
        note?: string | null
      }
      const ride: E2EEventRide = {
        id: `e2e-ride-${Date.now().toString(36)}`,
        driverId: selfId,
        driverName: session.user.name,
        seats: Math.max(1, Math.min(8, body.seats ?? 3)),
        departFrom: body.departFrom?.trim() || null,
        departAt: body.departAt ?? null,
        note: body.note?.trim() || null,
        passengers: [],
        createdAt: new Date().toISOString(),
      }
      rides.push(ride)
      const item = buildCarpoolBoard(eventId).rides.find((entry) => entry.id === ride.id)
      return { handled: true, ok: true, status: 201, body: clone(item) }
    }
    const ride = rideId ? rides.find((entry) => entry.id === rideId) : undefined
    if (rideId && !ride) return { handled: true, ok: false, status: 404, message: 'Ride not found' }
    if (ride && !seat && method === 'DELETE') {
      const canManage = session.scenario === 'coach' || session.scenario === 'club-admin'
      if (ride.driverId !== selfId && !canManage) {
        return { handled: true, ok: false, status: 403, message: 'Only the driver can remove this ride' }
      }
      flow.rides[eventId] = rides.filter((entry) => entry.id !== ride.id)
      return { handled: true, ok: true, status: 200, body: clone(buildCarpoolBoard(eventId)) }
    }
    if (ride && seat && (method === 'POST' || method === 'DELETE')) {
      const body = (options.body ?? {}) as { childUserId?: string }
      const riderId = body.childUserId ?? selfId
      if (method === 'DELETE') {
        ride.passengers = ride.passengers.filter((p) => p.userId !== riderId)
        return { handled: true, ok: true, status: 200, body: clone(buildCarpoolBoard(eventId)) }
      }
      if (ride.driverId === riderId) {
        return { handled: true, ok: false, status: 400, message: 'You drive this ride' }
      }
      if (ride.passengers.some((p) => p.userId === riderId)) {
        return { handled: true, ok: true, status: 200, body: clone(buildCarpoolBoard(eventId)) }
      }
      if (ride.passengers.length >= ride.seats) {
        return { handled: true, ok: false, status: 409, message: 'Ride is full' }
      }
      rides.forEach((entry) => {
        entry.passengers = entry.passengers.filter((p) => p.userId !== riderId)
      })
      const riderName =
        E2E_PARENT_KIDS.find((kid) => kid.userId === riderId)?.name ??
        eventFlowMembers().find((member) => member.userId === riderId)?.name ??
        session.user.name
      ride.passengers.push({ userId: riderId, name: riderName })
      return { handled: true, ok: true, status: 200, body: clone(buildCarpoolBoard(eventId)) }
    }
  }

  return null
}
// ─── /Events revamp mocks ────────────────────────────────────────────────────

export function handleE2EApiRequest(
  path: string,
  options: { method: string; body?: unknown },
): E2EApiResponse {
  if (!isE2ESupported() || !currentSession) {
    return { handled: false }
  }

  const pathname = path.split('?')[0]
  const method = options.method.toUpperCase()
  const query = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : null

  // Wechselbörse revamp: trials, Gesuche, free agents, Aufnahmeantrag.
  const session = currentSession
  const wechsel = handleWechselMock({
    scenario: session.scenario,
    pathname,
    method,
    query,
    body: options.body,
    user: {
      id: session.user.id,
      name: session.user.name,
      dateOfBirth: session.user.dateOfBirth ?? null,
      avatarUrl: session.user.avatarUrl,
    },
    club: {
      id: CLUB_ID,
      name: 'SV Albatros',
      primaryColor: CLUB_PRIMARY,
      teamId: TEAM_ID,
      teamName: TEAM_DISPLAY_NAME,
    },
    getProfile: () => session.api.freeAgentProfile,
    setProfile: (profile) => {
      session.api.freeAgentProfile = profile
    },
  })
  if (wechsel.handled) return wechsel

  // ── club-admin revamp: the club-admin world answers first (members,
  // stats, team-groups, admin-inbox, compliance, ...) so every count agrees.
  const clubAdminWorld = handleClubAdminWorldRequest(
    currentSession as unknown as ClubAdminWorldSession,
    { pathname, method, query, body: options.body, clubId: CLUB_ID },
  )
  if (clubAdminWorld) return clubAdminWorld
  // ── end club-admin revamp ──

  // ── privacy: guardian consent withdrawal ──
  const guardianConsentResponse = handleGuardianConsentRequest(currentSession, method, pathname)
  if (guardianConsentResponse) return guardianConsentResponse
  // ── end privacy ──

  // Redesign: notifications inbox and coach-recorded live match.
  const inboxLive = handleInboxLiveMock({
    scenario: session.scenario,
    pathname,
    method,
    query,
    body: options.body,
    clubId: CLUB_ID,
    teamId: TEAM_ID,
    nameFor: (userId) => eventFlowMembers().find((m) => m.userId === userId)?.name ?? null,
  })
  if (inboxLive) return inboxLive

  // Events revamp: event flow mocks take precedence over the older handlers.
  const eventFlowResponse = handleEventFlowRequest(method, pathname, query, options)
  if (eventFlowResponse) return eventFlowResponse

  // Onboarding revamp: profile, team-code, coach-request and pending mocks.
  const onboardingResponse = handleOnboardingRequest(method, pathname, options.body)
  if (onboardingResponse) return onboardingResponse

  if (method === 'GET' && pathname === '/me/export') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        exportedAt: new Date().toISOString(),
        user: clone(currentSession.user),
        memberships: clone(currentSession.memberships),
        teamMembers: clone(currentSession.teamMembers),
        ageGate: clone(currentSession.ageGate),
      },
    }
  }

  if (method === 'DELETE' && pathname === '/me') {
    return { handled: true, ok: true, status: 204 }
  }

  if (method === 'GET' && pathname === '/clubs/search') {
    const q = (query?.get('q') ?? '').trim().toLowerCase()
    const rows = createClubSearchRows()
    const results =
      q.length < 2
        ? []
        : rows.filter((row) =>
            [row.name, row.slug, row.city, row.state, row.association]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(q)),
          )
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { results, nextCursor: null },
    }
  }

  const publicClubMatch = pathname.match(/^\/public\/clubs\/([^/]+)$/)
  if (method === 'GET' && publicClubMatch) {
    const club = createPublicClub(publicClubMatch[1])
    if (!club) {
      return { handled: true, ok: false, status: 404, message: 'Club not found' }
    }
    return { handled: true, ok: true, status: 200, body: clone(club) }
  }

  // Club-admin onboarding now submits a *claim* on an official directory
  // entry (verified by Anstoss before any club is created) instead of
  // creating the club directly. The wizard reads `id` off the response and
  // lands on claim-pending, which lists the caller's claims. Without these
  // two routes the response is undefined and "Create club" throws.
  if (method === 'POST' && pathname === '/club-claims/first') {
    const body = (options.body || {}) as { directoryEntryId?: string; teamName?: string }
    // onboarding review fix (H3): the server sets CLUB_ADMIN with the claim.
    if (currentSession) currentSession.user.registrationRole = 'CLUB_ADMIN' as RegistrationRole
    const directory = createClubSearchRows().find((row) => row.id === body.directoryEntryId)
    e2eClaim = {
      id: 'claim-e2e-1',
      status: 'SUBMITTED',
      reviewNote: null,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      escalatesAt: null,
      directoryEntry: {
        name: directory?.name ?? 'TSV Linden 1899',
        city: directory?.city ?? null,
        badgeUrl: null,
      },
    }
    return { handled: true, ok: true, status: 201, body: { id: e2eClaim.id } }
  }

  if (method === 'GET' && pathname === '/club-claims/mine') {
    return { handled: true, ok: true, status: 200, body: e2eClaim ? [clone(e2eClaim)] : [] }
  }

  const claimAction = pathname.match(/^\/club-claims\/([^/]+)\/(respond|withdraw)$/)
  if (method === 'POST' && claimAction && e2eClaim) {
    if (claimAction[2] === 'withdraw') e2eClaim = { ...e2eClaim, status: 'WITHDRAWN' }
    return { handled: true, ok: true, status: 200, body: clone(e2eClaim) }
  }

  if (method === 'POST' && pathname === '/clubs/setup') {
    const body = (options.body || {}) as {
      club?: { name?: string; primaryColor?: string }
      team?: { name?: string; ageGroup?: string }
    }
    const clubName = body.club?.name?.trim() || 'Smoke FC'
    const primaryColor = body.club?.primaryColor || CLUB_PRIMARY
    const teamName = body.team?.name?.trim() || TEAM_DISPLAY_NAME
    const ageGroup = body.team?.ageGroup?.trim() || 'Herren'
    activateMembershipFromSetup({ clubName, primaryColor, teamName, ageGroup })
    return {
      handled: true,
      ok: true,
      status: 201,
      body: {
        club: createClub({
          name: clubName,
          slug: slugifyClubName(clubName),
          primaryColor,
        }),
        team: {
          id: TEAM_ID,
          name: teamName,
          displayName: teamName,
          clubId: CLUB_ID,
          ageGroup,
        },
      },
    }
  }

  // ── chat revamp: inbox + conversation mocks (see chatMocks.ts) ──
  {
    const chatResponse = handleE2EChatRequest(
      currentSession,
      CLUB_ID,
      pathname,
      method,
      options.body,
    )
    if (chatResponse.handled) return chatResponse
  }
  // ── end chat revamp ──

  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/conversations`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.conversations),
    }
  }

  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/conversations`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { id: currentSession.api.conversations[0]?.id ?? 'conversation-e2e-team' },
    }
  }

  // Custom-channel provisioning (the "new group" sheet in the Chat tab).
  // Real backend creates a channel record and returns it; in mock mode we
  // synthesize a deterministic record so the rail picks it up after the
  // refetch trigger.
  if (
    method === 'POST' &&
    pathname.startsWith('/teams/') &&
    pathname.endsWith('/channels/provision')
  ) {
    const body = (options.body || {}) as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name : 'Neue Gruppe'
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        id: `channel-mock-${Date.now()}`,
        kind: typeof body.kind === 'string' ? body.kind : 'CUSTOM',
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        teamId: TEAM_ID,
        unreadCount: 0,
      },
    }
  }

  // Same listing for /teams/:teamId/channels which the rail reads.
  if (method === 'GET' && /^\/teams\/[^/]+\/channels$/.test(pathname)) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: [
        { id: 'team', kind: 'TEAM', name: 'Team', slug: 'team', teamId: TEAM_ID, unreadCount: 0 },
        {
          id: 'announcements',
          kind: 'ANNOUNCEMENTS',
          name: 'Ankündigungen',
          slug: 'announcements',
          teamId: TEAM_ID,
          unreadCount: 0,
        },
        {
          id: 'coaches',
          kind: 'COACHES',
          name: 'Trainer',
          slug: 'coaches',
          teamId: TEAM_ID,
          unreadCount: 0,
        },
      ],
    }
  }

  if (method === 'GET' && pathname === `/teams/${TEAM_ID}/fixtures`) {
    const limit = query?.get('limit')
    const fixtures = limit
      ? currentSession.api.fixtures.slice(0, Number.parseInt(limit, 10) || 1)
      : currentSession.api.fixtures

    // Kader fix H3: the API resolves our side from the team link.
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(fixtures).map((fixture) => {
        const isHome =
          fixture.homeTeam === 'SV Albatros' ? true : fixture.awayTeam === 'SV Albatros' ? false : null
        return { ...fixture, isHome, ownTeamName: isHome === null ? null : 'SV Albatros' }
      }),
    }
  }

  if (method === 'GET' && pathname === '/integrations/fussball/team-links') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.linkedTeams),
    }
  }

  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/members`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(E2E_STAFF.filter((member) => !e2eRemovedMemberUserIds.has(member.user.id))),
    }
  }

  const memberDeleteMatch = pathname.match(new RegExp(`^/clubs/${CLUB_ID}/members/([^/]+)$`))
  if (method === 'DELETE' && memberDeleteMatch) {
    e2eRemovedMemberUserIds.add(memberDeleteMatch[1])
    return { handled: true, ok: true, status: 204 }
  }

  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/leave`) {
    if (currentSession.memberships[0]?.role === MembershipRole.OWNER) {
      return {
        handled: true,
        ok: false,
        status: 409,
        message: 'Transfer ownership or delete the club before leaving.',
      }
    }
    currentSession.user.dateOfBirth = currentSession.user.dateOfBirth ?? '1998-05-15'
    currentSession.memberships = []
    currentSession.teamMembers = []
    emitSession(currentSession)
    return { handled: true, ok: true, status: 204 }
  }

  // ── Team Management: groups / teams / coach assignments ──────────────
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/team-groups`) {
    return { handled: true, ok: true, status: 200, body: clone(e2eTeamGroups) }
  }

  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/team-groups`) {
    const b = (options.body ?? {}) as { displayName?: string; type?: string }
    const group: E2ETeamGroupRow = {
      id: `group-e2e-${e2eTeamGroups.length + 1}-${Date.now().toString(36)}`,
      displayName: b.displayName?.trim() || 'New group',
      type: b.type || 'CUSTOM',
      teams: [],
    }
    e2eTeamGroups.push(group)
    return { handled: true, ok: true, status: 200, body: clone(group) }
  }

  const e2eTeamCreate = pathname.match(new RegExp(`^/clubs/${CLUB_ID}/team-groups/([^/]+)/teams$`))
  if (method === 'POST' && e2eTeamCreate) {
    const group = e2eTeamGroups.find((g) => g.id === e2eTeamCreate[1])
    const b = (options.body ?? {}) as {
      name?: string
      squadLabel?: string
      leagueName?: string
      headCoachUserId?: string
    }
    const team: E2ETeamRow = {
      id: `team-e2e-${Date.now().toString(36)}`,
      displayName: b.name?.trim() || 'New team',
      squadLabel: b.squadLabel?.trim() || null,
      leagueName: b.leagueName?.trim() || null,
      memberCount: 0,
      coachAssignments: {
        headCoach: e2eResolveCoach(b.headCoachUserId),
        assistants: [],
      },
    }
    if (group) group.teams.push(team)
    return { handled: true, ok: true, status: 200, body: clone(team) }
  }

  const e2eCoachAssign = pathname.match(new RegExp(`^/clubs/${CLUB_ID}/teams/([^/]+)/coaches$`))
  if (method === 'POST' && e2eCoachAssign) {
    const teamId = e2eCoachAssign[1]
    const b = (options.body ?? {}) as {
      headCoachUserId?: string | null
      assistantCoachUserIds?: string[]
    }
    for (const g of e2eTeamGroups) {
      const team = g.teams.find((tm) => tm.id === teamId)
      if (team) {
        team.coachAssignments = {
          headCoach: e2eResolveCoach(b.headCoachUserId),
          assistants: (b.assistantCoachUserIds ?? [])
            .map((id) => e2eResolveCoach(id))
            .filter((x): x is E2ECoach => x !== null),
        }
      }
    }
    return { handled: true, ok: true, status: 200, body: { ok: true } }
  }

  // Kader revamp: Statistik reads the season and the MOTM archive.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/season-stats`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        played: 9,
        wins: 5,
        draws: 2,
        losses: 2,
        winRate: 55.6,
        goalDifference: 7,
        recentForm: ['W', 'W', 'D', 'L', 'W'],
      },
    }
  }
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/motm/archive`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        // Kader Statistik: echo the team scope like the API does.
        ...(query?.get('teamId') === TEAM_ID ? { teamId: TEAM_ID } : {}),
        season: '2026/27',
        topByPlayer: [
          { userId: 'user-player-12', name: 'David Köhler', avatarUrl: null, count: 3 },
          { userId: 'user-player-8', name: 'Paul Schäfer', avatarUrl: null, count: 2 },
          { userId: 'user-player-1', name: 'Julian Becker', avatarUrl: null, count: 1 },
          { userId: 'user-player-3', name: 'Lukas Hoffmann', avatarUrl: null, count: 1 },
        ],
        byMatch: [
          { matchId: 'fixture-past-1', kickoffAt: nowIso(-2, 14, 0), opponentName: 'FC Energie Cottbus II', motmUserId: 'user-player-12', motmName: 'David Köhler' },
          { matchId: 'fixture-past-2', kickoffAt: nowIso(-9, 15, 0), opponentName: 'SV Babelsberg 03 II', motmUserId: 'user-player-8', motmName: 'Paul Schäfer' },
          { matchId: 'fixture-past-3', kickoffAt: nowIso(-16, 14, 0), opponentName: 'Brandenburger SC Süd 05', motmUserId: 'user-player-1', motmName: 'Julian Becker' },
          { matchId: 'fixture-past-4', kickoffAt: nowIso(-23, 13, 0), opponentName: 'FSV Luckenwalde', motmUserId: 'user-player-12', motmName: 'David Köhler' },
        ],
      },
    }
  }

  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/roster-ops`) {
    // Kader revamp: squadCount follows the buckets after any PATCH.
    const ops = currentSession.api.rosterOps
    if (ops) ops.squadCount = e2eRosterCount(ops)
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(ops),
    }
  }

  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/stats`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.clubStats),
    }
  }

  // Free-agent media endpoints — presign returns enabled:false in E2E so
  // the upload flow degrades gracefully (the UI shows "uploadNotAvailable")
  // instead of crashing on a real network call to a presign URL we can't
  // generate offline. Add/Delete patches the in-memory profile.media so
  // the optimistic UI persists across reloads in the same session.
  if (method === 'POST' && pathname === '/me/free-agent-profile/media/presign') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { enabled: false, objectKey: '', uploadUrl: null, publicUrl: null },
    }
  }

  if (method === 'POST' && pathname === '/me/free-agent-profile/media') {
    const body = (options.body || {}) as {
      type?: 'PHOTO' | 'VIDEO'
      url?: string
      thumbnailUrl?: string | null
    }
    const profile = currentSession.api.freeAgentProfile
    if (!profile) {
      return { handled: true, ok: false, status: 404, message: 'No profile' }
    }
    const entry = {
      id: `e2e-media-${Date.now()}`,
      type: body.type || 'PHOTO',
      url: body.url || '',
      thumbnailUrl: body.thumbnailUrl ?? null,
      sortOrder: profile.media.length,
      createdAt: new Date().toISOString(),
    }
    profile.media = [...profile.media, entry]
    return { handled: true, ok: true, status: 200, body: clone(entry) }
  }

  const mediaDeleteMatch = pathname.match(/^\/me\/free-agent-profile\/media\/([^/]+)$/)
  if (method === 'DELETE' && mediaDeleteMatch) {
    const mediaId = mediaDeleteMatch[1]
    const profile = currentSession.api.freeAgentProfile
    if (profile) {
      profile.media = profile.media.filter((m) => m.id !== mediaId)
    }
    return { handled: true, ok: true, status: 200, body: { success: true } }
  }

  // Invite create — POST /clubs/:clubId/invites. The real backend mints a
  // code, persists the invite, and optionally emails it; in E2E mode we
  // synthesize a deterministic invite so the screen can share / confirm.
  // Keep this schema-validated so the mock does not accept payloads the API
  // would reject.
  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/invites`) {
    const parsed = createInviteSchema.safeParse(options.body || {})
    if (!parsed.success) {
      return {
        handled: true,
        ok: false,
        status: 400,
        message: parsed.error.issues[0]?.message || 'Invalid invite payload',
      }
    }

    const body = parsed.data
    const code = createE2EInviteCode()
    const link = buildE2EInviteLink(createClub().slug, code)
    return {
      handled: true,
      ok: true,
      status: 201,
      body: {
        id: `invite-mock-${Date.now()}`,
        clubId: CLUB_ID,
        teamId: body.teamId,
        code,
        kind: InviteKind.MEMBER_INVITE,
        link,
        url: link,
        role: body.role,
        phase: body.phase,
        deliveryChannel: body.deliveryChannel,
        recipientEmail: body.recipientEmail ?? null,
        linkedPlayerUserId: body.linkedPlayerUserId ?? null,
        guardianEmail: body.guardianEmail ?? null,
        childName: body.childName ?? null,
        createdById: currentSession.user.id,
        acceptedByUserId: null,
        status: InviteStatus.PENDING,
        expiresAt: nowIso(14, 23, 59),
        createdAt: new Date().toISOString(),
        acceptedAt: null,
        revokedAt: null,
      },
    }
  }

  const publicInviteMatch = pathname.match(/^\/public\/invites\/([^/]+)$/)
  if (method === 'GET' && publicInviteMatch) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: createPublicInvite(publicInviteMatch[1]),
    }
  }

  const inviteRedeemMatch = pathname.match(/^\/invites\/([^/]+)\/redeem$/)
  if (method === 'POST' && inviteRedeemMatch) {
    const result = activateMembershipFromInvite()
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        status: 'joined',
        membership: result?.membership,
        teamAccess: result?.teamAccess,
        club: result?.club,
        team: result?.team,
      },
    }
  }

  // Active join request for the current user — drives /pending-approval.
  if (method === 'GET' && pathname === '/me/join-requests/active') {
    const session = currentSession
    const request = session.api.joinRequests.find(
      (r) => r.user.id === session.user.id && r.status === 'PENDING',
    )
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        request: request
          ? {
              id: request.id,
              clubId: CLUB_ID,
              status: request.status,
              revision: request.revision,
            }
          : null,
      },
    }
  }

  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/join-requests`) {
    const session = currentSession
    const existing = session.api.joinRequests.find((r) => r.user.id === session.user.id)
    if (existing?.status === 'APPROVED') {
      return { handled: true, ok: false, status: 409, message: 'Already a member' }
    }
    if (existing?.status === 'PENDING') {
      return { handled: true, ok: false, status: 409, message: 'Request already pending' }
    }
    const request = existing ? {
      ...existing,
      role: 'PLAYER',
      message: null,
      status: 'PENDING' as const,
      revision: existing.revision + 1,
      createdAt: new Date().toISOString(),
    } : {
      id: `join-request-${session.user.id}`,
      role: 'PLAYER',
      message: null,
      status: 'PENDING' as const,
      revision: 1,
      createdAt: new Date().toISOString(),
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
    }
    if (existing) {
      Object.assign(existing, request)
      persistCurrentSession()
    } else {
      session.api.joinRequests.unshift(request)
      persistCurrentSession()
    }
    return {
      handled: true,
      ok: true,
      status: existing ? 200 : 201,
      body: clone({
        id: request.id,
        clubId: CLUB_ID,
        status: request.status,
      }),
    }
  }

  // Pending join requests for the admin Pending-requests screen.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/join-requests`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.joinRequests.filter((r) => r.status === 'PENDING')),
    }
  }

  const joinRequestWithdrawMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/join-requests/([^/]+)/withdraw$`),
  )
  if (method === 'POST' && joinRequestWithdrawMatch) {
    const session = currentSession
    if (!session) return { handled: false }
    const requestId = joinRequestWithdrawMatch[1]
    const idx = session.api.joinRequests.findIndex(
      (request) =>
        request.id === requestId &&
        request.user.id === session.user.id &&
        request.status === 'PENDING',
    )
    if (idx === -1) {
      return { handled: true, ok: false, status: 404, message: 'Pending join request not found' }
    }
    session.api.joinRequests[idx] = {
      ...session.api.joinRequests[idx],
      status: 'WITHDRAWN',
    }
    persistCurrentSession()
    return { handled: true, ok: true, status: 200, body: { withdrawn: true } }
  }

  // Approve / reject a join request — POST
  // /clubs/:clubId/join-requests/:id/approve|reject. Remove the row from the
  // seeded list so the admin screen visibly updates after the action.
  const joinRequestDecisionMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/join-requests/([^/]+)/(approve|reject)$`),
  )
  if (method === 'POST' && joinRequestDecisionMatch) {
    const requestId = joinRequestDecisionMatch[1]
    const action = joinRequestDecisionMatch[2]
    const expectedRevision = (options.body as { revision?: number } | undefined)?.revision
    const idx = currentSession.api.joinRequests.findIndex((r) => r.id === requestId)
    if (
      idx === -1 ||
      currentSession.api.joinRequests[idx].status !== 'PENDING' ||
      currentSession.api.joinRequests[idx].revision !== expectedRevision
    ) {
      return {
        handled: true,
        ok: false,
        status: 404,
        message: 'Join request not found',
      }
    }
    currentSession.api.joinRequests[idx] = {
      ...currentSession.api.joinRequests[idx],
      status: action === 'approve' ? 'APPROVED' : 'REJECTED',
    }
    return { handled: true, ok: true, status: 204 }
  }

  // My contributions list (player view) — drives the More → My
  // contributions screen. Returns the seeded plans with running status.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/contributions/my`) {
    // Derive the member's bank-transfer block from the SAME admin settings the
    // billing screen writes — mirrors production (one ClubContributionSettings
    // row), so an admin IBAN edit shows up on the member screen in the demo.
    const s = currentSession.api.adminContributions.settings
    const bankTransfer =
      s.bankIban && s.bankAccountHolder
        ? {
            accountHolder: s.bankAccountHolder,
            iban: s.bankIban,
            reference: s.bankReference ?? null,
          }
        : null
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone({ ...currentSession.api.myContributions, bankTransfer }),
    }
  }

  // Software subscription checkout — POST
  // /clubs/:clubId/contributions/my/:planId/checkout. Returning a null url
  // is a SUCCESSFUL "software billing is unavailable" response: the screen then
  // falls back to the soft mark-paid (/pay) path. We deliberately return
  // null here so the E2E flow never opens an external browser (which would
  // break Maestro) and instead completes via the existing /pay mock.
  const checkoutMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/contributions/my/([^/]+)/checkout$`),
  )
  if (method === 'POST' && checkoutMatch) {
    return { handled: true, ok: true, status: 200, body: { url: null } }
  }

  // Mark an individual contribution as paid — POST
  // /clubs/:clubId/contributions/my/:planId/pay. Updates in-memory state
  // so the row visibly flips to PAID after the screen refetches.
  const payMatch = pathname.match(new RegExp(`^/clubs/${CLUB_ID}/contributions/my/([^/]+)/pay$`))
  if (method === 'POST' && payMatch) {
    const planId = payMatch[1]
    const list = currentSession.api.myContributions.items
    const idx = list.findIndex((c) => c.planId === planId)
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        status: 'PAID',
        paidAmount: list[idx].amount,
        paidAt: new Date().toISOString(),
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Roster operational-status mutations — Mark new / Set inactive /
  // Mark active. Move the matching member between buckets so the UI
  // visibly reflects the action after the refetch fires.
  const rosterPatchMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/teams/${TEAM_ID}/roster/([^/]+)$`),
  )
  if (method === 'PATCH' && rosterPatchMatch && currentSession.api.rosterOps) {
    const targetUserId = rosterPatchMatch[1]
    const nextStatus =
      (options.body as { operationalStatus?: string } | undefined)?.operationalStatus ?? null
    const ops = currentSession.api.rosterOps
    const buckets: Array<{
      key: 'squad' | 'newPlayers' | 'inactive' | 'trials'
      list: typeof ops.squad
    }> = [
      { key: 'squad', list: ops.squad },
      { key: 'newPlayers', list: ops.operations.newPlayers },
      { key: 'inactive', list: ops.operations.inactive },
      { key: 'trials', list: ops.operations.trials },
    ]
    // Kader revamp: position, number and absence edits stay in place.
    const patch = (options.body ?? {}) as {
      position?: string | null
      jerseyNumber?: number | null
      absence?: 'NONE' | 'SUSPENDED' | 'AWAY'
      absenceUntil?: string | null
    }
    let found: (typeof ops.squad)[number] | null = null
    for (const b of buckets) {
      const idx = b.list.findIndex((m) => m.userId === targetUserId)
      if (idx >= 0) {
        found = {
          ...b.list[idx],
          ...(patch.position !== undefined && { position: patch.position }),
          ...(patch.jerseyNumber !== undefined && { jerseyNumber: patch.jerseyNumber }),
          ...(patch.absence !== undefined && {
            absence: patch.absence,
            absenceUntil: patch.absence === 'NONE' ? null : (patch.absenceUntil ?? null),
          }),
          operationalStatus:
            (nextStatus as 'ACTIVE' | 'NEW_PLAYER' | 'INACTIVE') ?? b.list[idx].operationalStatus,
        }
        if (nextStatus) b.list.splice(idx, 1)
        else b.list[idx] = found
        break
      }
    }
    if (found && nextStatus) {
      if (nextStatus === 'ACTIVE') ops.squad.push(found)
      else if (nextStatus === 'NEW_PLAYER') ops.operations.newPlayers.push(found)
      else if (nextStatus === 'INACTIVE') ops.operations.inactive.push(found)
    }
    ops.squadCount = e2eRosterCount(ops)
    return { handled: true, ok: true, status: 200, body: clone(found) }
  }

  // Trial decision — POST /clubs/:clubId/team-access/:memberId/decision
  // { decision: 'ACCEPT' | 'REJECT' }. ACCEPT moves the trial player into
  // the active squad, REJECT removes them so the UI flow completes.
  const trialDecisionMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/team-access/([^/]+)/decision$`),
  )
  if (method === 'POST' && trialDecisionMatch && currentSession.api.rosterOps) {
    const memberId = trialDecisionMatch[1]
    const decision = (options.body as { decision?: string } | undefined)?.decision
    const ops = currentSession.api.rosterOps
    const idx = ops.operations.trials.findIndex((t) => t.id === memberId || t.userId === memberId)
    if (idx >= 0) {
      const [member] = ops.operations.trials.splice(idx, 1)
      if (decision === 'ACCEPT') {
        ops.squad.push({ ...member, operationalStatus: 'ACTIVE' })
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Injury create — POST /clubs/:clubId/teams/:teamId/injuries
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/injuries` &&
    currentSession.api.rosterOps
  ) {
    const body = (options.body || {}) as Record<string, unknown>
    const userId = String(body.userId || '')
    const title = String(body.title || 'Injury')
    const status = String(body.status || 'OUT')
    const ops = currentSession.api.rosterOps
    const member =
      [
        ...ops.squad,
        ...ops.operations.newPlayers,
        ...ops.operations.inactive,
        ...ops.operations.trials,
      ].find((m) => m.userId === userId) ?? null
    const id = `injury-mock-${Date.now()}`
    const injury = {
      id,
      clubId: CLUB_ID,
      teamId: TEAM_ID,
      userId,
      reportedById: 'coach-1',
      title,
      notes: null,
      status,
      // Kader revamp: the injury sheets send a real return date.
      expectedReturnAt:
        typeof body.expectedReturnAt === 'string' ? (body.expectedReturnAt as string) : null,
      expectedReturnLabel:
        typeof body.expectedReturnLabel === 'string' ? (body.expectedReturnLabel as string) : null,
      clearedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: member ? { id: member.userId, name: member.name, avatarUrl: member.avatarUrl } : null,
    }

    ;(ops.medic.active as any[]).unshift(injury)

    // Auto-suggest a Beitrag pause if the expected return label parses
    // to >= 6 weeks. The admin sees the suggestion as a pending pause
    // on AdminHome — they can approve, snooze, or ignore.
    const label =
      typeof body.expectedReturnLabel === 'string'
        ? (body.expectedReturnLabel as string).toLowerCase()
        : ''
    const weekMatch = label.match(/(\d+)\s*(?:w|wk|wks|woche|wochen|week|weeks)/)
    const monthMatch = label.match(/(\d+)\s*(?:m|month|months|monat|monate)/)
    let weeks = 0
    if (weekMatch) weeks = parseInt(weekMatch[1], 10)
    if (monthMatch) weeks = Math.max(weeks, parseInt(monthMatch[1], 10) * 4)
    if (/season|saison|long/.test(label)) weeks = Math.max(weeks, 12)
    if (typeof body.expectedReturnAt === 'string') {
      const days = (new Date(body.expectedReturnAt as string).getTime() - Date.now()) / 86_400_000
      weeks = Math.max(weeks, Math.floor(days / 7))
    }
    if (weeks >= 6 && member) {
      const exists = currentSession.api.pendingDuesPauses.find(
        (p) => p.memberUserId === userId && p.status === 'PENDING',
      )
      if (!exists) {
        currentSession.api.pendingDuesPauses.unshift({
          id: `pause-${Date.now()}`,
          memberUserId: userId,
          memberName: member.name,
          reason: `${title} · expected return ${weeks} weeks`,
          createdAt: new Date().toISOString(),
          weeks,
          status: 'PENDING',
        })
      }
    }
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { ...clone(injury), longTermPauseSuggested: weeks >= 6 },
    }
  }

  // Injury clear — PATCH /clubs/:clubId/teams/:teamId/injuries/:id { cleared: true }
  const injuryPatchMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/teams/${TEAM_ID}/injuries/([^/]+)$`),
  )
  if (method === 'PATCH' && injuryPatchMatch && currentSession.api.rosterOps) {
    const id = injuryPatchMatch[1]
    const ops = currentSession.api.rosterOps
    const idx = ops.medic.active.findIndex((i) => i.id === id)
    if (idx >= 0) {
      const cleared = { ...ops.medic.active[idx], clearedAt: new Date().toISOString() }
      ops.medic.active.splice(idx, 1)
      ;(ops.medic.recentlyCleared as any[]).unshift(cleared)
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Duty rotate / update — POST .../duties/rotate, PATCH .../duties/:id
  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/duties/rotate`) {
    // Kader revamp (Aufgaben): mirror the server rota — next active player
    // alphabetically after whoever had this duty last.
    const ops = currentSession.api.rosterOps
    const kind = ((options.body ?? {}) as { kind?: string }).kind ?? 'JERSEY_CLEANUP'
    if (!ops) return { handled: true, ok: true, status: 204 }
    const eligible = [...ops.squad, ...ops.operations.newPlayers]
      .filter((m) => m.role === TeamRole.PLAYER)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    const last = [...ops.kit.pending, ...ops.kit.recent]
      .filter((d) => d.kind === kind)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const lastIndex = eligible.findIndex((m) => m.userId === last?.assignedUserId)
    const next = eligible[(lastIndex + 1) % Math.max(1, eligible.length)]
    if (!next) {
      return { handled: true, ok: false, status: 400, message: 'No eligible active players' }
    }
    const now = new Date().toISOString()
    const duty = {
      id: `duty-mock-${Date.now().toString(36)}`,
      clubId: CLUB_ID,
      teamId: TEAM_ID,
      assignedUserId: next.userId,
      createdById: currentSession.user.id,
      kind: kind as 'JERSEY_CLEANUP' | 'BIB_CLEANUP' | 'LOCKER_ROOM',
      status: 'PENDING' as const,
      dueDate: nowIso(3, 18, 0),
      notes: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      assignedUser: { id: next.userId, name: next.name, avatarUrl: null },
    }
    ops.kit.pending.push(duty)
    return { handled: true, ok: true, status: 201, body: clone(duty) }
  }
  const dutyPatchMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/teams/${TEAM_ID}/duties/([^/]+)$`),
  )
  if (method === 'PATCH' && dutyPatchMatch && currentSession.api.rosterOps) {
    const id = dutyPatchMatch[1]
    const ops = currentSession.api.rosterOps
    const idx = ops.kit.pending.findIndex((d) => d.id === id)
    if (idx >= 0) {
      const status = (options.body as { status?: string } | undefined)?.status ?? 'COMPLETED'
      const next = { ...ops.kit.pending[idx], status, completedAt: new Date().toISOString() }
      ops.kit.pending.splice(idx, 1)
      ;(ops.kit.recent as any[]).unshift(next)
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Event detail GET/PATCH live in handleEventFlowRequest (events revamp).
  const eventDetailMatch = pathname.match(new RegExp(`^/clubs/${CLUB_ID}/events/([^/]+)$`))

  // Cancel — DELETE /clubs/:clubId/events/:eventId with an optional reason.
  // A soft cancel: the event stays in the upcoming feed, struck through.
  if (method === 'DELETE' && eventDetailMatch) {
    const event = currentSession.api.events.find((e) => e.id === eventDetailMatch[1])
    if (!event) return { handled: true, ok: false, status: 404, message: 'Event not found' }
    const body = (options.body || {}) as { reason?: string; scope?: 'this' | 'following' }
    const cancelled = event as typeof event & {
      cancelledAt?: string | null
      cancelReason?: string | null
    }
    cancelled.cancelledAt = new Date().toISOString()
    cancelled.cancelReason = body.reason?.trim() || null
    if (body.scope === 'following' && event.seriesId) {
      currentSession.api.events
        .filter(
          (e) => e.seriesId === event.seriesId && e.id !== event.id && new Date(e.date) > new Date(event.date),
        )
        .forEach((e) => {
          e.cancelledAt = cancelled.cancelledAt
          e.cancelReason = cancelled.cancelReason
        })
    }
    return { handled: true, ok: true, status: 200, body: clone(event) }
  }

  // RSVP-reminder nudge — POST /clubs/:clubId/events/:eventId/remind-rsvp.
  // Backend pushes a reminder to every player who hasn't RSVPed yet and
  // returns { sent, nextAvailableAt } (429 + { retryAfter } when on cooldown).
  // In demo mode we always succeed so the "Nudge sent" alert shows.
  if (
    method === 'POST' &&
    new RegExp(`^/clubs/${CLUB_ID}/events/[^/]+/remind-rsvp$`).test(pathname)
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        sent: 3,
        nextAvailableAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h cooldown
      },
    }
  }

  // Latest announcements — the team-channel banner and home pulse read this.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/announcements`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: [
        {
          id: 'e2e-announcement-1',
          title: 'Kit wash rota starts this week',
          body: 'Check the Team tab for who is up first.',
        },
      ],
    }
  }

  // Manager compose actions from the chat composer. Both return a message
  // shaped like the gateway's, which the client appends locally.
  const composeMatch = pathname.match(/^\/teams\/([^/]+)\/messages\/(rsvp-poll|poll)$/)
  if (method === 'POST' && composeMatch) {
    const body = (options.body ?? {}) as {
      eventId?: string
      question?: string
      options?: string[]
      channelId?: string
    }
    const kind = composeMatch[2]
    const event =
      kind === 'rsvp-poll'
        ? currentSession.api.events.find((ev) => ev.id === body.eventId) ?? null
        : null
    if (kind === 'rsvp-poll' && !event) {
      return { handled: true, ok: false, status: 404, message: 'Event not found' }
    }
    return {
      handled: true,
      ok: true,
      status: 201,
      body: {
        id: `e2e-compose-${Date.now().toString(36)}`,
        teamId: composeMatch[1],
        channelId: body.channelId ?? null,
        senderId: currentSession.user.id,
        senderName: currentSession.user.name,
        senderAvatar: null,
        content: kind === 'rsvp-poll' ? event?.title ?? '' : body.question ?? '',
        messageType: kind === 'rsvp-poll' ? 'RSVP_POLL' : 'POLL',
        attachmentMeta:
          kind === 'rsvp-poll' && event
            ? {
                eventId: event.id,
                eventDate: event.date,
                eventType: event.type,
                location: event.location ?? null,
              }
            : null,
        createdAt: new Date().toISOString(),
        readByMe: true,
        reactions: [],
      },
    }
  }

  // Reminder toggle / RSVP write on event detail — succeed silently.
  if (
    (method === 'POST' || method === 'PUT' || method === 'DELETE') &&
    new RegExp(`^/clubs/${CLUB_ID}/events/[^/]+/(reminder|rsvp)$`).test(pathname)
  ) {
    return { handled: true, ok: true, status: 204 }
  }

  // Live match timeline — drives the Time Line tab on match-detail.
  // Each call advances the in-memory minute by 1 and occasionally
  // injects a new event so the demo feels alive.
  const timelineMatch = pathname.match(/^\/fixtures\/([^/]+)\/timeline$/)
  if (method === 'GET' && timelineMatch) {
    const fixId = timelineMatch[1]
    const live = currentSession.api.liveMatches[fixId]
    if (!live) {
      return { handled: true, ok: true, status: 200, body: null }
    }
    if (live.status === 'live') {
      const now = Date.now()
      // Advance roughly 1 minute of match time per 12s of real time so
      // pulling-to-refresh in mock mode actually shows progress.
      const elapsedSec = Math.floor((now - live.lastTickedAt) / 1000)
      if (elapsedSec >= 6) {
        const ticks = Math.min(3, Math.floor(elapsedSec / 6))
        live.minute = Math.min(95, live.minute + ticks)
        live.lastTickedAt = now
        // 1-in-4 chance of a new event (max minute 90+).
        if (live.minute < 91 && Math.random() < 0.18) {
          const kinds = ['yellow', 'sub', 'goal'] as const
          const kind = kinds[Math.floor(Math.random() * kinds.length)]
          if (kind === 'goal') {
            live.scoreHome += 1
            live.events.push({
              id: `evt-${Date.now()}`,
              minute: live.minute,
              kind: 'goal',
              player: 'Erik Walter',
              detail: 'Tap-in from a Schäfer cutback',
              side: 'home',
            })
          } else if (kind === 'yellow') {
            live.events.push({
              id: `evt-${Date.now()}`,
              minute: live.minute,
              kind: 'yellow',
              player: 'Lukas Hoffmann',
              side: 'home',
            })
          } else {
            live.events.push({
              id: `evt-${Date.now()}`,
              minute: live.minute,
              kind: 'sub',
              player: 'Tobias Lang',
              detail: 'Off: Niklas Wagner',
              side: 'home',
            })
          }
        }
        // Auto-finalize at 90+ for the demo.
        if (live.minute >= 90) {
          live.status = 'final'
        }
      }
    }
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(live),
    }
  }

  const fixtureEnrichmentMatch = pathname.match(/^\/fixtures\/([^/]+)\/enrichment$/)
  if (method === 'GET' && fixtureEnrichmentMatch) {
    return { handled: true, ok: true, status: 200, body: null }
  }

  // Match Facts — season head-to-head comparison + recent form. Demo payload
  // mirrors the production /fixtures/:id/facts shape so the Facts tab renders.
  const fixtureFactsMatch = pathname.match(/^\/fixtures\/([^/]+)\/facts$/)
  if (method === 'GET' && fixtureFactsMatch) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        comparison: {
          homeTeam: 'SV Albatros',
          awayTeam: 'FC Beispiel',
          metrics: [
            { key: 'games', home: 28, away: 28, higherIsBetter: true },
            { key: 'points', home: 41, away: 36, higherIsBetter: true },
            { key: 'goalsFor', home: 74, away: 55, higherIsBetter: true },
            { key: 'goalsAgainst', home: 76, away: 75, higherIsBetter: false },
          ],
        },
        recentForm: {
          teamName: 'SV Albatros',
          results: ['L', 'W', 'W', 'W', 'L'],
          points: 9,
        },
        goalTiming: {
          teamName: 'SV Albatros',
          bands: [
            { label: '0-15', scored: 8, conceded: 6 },
            { label: '15-30', scored: 12, conceded: 9 },
            { label: '30-45', scored: 15, conceded: 11 },
            { label: '45-60', scored: 10, conceded: 13 },
            { label: '60-75', scored: 14, conceded: 16 },
            { label: '75-90', scored: 15, conceded: 21 },
          ],
        },
        topScorers: {
          homeTeam: 'SV Albatros',
          awayTeam: 'FC Beispiel',
          home: [
            { name: 'Niklas Frank Müller', goals: 25, matches: 24 },
            { name: 'Reece Beyer', goals: 9, matches: 23 },
            { name: 'Abdirahman Mohamed Ali', goals: 6, matches: 23 },
          ],
          away: [
            { name: 'Philipp Von Der Mark', goals: 14, matches: 21 },
            { name: 'Riccardo Andreoli', goals: 7, matches: 23 },
          ],
        },
      },
    }
  }

  // MOTM tally — returns the per-fixture poll. Falls back to null so
  // fixtures without a tally still render the empty state.
  const motmGet = pathname.match(/^\/fixtures\/([^/]+)\/motm$/)
  if (method === 'GET' && motmGet) {
    const fixId = motmGet[1]
    const tally = currentSession.api.motm[fixId]
    return {
      handled: true,
      ok: true,
      status: 200,
      body: tally ? clone(tally) : null,
    }
  }

  // MOTM vote — POST /fixtures/:id/motm/vote { userId }. Records the
  // current user's vote (one per user, can be changed).
  const motmVote = pathname.match(/^\/fixtures\/([^/]+)\/motm\/vote$/)
  if (method === 'POST' && motmVote) {
    const fixId = motmVote[1]
    const tally = currentSession.api.motm[fixId]
    const userId = (options.body as { userId?: string } | undefined)?.userId
    if (tally && userId) {
      // Decrement previous vote's count (if any).
      if (tally.myVoteUserId) {
        const prev = tally.results.find((r) => r.userId === tally.myVoteUserId)
        if (prev) {
          prev.votes = Math.max(0, prev.votes - 1)
          tally.totalVotes = Math.max(0, tally.totalVotes - 1)
        }
      }
      // Increment new vote.
      const target = tally.results.find((r) => r.userId === userId)
      if (target) {
        target.votes += 1
        tally.totalVotes += 1
      } else {
        tally.results.push({
          userId,
          name: currentSession.api.squadStats.find((p) => p.userId === userId)?.name ?? 'Player',
          votes: 1,
          pct: 0,
        })
        tally.totalVotes += 1
      }
      tally.myVoteUserId = userId
      // Recompute pct.
      tally.results = tally.results
        .map((r) => ({
          ...r,
          pct: tally.totalVotes === 0 ? 0 : Math.round((r.votes / tally.totalVotes) * 100),
        }))
        .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
    }
    return {
      handled: true,
      ok: true,
      status: 200,
      body: tally ? clone(tally) : null,
    }
  }

  // Photo wall — GET /fixtures/:id/photos.
  const photosGet = pathname.match(/^\/fixtures\/([^/]+)\/photos$/)
  if (method === 'GET' && photosGet) {
    const fixId = photosGet[1]
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.photos[fixId] ?? []),
    }
  }

  // Photo wall — POST /fixtures/:id/photos { imageUrl, caption }.
  if (method === 'POST' && photosGet) {
    const fixId = photosGet[1]
    const map = currentSession.api.photos
    if (!map[fixId]) map[fixId] = []
    const me = currentSession.user
    const body = (options.body ?? {}) as {
      imageUrl?: string
      caption?: string | null
    }
    map[fixId].unshift({
      id: `photo-${Math.random().toString(36).slice(2, 8)}`,
      uploaderId: me.id,
      uploaderName: me.name,
      uploadedAt: new Date().toISOString(),
      imageUrl:
        body.imageUrl ||
        `https://picsum.photos/seed/${Math.random().toString(36).slice(2, 8)}/800/600`,
      caption: body.caption ?? null,
      votes: 0,
      myVoted: false,
    })
    return { handled: true, ok: true, status: 201 }
  }

  // Photo wall — POST/DELETE /fixtures/:id/photos/:photoId/vote (toggle).
  const photoVote = pathname.match(/^\/fixtures\/([^/]+)\/photos\/([^/]+)\/vote$/)
  if (photoVote && (method === 'POST' || method === 'DELETE')) {
    const [, fixId, photoId] = photoVote
    const list = currentSession.api.photos[fixId]
    const photo = list?.find((p) => p.id === photoId)
    if (photo) {
      if (method === 'POST' && !photo.myVoted) {
        photo.votes += 1
        photo.myVoted = true
      } else if (method === 'DELETE' && photo.myVoted) {
        photo.votes = Math.max(0, photo.votes - 1)
        photo.myVoted = false
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Lineup endpoint kept as a default-null fallback so existing match
  // screens keep their empty state behavior until the lineup builder
  // posts a real one.
  if (method === 'GET' && /^\/fixtures\/[^/]+\/lineup$/.test(pathname)) {
    return { handled: true, ok: true, status: 200, body: null }
  }

  // Children agenda — drives the multi-kid conflict scanner. Returns
  // linked kids + their upcoming events (across teams). Conflict
  // detection is computed client-side from this payload.
  if (method === 'GET' && pathname === '/me/children-agenda') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.childrenAgenda),
    }
  }

  // Resolve a conflict by marking one kid out — POST
  // /me/children-events/:eventId/rsvp { kidId, status }. Flips the rsvp
  // field so the next scan no longer reports the overlap.
  const childRsvpMatch = pathname.match(/^\/me\/children-events\/([^/]+)\/rsvp$/)
  if (method === 'POST' && childRsvpMatch) {
    const eventId = childRsvpMatch[1]
    const body = (options.body ?? {}) as { kidId?: string; status?: string }
    const events = currentSession.api.childrenAgenda.events
    const idx = events.findIndex((ev) => ev.id === eventId && ev.kidId === body.kidId)
    if (idx >= 0 && body.status) {
      events[idx] = {
        ...events[idx],
        rsvp: body.status as 'YES' | 'MAYBE' | 'NO' | 'PENDING',
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Squad stats — drives the lineup builder. Returns each player's
  // attendance %, minutes share, position, and availability so the
  // fairness algorithm can score rotation candidates.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/squad-stats`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.squadStats),
    }
  }

  // Save & post a lineup — POST /teams/:teamId/lineups. Mocks success
  // (the safety net would 204 anyway, but this is explicit). The fake
  // backend doesn't persist the XI; the screen pops back on success.
  if (method === 'POST' && pathname === `/teams/${TEAM_ID}/lineups`) {
    return { handled: true, ok: true, status: 204 }
  }

  // Channel membership — drives the Channel-info sheet. The default
  // roster is seeded once; per-channel state is lazily forked off it so
  // new (CUSTOM) channels start with everyone in.
  const channelMembersGet = pathname.match(/^\/teams\/[^/]+\/channels\/([^/]+)\/members$/)
  if (method === 'GET' && channelMembersGet) {
    const channelId = channelMembersGet[1]
    const map = currentSession.api.channelMembership
    if (!map[channelId]) {
      map[channelId] = clone(map['default'] ?? [])
    }
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(map[channelId]),
    }
  }

  // Chat revamp (H2): the legacy POST/DELETE /teams/:teamId/channels/:id/members
  // routes are gone from the API; members change via /clubs/:clubId/channels
  // (chatMocks.ts).

  // home revamp: /clubs/:clubId/duties (+ swap) removed. The API has no such
  // route; the parent home reads team duties from /me/children-overview.

  // Admin contributions overview — drives admin-billing + the plan editor.
  // Returns settings, summary KPIs, the plan list, and per-member rows.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/contributions`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.adminContributions),
    }
  }

  // Admin: update contribution settings (toggles + bank-transfer details).
  // Mirrors the server's tri-state: omitted = leave unchanged, null/'' = clear,
  // value = set. Writes the single settings source the member view reads from.
  if (method === 'PATCH' && pathname === `/clubs/${CLUB_ID}/contributions/settings`) {
    const settings = currentSession.api.adminContributions.settings
    const patch = (options.body ?? {}) as Record<string, unknown>
    if (patch.enabled !== undefined) settings.enabled = Boolean(patch.enabled)
    if (patch.autoRemindersEnabled !== undefined)
      settings.autoRemindersEnabled = Boolean(patch.autoRemindersEnabled)
    if (patch.defaultCurrency !== undefined)
      settings.defaultCurrency = String(patch.defaultCurrency)
    if (patch.bankAccountHolder !== undefined)
      settings.bankAccountHolder = patch.bankAccountHolder ? String(patch.bankAccountHolder) : null
    if (patch.bankIban !== undefined)
      settings.bankIban = patch.bankIban
        ? String(patch.bankIban).replace(/\s+/g, '').toUpperCase()
        : null
    if (patch.bankReference !== undefined)
      settings.bankReference = patch.bankReference ? String(patch.bankReference) : null
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(settings),
    }
  }

  // Admin: list plans only — used by the plan editor when no planId is
  // passed (so it can render an overview list without the full member roll).
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/contributions/plans`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.adminContributions.plans),
    }
  }

  // Admin: create a new plan. Push it onto state so the list reflects it
  // on the next refetch — including a fresh id and now() timestamps.
  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/contributions/plans`) {
    const body = (options.body ?? {}) as Record<string, unknown>
    const memberIds = Array.isArray(body.memberUserIds) ? (body.memberUserIds as string[]) : []
    const ts = new Date().toISOString()
    const plan = {
      id: `plan-${Math.random().toString(36).slice(2, 8)}`,
      clubId: CLUB_ID,
      name: String(body.name ?? 'New plan'),
      description: body.description ? String(body.description) : null,
      amount: typeof body.amount === 'number' ? body.amount : 0,
      currency: String(body.currency ?? 'EUR'),
      cadence: (body.cadence as 'MONTHLY' | 'YEARLY') ?? 'MONTHLY',
      targetRole:
        (body.targetRole as 'PLAYER' | 'PARENT' | 'COACH' | 'ADMIN' | 'CUSTOM') ?? 'PLAYER',
      dueDay: typeof body.dueDay === 'number' ? body.dueDay : 5,
      dueMonth: typeof body.dueMonth === 'number' ? body.dueMonth : null,
      graceDays: typeof body.graceDays === 'number' ? body.graceDays : 0,
      reminderPolicy: (body.reminderPolicy as { daysBefore: number[]; daysAfter: number[] }) ?? {
        daysBefore: [],
        daysAfter: [],
      },
      active: true,
      assignedMemberCount: memberIds.length,
      createdAt: ts,
      updatedAt: ts,
    }
    currentSession.api.adminContributions.plans.push(plan)
    return { handled: true, ok: true, status: 201, body: clone(plan) }
  }

  // Admin: update an existing plan via PATCH. Merge fields and bump
  // updatedAt so the editor's summary reflects the change.
  const adminPlanPatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/contributions/plans/([^/]+)$`),
  )
  if (method === 'PATCH' && adminPlanPatch) {
    const planId = adminPlanPatch[1]
    const idx = currentSession.api.adminContributions.plans.findIndex((p) => p.id === planId)
    if (idx >= 0) {
      const body = (options.body ?? {}) as Record<string, unknown>
      currentSession.api.adminContributions.plans[idx] = {
        ...currentSession.api.adminContributions.plans[idx],
        ...body,
        updatedAt: new Date().toISOString(),
      } as E2EApiState['adminContributions']['plans'][number]
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Admin: archive a plan via DELETE. Filter it out so the list refetch
  // shows it gone — same UX whether it's archived or hard-deleted.
  if (method === 'DELETE' && adminPlanPatch) {
    const planId = adminPlanPatch[1]
    currentSession.api.adminContributions.plans =
      currentSession.api.adminContributions.plans.filter((p) => p.id !== planId)
    return { handled: true, ok: true, status: 204 }
  }

  // Admin: assignment update — POST /clubs/:clubId/contributions/assignments
  // { planId, memberUserIds }. Updates assignedMemberCount on the plan.
  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/contributions/assignments`) {
    const body = (options.body ?? {}) as { planId?: string; memberUserIds?: string[] }
    const idx = currentSession.api.adminContributions.plans.findIndex((p) => p.id === body.planId)
    if (idx >= 0) {
      currentSession.api.adminContributions.plans[idx].assignedMemberCount = Array.isArray(
        body.memberUserIds,
      )
        ? body.memberUserIds.length
        : 0
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Admin: send reminders — POST /clubs/:clubId/contributions/plans/:planId/remind
  // or the real bulk endpoint /reminders/send. Keep this contract exact so the
  // E2E layer cannot hide a mobile/API path mismatch.
  const remindMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/contributions/(?:plans/[^/]+/remind|reminders/send)$`),
  )
  if (method === 'POST' && remindMatch) {
    const overdue = currentSession.api.adminContributions.summary.overdueMembers
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { requested: overdue, sent: overdue, skipped: 0 },
    }
  }

  // Voice memos — GET /me/voice-memos returns the caller's inbox.
  if (method === 'GET' && pathname === '/me/voice-memos') {
    const me = currentSession.user
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.voiceMemos.filter((m) => m.toUserId === me.id)),
    }
  }

  // Voice memos — GET /clubs/:clubId/voice-memos/sent returns memos
  // the caller (typically a coach) has sent.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/voice-memos/sent`) {
    const me = currentSession.user
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.voiceMemos.filter((m) => m.fromUserId === me.id)),
    }
  }

  // Voice memos — POST /clubs/:clubId/voice-memos { toUserId, title, tags,
  // durationSec }. Mock-mode reuses a placeholder audio URL.
  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/voice-memos`) {
    const body = (options.body ?? {}) as {
      toUserId?: string
      toUserName?: string
      title?: string | null
      tags?: Array<'tactical' | 'praise' | 'fix' | 'set-piece'>
      durationSec?: number
      fixtureId?: string | null
    }
    const me = currentSession.user
    currentSession.api.voiceMemos.unshift({
      id: `vm-${Math.random().toString(36).slice(2, 8)}`,
      fromUserId: me.id,
      fromUserName: me.name,
      toUserId: String(body.toUserId ?? ''),
      toUserName: String(body.toUserName ?? ''),
      audioUrl: 'https://www.kozco.com/tech/piano2-CoolEdit.mp3',
      durationSec: typeof body.durationSec === 'number' ? body.durationSec : 22,
      peaks: Array.from({ length: 40 }, (_, i) =>
        Math.max(0.15, Math.min(1, Math.sin(i / 1.3) * 0.4 + 0.6)),
      ),
      title: body.title ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      listened: false,
      fixtureId: body.fixtureId ?? null,
      createdAt: new Date().toISOString(),
    })
    return { handled: true, ok: true, status: 201 }
  }

  // Voice memos — PATCH /me/voice-memos/:id { listened } so the caller
  // can mark a memo as played.
  const memoPatch = pathname.match(/^\/me\/voice-memos\/([^/]+)$/)
  if (method === 'PATCH' && memoPatch) {
    const id = memoPatch[1]
    const idx = currentSession.api.voiceMemos.findIndex((m) => m.id === id)
    if (idx >= 0) {
      const body = (options.body ?? {}) as { listened?: boolean }
      if (typeof body.listened === 'boolean') {
        currentSession.api.voiceMemos[idx].listened = body.listened
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Streaks — GET /clubs/:clubId/streaks returns the caller's personal
  // streaks + the squad leaderboard.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/streaks`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        ...clone(currentSession.api.streaks),
        // Kader Statistik: echo the team scope like the API does.
        ...(query?.get('teamId') === TEAM_ID ? { teamId: TEAM_ID } : {}),
      },
    }
  }

  // Compliance dashboard — GET /clubs/:clubId/compliance returns every
  // tracked document (Spielerpass, Führungszeugnis, medical, vaccination,
  // first-aid) with expiry + issue + document links + per-row notes.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/compliance`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.compliance),
    }
  }

  // Compliance — PATCH /clubs/:clubId/compliance/:id { expiresAt?,
  // documentUrl?, note? } so admins can mark renewed / replace docs.
  const compliancePatch = pathname.match(new RegExp(`^/clubs/${CLUB_ID}/compliance/([^/]+)$`))
  if (method === 'PATCH' && compliancePatch) {
    const id = compliancePatch[1]
    const idx = currentSession.api.compliance.findIndex((c) => c.id === id)
    if (idx >= 0) {
      const body = (options.body ?? {}) as Record<string, unknown>
      currentSession.api.compliance[idx] = {
        ...currentSession.api.compliance[idx],
        ...body,
      } as E2EApiState['compliance'][number]
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Pending dues pauses — drives the "1 long-term injury → pause Lukas's
  // dues?" prompt that lands on AdminHome after the medic logs a >=6
  // week injury.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/contributions/pending-pauses`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.pendingDuesPauses),
    }
  }

  // Approve / snooze a pending pause.
  const pauseDecision = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/contributions/pending-pauses/([^/]+)/(approve|snooze|dismiss)$`),
  )
  if (method === 'POST' && pauseDecision) {
    const [, id, action] = pauseDecision
    const list = currentSession.api.pendingDuesPauses
    const idx = list.findIndex((p) => p.id === id)
    if (idx >= 0) {
      if (action === 'approve') {
        list[idx].status = 'APPROVED'
      } else if (action === 'snooze') {
        list[idx].status = 'SNOOZED'
      } else {
        list.splice(idx, 1)
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Safety net: when an E2E session is active, never fall through to a
  // real network request. Unmatched endpoints return safe defaults so
  // screens render their empty states instead of triggering 401s and
  // the sign-out flow.
  if (__DEV__) {
    console.info(`[e2e] unmocked ${method} ${pathname} → returning default response`)
  }
  if (STRICT_E2E_MOCKS) {
    return {
      handled: true,
      ok: false,
      status: 501,
      code: 'e2e_unmocked_endpoint',
      message: `No mock for ${method} ${pathname}. Add this endpoint in apps/mobile/src/e2e/session.ts.`,
    }
  }
  if (method === 'GET') {
    // Lists are far more common than singletons in this app; bias to [].
    // Screens that expect an object will see undefined fields and show
    // their loading or empty state — better than crashing the screen
    // and far better than letting the request hit the real backend.
    return { handled: true, ok: true, status: 200, body: [] }
  }
  // Mutations succeed silently in mock mode.
  return { handled: true, ok: true, status: 204 }
}
