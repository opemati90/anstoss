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
  fixtures: ImportedFixture[]
  linkedTeams: ExternalTeamLink[]
  clubStats: ClubAggregateStats | null
  rosterOps: RosterOpsSnapshot | null
  trialInvites: TrialInvite[]
  freeAgentProfile: FreeAgentProfile | null
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

function createApiState(overrides?: Partial<E2EApiState>): E2EApiState {
  return {
    events: createEvents(),
    parentEvents: [],
    fixtures: createFixtures(),
    linkedTeams: [],
    clubStats: null,
    rosterOps: null,
    trialInvites: [],
    freeAgentProfile: null,
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

  return { handled: false }
}
