import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  buildClubPermissionMap,
  ClubCapability,
  ExternalTeamLinkStatus,
  FreeAgentVisibility,
  MembershipRole,
  PlayerPosition,
  PreferredFoot,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  TrialInviteStatus,
  type ClubAggregateStats,
  type CrossTeamEventItem,
  type EventFeedItem,
  type ExternalTeamLink,
  type FreeAgentProfile,
  type ImportedFixture,
  type RosterOpsSnapshot,
  type TrialInvite,
} from '@anstoss/shared'

export const E2E_SESSION_KEY = 'anstoss:e2e:session'

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

type E2EApiState = {
  events: EventFeedItem[]
  parentEvents: CrossTeamEventItem[]
  conversations: E2EConversationItem[]
  fixtures: ImportedFixture[]
  linkedTeams: ExternalTeamLink[]
  clubStats: ClubAggregateStats | null
  rosterOps: RosterOpsSnapshot | null
  trialInvites: TrialInvite[]
  joinRequests: Array<{
    id: string
    role: string
    message: string | null
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    createdAt: string
    user: { id: string; name: string; email: string }
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
  sportgericht: Array<{
    id: string
    fixtureId: string
    fixtureTitle: string
    kickoffAt: string
    competition: string
    referee: string
    /** Cards as captured during the match, pre-filled into the report. */
    incidents: Array<{
      minute: number
      kind: 'YELLOW' | 'YELLOW2' | 'RED' | 'OTHER'
      playerName: string
      playerNumber: number | null
      reason: string
      narrative: string
    }>
    coachNarrative: string
    status: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED'
    submittedAt: string | null
  }>
  trialScouts: Array<{
    id: string
    userId: string
    name: string
    age: number
    position: 'GK' | 'DEF' | 'MID' | 'ATT'
    foot: 'LEFT' | 'RIGHT' | 'BOTH'
    /** German postcode, used as a coarse "nearby" filter. */
    postcode: string
    distanceKm: number
    /** Highest level previously played. */
    history: string
    note: string
    avatarUrl: string | null
    videoUrl: string | null
    contactedByThisClub: boolean
    /** ISO date the agent posted / refreshed the listing. */
    postedAt: string
  }>
  exchange: Array<{
    id: string
    sellerUserId: string
    sellerName: string
    title: string
    category: 'BOOTS' | 'KIT' | 'GLOVES' | 'OTHER'
    sizeLabel: string
    condition: 'NEW' | 'GOOD' | 'WORN'
    askCents: number
    note?: string | null
    photoUrl: string
    postedAt: string
    status: 'AVAILABLE' | 'CLAIMED' | 'GONE'
    claimedByUserId: string | null
    claimedByName: string | null
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
  jerseys: Array<{
    number: number
    holderUserId: string | null
    holderName: string | null
    /** Has the holder washed + returned the jersey for next match? */
    washed: boolean
    /** ISO date when the assignment last changed. */
    assignedAt: string
    /** Free-text note (size, condition, captain band, etc.). */
    note?: string | null
  }>
  pitchStatus: {
    fixtureId: string | null
    state: 'OK' | 'WET' | 'FROZEN' | 'CANCELLED'
    reportedById: string | null
    reportedByName: string | null
    reportedAt: string | null
    photoUrl: string | null
    note: string | null
  }
  vereinsheim: {
    menu: Array<{
      id: string
      name: string
      priceCents: number
      icon: string
      category: 'FOOD' | 'DRINK' | 'OTHER'
    }>
    orders: Array<{
      id: string
      buyerId: string | null
      buyerName: string
      itemId: string
      itemName: string
      priceCents: number
      qty: number
      placedAt: string
      paid: boolean
    }>
    targetCents: number
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
  ehrenamt: {
    settings: {
      annualGoalHours: number
      foerderungReady: boolean
    }
    entries: Array<{
      id: string
      memberUserId: string
      memberName: string
      role: 'COACH' | 'PARENT' | 'ADMIN' | 'OWNER'
      activity: string
      hours: number
      occurredAt: string
      note?: string | null
    }>
  }
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
  carpool: Record<
    string,
    Array<{
      id: string
      driverId: string | null
      driverName: string | null
      postcode: string
      seatsOffered: number
      parking?: string | null
      notes?: string | null
      riders: Array<{ userId: string; name: string }>
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
  duties: {
    members: Array<{ userId: string; name: string }>
    duties: Array<{
      id: string
      kind: 'KUCHEN' | 'AUFBAU' | 'PLATZWART' | 'SCHIRI'
      title: string
      date: string
      matchTitle: string
      assignedUserId: string
      assignedName: string
      swappable: boolean
    }>
  }
  adminContributions: {
    settings: {
      clubId: string
      enabled: boolean
      autoRemindersEnabled: boolean
      defaultCurrency: string
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
// Superset member shape so the single GET /clubs/:id/members mock satisfies
// every caller: team-management staff chips (id/userId/role/user.name),
// my-team (top-level name), dm-new (user.email), invite/roster/loans.
function e2eMember(
  id: string,
  name: string,
  role: 'ADMIN' | 'COACH' | 'PLAYER',
) {
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
function e2eResolveCoach(userId: string | null | undefined): E2ECoach | null {
  if (!userId) return null
  const m = E2E_STAFF.find((s) => s.userId === userId)
  return m
    ? { userId: m.userId, name: m.user.name, avatarUrl: null }
    : { userId, name: 'Coach', avatarUrl: null }
}
const TEAM_DISPLAY_NAME = 'Senior Team'
const CLUB_PRIMARY = '#4A4A48'

let currentSession: E2ESessionSnapshot | null = null
const listeners = new Set<(session: E2ESessionSnapshot | null) => void>()

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowIso(offsetDays = 0, hour = 18, minute = 0) {
  const value = new Date()
  value.setDate(value.getDate() + offsetDays)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

function createClub() {
  return {
    id: CLUB_ID,
    name: 'SV Albatros',
    slug: 'sv-albatros',
    badgeUrl: null,
    primaryColor: CLUB_PRIMARY,
  }
}

function createMembership(role: MembershipRole): E2EAuthMembership {
  return {
    id: `membership-${role.toLowerCase()}`,
    role,
    operationalRoles: [],
    permissions: buildClubPermissionMap({
      membershipRole: role,
    }),
    club: createClub(),
  }
}

function createTeamMember(role: TeamRole): E2EAuthTeamMember {
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
    },
  }
}

function createEvents(): EventFeedItem[] {
  return [
    // ─── Upcoming ─────────────────────────────────────────────
    {
      id: 'event-match-next',
      teamId: TEAM_ID,
      clubId: CLUB_ID,
      title: 'vs. SV Babelsberg 03',
      type: 'MATCH',
      date: nowIso(3, 14, 0),
      location: 'Karl-Liebknecht-Stadion',
      notes: null,
      createdById: 'coach-1',
      createdAt: nowIso(-4, 9, 0),
      archivedAt: null,
      responseCount: 17,
      yesCount: 14,
      maybeCount: 1,
      noCount: 2,
      myRsvp: 'YES',
    },
    {
      id: 'event-training-later',
      teamId: TEAM_ID,
      clubId: CLUB_ID,
      title: 'Tuesday session',
      type: 'TRAINING',
      date: nowIso(5, 19, 30),
      location: 'Pitch 2',
      notes: null,
      createdById: 'coach-1',
      createdAt: nowIso(-2, 11, 0),
      archivedAt: null,
      responseCount: 16,
      yesCount: 12,
      maybeCount: 2,
      noCount: 2,
      myRsvp: 'MAYBE',
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
      maybeCount: 2,
      noCount: 2,
      myRsvp: 'YES',
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
      maybeCount: 2,
      noCount: 1,
      myRsvp: 'YES',
    },
  ]
}

function createParentEvents(): CrossTeamEventItem[] {
  return [
    {
      ...createEvents()[0],
      teamName: 'U15',
      teamDisplayName: 'U15 I',
    },
    {
      ...createEvents()[1],
      id: 'event-parent-second',
      title: 'Saturday away match',
      date: nowIso(7, 11, 0),
      teamName: 'U15',
      teamDisplayName: 'U15 I',
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

function createLinkedTeams(
  status: ExternalTeamLinkStatus = 'ACTIVE',
): ExternalTeamLink[] {
  return [
    {
      id: 'link-1',
      clubId: CLUB_ID,
      teamId: TEAM_ID,
      provider: 'api_fussball',
      externalTeamId: 'team-42',
      externalClubId: 'club-42',
      externalUrl: 'https://fussball.de/team/sv-albatros',
      label: 'SV Albatros I',
      status,
      lastSyncedAt: nowIso(-1, 8, 0),
      createdAt: nowIso(-10, 8, 0),
      updatedAt: nowIso(-1, 8, 0),
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

function createRosterOps(): RosterOpsSnapshot {
  return {
    team: {
      id: TEAM_ID,
      displayName: TEAM_DISPLAY_NAME,
      squadTarget: 13,
    },
    squad: [
      {
        id: 'roster-player-1',
        userId: 'player-1',
        name: 'Julian Becker',
        avatarUrl: null,
        role: TeamRole.PLAYER,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
        position: 'ST',
        jerseyNumber: 9,
        operationalStatus: 'ACTIVE',
        createdAt: nowIso(-30, 10, 0),
        loanedFromTeamId: null,
        loanedFromTeamName: null,
      },
      {
        id: 'roster-player-2',
        userId: 'player-2',
        name: 'Tim Hoffmann',
        avatarUrl: null,
        role: TeamRole.PLAYER,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
        position: 'CB',
        jerseyNumber: 4,
        operationalStatus: 'ACTIVE',
        createdAt: nowIso(-20, 10, 0),
        loanedFromTeamId: null,
        loanedFromTeamName: null,
      },
    ],
    operations: {
      trials: [
        {
          id: 'trial-player-1',
          userId: 'trial-player-1',
          name: 'Max Mustermann',
          avatarUrl: null,
          role: TeamRole.PLAYER,
          phase: TeamAccessPhase.TRIAL,
          status: TeamAccessStatus.ACTIVE,
          position: 'MID',
          jerseyNumber: null,
          operationalStatus: 'ACTIVE',
          createdAt: nowIso(-3, 10, 0),
          loanedFromTeamId: null,
          loanedFromTeamName: null,
        },
      ],
      newPlayers: [
        {
          id: 'new-player-1',
          userId: 'new-player-1',
          name: 'David Fischer',
          avatarUrl: null,
          role: TeamRole.PLAYER,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
          position: 'DEF',
          jerseyNumber: 16,
          operationalStatus: 'NEW_PLAYER',
          createdAt: nowIso(-5, 10, 0),
          loanedFromTeamId: null,
          loanedFromTeamName: null,
        },
      ],
      inactive: [
        {
          id: 'inactive-player-1',
          userId: 'inactive-player-1',
          name: 'Lukas Meyer',
          avatarUrl: null,
          role: TeamRole.PLAYER,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
          position: 'GK',
          jerseyNumber: 31,
          operationalStatus: 'INACTIVE',
          createdAt: nowIso(-120, 10, 0),
          loanedFromTeamId: null,
          loanedFromTeamName: null,
        },
      ],
      pendingCoaches: [],
    },
    medic: {
      active: [
        {
          id: 'injury-1',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          userId: 'player-2',
          reportedById: 'coach-1',
          title: 'Hamstring tear',
          notes: null,
          status: 'OUT',
          expectedReturnAt: null,
          expectedReturnLabel: '6 wks',
          clearedAt: null,
          createdAt: nowIso(-2, 9, 0),
          updatedAt: nowIso(-2, 9, 0),
          user: {
            id: 'player-2',
            name: 'Tim Hoffmann',
            avatarUrl: null,
          },
        },
      ],
      recentlyCleared: [
        {
          id: 'injury-2',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          userId: 'player-3',
          reportedById: 'coach-1',
          title: 'Ankle sprain',
          notes: null,
          status: 'DAY_TO_DAY',
          expectedReturnAt: null,
          expectedReturnLabel: 'cleared',
          clearedAt: nowIso(-1, 9, 0),
          createdAt: nowIso(-12, 9, 0),
          updatedAt: nowIso(-1, 9, 0),
          user: {
            id: 'player-3',
            name: 'Luca Weber',
            avatarUrl: null,
          },
        },
      ],
    },
    kit: {
      pending: [
        {
          id: 'duty-1',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          assignedUserId: 'player-1',
          createdById: 'coach-1',
          kind: 'JERSEY_CLEANUP',
          status: 'PENDING',
          dueDate: nowIso(3, 21, 0),
          notes: 'Wash first-team jerseys after the away match.',
          completedAt: null,
          createdAt: nowIso(-1, 9, 0),
          updatedAt: nowIso(-1, 9, 0),
          assignedUser: {
            id: 'player-1',
            name: 'Julian Becker',
            avatarUrl: null,
          },
        },
      ],
      recent: [
        {
          id: 'duty-2',
          clubId: CLUB_ID,
          teamId: TEAM_ID,
          assignedUserId: 'player-4',
          createdById: 'coach-1',
          kind: 'BIB_CLEANUP',
          status: 'COMPLETED',
          dueDate: nowIso(-2, 21, 0),
          notes: 'Collect training bibs after Tuesday session.',
          completedAt: nowIso(-1, 21, 30),
          createdAt: nowIso(-4, 9, 0),
          updatedAt: nowIso(-1, 21, 30),
          assignedUser: {
            id: 'player-4',
            name: 'Leon Goretzka',
            avatarUrl: null,
          },
        },
      ],
    },
  }
}

function createTrialInvites(): TrialInvite[] {
  return [
    {
      id: 'trial-invite-1',
      clubId: CLUB_ID,
      freeAgentProfileId: 'free-agent-profile-1',
      teamId: TEAM_ID,
      sentByUserId: 'coach-1',
      club: {
        id: CLUB_ID,
        name: 'SV Albatros',
        badgeUrl: null,
        primaryColor: CLUB_PRIMARY,
      },
      team: {
        id: TEAM_ID,
        displayName: TEAM_DISPLAY_NAME,
        groupName: 'Senior',
      },
      status: TrialInviteStatus.PENDING,
      message: 'Join the next training session and meet the staff.',
      createdAt: nowIso(-2, 8, 0),
      expiresAt: nowIso(5, 20, 0),
      respondedAt: null,
      sender: {
        id: 'coach-1',
        name: 'Coach Albrecht',
      },
    },
  ]
}

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
      createdAt: nowIso(-1, 17, 30),
      user: {
        id: 'join-user-1',
        name: 'Erik Brandt',
        email: 'erik.brandt@sv-albatros.example',
      },
    },
    {
      id: 'join-request-2',
      role: 'PLAYER',
      message: null,
      status: 'PENDING',
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
  // Three plans on the player view: a current monthly due (PENDING),
  // an annual one already paid (PAID), and an overdue one to exercise
  // the chase / pay-now affordances.
  const today = new Date()
  const dueSoon = new Date(today.getFullYear(), today.getMonth(), 28).toISOString()
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 5).toISOString()
  const overdueDate = new Date(today.getFullYear(), today.getMonth() - 1, 28).toISOString()
  return {
    hasContributions: true,
    items: [
      {
        planId: 'plan-monthly',
        planName: 'Membership fee',
        amount: 2500,
        currency: 'EUR',
        cadence: 'MONTHLY',
        dueDate: dueSoon,
        status: 'PAID',
        paidAmount: 2500,
        paidAt: lastMonth,
      },
      {
        planId: 'plan-trikot',
        planName: 'Jersey levy',
        amount: 4500,
        currency: 'EUR',
        cadence: 'YEARLY',
        dueDate: overdueDate,
        status: 'OVERDUE',
        paidAmount: null,
        paidAt: null,
      },
      {
        planId: 'plan-annual',
        planName: 'Annual fee',
        amount: 12000,
        currency: 'EUR',
        cadence: 'YEARLY',
        dueDate: lastMonth,
        status: 'PAID',
        paidAmount: 12000,
        paidAt: lastMonth,
      },
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
  const audioUrl =
    'https://www.kozco.com/tech/piano2-CoolEdit.mp3' // 24s placeholder
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

function createSportgericht(): E2EApiState['sportgericht'] {
  // One auto-generated draft after the most recent fixture. Pre-fills
  // every yellow/red captured during the live ticker as an incident
  // row with a coach-narrative scaffold the user can edit.
  return [
    {
      id: 'sg-1',
      fixtureId: 'fixture-1',
      fixtureTitle: 'SV Albatros vs SV Babelsberg 03',
      kickoffAt: nowIso(0, 14, 0),
      competition: 'League match',
      referee: 'A. Lindner',
      incidents: [
        {
          minute: 23,
          kind: 'YELLOW',
          playerName: 'Tim Weber',
          playerNumber: 2,
          reason: 'Tactical foul · breaking up counter',
          narrative:
            'Late challenge on a counter break, no malice. Clean on the ball, ref called as professional foul.',
        },
        {
          minute: 67,
          kind: 'YELLOW',
          playerName: 'Lukas Hoffmann',
          playerNumber: 5,
          reason: 'Dissent · disputing decision',
          narrative:
            'Brief verbal protest after a no-call on what we believed was a clear foul on the wing.',
        },
      ],
      coachNarrative:
        'Match was competitive but fair. No off-the-ball incidents observed. We accept both yellows and have spoken with the players.',
      status: 'DRAFT',
      submittedAt: null,
    },
  ]
}

function createTrialScouts(): E2EApiState['trialScouts'] {
  // 6 free agents with varied positions, ages, distances. Distance is
  // coarse "as the crow flies km" derived from postcode prefix; finer
  // matching is server-side in real mode. Two have video links.
  const ago = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }
  const u = (seed: string) => `https://picsum.photos/seed/${seed}/240/240`
  return [
    {
      id: 'fa-1',
      userId: 'fa-user-1',
      name: 'Max Wernicke',
      age: 16,
      position: 'MID',
      foot: 'RIGHT',
      postcode: '14169',
      distanceKm: 4,
      history: 'Hertha 03 Zehlendorf U16',
      note: 'Looking for U17/U19 club for next season — box-to-box.',
      avatarUrl: u('fa-max'),
      videoUrl: 'https://example.com/clip-max.mp4',
      contactedByThisClub: false,
      postedAt: ago(2),
    },
    {
      id: 'fa-2',
      userId: 'fa-user-2',
      name: 'Lina Stein',
      age: 18,
      position: 'GK',
      foot: 'BOTH',
      postcode: '14199',
      distanceKm: 7,
      history: 'TuS Lichterfelde Damen II',
      note: 'GK with reflex training cert. Open to trials in Berlin SW.',
      avatarUrl: u('fa-lina'),
      videoUrl: null,
      contactedByThisClub: false,
      postedAt: ago(5),
    },
    {
      id: 'fa-3',
      userId: 'fa-user-3',
      name: 'Yusuf Demir',
      age: 17,
      position: 'ATT',
      foot: 'LEFT',
      postcode: '12161',
      distanceKm: 12,
      history: 'BSC Eintracht Südring U17',
      note: 'Striker, 11 goals last season. Schedule conflict at Eintracht.',
      avatarUrl: u('fa-yusuf'),
      videoUrl: 'https://example.com/clip-yusuf.mp4',
      contactedByThisClub: false,
      postedAt: ago(8),
    },
    {
      id: 'fa-4',
      userId: 'fa-user-4',
      name: 'Tom Hartmann',
      age: 22,
      position: 'DEF',
      foot: 'RIGHT',
      postcode: '13627',
      distanceKm: 18,
      history: 'SV Tasmania III',
      note: 'CB, 188cm, headed-set-piece specialist. Moving south for work.',
      avatarUrl: u('fa-tom'),
      videoUrl: null,
      contactedByThisClub: true,
      postedAt: ago(11),
    },
    {
      id: 'fa-5',
      userId: 'fa-user-5',
      name: 'Sophie Klein',
      age: 19,
      position: 'MID',
      foot: 'BOTH',
      postcode: '10967',
      distanceKm: 25,
      history: 'BFC Dynamo Frauen II',
      note: 'Defensive 6, 2 years senior football. Looking for next step.',
      avatarUrl: u('fa-sophie'),
      videoUrl: null,
      contactedByThisClub: false,
      postedAt: ago(14),
    },
    {
      id: 'fa-6',
      userId: 'fa-user-6',
      name: 'Niclas Roth',
      age: 15,
      position: 'GK',
      foot: 'RIGHT',
      postcode: '14163',
      distanceKm: 3,
      history: 'New to organised football — 5 years futsal.',
      note: 'Fast hands, strong distribution. Trials welcome any time.',
      avatarUrl: u('fa-niclas'),
      videoUrl: null,
      contactedByThisClub: false,
      postedAt: ago(1),
    },
  ]
}

function createExchange(): E2EApiState['exchange'] {
  // 5 listings — boots in 3 sizes, gloves, an outgrown jersey. Three
  // available, one claimed, one gone so the demo shows all states.
  const ago = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }
  const u = (seed: string) => `https://picsum.photos/seed/${seed}/600/600`
  return [
    {
      id: 'ex-1',
      sellerUserId: 'user-parent-1',
      sellerName: 'Nina Becker',
      title: 'Adidas Predator FG · Size 38',
      category: 'BOOTS',
      sizeLabel: 'EU 38',
      condition: 'GOOD',
      askCents: 2500,
      note: 'Outgrown after one season. Studs still solid.',
      photoUrl: u('boots-predator'),
      postedAt: ago(3),
      status: 'AVAILABLE',
      claimedByUserId: null,
      claimedByName: null,
    },
    {
      id: 'ex-2',
      sellerUserId: 'user-coach-1',
      sellerName: 'Markus Hoffmann',
      title: 'Nike GK gloves · adult M',
      category: 'GLOVES',
      sizeLabel: 'M',
      condition: 'WORN',
      askCents: 1000,
      note: 'Backup pair from last season — palms still grippy.',
      photoUrl: u('gloves-nike'),
      postedAt: ago(7),
      status: 'AVAILABLE',
      claimedByUserId: null,
      claimedByName: null,
    },
    {
      id: 'ex-3',
      sellerUserId: 'user-player-3',
      sellerName: 'Lukas Hoffmann',
      title: 'Albatros home jersey · 152',
      category: 'KIT',
      sizeLabel: 'Youth 152',
      condition: 'GOOD',
      askCents: 1500,
      note: 'Outgrown — perfect for U13/U14.',
      photoUrl: u('jersey-albatros'),
      postedAt: ago(2),
      status: 'CLAIMED',
      claimedByUserId: 'user-player-7',
      claimedByName: 'Jonas Krüger',
    },
    {
      id: 'ex-4',
      sellerUserId: 'user-parent-1',
      sellerName: 'Nina Becker',
      title: 'Puma Future MG · Size 42',
      category: 'BOOTS',
      sizeLabel: 'EU 42',
      condition: 'NEW',
      askCents: 4500,
      note: 'Brand new in box — wrong size. Receipt available.',
      photoUrl: u('boots-puma'),
      postedAt: ago(4),
      status: 'AVAILABLE',
      claimedByUserId: null,
      claimedByName: null,
    },
    {
      id: 'ex-5',
      sellerUserId: 'user-coach-1',
      sellerName: 'Markus Hoffmann',
      title: 'Training cones (set of 12)',
      category: 'OTHER',
      sizeLabel: '—',
      condition: 'GOOD',
      askCents: 800,
      note: 'Old set, replaced. Free to a good home if you collect.',
      photoUrl: u('cones'),
      postedAt: ago(20),
      status: 'GONE',
      claimedByUserId: 'user-coach-1',
      claimedByName: 'Markus Hoffmann',
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

function createJerseys(): E2EApiState['jerseys'] {
  // 18 jerseys — most assigned to seeded squad, a couple unassigned, a
  // mix of washed/not so the demo shows the rotation status clearly.
  const now = new Date().toISOString()
  return [
    { number: 1, holderUserId: 'user-player-1', holderName: 'Julian Becker', washed: true, assignedAt: now, note: 'GK kit' },
    { number: 2, holderUserId: 'user-player-2', holderName: 'Tim Weber', washed: true, assignedAt: now, note: null },
    { number: 3, holderUserId: 'user-player-5', holderName: 'Felix Bauer', washed: false, assignedAt: now, note: null },
    { number: 4, holderUserId: 'user-player-4', holderName: 'Anna Schmidt', washed: false, assignedAt: now, note: 'Dropped at clubhouse Sat night' },
    { number: 5, holderUserId: 'user-player-3', holderName: 'Lukas Hoffmann', washed: true, assignedAt: now, note: null },
    { number: 6, holderUserId: 'user-player-6', holderName: 'Niklas Wagner', washed: true, assignedAt: now, note: null },
    { number: 7, holderUserId: 'user-player-10', holderName: 'Max Hoffmann', washed: false, assignedAt: now, note: null },
    { number: 8, holderUserId: 'user-player-7', holderName: 'Jonas Krüger', washed: true, assignedAt: now, note: null },
    { number: 9, holderUserId: 'user-player-12', holderName: 'David Köhler', washed: true, assignedAt: now, note: 'Captain band' },
    { number: 10, holderUserId: 'user-player-8', holderName: 'Paul Schäfer', washed: true, assignedAt: now, note: null },
    { number: 11, holderUserId: 'user-player-11', holderName: 'Tobias Lang', washed: false, assignedAt: now, note: null },
    { number: 13, holderUserId: 'user-player-16', holderName: 'Hendrik Maier', washed: true, assignedAt: now, note: null },
    { number: 14, holderUserId: 'user-player-9', holderName: 'Leon Fischer', washed: true, assignedAt: now, note: null },
    { number: 15, holderUserId: 'user-player-17', holderName: 'Yannick Roth', washed: true, assignedAt: now, note: null },
    { number: 17, holderUserId: 'user-player-13', holderName: 'Erik Walter', washed: true, assignedAt: now, note: null },
    { number: 19, holderUserId: 'user-player-14', holderName: 'Moritz Vogel', washed: false, assignedAt: now, note: null },
    { number: 20, holderUserId: null, holderName: null, washed: true, assignedAt: now, note: 'Spare' },
    { number: 22, holderUserId: 'user-player-15', holderName: 'Simon Klein', washed: true, assignedAt: now, note: 'Backup GK' },
  ]
}

function createPitchStatus(): E2EApiState['pitchStatus'] {
  // Fresh pitch as the default — the Saturday match is on. The first
  // arriver-confirms photo-mock kicks in via the POST handler.
  return {
    fixtureId: 'fixture-1',
    state: 'OK',
    reportedById: null,
    reportedByName: null,
    reportedAt: null,
    photoUrl: null,
    note: null,
  }
}

function createVereinsheim(): E2EApiState['vereinsheim'] {
  // A standard Vereinsheim menu — Bratwurst, Pommes, Schnitzel, plus
  // Pils + Apfelschorle. Six seeded orders so the revenue summary
  // lands "84 € of 200 € target" on first open.
  const placedAt = (mins: number) => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - mins)
    return d.toISOString()
  }
  return {
    menu: [
      { id: 'm-brat', name: 'Bratwurst', priceCents: 350, icon: '🌭', category: 'FOOD' },
      { id: 'm-pom', name: 'Pommes', priceCents: 300, icon: '🍟', category: 'FOOD' },
      { id: 'm-schnitzel', name: 'Schnitzel', priceCents: 850, icon: '🍖', category: 'FOOD' },
      { id: 'm-cake', name: 'Kuchen', priceCents: 250, icon: '🍰', category: 'FOOD' },
      { id: 'm-pils', name: 'Pils 0.3l', priceCents: 350, icon: '🍺', category: 'DRINK' },
      { id: 'm-apfel', name: 'Apfelschorle', priceCents: 250, icon: '🥤', category: 'DRINK' },
      { id: 'm-kaffee', name: 'Kaffee', priceCents: 200, icon: '☕', category: 'DRINK' },
      { id: 'm-water', name: 'Wasser', priceCents: 200, icon: '💧', category: 'DRINK' },
    ],
    orders: [
      { id: 'o-1', buyerId: 'user-parent-1', buyerName: 'Nina Becker', itemId: 'm-brat', itemName: 'Bratwurst', priceCents: 350, qty: 2, placedAt: placedAt(8), paid: true },
      { id: 'o-2', buyerId: 'user-coach-1', buyerName: 'Markus Hoffmann', itemId: 'm-pils', itemName: 'Pils 0.3l', priceCents: 350, qty: 1, placedAt: placedAt(11), paid: true },
      { id: 'o-3', buyerId: 'user-admin-1', buyerName: 'Franziska Vogel', itemId: 'm-cake', itemName: 'Kuchen', priceCents: 250, qty: 3, placedAt: placedAt(20), paid: true },
      { id: 'o-4', buyerId: 'user-player-2', buyerName: 'Tim Weber', itemId: 'm-apfel', itemName: 'Apfelschorle', priceCents: 250, qty: 1, placedAt: placedAt(25), paid: true },
      { id: 'o-5', buyerId: null, buyerName: 'Walk-up', itemId: 'm-schnitzel', itemName: 'Schnitzel', priceCents: 850, qty: 1, placedAt: placedAt(40), paid: true },
      { id: 'o-6', buyerId: null, buyerName: 'Walk-up', itemId: 'm-pils', itemName: 'Pils 0.3l', priceCents: 350, qty: 4, placedAt: placedAt(55), paid: true },
    ],
    targetCents: 20000,
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

function createEhrenamt(): E2EApiState['ehrenamt'] {
  // Volunteer hours across 4 contributors with a healthy spread + a
  // cluster of recent entries so the demo lands "this month: 12.5h"
  // and "year-to-date: 87h of 200h" cleanly.
  const offsetIso = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }
  return {
    settings: { annualGoalHours: 200, foerderungReady: true },
    entries: [
      {
        id: 'ea-1',
        memberUserId: 'user-parent-1',
        memberName: 'Nina Becker',
        role: 'PARENT',
        activity: 'Kuchen-Dienst',
        hours: 3,
        occurredAt: offsetIso(2),
        note: 'Saturday home match',
      },
      {
        id: 'ea-2',
        memberUserId: 'user-coach-1',
        memberName: 'Markus Hoffmann',
        role: 'COACH',
        activity: 'Coaching session',
        hours: 1.5,
        occurredAt: offsetIso(3),
      },
      {
        id: 'ea-3',
        memberUserId: 'user-admin-1',
        memberName: 'Franziska Vogel',
        role: 'ADMIN',
        activity: 'Vereinsheim renovation',
        hours: 4,
        occurredAt: offsetIso(5),
        note: 'Repainted the entry hall',
      },
      {
        id: 'ea-4',
        memberUserId: 'user-coach-1',
        memberName: 'Markus Hoffmann',
        role: 'COACH',
        activity: 'Match coaching',
        hours: 2,
        occurredAt: offsetIso(9),
      },
      {
        id: 'ea-5',
        memberUserId: 'user-parent-1',
        memberName: 'Nina Becker',
        role: 'PARENT',
        activity: 'Platzdienst',
        hours: 2,
        occurredAt: offsetIso(11),
      },
      {
        id: 'ea-6',
        memberUserId: 'user-admin-1',
        memberName: 'Franziska Vogel',
        role: 'ADMIN',
        activity: 'BFV reporting',
        hours: 1.5,
        occurredAt: offsetIso(14),
      },
      {
        id: 'ea-7',
        memberUserId: 'user-parent-1',
        memberName: 'Nina Becker',
        role: 'PARENT',
        activity: 'Schiedsrichter-Begleitung',
        hours: 2,
        occurredAt: offsetIso(20),
      },
    ],
  }
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
  // Live MOTM open for fixture-1 — votes already coming in. Top of board
  // is Paul (free-kick goal) closely followed by David. Closes 2h after
  // expected full-time so coaches can wrap before posting.
  const totalVotes = 14
  const results = [
    { userId: 'user-player-8', name: 'Paul Schäfer', votes: 6, pct: 0 },
    { userId: 'user-player-12', name: 'David Köhler', votes: 5, pct: 0 },
    { userId: 'user-player-1', name: 'Julian Becker', votes: 2, pct: 0 },
    { userId: 'user-player-3', name: 'Lukas Hoffmann', votes: 1, pct: 0 },
  ].map((r) => ({ ...r, pct: Math.round((r.votes / totalVotes) * 100) }))
  return {
    'fixture-1': {
      fixtureId: 'fixture-1',
      totalVotes,
      results,
      myVoteUserId: null,
      closesAt: nowIso(0, 22, 0),
    },
  }
}

function createPhotos(): E2EApiState['photos'] {
  // Six seeded photos with vote counts; uses Picsum seeded URLs so the
  // grid renders something attractive without needing real uploads.
  // Picsum returns a stable image for `${seed}` on each call.
  const u = (seed: string, w = 800, h = 600) =>
    `https://picsum.photos/seed/${seed}/${w}/${h}`
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

function createCarpool(): E2EApiState['carpool'] {
  // Two seeded drivers (one mostly full, one half full) and one rider
  // looking for a seat. Drivers cluster by adjacent Berlin postcodes so
  // the postcode-match story reads naturally on first open.
  return {
    'fixture-1': [
      {
        id: 'ride-1',
        driverId: 'user-coach-1',
        driverName: 'Markus Hoffmann',
        postcode: '14169',
        seatsOffered: 4,
        parking: 'Lot F · 13:30 at clubhouse',
        notes: 'Will pass through Steglitz at 13:00 — ping me.',
        riders: [
          { userId: 'user-player-7', name: 'Jonas Krüger' },
          { userId: 'user-player-9', name: 'Leon Fischer' },
          { userId: 'user-player-13', name: 'Erik Walter' },
        ],
      },
      {
        id: 'ride-2',
        driverId: 'user-admin-1',
        driverName: 'Franziska Vogel',
        postcode: '14195',
        seatsOffered: 3,
        parking: 'Meet at U Krumme Lanke · 13:15',
        notes: null,
        riders: [{ userId: 'user-player-14', name: 'Moritz Vogel' }],
      },
      {
        id: 'ride-3',
        driverId: null,
        driverName: null,
        postcode: '14199',
        seatsOffered: 0,
        parking: null,
        notes: 'Ideally pickup near S Sundgauer Str.',
        riders: [{ userId: 'user-player-18', name: 'Kai Berger' }],
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
    { userId: 'user-player-1', name: 'Julian Becker', jerseyNumber: 1, position: 'GK', attendance: 0.92, minutesShare: 0.85, unavailable: false },
    { userId: 'user-player-2', name: 'Tim Weber', jerseyNumber: 2, position: 'DEF', attendance: 0.95, minutesShare: 0.92, unavailable: false },
    { userId: 'user-player-3', name: 'Lukas Hoffmann', jerseyNumber: 5, position: 'DEF', attendance: 0.88, minutesShare: 0.32, unavailable: false },
    { userId: 'user-player-4', name: 'Anna Schmidt', jerseyNumber: 4, position: 'DEF', attendance: 0.45, minutesShare: 0.4, unavailable: true },
    { userId: 'user-player-5', name: 'Felix Bauer', jerseyNumber: 3, position: 'DEF', attendance: 0.82, minutesShare: 0.78, unavailable: false },
    { userId: 'user-player-6', name: 'Niklas Wagner', jerseyNumber: 6, position: 'DEF', attendance: 0.78, minutesShare: 0.55, unavailable: false },
    { userId: 'user-player-7', name: 'Jonas Krüger', jerseyNumber: 8, position: 'MID', attendance: 0.9, minutesShare: 0.88, unavailable: false },
    { userId: 'user-player-8', name: 'Paul Schäfer', jerseyNumber: 10, position: 'MID', attendance: 0.94, minutesShare: 0.9, unavailable: false },
    { userId: 'user-player-9', name: 'Leon Fischer', jerseyNumber: 14, position: 'MID', attendance: 0.86, minutesShare: 0.42, unavailable: false },
    { userId: 'user-player-10', name: 'Max Hoffmann', jerseyNumber: 7, position: 'MID', attendance: 0.7, minutesShare: 0.6, unavailable: false },
    { userId: 'user-player-11', name: 'Tobias Lang', jerseyNumber: 11, position: 'MID', attendance: 0.83, minutesShare: 0.66, unavailable: false },
    { userId: 'user-player-12', name: 'David Köhler', jerseyNumber: 9, position: 'ATT', attendance: 0.96, minutesShare: 0.94, unavailable: false },
    { userId: 'user-player-13', name: 'Erik Walter', jerseyNumber: 17, position: 'ATT', attendance: 0.84, minutesShare: 0.51, unavailable: false },
    { userId: 'user-player-14', name: 'Moritz Vogel', jerseyNumber: 19, position: 'ATT', attendance: 0.72, minutesShare: 0.28, unavailable: false },
    { userId: 'user-player-15', name: 'Simon Klein', jerseyNumber: 22, position: 'GK', attendance: 0.65, minutesShare: 0.12, unavailable: false },
    { userId: 'user-player-16', name: 'Hendrik Maier', jerseyNumber: 13, position: 'DEF', attendance: 0.6, minutesShare: 0.2, unavailable: false },
    { userId: 'user-player-17', name: 'Yannick Roth', jerseyNumber: 15, position: 'MID', attendance: 0.58, minutesShare: 0.18, unavailable: false },
    { userId: 'user-player-18', name: 'Kai Berger', jerseyNumber: 20, position: 'ATT', attendance: 0.5, minutesShare: 0.08, unavailable: false },
  ]
}

// Builds a plausible RSVP roster matching the seeded aggregate counts, so the
// event-detail and attendance screens line up with the home card. The real API
// returns the full `rsvps` relation; this mirrors that contract in mock mode.
const RSVP_NAME_POOL = [
  'Julian Becker', 'Tim Weber', 'Lukas Hoffmann', 'Felix Braun', 'Jonas Schäfer',
  'Niklas Wolf', 'Max Hoffmann', 'Tobias Lang', 'David Köhler', 'Erik Walter',
  'Moritz Vogel', 'Simon Klein', 'Hendrik Maier', 'Yannick Roth', 'Kai Berger',
  'Leon Fuchs', 'Paul Schäfer', 'Finn Krüger', 'Jan Richter', 'Marvin Sommer',
]

function synthesizeRsvps(
  eventId: string,
  yes: number,
  maybe: number,
  no: number,
): Array<{
  id: string
  status: 'YES' | 'MAYBE' | 'NO'
  updatedAt: string
  user: { id: string; name: string; avatarUrl: null }
}> {
  const out: Array<{
    id: string
    status: 'YES' | 'MAYBE' | 'NO'
    updatedAt: string
    user: { id: string; name: string; avatarUrl: null }
  }> = []
  let i = 0
  const push = (status: 'YES' | 'MAYBE' | 'NO', count: number) => {
    for (let n = 0; n < count; n += 1) {
      const name = RSVP_NAME_POOL[i % RSVP_NAME_POOL.length]
      out.push({
        id: `rsvp-${eventId}-${i}`,
        status,
        updatedAt: new Date().toISOString(),
        user: { id: `user-rsvp-${i}`, name, avatarUrl: null },
      })
      i += 1
    }
  }
  push('YES', yes)
  push('MAYBE', maybe)
  push('NO', no)
  return out
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

function createDuties(): E2EApiState['duties'] {
  // Seeded rotation across the four typical German amateur-club duties.
  // Assignments are spread across the seeded users so any logged-in
  // scenario sees at least one row tagged as "you".
  const members = [
    { userId: 'user-player-1', name: 'Julian Becker' },
    { userId: 'user-parent-1', name: 'Nina Becker' },
    { userId: 'user-coach-1', name: 'Markus Hoffmann' },
    { userId: 'user-admin-1', name: 'Franziska Vogel' },
    { userId: 'user-player-2', name: 'Tim Weber' },
    { userId: 'user-player-3', name: 'Lukas Hoffmann' },
  ]
  return {
    members,
    duties: [
      {
        id: 'duty-1',
        kind: 'KUCHEN',
        title: 'Kuchen-Dienst',
        date: nowIso(2, 11, 0),
        matchTitle: 'SV Albatros vs Hertha 03',
        assignedUserId: 'user-parent-1',
        assignedName: 'Nina Becker',
        swappable: true,
      },
      {
        id: 'duty-2',
        kind: 'AUFBAU',
        title: 'Pitch set-up',
        date: nowIso(2, 9, 30),
        matchTitle: 'SV Albatros vs Hertha 03',
        assignedUserId: 'user-player-1',
        assignedName: 'Julian Becker',
        swappable: true,
      },
      {
        id: 'duty-3',
        kind: 'SCHIRI',
        title: 'Referee escort',
        date: nowIso(2, 14, 30),
        matchTitle: 'SV Albatros vs Hertha 03',
        assignedUserId: 'user-coach-1',
        assignedName: 'Markus Hoffmann',
        swappable: false,
      },
      {
        id: 'duty-4',
        kind: 'PLATZWART',
        title: 'Platzwart',
        date: nowIso(9, 8, 0),
        matchTitle: 'SV Albatros vs FC Union 06',
        assignedUserId: 'user-admin-1',
        assignedName: 'Franziska Vogel',
        swappable: true,
      },
      {
        id: 'duty-5',
        kind: 'KUCHEN',
        title: 'Kuchen-Dienst',
        date: nowIso(9, 11, 0),
        matchTitle: 'SV Albatros vs FC Union 06',
        assignedUserId: 'user-player-2',
        assignedName: 'Tim Weber',
        swappable: true,
      },
    ],
  }
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
    trialInvites: [],
    joinRequests: createJoinRequests(),
    freeAgentProfile: null,
    myContributions: createMyContributions(),
    adminContributions: createAdminContributions(),
    duties: createDuties(),
    channelMembership: createChannelMembership(),
    squadStats: createSquadStats(),
    childrenAgenda: createChildrenAgenda(),
    carpool: createCarpool(),
    liveMatches: createLiveMatches(),
    motm: createMotmTallies(),
    photos: createPhotos(),
    compliance: createCompliance(),
    ehrenamt: createEhrenamt(),
    pendingDuesPauses: createPendingDuesPauses(),
    jerseys: createJerseys(),
    pitchStatus: createPitchStatus(),
    vereinsheim: createVereinsheim(),
    trialScouts: createTrialScouts(),
    exchange: createExchange(),
    streaks: createStreaks(),
    voiceMemos: createVoiceMemos(),
    sportgericht: createSportgericht(),
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
    api: createApiState(),
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
      trialInvites: createTrialInvites(),
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
      trialInvites: createTrialInvites(),
      freeAgentProfile: createFreeAgentProfile(),
    }),
  }
}

type E2EPrimaryScenarioName =
  | 'player'
  | 'parent'
  | 'coach'
  | 'club-admin'
  | 'free-agent'

function buildPostSignupSession(
  registrationRole: RegistrationRole,
): E2ESessionSnapshot {
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
  }
}

function emitSession(session: E2ESessionSnapshot | null) {
  currentSession = session ? clone(session) : null

  listeners.forEach((listener) => {
    listener(currentSession ? clone(currentSession) : null)
  })
}

export function isE2ESupported() {
  return __DEV__
}

export function getE2ESession() {
  return currentSession ? clone(currentSession) : null
}

export function subscribeToE2ESession(
  listener: (session: E2ESessionSnapshot | null) => void,
) {
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
      adminContributions:
        parsed.api?.adminContributions ?? defaults.adminContributions,
      duties: parsed.api?.duties ?? defaults.duties,
      channelMembership:
        parsed.api?.channelMembership ?? defaults.channelMembership,
      squadStats: parsed.api?.squadStats ?? defaults.squadStats,
      childrenAgenda:
        parsed.api?.childrenAgenda ?? defaults.childrenAgenda,
      carpool: parsed.api?.carpool ?? defaults.carpool,
      liveMatches: parsed.api?.liveMatches ?? defaults.liveMatches,
      motm: parsed.api?.motm ?? defaults.motm,
      photos: parsed.api?.photos ?? defaults.photos,
      compliance: parsed.api?.compliance ?? defaults.compliance,
      ehrenamt: parsed.api?.ehrenamt ?? defaults.ehrenamt,
      pendingDuesPauses:
        parsed.api?.pendingDuesPauses ?? defaults.pendingDuesPauses,
      jerseys: parsed.api?.jerseys ?? defaults.jerseys,
      pitchStatus: parsed.api?.pitchStatus ?? defaults.pitchStatus,
      vereinsheim: parsed.api?.vereinsheim ?? defaults.vereinsheim,
      trialScouts: parsed.api?.trialScouts ?? defaults.trialScouts,
      exchange: parsed.api?.exchange ?? defaults.exchange,
      streaks: parsed.api?.streaks ?? defaults.streaks,
      voiceMemos: parsed.api?.voiceMemos ?? defaults.voiceMemos,
      sportgericht: parsed.api?.sportgericht ?? defaults.sportgericht,
    }
    currentSession = parsed
    return clone(parsed)
  } catch {
    await AsyncStorage.removeItem(E2E_SESSION_KEY).catch(() => {})
    return null
  }
}

export async function activateE2EScenario(
  name: E2EPrimaryScenarioName,
) {
  if (!isE2ESupported()) {
    return null
  }

  const scenario = buildScenario(name)
  e2eTeamGroups =
    name === 'club-admin' || name === 'coach'
      ? [
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
      : []
  await AsyncStorage.setItem(E2E_SESSION_KEY, JSON.stringify(scenario)).catch(() => {})
  emitSession(scenario)
  return clone(scenario)
}

export async function activateE2EPostSignupRole(
  registrationRole: RegistrationRole,
) {
  if (!isE2ESupported()) {
    return null
  }

  const scenario = buildPostSignupSession(registrationRole)
  await AsyncStorage.setItem(E2E_SESSION_KEY, JSON.stringify(scenario)).catch(() => {})
  emitSession(scenario)
  return clone(scenario)
}

export async function clearE2ESession() {
  await AsyncStorage.removeItem(E2E_SESSION_KEY).catch(() => {})
  emitSession(null)
}

export function handleE2EApiRequest(
  path: string,
  options: { method: string; body?: unknown },
): E2EApiResponse {
  if (!currentSession) {
    return { handled: false }
  }

  const pathname = path.split('?')[0]
  const method = options.method.toUpperCase()
  const query = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : null

  if (method === 'GET' && pathname === '/me/children-events') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.parentEvents),
    }
  }

  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/events`
  ) {
    const scope = query?.get('scope') ?? 'upcoming'
    const typeFilter = query?.get('type') ?? null
    const now = new Date()
    // Mirror the server's 3-day archive window: past events older than 3 days
    // are treated as archived and not returned.
    const archiveCutoff = new Date(now)
    archiveCutoff.setDate(archiveCutoff.getDate() - 3)

    let filtered = clone(currentSession.api.events).filter((e: EventFeedItem) => {
      const eventDate = new Date(e.date)
      if (scope === 'past') {
        return eventDate < now && eventDate >= archiveCutoff
      }
      return eventDate >= now
    })

    if (typeFilter) {
      filtered = filtered.filter((e: EventFeedItem) => e.type === typeFilter)
    }

    return {
      handled: true,
      ok: true,
      status: 200,
      body: filtered,
    }
  }

  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/conversations`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.conversations),
    }
  }

  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/conversations`
  ) {
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

  if (
    method === 'PUT' &&
    pathname.startsWith(`/clubs/${CLUB_ID}/events/`) &&
    pathname.endsWith('/rsvp')
  ) {
    const eventId = pathname.split('/')[4]
    const nextStatus =
      options.body &&
      typeof options.body === 'object' &&
      'status' in options.body &&
      typeof (options.body as { status?: unknown }).status === 'string'
        ? (options.body as { status: EventFeedItem['myRsvp'] }).status
        : null

    currentSession.api.events = currentSession.api.events.map((event) =>
      event.id === eventId ? { ...event, myRsvp: nextStatus } : event,
    )

    return {
      handled: true,
      ok: true,
      status: 204,
    }
  }

  if (
    method === 'GET' &&
    pathname === `/teams/${TEAM_ID}/fixtures`
  ) {
    const limit = query?.get('limit')
    const fixtures = limit
      ? currentSession.api.fixtures.slice(0, Number.parseInt(limit, 10) || 1)
      : currentSession.api.fixtures

    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(fixtures),
    }
  }

  if (
    method === 'GET' &&
    pathname === '/integrations/fussball/team-links'
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.linkedTeams),
    }
  }

  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/members`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(E2E_STAFF),
    }
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

  const e2eTeamCreate = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/team-groups/([^/]+)/teams$`),
  )
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

  const e2eCoachAssign = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/teams/([^/]+)/coaches$`),
  )
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

  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/roster-ops`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.rosterOps),
    }
  }

  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/stats`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.clubStats),
    }
  }

  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/trial-invites`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.trialInvites),
    }
  }

  if (method === 'GET' && pathname === '/me/free-agent-profile') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.freeAgentProfile),
    }
  }

  // Save / update — both endpoints persist into the in-memory profile so
  // a save round-trip works without a backend. Without this the JS code
  // would attempt a real fetch which 401s during E2E (no Clerk token),
  // returns undefined, and crashes hydrateFromProfile on `.id`.
  if (
    (method === 'POST' || method === 'PATCH') &&
    pathname === '/me/free-agent-profile'
  ) {
    const profile = currentSession.api.freeAgentProfile
    if (!profile) {
      return { handled: true, ok: false, status: 404, message: 'No profile' }
    }
    const patch = (options.body || {}) as Partial<typeof profile>
    if ('position' in patch) profile.position = patch.position ?? null
    if ('preferredFoot' in patch) profile.preferredFoot = patch.preferredFoot ?? null
    if ('city' in patch) profile.city = patch.city ?? null
    if ('bio' in patch) profile.bio = patch.bio ?? null
    if ('isOnTransferList' in patch)
      profile.isOnTransferList = !!patch.isOnTransferList
    if ('visibility' in patch && patch.visibility) profile.visibility = patch.visibility
    if ('experience' in patch && Array.isArray(patch.experience)) {
      profile.experience = patch.experience.map((entry, idx) => ({
        id: entry.id || `e2e-exp-${Date.now()}-${idx}`,
        clubName: entry.clubName,
        roleLabel: entry.roleLabel,
        fromYear: entry.fromYear ?? null,
        toYear: entry.toYear ?? null,
        sortOrder: entry.sortOrder ?? idx,
      }))
    }
    profile.updatedAt = new Date().toISOString()
    return { handled: true, ok: true, status: 200, body: clone(profile) }
  }

  // Free-agent media endpoints — presign returns enabled:false in E2E so
  // the upload flow degrades gracefully (the UI shows "uploadNotAvailable")
  // instead of crashing on a real network call to a presign URL we can't
  // generate offline. Add/Delete patches the in-memory profile.media so
  // the optimistic UI persists across reloads in the same session.
  if (
    method === 'POST' &&
    pathname === '/me/free-agent-profile/media/presign'
  ) {
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

  const mediaDeleteMatch = pathname.match(
    /^\/me\/free-agent-profile\/media\/([^/]+)$/,
  )
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
  // The client only reads { code, link }, but we return the fuller shape.
  if (method === 'POST' && pathname === `/clubs/${CLUB_ID}/invites`) {
    const body = (options.body || {}) as Record<string, unknown>
    const role = typeof body.role === 'string' ? body.role : 'PLAYER'
    const code = `E2E-${Date.now().toString(36).toUpperCase()}`
    const link = `https://app.anstoss.example/join?code=${code}`
    return {
      handled: true,
      ok: true,
      status: 201,
      body: {
        id: `invite-mock-${Date.now()}`,
        code,
        link,
        url: link,
        role,
        status: 'PENDING',
      },
    }
  }

  // Active join request for the current user — drives /pending-approval.
  // No outbound request seeded for the demo personas, so report none and
  // let the screen behave as "no pending request".
  if (method === 'GET' && pathname === '/me/join-requests/active') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { request: null },
    }
  }

  // Pending join requests for the admin Pending-requests screen.
  if (method === 'GET' && pathname === `/clubs/${CLUB_ID}/join-requests`) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(
        currentSession.api.joinRequests.filter((r) => r.status === 'PENDING'),
      ),
    }
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
    const idx = currentSession.api.joinRequests.findIndex(
      (r) => r.id === requestId,
    )
    if (idx === -1) {
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

  if (method === 'GET' && pathname === '/me/trial-invites') {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.trialInvites),
    }
  }

  // Mutate trial invite (Accept/Decline) — the real PATCH would require
  // a Clerk-verified token; in E2E mode we update the in-memory mock so
  // the UI flow works end-to-end without a real backend.
  const trialInvitePatchMatch = pathname.match(/^\/trial-invites\/([^/]+)$/)
  if (method === 'PATCH' && trialInvitePatchMatch) {
    const inviteId = trialInvitePatchMatch[1]
    const status = (options.body as { status?: string } | undefined)?.status
    if (
      !status ||
      (status !== TrialInviteStatus.ACCEPTED &&
        status !== TrialInviteStatus.DECLINED)
    ) {
      return {
        handled: true,
        ok: false,
        status: 400,
        message: 'Invalid trial invite status',
      }
    }
    const idx = currentSession.api.trialInvites.findIndex(
      (i) => i.id === inviteId,
    )
    if (idx === -1) {
      return {
        handled: true,
        ok: false,
        status: 404,
        message: 'Trial invite not found',
      }
    }
    const next: TrialInvite = {
      ...currentSession.api.trialInvites[idx],
      status: status as TrialInviteStatus,
      respondedAt: new Date().toISOString(),
    }
    currentSession.api.trialInvites[idx] = next
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(next),
    }
  }

  // My contributions list (player view) — drives the More → My
  // contributions screen. Returns the seeded plans with running status.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/contributions/my`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.myContributions),
    }
  }

  // Stripe Checkout for a single contribution — POST
  // /clubs/:clubId/contributions/my/:planId/checkout. Returning a null url
  // is a SUCCESSFUL "club hasn't wired Stripe" response: the screen then
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
  const payMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/contributions/my/([^/]+)/pay$`),
  )
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
      (options.body as { operationalStatus?: string } | undefined)
        ?.operationalStatus ?? null
    const ops = currentSession.api.rosterOps
    const buckets: Array<{ key: 'squad' | 'newPlayers' | 'inactive' | 'trials'; list: typeof ops.squad }> = [
      { key: 'squad', list: ops.squad },
      { key: 'newPlayers', list: ops.operations.newPlayers },
      { key: 'inactive', list: ops.operations.inactive },
      { key: 'trials', list: ops.operations.trials },
    ]
    let found: typeof ops.squad[number] | null = null
    for (const b of buckets) {
      const idx = b.list.findIndex((m) => m.userId === targetUserId)
      if (idx >= 0) {
        found = { ...b.list[idx], operationalStatus: (nextStatus as 'ACTIVE' | 'NEW_PLAYER' | 'INACTIVE') ?? b.list[idx].operationalStatus }
        b.list.splice(idx, 1)
        break
      }
    }
    if (found) {
      if (nextStatus === 'ACTIVE') ops.squad.push(found)
      else if (nextStatus === 'NEW_PLAYER') ops.operations.newPlayers.push(found)
      else if (nextStatus === 'INACTIVE') ops.operations.inactive.push(found)
      else ops.squad.push(found)
    }
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
    const idx = ops.operations.trials.findIndex(
      (t) => t.id === memberId || t.userId === memberId,
    )
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
      [...ops.squad, ...ops.operations.newPlayers, ...ops.operations.inactive, ...ops.operations.trials]
        .find((m) => m.userId === userId) ?? null
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
      expectedReturnAt: null,
      expectedReturnLabel:
        typeof body.expectedReturnLabel === 'string'
          ? (body.expectedReturnLabel as string)
          : null,
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
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/duties/rotate`
  ) {
    return { handled: true, ok: true, status: 204 }
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

  // Event detail: synthesize a detail object from the events feed.
  const eventDetailMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/events/([^/]+)$`),
  )
  if (method === 'GET' && eventDetailMatch) {
    const eventId = eventDetailMatch[1]
    const event = currentSession.api.events.find((e) => e.id === eventId)
    if (!event) {
      return {
        handled: true,
        ok: false,
        status: 404,
        message: 'Event not found in mock data',
      }
    }
    // Synthesize a roster of RSVPs consistent with the feed aggregate so the
    // detail/attendance screens match the home card (instead of showing 0/0/0).
    const feedEvent = event as typeof event & {
      yesCount?: number
      maybeCount?: number
      noCount?: number
    }
    const rsvps = synthesizeRsvps(
      eventId,
      feedEvent.yesCount ?? 0,
      feedEvent.maybeCount ?? 0,
      feedEvent.noCount ?? 0,
    )
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone({
        ...event,
        rsvps,
        yesCount: feedEvent.yesCount ?? 0,
        maybeCount: feedEvent.maybeCount ?? 0,
        noCount: feedEvent.noCount ?? 0,
        reminderEnabled: false,
      }),
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
          name:
            currentSession.api.squadStats.find((p) => p.userId === userId)?.name ??
            'Player',
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
  const photoVote = pathname.match(
    /^\/fixtures\/([^/]+)\/photos\/([^/]+)\/vote$/,
  )
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

  // Carpool board — drives the carpool screen for a fixture. Returns
  // fixture metadata + every offered ride and rider request, with the
  // passenger list per ride so seat fill states render correctly.
  const carpoolGet = pathname.match(/^\/fixtures\/([^/]+)\/carpool$/)
  if (method === 'GET' && carpoolGet) {
    const fixId = carpoolGet[1]
    const fixture = currentSession.api.fixtures.find((f) => f.id === fixId)
    const rides = currentSession.api.carpool[fixId] ?? []
    return {
      handled: true,
      ok: true,
      status: 200,
      body: {
        fixture: fixture
          ? {
              id: fixture.id,
              title: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
              venueName: fixture.venueName,
              pitchAddress: fixture.pitchAddress,
              kickoffAt: fixture.kickoffAt,
            }
          : null,
        rides: clone(rides),
      },
    }
  }

  // Offer a ride — POST /fixtures/:fixtureId/carpool/offer.
  const carpoolOffer = pathname.match(
    /^\/fixtures\/([^/]+)\/carpool\/offer$/,
  )
  if (method === 'POST' && carpoolOffer) {
    const fixId = carpoolOffer[1]
    const map = currentSession.api.carpool
    if (!map[fixId]) map[fixId] = []
    const body = (options.body ?? {}) as {
      postcode?: string
      seatsOffered?: number
      parking?: string | null
      notes?: string | null
    }
    const driver = currentSession.user
    map[fixId].unshift({
      id: `ride-${Math.random().toString(36).slice(2, 8)}`,
      driverId: driver.id,
      driverName: driver.name,
      postcode: String(body.postcode ?? ''),
      seatsOffered: typeof body.seatsOffered === 'number' ? body.seatsOffered : 3,
      parking: body.parking ?? null,
      notes: body.notes ?? null,
      riders: [],
    })
    return { handled: true, ok: true, status: 201 }
  }

  // Request a ride — POST /fixtures/:fixtureId/carpool/request. Stored as
  // a rider entry on a placeholder driver-less "ride" record so the
  // board can list it under "looking" without modeling a separate type.
  const carpoolRequest = pathname.match(
    /^\/fixtures\/([^/]+)\/carpool\/request$/,
  )
  if (method === 'POST' && carpoolRequest) {
    const fixId = carpoolRequest[1]
    const map = currentSession.api.carpool
    if (!map[fixId]) map[fixId] = []
    const body = (options.body ?? {}) as {
      postcode?: string
      notes?: string | null
    }
    const me = currentSession.user
    map[fixId].push({
      id: `req-${Math.random().toString(36).slice(2, 8)}`,
      driverId: null,
      driverName: null,
      postcode: String(body.postcode ?? ''),
      seatsOffered: 0,
      parking: null,
      notes: body.notes ?? null,
      riders: [{ userId: me.id, name: me.name }],
    })
    return { handled: true, ok: true, status: 201 }
  }

  // Claim / release a seat — POST or DELETE
  // /fixtures/:fixtureId/carpool/:rideId/claim. Adds or removes the
  // current user from the ride's riders list.
  const carpoolClaim = pathname.match(
    /^\/fixtures\/([^/]+)\/carpool\/([^/]+)\/claim$/,
  )
  if (carpoolClaim && (method === 'POST' || method === 'DELETE')) {
    const [, fixId, rideId] = carpoolClaim
    const ride = currentSession.api.carpool[fixId]?.find((r) => r.id === rideId)
    const me = currentSession.user
    if (ride) {
      if (method === 'POST') {
        if (
          !ride.riders.some((r) => r.userId === me.id) &&
          ride.riders.length < ride.seatsOffered
        ) {
          ride.riders.push({ userId: me.id, name: me.name })
        }
      } else {
        ride.riders = ride.riders.filter((r) => r.userId !== me.id)
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Cancel a ride — DELETE /fixtures/:fixtureId/carpool/:rideId. Only
  // the driver / requester is allowed; mock just removes the entry.
  const carpoolDelete = pathname.match(
    /^\/fixtures\/([^/]+)\/carpool\/([^/]+)$/,
  )
  if (method === 'DELETE' && carpoolDelete) {
    const [, fixId, rideId] = carpoolDelete
    const list = currentSession.api.carpool[fixId]
    if (list) {
      currentSession.api.carpool[fixId] = list.filter((r) => r.id !== rideId)
    }
    return { handled: true, ok: true, status: 204 }
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
  const childRsvpMatch = pathname.match(
    /^\/me\/children-events\/([^/]+)\/rsvp$/,
  )
  if (method === 'POST' && childRsvpMatch) {
    const eventId = childRsvpMatch[1]
    const body = (options.body ?? {}) as { kidId?: string; status?: string }
    const events = currentSession.api.childrenAgenda.events
    const idx = events.findIndex(
      (ev) => ev.id === eventId && ev.kidId === body.kidId,
    )
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
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/squad-stats`
  ) {
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
  if (
    method === 'POST' &&
    pathname === `/teams/${TEAM_ID}/lineups`
  ) {
    return { handled: true, ok: true, status: 204 }
  }

  // Channel membership — drives the Channel-info sheet. The default
  // roster is seeded once; per-channel state is lazily forked off it so
  // new (CUSTOM) channels start with everyone in.
  const channelMembersGet = pathname.match(
    /^\/teams\/[^/]+\/channels\/([^/]+)\/members$/,
  )
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

  // Add a member to a channel — POST /teams/:teamId/channels/:id/members
  // { userId }. Flips the seed roster's isMember flag.
  if (method === 'POST' && channelMembersGet) {
    const channelId = channelMembersGet[1]
    const body = (options.body ?? {}) as { userId?: string }
    const map = currentSession.api.channelMembership
    if (!map[channelId]) map[channelId] = clone(map['default'] ?? [])
    const idx = map[channelId].findIndex((m) => m.userId === body.userId)
    if (idx >= 0) map[channelId][idx].isMember = true
    return { handled: true, ok: true, status: 204 }
  }

  // Remove a member — DELETE /teams/:teamId/channels/:id/members/:userId.
  const channelMemberDelete = pathname.match(
    /^\/teams\/[^/]+\/channels\/([^/]+)\/members\/([^/]+)$/,
  )
  if (method === 'DELETE' && channelMemberDelete) {
    const [, channelId, userId] = channelMemberDelete
    const map = currentSession.api.channelMembership
    if (!map[channelId]) map[channelId] = clone(map['default'] ?? [])
    const idx = map[channelId].findIndex((m) => m.userId === userId)
    if (idx >= 0) map[channelId][idx].isMember = false
    return { handled: true, ok: true, status: 204 }
  }

  // Team duties (Kuchen-Dienst / Aufbau / Platzwart / Schiri-Begleitung).
  // Returns the rotation roster + each upcoming assignment so members can
  // see who has the next duty and swap with a teammate.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/duties`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.duties),
    }
  }

  // Duty swap — POST /clubs/:clubId/duties/:dutyId/swap { otherUserId }.
  // Reassigns the duty to the chosen teammate so the row visibly flips on
  // the next refetch.
  const dutySwapMatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/duties/([^/]+)/swap$`),
  )
  if (method === 'POST' && dutySwapMatch) {
    const dutyId = dutySwapMatch[1]
    const body = (options.body ?? {}) as { otherUserId?: string }
    const idx = currentSession.api.duties.duties.findIndex((d) => d.id === dutyId)
    if (idx >= 0 && body.otherUserId) {
      const member = currentSession.api.duties.members.find(
        (m) => m.userId === body.otherUserId,
      )
      if (member) {
        currentSession.api.duties.duties[idx] = {
          ...currentSession.api.duties.duties[idx],
          assignedUserId: member.userId,
          assignedName: member.name,
        }
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Admin contributions overview — drives admin-billing + the plan editor.
  // Returns settings, summary KPIs, the plan list, and per-member rows.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/contributions`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.adminContributions),
    }
  }

  // Admin: list plans only — used by the plan editor when no planId is
  // passed (so it can render an overview list without the full member roll).
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/contributions/plans`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.adminContributions.plans),
    }
  }

  // Admin: create a new plan. Push it onto state so the list reflects it
  // on the next refetch — including a fresh id and now() timestamps.
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/contributions/plans`
  ) {
    const body = (options.body ?? {}) as Record<string, unknown>
    const memberIds = Array.isArray(body.memberUserIds)
      ? (body.memberUserIds as string[])
      : []
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
        (body.targetRole as 'PLAYER' | 'PARENT' | 'COACH' | 'ADMIN' | 'CUSTOM') ??
        'PLAYER',
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
    const idx = currentSession.api.adminContributions.plans.findIndex(
      (p) => p.id === planId,
    )
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
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/contributions/assignments`
  ) {
    const body = (options.body ?? {}) as { planId?: string; memberUserIds?: string[] }
    const idx = currentSession.api.adminContributions.plans.findIndex(
      (p) => p.id === body.planId,
    )
    if (idx >= 0) {
      currentSession.api.adminContributions.plans[idx].assignedMemberCount =
        Array.isArray(body.memberUserIds) ? body.memberUserIds.length : 0
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Admin: send reminders — POST /clubs/:clubId/contributions/plans/:planId/remind
  // OR  /clubs/:clubId/contributions/reminders (bulk). Returns a dispatch result.
  const remindMatch = pathname.match(
    new RegExp(
      `^/clubs/${CLUB_ID}/contributions/(?:plans/[^/]+/remind|reminders)$`,
    ),
  )
  if (method === 'POST' && remindMatch) {
    const overdue =
      currentSession.api.adminContributions.summary.overdueMembers
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
      body: clone(
        currentSession.api.voiceMemos.filter((m) => m.toUserId === me.id),
      ),
    }
  }

  // Voice memos — GET /clubs/:clubId/voice-memos/sent returns memos
  // the caller (typically a coach) has sent.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/voice-memos/sent`
  ) {
    const me = currentSession.user
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(
        currentSession.api.voiceMemos.filter((m) => m.fromUserId === me.id),
      ),
    }
  }

  // Voice memos — POST /clubs/:clubId/voice-memos { toUserId, title, tags,
  // durationSec }. Mock-mode reuses a placeholder audio URL.
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/voice-memos`
  ) {
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

  // Sportgericht — GET /clubs/:clubId/sportgericht/reports returns
  // every disciplinary report draft + submitted state.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/sportgericht/reports`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.sportgericht),
    }
  }

  // Sportgericht — PATCH /clubs/:clubId/sportgericht/reports/:id with
  // { coachNarrative? incidents? }. Mock-mode merges and bumps no
  // status.
  const sgPatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/sportgericht/reports/([^/]+)$`),
  )
  if (method === 'PATCH' && sgPatch) {
    const id = sgPatch[1]
    const idx = currentSession.api.sportgericht.findIndex((r) => r.id === id)
    if (idx >= 0) {
      const body = (options.body ?? {}) as Record<string, unknown>
      currentSession.api.sportgericht[idx] = {
        ...currentSession.api.sportgericht[idx],
        ...body,
      } as E2EApiState['sportgericht'][number]
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Sportgericht — POST .../:id/submit flips status to SUBMITTED, sets
  // submittedAt. The fake "verband" is the BFV; an Alert client-side
  // surfaces the submission receipt.
  const sgSubmit = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/sportgericht/reports/([^/]+)/submit$`),
  )
  if (method === 'POST' && sgSubmit) {
    const id = sgSubmit[1]
    const idx = currentSession.api.sportgericht.findIndex((r) => r.id === id)
    if (idx >= 0) {
      currentSession.api.sportgericht[idx].status = 'SUBMITTED'
      currentSession.api.sportgericht[idx].submittedAt = new Date().toISOString()
    }
    return {
      handled: true,
      ok: true,
      status: 200,
      body: { receipt: `BFV-${Date.now()}` },
    }
  }

  // Trial scouting feed — GET /clubs/:clubId/scouting returns every
  // free-agent listing the admin's club is allowed to see. Sort is by
  // distance ASC, then postedAt DESC so closest + freshest shows first.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/scouting`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.trialScouts),
    }
  }

  // Express interest — POST /clubs/:clubId/scouting/:id/interest. Marks
  // the listing as contacted by this club so the badge updates.
  const scoutInterest = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/scouting/([^/]+)/interest$`),
  )
  if (method === 'POST' && scoutInterest) {
    const id = scoutInterest[1]
    const idx = currentSession.api.trialScouts.findIndex((s) => s.id === id)
    if (idx >= 0) {
      currentSession.api.trialScouts[idx].contactedByThisClub = true
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Boot exchange — GET /clubs/:clubId/exchange + POST a new listing +
  // POST claim + DELETE listing. Mocks per-status state transitions.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/exchange`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.exchange),
    }
  }

  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/exchange`
  ) {
    const body = (options.body ?? {}) as {
      title?: string
      category?: 'BOOTS' | 'KIT' | 'GLOVES' | 'OTHER'
      sizeLabel?: string
      condition?: 'NEW' | 'GOOD' | 'WORN'
      askCents?: number
      note?: string | null
      photoUrl?: string | null
    }
    const me = currentSession.user
    currentSession.api.exchange.unshift({
      id: `ex-${Math.random().toString(36).slice(2, 8)}`,
      sellerUserId: me.id,
      sellerName: me.name,
      title: String(body.title ?? 'Untitled item'),
      category: body.category ?? 'OTHER',
      sizeLabel: body.sizeLabel ?? '—',
      condition: body.condition ?? 'GOOD',
      askCents: typeof body.askCents === 'number' ? body.askCents : 0,
      note: body.note ?? null,
      photoUrl:
        body.photoUrl ||
        `https://picsum.photos/seed/${Math.random()
          .toString(36)
          .slice(2, 8)}/600/600`,
      postedAt: new Date().toISOString(),
      status: 'AVAILABLE',
      claimedByUserId: null,
      claimedByName: null,
    })
    return { handled: true, ok: true, status: 201 }
  }

  // Claim / release a listing.
  const exchangeClaim = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/exchange/([^/]+)/claim$`),
  )
  if (exchangeClaim && (method === 'POST' || method === 'DELETE')) {
    const id = exchangeClaim[1]
    const idx = currentSession.api.exchange.findIndex((e) => e.id === id)
    if (idx >= 0) {
      const me = currentSession.user
      if (method === 'POST') {
        currentSession.api.exchange[idx] = {
          ...currentSession.api.exchange[idx],
          status: 'CLAIMED',
          claimedByUserId: me.id,
          claimedByName: me.name,
        }
      } else {
        currentSession.api.exchange[idx] = {
          ...currentSession.api.exchange[idx],
          status: 'AVAILABLE',
          claimedByUserId: null,
          claimedByName: null,
        }
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Mark as gone (seller-only in real mode; mock allows).
  const exchangeGone = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/exchange/([^/]+)/gone$`),
  )
  if (method === 'POST' && exchangeGone) {
    const id = exchangeGone[1]
    const idx = currentSession.api.exchange.findIndex((e) => e.id === id)
    if (idx >= 0) {
      currentSession.api.exchange[idx].status = 'GONE'
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Streaks — GET /clubs/:clubId/streaks returns the caller's personal
  // streaks + the squad leaderboard.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/streaks`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.streaks),
    }
  }

  // Jersey rotation — GET /clubs/:clubId/teams/:teamId/jerseys.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/jerseys`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.jerseys),
    }
  }

  // Reassign / mark washed — PATCH /clubs/:clubId/teams/:teamId/jerseys/:n
  // { holderUserId? holderName? washed? note? }.
  const jerseyPatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/teams/${TEAM_ID}/jerseys/(\\d+)$`),
  )
  if (method === 'PATCH' && jerseyPatch) {
    const num = parseInt(jerseyPatch[1], 10)
    const idx = currentSession.api.jerseys.findIndex((j) => j.number === num)
    if (idx >= 0) {
      const body = (options.body ?? {}) as Partial<E2EApiState['jerseys'][number]>
      currentSession.api.jerseys[idx] = {
        ...currentSession.api.jerseys[idx],
        ...body,
        assignedAt: new Date().toISOString(),
      }
    }
    return { handled: true, ok: true, status: 204 }
  }

  // Pitch status — GET /clubs/:clubId/teams/:teamId/pitch-status.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/pitch-status`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.pitchStatus),
    }
  }

  // Pitch confirm — POST /clubs/:clubId/teams/:teamId/pitch-status
  // { state, photoUrl?, note? }.
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/teams/${TEAM_ID}/pitch-status`
  ) {
    const body = (options.body ?? {}) as {
      state?: 'OK' | 'WET' | 'FROZEN' | 'CANCELLED'
      photoUrl?: string | null
      note?: string | null
    }
    const me = currentSession.user
    currentSession.api.pitchStatus = {
      ...currentSession.api.pitchStatus,
      state: body.state ?? 'OK',
      reportedById: me.id,
      reportedByName: me.name,
      reportedAt: new Date().toISOString(),
      photoUrl:
        body.photoUrl ??
        `https://picsum.photos/seed/pitch-${Math.random().toString(36).slice(2, 6)}/800/500`,
      note: body.note ?? null,
    }
    return { handled: true, ok: true, status: 200, body: clone(currentSession.api.pitchStatus) }
  }

  // Vereinsheim — GET /clubs/:clubId/vereinsheim returns menu + orders +
  // the target. The menu screen rolls them up into "X € of Y € target".
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/vereinsheim`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.vereinsheim),
    }
  }

  // Vereinsheim — POST /clubs/:clubId/vereinsheim/orders { itemId, qty }.
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/vereinsheim/orders`
  ) {
    const body = (options.body ?? {}) as { itemId?: string; qty?: number }
    const item = currentSession.api.vereinsheim.menu.find(
      (m) => m.id === body.itemId,
    )
    const qty = typeof body.qty === 'number' ? Math.max(1, body.qty) : 1
    if (item) {
      const me = currentSession.user
      currentSession.api.vereinsheim.orders.unshift({
        id: `o-${Date.now()}`,
        buyerId: me.id,
        buyerName: me.name,
        itemId: item.id,
        itemName: item.name,
        priceCents: item.priceCents,
        qty,
        placedAt: new Date().toISOString(),
        paid: true,
      })
    }
    return { handled: true, ok: true, status: 201 }
  }

  // Compliance dashboard — GET /clubs/:clubId/compliance returns every
  // tracked document (Spielerpass, Führungszeugnis, medical, vaccination,
  // first-aid) with expiry + issue + document links + per-row notes.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/compliance`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.compliance),
    }
  }

  // Compliance — PATCH /clubs/:clubId/compliance/:id { expiresAt?,
  // documentUrl?, note? } so admins can mark renewed / replace docs.
  const compliancePatch = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/compliance/([^/]+)$`),
  )
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
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/contributions/pending-pauses`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.pendingDuesPauses),
    }
  }

  // Approve / snooze a pending pause.
  const pauseDecision = pathname.match(
    new RegExp(
      `^/clubs/${CLUB_ID}/contributions/pending-pauses/([^/]+)/(approve|snooze|dismiss)$`,
    ),
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

  // Ehrenamt-Stunden — GET /clubs/:clubId/ehrenamt returns settings +
  // every entry. The dashboard rolls them up by month / member.
  if (
    method === 'GET' &&
    pathname === `/clubs/${CLUB_ID}/ehrenamt`
  ) {
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.ehrenamt),
    }
  }

  // POST /clubs/:clubId/ehrenamt/entries — log new volunteer hours.
  if (
    method === 'POST' &&
    pathname === `/clubs/${CLUB_ID}/ehrenamt/entries`
  ) {
    const body = (options.body ?? {}) as {
      activity?: string
      hours?: number
      note?: string | null
      memberUserId?: string
      memberName?: string
      role?: 'COACH' | 'PARENT' | 'ADMIN' | 'OWNER'
    }
    const me = currentSession.user
    currentSession.api.ehrenamt.entries.unshift({
      id: `ea-${Math.random().toString(36).slice(2, 8)}`,
      memberUserId: body.memberUserId ?? me.id,
      memberName: body.memberName ?? me.name,
      role: body.role ?? 'PARENT',
      activity: String(body.activity ?? 'Activity'),
      hours: typeof body.hours === 'number' ? body.hours : 1,
      occurredAt: new Date().toISOString(),
      note: body.note ?? null,
    })
    return { handled: true, ok: true, status: 201 }
  }

  // DELETE /clubs/:clubId/ehrenamt/entries/:id.
  const ehrenamtDelete = pathname.match(
    new RegExp(`^/clubs/${CLUB_ID}/ehrenamt/entries/([^/]+)$`),
  )
  if (method === 'DELETE' && ehrenamtDelete) {
    const id = ehrenamtDelete[1]
    currentSession.api.ehrenamt.entries =
      currentSession.api.ehrenamt.entries.filter((e) => e.id !== id)
    return { handled: true, ok: true, status: 204 }
  }

  // Safety net: when an E2E session is active, never fall through to a
  // real network request. Unmatched endpoints return safe defaults so
  // screens render their empty states instead of triggering 401s and
  // the sign-out flow.
  if (__DEV__) {
    console.info(
      `[e2e] unmocked ${method} ${pathname} → returning default response`,
    )
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
