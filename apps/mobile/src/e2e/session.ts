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
      kickoffAt: nowIso(3, 14, 0),
      status: 'scheduled',
      homeTeam: 'SV Albatros',
      awayTeam: 'SV Babelsberg 03',
      homeLogo: null,
      awayLogo: null,
      venueName: 'Karl-Liebknecht-Stadion',
      pitchAddress: 'Karl-Liebknecht-Stadion',
      resultHome: null,
      resultAway: null,
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
        dueDate: overdueDate,
        status: 'OVERDUE',
        paidAmount: null,
        paidAt: null,
      },
      {
        planId: 'plan-annual',
        planName: 'Jahresbeitrag',
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
    freeAgentProfile: null,
    myContributions: createMyContributions(),
    adminContributions: createAdminContributions(),
    duties: createDuties(),
    channelMembership: createChannelMembership(),
    squadStats: createSquadStats(),
    childrenAgenda: createChildrenAgenda(),
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
      adminContributions:
        parsed.api?.adminContributions ?? defaults.adminContributions,
      duties: parsed.api?.duties ?? defaults.duties,
      channelMembership:
        parsed.api?.channelMembership ?? defaults.channelMembership,
      squadStats: parsed.api?.squadStats ?? defaults.squadStats,
      childrenAgenda:
        parsed.api?.childrenAgenda ?? defaults.childrenAgenda,
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
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone(currentSession.api.events),
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
      body: clone(currentSession.api.rosterOps?.operations.trials ?? []),
    }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ops.medic.active as any[]).unshift(injury)
    return { handled: true, ok: true, status: 200, body: clone(injury) }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    return {
      handled: true,
      ok: true,
      status: 200,
      body: clone({
        ...event,
        rsvps: [],
        yesCount: 0,
        maybeCount: 0,
        noCount: 0,
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

  // MOTM / lineup endpoints used by match-detail. Return null tally /
  // empty lineup so the screen renders its "not available yet" state.
  if (method === 'GET' && /^\/fixtures\/[^/]+\/(motm|lineup)$/.test(pathname)) {
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
