import { matchesSearchText } from '@anstoss/shared'
/**
 * Club-admin e2e world — one consistent SV Albatros for the club-admin
 * persona (owned by the club-admin revamp).
 *
 * Every number the admin sees agrees across screens because it is derived
 * from the same seed here:
 *   126 Mitglieder · 8 Mannschaften (1 without a head coach: D-Jugend)
 *   2 Aufnahmeanträge (from session.api.joinRequests)
 *   4 overdue dues totalling 150 € (from session.api.adminContributions)
 *   2 youth coaches without a Führungszeugnis (Stefan Braun, Katrin Vogt)
 *   Kassenwart unfilled (Schriftführer: Lukas Weber)
 *
 * The session.ts request handler calls `handleClubAdminWorldRequest` first;
 * it answers only the routes listed here and returns null for the rest.
 */

type WorldRole = 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
type WorldTeamRole = 'HEAD_COACH' | 'ASSISTANT_COACH' | 'PLAYER'

export type WorldMember = {
  id: string
  userId: string
  role: WorldRole
  operationalRoles: string[]
  name: string
  isYouth: boolean
  isActive: boolean
  teamNames: string[]
  user: {
    id: string
    name: string
    email: string
    avatarUrl: string | null
    teamAccess: Array<{
      id: string
      role: 'HEAD_COACH' | 'ASSISTANT_COACH'
      team: { id: string; displayName: string; group: { id: string; displayName: string } }
    }>
  }
}

type WorldCoach = { userId: string; name: string; avatarUrl: string | null }
type WorldTeam = {
  id: string
  displayName: string
  squadLabel: string | null
  leagueName: string | null
  memberCount: number
  coachAssignments: { headCoach: WorldCoach | null; assistants: WorldCoach[] }
}
type WorldGroup = { id: string; displayName: string; type: string; teams: WorldTeam[] }

type WorldCompliance = {
  id: string
  memberUserId: string
  memberName: string
  role: WorldRole
  kind: string
  expiresAt: string | null
  issuedAt: string | null
  documentUrl: string | null
  note: string | null
}

type WorldState = {
  members: WorldMember[]
  groups: WorldGroup[]
  compliance: WorldCompliance[]
  chatRetention: { enabled: boolean; messageRetentionDays: number; attachmentRetentionDays: number }
  reports: WorldReport[]
}

type WorldReport = {
  id: string
  kind: 'channel' | 'direct'
  reason: string
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
  overdue: boolean
  reporter: { id: string; name: string | null }
  message: {
    id: string
    content: string
    removed: boolean
    createdAt: string
    sender: { id: string; name: string | null } | null
    teamId: string | null
    channelId: string | null
    /** Evidence: short-lived signed URL (300s on the API) or null. */
    attachment: { url: string; meta: Record<string, unknown> | null } | null
  }
  /**
   * Mock only (never sent): the sender became club staff after the report was
   * filed, so resolving it answers 403 and it moves to the platform queue.
   */
  escalateOnResolve?: boolean
}

export type ClubAdminWorldSession = {
  scenario: string
  user: { id: string; name: string }
  api: {
    joinRequests: Array<{
      id: string
      role: string
      message: string | null
      status: string
      revision: number
      createdAt: string
      user: { id: string; name: string; email: string }
    }>
    adminContributions: {
      settings: { defaultCurrency: string }
      members: Array<{
        memberUserId: string
        name: string
        amount: number | null
        paidAmount: number | null
        currency: string | null
        dueDate: string | null
        status: string | null
        planName: string | null
      }>
    }
  }
}

type WorldResponse = { handled: true; ok: boolean; status: number; body?: unknown; message?: string }

const DAY = 24 * 60 * 60 * 1000
/** Last compliance reminder per `${memberUserId}:${kind}` (24h cooldown mock). */
const remindedAt = new Map<string, number>()
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString()

export const WORLD_TEAM_IDS = {
  herren1: 'team-e2e-senior-1',
  herren2: 'team-e2e-herren-2',
  damen: 'team-e2e-damen',
  aJugend: 'team-e2e-a-jugend',
  cJugend: 'team-e2e-c-jugend',
  dJugend: 'team-e2e-d-jugend',
  eJugend: 'team-e2e-e-jugend',
  fJugend: 'team-e2e-f-jugend',
} as const

const GROUPS = {
  senior: { id: 'group-e2e-senior', displayName: 'Senioren', type: 'SENIOR' },
  youth: { id: 'group-e2e-youth', displayName: 'Junioren', type: 'YOUTH' },
  mini: { id: 'group-e2e-mini', displayName: 'Bambini & F-Jugend', type: 'MINI' },
} as const

type TeamSeed = {
  id: string
  name: string
  squadLabel: string | null
  league: string | null
  group: keyof typeof GROUPS
  players: number
  youth: boolean
}

const TEAM_SEEDS: TeamSeed[] = [
  { id: WORLD_TEAM_IDS.herren1, name: 'Senior Team', squadLabel: '1. Mannschaft', league: 'Kreisliga A', group: 'senior', players: 22, youth: false },
  { id: WORLD_TEAM_IDS.herren2, name: 'Herren II', squadLabel: '2. Mannschaft', league: 'Kreisklasse B', group: 'senior', players: 14, youth: false },
  { id: WORLD_TEAM_IDS.damen, name: 'Damen', squadLabel: null, league: 'Bezirksliga', group: 'senior', players: 14, youth: false },
  { id: WORLD_TEAM_IDS.aJugend, name: 'A-Jugend (U19)', squadLabel: null, league: 'Kreisliga', group: 'youth', players: 14, youth: true },
  { id: WORLD_TEAM_IDS.cJugend, name: 'C-Jugend (U15)', squadLabel: null, league: 'Kreisliga', group: 'youth', players: 12, youth: true },
  { id: WORLD_TEAM_IDS.dJugend, name: 'D-Jugend (U13)', squadLabel: null, league: 'Kreisklasse', group: 'youth', players: 10, youth: true },
  { id: WORLD_TEAM_IDS.eJugend, name: 'E-Jugend (U11)', squadLabel: null, league: null, group: 'youth', players: 9, youth: true },
  { id: WORLD_TEAM_IDS.fJugend, name: 'F-Jugend (U9)', squadLabel: null, league: null, group: 'mini', players: 8, youth: true },
]

type StaffSeed = {
  key: string
  userId?: string
  name: string
  role: WorldRole
  ops: string[]
  head?: string
  assistant?: string
}

// Nine staff. Mara Schulte is the signed-in club-admin persona (user-admin-1).
const STAFF_SEEDS: StaffSeed[] = [
  { key: 'mara', userId: 'user-admin-1', name: 'Mara Schulte', role: 'OWNER', ops: ['BOARD_MEMBER'], head: WORLD_TEAM_IDS.herren1 },
  { key: 'lukas-w', name: 'Lukas Weber', role: 'ADMIN', ops: ['SECRETARY'] },
  { key: 'markus', userId: 'user-coach-1', name: 'Markus Hoffmann', role: 'COACH', ops: [], head: WORLD_TEAM_IDS.herren2 },
  { key: 'sandra', name: 'Sandra Keller', role: 'COACH', ops: [], head: WORLD_TEAM_IDS.damen },
  { key: 'tobias', name: 'Tobias Lang', role: 'COACH', ops: ['TEAM_COORDINATOR'], head: WORLD_TEAM_IDS.aJugend },
  { key: 'ali', name: 'Ali Yılmaz', role: 'COACH', ops: [], assistant: WORLD_TEAM_IDS.aJugend },
  { key: 'stefan', name: 'Stefan Braun', role: 'COACH', ops: [], head: WORLD_TEAM_IDS.cJugend },
  { key: 'katrin', name: 'Katrin Vogt', role: 'COACH', ops: [], head: WORLD_TEAM_IDS.eJugend },
  { key: 'peter', name: 'Peter Neumann', role: 'COACH', ops: [], head: WORLD_TEAM_IDS.fJugend },
]

const FIRST_ADULT = ['Tim', 'Jonas', 'Felix', 'Noah', 'Leon', 'Paul', 'Ben', 'Elias', 'Finn', 'Moritz', 'Niklas', 'Jan', 'David', 'Tom', 'Max', 'Erik', 'Sebastian', 'Florian', 'Daniel', 'Kevin', 'Marco', 'Dennis']
const FIRST_WOMEN = ['Lena', 'Sophie', 'Marie', 'Laura', 'Julia', 'Anna', 'Lea', 'Hannah', 'Nina', 'Sarah', 'Carla', 'Jana', 'Pia', 'Kim']
const FIRST_YOUTH = ['Luca', 'Emil', 'Anton', 'Mats', 'Theo', 'Henry', 'Karl', 'Levi', 'Jakob', 'Oskar', 'Mika', 'Lio', 'Ole', 'Milan', 'Yusuf', 'Can', 'Deniz', 'Mia', 'Emma', 'Ida']
const LAST = ['Weber', 'Krüger', 'Bauer', 'Schmidt', 'Becker', 'Wagner', 'Fischer', 'Schulz', 'Meyer', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Zimmermann', 'Hartmann', 'Lange', 'Krause', 'Lehmann', 'Köhler', 'Maier', 'Brandt', 'Seidel', 'Kaiser', 'Fuchs', 'Peters', 'Arnold', 'Busch']
const PASSIVE_NAMES = ['Werner Albrecht', 'Gisela Hahn', 'Helmut Engel', 'Renate Vogel', 'Dieter Sommer', 'Ursula Frank', 'Klaus Roth', 'Monika Berger', 'Horst Keller', 'Brigitte Ludwig', 'Günter Winkler', 'Erika Schubert', 'Jürgen Otto', 'Heike Pohl']

function emailFor(name: string) {
  const local = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '')
  return `${local}@sv-albatros.example`
}

function teamById(id: string) {
  return TEAM_SEEDS.find((team) => team.id === id)
}

function buildMembers(): WorldMember[] {
  const members: WorldMember[] = []
  const used = new Set<string>()
  const staffNames = new Set(STAFF_SEEDS.map((s) => s.name))

  for (const staff of STAFF_SEEDS) {
    const userId = staff.userId ?? `user-e2e-${staff.key}`
    const access: WorldMember['user']['teamAccess'] = []
    for (const [teamId, role] of [
      [staff.head, 'HEAD_COACH'],
      [staff.assistant, 'ASSISTANT_COACH'],
    ] as const) {
      const team = teamId ? teamById(teamId) : undefined
      if (!team) continue
      const group = GROUPS[team.group]
      access.push({
        id: `ta-${staff.key}-${team.id}`,
        role,
        team: { id: team.id, displayName: team.name, group: { id: group.id, displayName: group.displayName } },
      })
    }
    members.push({
      id: `mem-${staff.key}`,
      userId,
      role: staff.role,
      operationalRoles: [...staff.ops],
      name: staff.name,
      isYouth: false,
      isActive: true,
      teamNames: access.map((a) => a.team.displayName),
      user: { id: userId, name: staff.name, email: emailFor(staff.name), avatarUrl: null, teamAccess: access },
    })
    used.add(staff.name)
  }

  let cursor = 0
  const nextName = (firsts: string[]) => {
    for (let guard = 0; guard < 2000; guard += 1) {
      const first = firsts[cursor % firsts.length]
      const last = LAST[Math.floor(cursor / firsts.length + cursor * 7) % LAST.length]
      cursor += 1
      const name = `${first} ${last}`
      if (!used.has(name) && !staffNames.has(name)) {
        used.add(name)
        return name
      }
    }
    return `Mitglied ${cursor}`
  }

  // The named e2e players other screens already use keep their ids.
  const pinned: Record<string, string> = {
    'Tim Weber': 'user-player-2',
    'Lukas Hoffmann': 'user-player-3',
    'Julian Becker': 'user-player-1',
    'Jonas Krüger': 'user-player-7',
  }

  for (const team of TEAM_SEEDS) {
    for (let i = 0; i < team.players; i += 1) {
      let name: string
      if (team.id === WORLD_TEAM_IDS.herren1 && i < 4) {
        name = Object.keys(pinned)[i]
        used.add(name)
      } else {
        name = nextName(team.youth ? FIRST_YOUTH : team.id === WORLD_TEAM_IDS.damen ? FIRST_WOMEN : FIRST_ADULT)
      }
      const userId = pinned[name] ?? `user-e2e-m${members.length + 1}`
      members.push({
        id: `mem-${userId}`,
        userId,
        role: 'PLAYER',
        operationalRoles: [],
        name,
        isYouth: team.youth,
        isActive: true,
        teamNames: [team.name],
        user: { id: userId, name, email: emailFor(name), avatarUrl: null, teamAccess: [] },
      })
    }
  }

  for (const name of PASSIVE_NAMES) {
    const userId = `user-e2e-p${members.length + 1}`
    members.push({
      id: `mem-${userId}`,
      userId,
      role: 'PLAYER',
      operationalRoles: [],
      name,
      isYouth: false,
      isActive: false,
      teamNames: [],
      user: { id: userId, name, email: emailFor(name), avatarUrl: null, teamAccess: [] },
    })
  }

  return members.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

function coachFor(members: WorldMember[], teamId: string, role: 'HEAD_COACH' | 'ASSISTANT_COACH') {
  return members
    .filter((m) => m.user.teamAccess.some((a) => a.team.id === teamId && a.role === role))
    .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: null }))
}

function buildGroups(members: WorldMember[]): WorldGroup[] {
  return (Object.keys(GROUPS) as Array<keyof typeof GROUPS>).map((key) => ({
    ...GROUPS[key],
    teams: TEAM_SEEDS.filter((team) => team.group === key).map((team) => ({
      id: team.id,
      displayName: team.name,
      squadLabel: team.squadLabel,
      leagueName: team.league,
      memberCount: team.players,
      coachAssignments: {
        headCoach: coachFor(members, team.id, 'HEAD_COACH')[0] ?? null,
        assistants: coachFor(members, team.id, 'ASSISTANT_COACH'),
      },
    })),
  }))
}

function buildCompliance(members: WorldMember[]): WorldCompliance[] {
  const byName = (name: string) => members.find((m) => m.name === name)
  const fz = (name: string, issuedDaysAgo: number, note: string | null = null): WorldCompliance | null => {
    const m = byName(name)
    if (!m) return null
    return {
      id: `cmp-fz-${m.userId}`,
      memberUserId: m.userId,
      memberName: m.name,
      role: m.role,
      kind: 'FUEHRUNGSZEUGNIS',
      issuedAt: inDays(-issuedDaysAgo),
      expiresAt: inDays(5 * 365 - issuedDaysAgo),
      documentUrl: null,
      note,
    }
  }
  const docs: Array<WorldCompliance | null> = [
    fz('Mara Schulte', 400),
    fz('Tobias Lang', 700),
    fz('Ali Yılmaz', 120),
    fz('Peter Neumann', 900),
    fz('Markus Hoffmann', 1500),
    fz('Sandra Keller', 300),
  ]
  const tim = byName('Tim Weber')
  if (tim) {
    docs.push({
      id: 'cmp-sepa-tim',
      memberUserId: tim.userId,
      memberName: tim.name,
      role: tim.role,
      kind: 'SEPA_MANDATE',
      issuedAt: inDays(-420),
      expiresAt: null,
      documentUrl: null,
      note: null,
    })
    docs.push({
      id: 'cmp-dsgvo-tim',
      memberUserId: tim.userId,
      memberName: tim.name,
      role: tim.role,
      kind: 'DATA_CONSENT',
      issuedAt: inDays(-420),
      expiresAt: null,
      documentUrl: null,
      note: null,
    })
  }
  return docs.filter((d): d is WorldCompliance => d !== null)
}

// Two open chat reports (one past the 24h response target) + one resolved.
function buildReports(): WorldReport[] {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
  return [
    {
      id: 'report-1',
      kind: 'channel',
      reason: 'ABUSE',
      createdAt: hoursAgo(30),
      resolvedAt: null,
      resolution: null,
      overdue: true,
      reporter: { id: 'user-player-3', name: 'Lukas Hoffmann' },
      message: {
        id: 'msg-report-1',
        content: 'Wer heute wieder nicht zum Training kommt, ist einfach ein Versager.',
        removed: false,
        createdAt: hoursAgo(31),
        sender: { id: 'user-e2e-m20', name: 'Kevin Richter' },
        teamId: WORLD_TEAM_IDS.herren2,
        channelId: 'channel-herren-2',
        attachment: {
          url: 'https://picsum.photos/seed/anstoss-report-1/800/600',
          meta: { width: 800, height: 600, mimeType: 'image/jpeg' },
        },
      },
    },
    {
      id: 'report-2',
      kind: 'direct',
      reason: 'SPAM',
      createdAt: hoursAgo(3),
      resolvedAt: null,
      resolution: null,
      overdue: false,
      reporter: { id: 'user-player-2', name: 'Tim Weber' },
      message: {
        id: 'dm-report-2',
        content: 'Günstige Trikots! Jetzt bestellen unter trikot-deals.example',
        removed: false,
        createdAt: hoursAgo(4),
        sender: { id: 'user-e2e-m31', name: 'Marco Lange' },
        teamId: null,
        channelId: null,
        attachment: null,
      },
      // Marco became Co-Trainer after the report: the club can't judge its own staff.
      escalateOnResolve: true,
    },
    {
      id: 'report-3',
      kind: 'channel',
      reason: 'INAPPROPRIATE',
      createdAt: hoursAgo(96),
      resolvedAt: hoursAgo(90),
      resolution: 'Mit dem Spieler gesprochen.',
      overdue: false,
      reporter: { id: 'user-player-1', name: 'Julian Becker' },
      message: {
        id: 'msg-report-3',
        content: 'Schiri war heute blind wie ein Maulwurf.',
        removed: false,
        createdAt: hoursAgo(97),
        sender: { id: 'user-player-7', name: 'Jonas Krüger' },
        teamId: WORLD_TEAM_IDS.herren1,
        channelId: 'channel-senior',
        attachment: null,
      },
    },
  ]
}

let world: WorldState | null = null

export function resetClubAdminWorld() {
  remindedAt.clear()
  const members = buildMembers()
  world = {
    members,
    groups: buildGroups(members),
    compliance: buildCompliance(members),
    chatRetention: { enabled: true, messageRetentionDays: 365, attachmentRetentionDays: 365 },
    reports: buildReports(),
  }
  return world
}

function getWorld() {
  return world ?? resetClubAdminWorld()
}

/** Contributions overview seed for the club-admin persona: 4 overdue = 150 €. */
export function createClubAdminContributionMembers() {
  const row = (
    memberUserId: string,
    name: string,
    planId: string,
    planName: string,
    cadence: 'MONTHLY' | 'YEARLY',
    amount: number,
    status: 'PENDING' | 'PAID' | 'OVERDUE',
    dueOffsetDays: number,
  ) => ({
    memberUserId,
    name,
    email: emailFor(name),
    avatarUrl: null,
    role: 'PLAYER' as const,
    planId,
    planName,
    cadence,
    amount,
    currency: 'EUR',
    dueDate: inDays(dueOffsetDays),
    status,
    paidAmount: status === 'PAID' ? amount : null,
    paidAt: status === 'PAID' ? inDays(dueOffsetDays - 2) : null,
    note: null,
    lastReminderSentAt: null,
  })
  return [
    row('user-player-2', 'Tim Weber', 'plan-monthly', 'Mitgliedsbeitrag', 'MONTHLY', 2500, 'OVERDUE', -21),
    row('user-player-7', 'Jonas Krüger', 'plan-monthly', 'Mitgliedsbeitrag', 'MONTHLY', 2500, 'OVERDUE', -14),
    row('user-e2e-m6', 'Felix Bauer', 'plan-monthly', 'Mitgliedsbeitrag', 'MONTHLY', 2500, 'OVERDUE', -10),
    row('user-e2e-p113', 'Werner Albrecht', 'plan-passive', 'Fördermitgliedschaft', 'YEARLY', 7500, 'OVERDUE', -30),
    row('user-player-1', 'Julian Becker', 'plan-monthly', 'Mitgliedsbeitrag', 'MONTHLY', 2500, 'PENDING', 5),
    row('user-player-3', 'Lukas Hoffmann', 'plan-monthly', 'Mitgliedsbeitrag', 'MONTHLY', 2500, 'PAID', -3),
  ]
}

function membershipOf(userId: string) {
  return getWorld().members.find((m) => m.userId === userId) ?? null
}

function isYouthStaff(member: WorldMember) {
  return member.user.teamAccess.some((access) => {
    const team = teamById(access.team.id)
    return Boolean(team?.youth)
  })
}

function fzStatus(userId: string) {
  const record = getWorld().compliance.find(
    (c) => c.memberUserId === userId && c.kind === 'FUEHRUNGSZEUGNIS',
  )
  if (!record) return { status: 'MISSING' as const, expiresAt: null, recordId: null }
  const expires = record.expiresAt ? new Date(record.expiresAt).getTime() : null
  const status =
    expires === null
      ? ('VALID' as const)
      : expires < Date.now()
        ? ('EXPIRED' as const)
        : expires - Date.now() <= 60 * DAY
          ? ('EXPIRING' as const)
          : ('VALID' as const)
  return { status, expiresAt: record.expiresAt, recordId: record.id }
}

function buildInbox(session: ClubAdminWorldSession) {
  const w = getWorld()
  const pendingJoin = session.api.joinRequests.filter((r) => r.status === 'PENDING')
  const overdue = session.api.adminContributions.members.filter((m) => m.status === 'OVERDUE')
  const overdueAmount = overdue.reduce(
    (sum, m) => sum + Math.max(0, (m.amount ?? 0) - (m.paidAmount ?? 0)),
    0,
  )
  const teamsWithoutCoach = w.groups.flatMap((g) =>
    g.teams
      .filter((team) => !team.coachAssignments.headCoach)
      .map((team) => ({ teamId: team.id, teamName: team.displayName, groupName: g.displayName })),
  )
  const safeguarding = w.members
    .filter(isYouthStaff)
    .map((m) => ({ m, fz: fzStatus(m.userId) }))
    .filter(({ fz }) => fz.status !== 'VALID')
    .map(({ m, fz }) => ({
      memberUserId: m.userId,
      name: m.name,
      teamNames: m.user.teamAccess.map((a) => a.team.displayName),
      status: fz.status,
      expiresAt: fz.expiresAt,
      recordId: fz.recordId,
    }))
  const offices = (['TREASURER', 'SECRETARY'] as const)
    .filter((office) => !w.members.some((m) => m.operationalRoles.includes(office)))
    .map((office) => ({ office }))

  const joinRequests = {
    count: pendingJoin.length,
    items: pendingJoin.slice(0, 3).map((r) => ({
      id: r.id,
      revision: r.revision,
      role: r.role,
      message: r.message,
      createdAt: r.createdAt,
      user: { id: r.user.id, name: r.user.name, avatarUrl: null },
    })),
  }
  const inbox = {
    generatedAt: new Date().toISOString(),
    memberCount: w.members.length,
    teamCount: w.groups.reduce((n, g) => n + g.teams.length, 0),
    joinRequests,
    staffAccessRequests: { count: 0, items: [] },
    overdueDues: {
      count: overdue.length,
      amount: overdueAmount,
      currency: session.api.adminContributions.settings.defaultCurrency || 'EUR',
      items: overdue.slice(0, 3).map((m) => ({
        memberUserId: m.memberUserId,
        name: m.name,
        amount: Math.max(0, (m.amount ?? 0) - (m.paidAmount ?? 0)),
        dueDate: m.dueDate,
      })),
    },
    teamsWithoutHeadCoach: { count: teamsWithoutCoach.length, items: teamsWithoutCoach.slice(0, 3) },
    safeguarding: { count: safeguarding.length, items: safeguarding.slice(0, 3) },
    unfilledOffices: { count: offices.length, items: offices },
    totalOpen: 0,
  }
  inbox.totalOpen =
    inbox.joinRequests.count +
    inbox.staffAccessRequests.count +
    inbox.overdueDues.count +
    inbox.teamsWithoutHeadCoach.count +
    inbox.safeguarding.count +
    inbox.unfilledOffices.count
  return inbox
}

function counts() {
  const members = getWorld().members
  return {
    all: members.length,
    active: members.filter((m) => m.isActive).length,
    passive: members.filter((m) => !m.isActive).length,
    youth: members.filter((m) => m.isYouth).length,
  }
}

function ok(body?: unknown, status = 200): WorldResponse {
  return { handled: true, ok: true, status, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)) }
}

/**
 * Routes that exist for every persona but had no mock (billing, sponsors,
 * ownership transfers, parent announcements, season stats).
 */
function handleSharedMissingRoutes(
  pathname: string,
  method: string,
  clubId: string,
): WorldResponse | null {
  if (method === 'GET' && pathname === `/clubs/${clubId}/billing/entitlements`) {
    return ok({
      clubId,
      plan: 'FOUNDATION',
      tier: 'FREE',
      limits: { teams: 10, players: 250 },
      usage: { teams: 8, players: 126 },
      features: ['contribution_intake', 'staff_chat', 'club_player_search', 'official_team_pages', 'sponsor_logos'],
      compliance: null,
    })
  }
  if (method === 'GET' && pathname === `/clubs/${clubId}/billing/status`) {
    return ok({
      clubId,
      plan: 'FREE',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripeConnected: false,
    })
  }
  if (method === 'GET' && pathname === `/clubs/${clubId}/sponsors`) {
    return ok([
      { id: 'sponsor-1', name: 'Bäckerei Hansen', logoUrl: 'https://picsum.photos/seed/hansen/256', linkUrl: 'https://baeckerei-hansen.example', displayOrder: 0 },
      { id: 'sponsor-2', name: 'Autohaus Brandt', logoUrl: 'https://picsum.photos/seed/brandt/256', linkUrl: null, displayOrder: 1 },
    ])
  }
  if (method === 'GET' && pathname === '/ownership-transfers/mine') return ok([])
  // home revamp: parent home overview (real route; no linked children here).
  if (method === 'GET' && pathname === '/me/children-overview') {
    return ok({ children: [], duties: [], announcements: [] })
  }
  if (method === 'GET' && /^\/clubs\/[^/]+\/teams\/[^/]+\/season-stats$/.test(pathname)) {
    return ok({
      played: 9,
      won: 5,
      drawn: 2,
      lost: 2,
      goalsFor: 21,
      goalsAgainst: 13,
      attendanceRate: 84,
      topScorers: [
        { userId: 'user-player-2', name: 'Tim Weber', goals: 7 },
        { userId: 'user-player-3', name: 'Lukas Hoffmann', goals: 4 },
      ],
    })
  }
  return null
}

export function handleClubAdminWorldRequest(
  session: ClubAdminWorldSession,
  input: { pathname: string; method: string; query: URLSearchParams | null; body: unknown; clubId: string },
): WorldResponse | null {
  const { pathname, method, query, body, clubId } = input
  const shared = handleSharedMissingRoutes(pathname, method, clubId)
  if (shared) return shared
  if (session.scenario !== 'club-admin') return null

  const w = getWorld()
  const base = `/clubs/${clubId}`

  if (method === 'GET' && pathname === `${base}/admin-inbox`) return ok(buildInbox(session))

  if (method === 'GET' && pathname === `${base}/stats`) {
    const teams = w.groups.flatMap((g) => g.teams)
    return ok({
      memberCount: w.members.length,
      teamCount: teams.length,
      upcomingEventCount: 11,
      overallRsvpRate: 84,
      teams: teams.map((team) => ({
        teamId: team.id,
        teamName: team.displayName,
        teamDisplayName: team.displayName,
        memberCount: team.memberCount,
        upcomingEventCount: 3,
        rsvpRate: 80,
      })),
    })
  }

  // H1/H2: server-built member export (the app writes it to cache and shares it).
  if (method === 'GET' && pathname === `${base}/members/export`) {
    const includeEmails = query?.get('includeEmails') === 'true'
    const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`
    const header = ['Name', ...(includeEmails ? ['E-Mail'] : []), 'Rolle', 'Mannschaften', 'Status', 'Eintritt']
    const rows = w.members.map((m) => [
      m.name,
      ...(includeEmails ? [m.user.email ?? ''] : []),
      m.role,
      m.teamNames.join(', '),
      m.isActive ? 'Aktiv' : 'Passiv',
      '',
    ])
    const csv = `\uFEFF${[header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`
    return ok({ fileName: 'sv-albatros-mitglieder.csv', csv, rowCount: rows.length, includeEmails })
  }

  if (method === 'GET' && pathname === `${base}/members` && !query?.get('teamId')) {
    const limitRaw = query?.get('limit')
    if (!limitRaw) return ok(w.members)
    const limit = Math.max(1, Math.min(100, Number(limitRaw) || 50))
    const offset = Math.max(0, Number(query?.get('offset') ?? 0) || 0)
    const filter = query?.get('filter') ?? 'all'
    const q = (query?.get('q') ?? '').trim()
    const filtered = w.members.filter((m) => {
      if (filter === 'active' && !m.isActive) return false
      if (filter === 'passive' && m.isActive) return false
      if (filter === 'youth' && !m.isYouth) return false
      // L2: accent-insensitive, email included (admin persona), like the API.
      if (q && !matchesSearchText(m.name, q) && !matchesSearchText(m.user.email, q)) return false
      return true
    })
    return ok({ items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit, counts: counts() })
  }

  const summaryMatch = pathname.match(new RegExp(`^${base}/members/([^/]+)/admin-summary$`))
  if (method === 'GET' && summaryMatch) {
    const member = membershipOf(summaryMatch[1])
    if (!member) return { handled: true, ok: false, status: 404, message: 'Member not found' }
    const due = session.api.adminContributions.members.find((m) => m.memberUserId === member.userId)
    const doc = (kind: string) => w.compliance.find((c) => c.memberUserId === member.userId && c.kind === kind)
    const sepa = doc('SEPA_MANDATE')
    const consent = doc('DATA_CONSENT')
    return ok({
      userId: member.userId,
      name: member.name,
      email: member.user.email,
      avatarUrl: null,
      role: member.role,
      operationalRoles: member.operationalRoles,
      isYouth: member.isYouth,
      teams: [
        ...member.user.teamAccess.map((a) => ({ teamId: a.team.id, teamName: a.team.displayName, role: a.role })),
        ...(member.role === 'PLAYER'
          ? member.teamNames.map((teamName) => ({
              teamId: TEAM_SEEDS.find((team) => team.name === teamName)?.id ?? teamName,
              teamName,
              role: 'PLAYER' as WorldTeamRole,
            }))
          : []),
      ],
      contribution:
        due && due.status
          ? {
              status: due.status,
              amount: due.amount ?? 0,
              currency: due.currency ?? 'EUR',
              dueDate: due.dueDate,
              planName: due.planName,
            }
          : null,
      sepaMandate: sepa ? { issuedAt: sepa.issuedAt } : null,
      dataConsent: consent ? { issuedAt: consent.issuedAt, source: 'RECORD' } : null,
      safeguarding: isYouthStaff(member) ? fzStatus(member.userId) : null,
    })
  }

  if (method === 'PATCH') {
    const opsMatch = pathname.match(new RegExp(`^${base}/members/([^/]+)/operational-roles$`))
    if (opsMatch) {
      const member = membershipOf(opsMatch[1])
      const roles = (body as { operationalRoles?: string[] } | null)?.operationalRoles
      if (member && Array.isArray(roles)) member.operationalRoles = [...roles]
      return ok(member)
    }
    const roleMatch = pathname.match(new RegExp(`^${base}/members/([^/]+)/role$`))
    if (roleMatch) {
      const member = membershipOf(roleMatch[1])
      const role = (body as { role?: WorldRole } | null)?.role
      if (member && role) member.role = role
      return ok(member)
    }
  }

  if (method === 'GET' && pathname === `${base}/staff-access-requests`) return ok([])
  if (method === 'POST' && /\/staff-access-requests\/[^/]+\/decision$/.test(pathname)) return ok({ ok: true })

  // Team structure: groups, teams, coach assignments.
  if (method === 'GET' && pathname === `${base}/team-groups`) return ok(w.groups)
  if (method === 'POST' && pathname === `${base}/team-groups`) {
    const b = (body ?? {}) as { displayName?: string; type?: string }
    const group: WorldGroup = {
      id: `group-e2e-${Date.now().toString(36)}`,
      displayName: b.displayName?.trim() || 'Neue Altersklasse',
      type: b.type || 'CUSTOM',
      teams: [],
    }
    w.groups.push(group)
    return ok(group)
  }
  const teamCreate = pathname.match(new RegExp(`^${base}/team-groups/([^/]+)/teams$`))
  if (method === 'POST' && teamCreate) {
    const group = w.groups.find((g) => g.id === teamCreate[1])
    const b = (body ?? {}) as { name?: string; squadLabel?: string; leagueName?: string }
    const team: WorldTeam = {
      id: `team-e2e-${Date.now().toString(36)}`,
      displayName: b.name?.trim() || 'Neue Mannschaft',
      squadLabel: b.squadLabel?.trim() || null,
      leagueName: b.leagueName?.trim() || null,
      memberCount: 0,
      coachAssignments: { headCoach: null, assistants: [] },
    }
    group?.teams.push(team)
    return ok(team)
  }
  const coachAssign = pathname.match(new RegExp(`^${base}/teams/([^/]+)/coaches$`))
  if (method === 'POST' && coachAssign) {
    const teamId = coachAssign[1]
    const b = (body ?? {}) as { headCoachUserId?: string | null; assistantCoachUserIds?: string[] }
    const resolve = (userId: string | null | undefined): WorldCoach | null => {
      const m = userId ? membershipOf(userId) : null
      return m ? { userId: m.userId, name: m.name, avatarUrl: null } : null
    }
    for (const group of w.groups) {
      const team = group.teams.find((tm) => tm.id === teamId)
      if (!team) continue
      team.coachAssignments = {
        headCoach: resolve(b.headCoachUserId),
        assistants: (b.assistantCoachUserIds ?? [])
          .map(resolve)
          .filter((x): x is WorldCoach => x !== null),
      }
      // Keep member team access in step so safeguarding + staff lists agree.
      for (const m of w.members) {
        m.user.teamAccess = m.user.teamAccess.filter((a) => a.team.id !== teamId)
      }
      const assign = (userId: string | null | undefined, role: 'HEAD_COACH' | 'ASSISTANT_COACH') => {
        const m = userId ? membershipOf(userId) : null
        if (!m) return
        m.user.teamAccess.push({
          id: `ta-${m.userId}-${teamId}`,
          role,
          team: { id: teamId, displayName: team.displayName, group: { id: group.id, displayName: group.displayName } },
        })
        if (m.role === 'PLAYER' || m.role === 'PARENT') m.role = 'COACH'
      }
      assign(b.headCoachUserId, 'HEAD_COACH')
      for (const id of b.assistantCoachUserIds ?? []) assign(id, 'ASSISTANT_COACH')
    }
    return ok({ ok: true })
  }

  // Compliance (Führungszeugnis & member documents).
  if (method === 'GET' && pathname === `${base}/compliance`) {
    const kind = query?.get('kind')
    return ok(kind ? w.compliance.filter((c) => c.kind === kind) : w.compliance)
  }
  // M1: 24h cooldown per member + kind, like the API.
  if (method === 'POST' && pathname === `${base}/compliance/remind`) {
    const b = (body ?? {}) as { memberUserId?: string; kind?: string }
    const key = `${b.memberUserId}:${b.kind}`
    const last = remindedAt.get(key)
    if (last && Date.now() - last < DAY) {
      return ok({ sent: false, reason: 'cooldown', retryAfter: new Date(last + DAY).toISOString() })
    }
    remindedAt.set(key, Date.now())
    return ok({ sent: true })
  }
  if (method === 'POST' && pathname === `${base}/compliance`) {
    const b = (body ?? {}) as { memberUserId?: string; kind?: string; issuedAt?: string; expiresAt?: string | null; note?: string | null }
    const member = b.memberUserId ? membershipOf(b.memberUserId) : null
    if (!member || !b.kind || !b.issuedAt) return { handled: true, ok: false, status: 400, message: 'Invalid input' }
    const expiresAt =
      b.expiresAt !== undefined
        ? b.expiresAt
        : b.kind === 'FUEHRUNGSZEUGNIS'
          ? new Date(new Date(b.issuedAt).getTime() + 5 * 365 * DAY).toISOString()
          : null
    const existing = w.compliance.find((c) => c.memberUserId === member.userId && c.kind === b.kind)
    if (existing) {
      existing.issuedAt = b.issuedAt
      existing.expiresAt = expiresAt
      existing.note = b.note ?? existing.note
      return ok(existing)
    }
    const record: WorldCompliance = {
      id: `cmp-${b.kind.toLowerCase()}-${member.userId}`,
      memberUserId: member.userId,
      memberName: member.name,
      role: member.role,
      kind: b.kind,
      issuedAt: b.issuedAt,
      expiresAt,
      documentUrl: null,
      note: b.note ?? null,
    }
    w.compliance.push(record)
    return ok(record, 201)
  }
  const compliancePatch = pathname.match(new RegExp(`^${base}/compliance/([^/]+)$`))
  if (method === 'PATCH' && compliancePatch) {
    const record = w.compliance.find((c) => c.id === compliancePatch[1])
    if (!record) return { handled: true, ok: false, status: 404, message: 'Not found' }
    Object.assign(record, body ?? {})
    return ok(record)
  }

  if (pathname === `${base}/chat/retention`) {
    if (method === 'GET') return ok(w.chatRetention)
    if (method === 'PATCH') {
      Object.assign(w.chatRetention, body ?? {})
      return ok(w.chatRetention)
    }
  }

  // Chat reports (Meldungen) for the club-admin moderation queue.
  if (method === 'GET' && pathname === `${base}/moderation/reports`) {
    const status = query?.get('status') ?? 'open'
    const rows = w.reports.filter((r) =>
      status === 'all' ? true : status === 'open' ? r.resolvedAt === null : r.resolvedAt !== null,
    )
    return ok(rows.map(({ escalateOnResolve: _escalate, ...report }) => report))
  }
  const resolveMatch = pathname.match(new RegExp(`^${base}/moderation/reports/([^/]+)/resolve$`))
  if (method === 'POST' && resolveMatch) {
    const report = w.reports.find((r) => r.id === resolveMatch[1])
    if (!report) return { handled: true, ok: false, status: 404, message: 'Report not found' }
    if (report.resolvedAt) {
      return { handled: true, ok: false, status: 409, message: 'Report has already been resolved' }
    }
    if (report.escalateOnResolve) {
      // Escalated to the platform queue: it leaves the club queue.
      w.reports = w.reports.filter((r) => r.id !== report.id)
      return {
        handled: true,
        ok: false,
        status: 403,
        message: 'Reports about club staff are handled by the platform team',
      }
    }
    const b = (body ?? {}) as { action?: 'dismiss' | 'remove'; resolution?: string }
    report.resolvedAt = new Date().toISOString()
    report.resolution = b.resolution ?? null
    report.overdue = false
    if (b.action === 'remove') report.message.removed = true
    return ok({ id: report.id, action: b.action, resolvedAt: report.resolvedAt })
  }

  if (method === 'PATCH' && pathname === base) return ok({ id: clubId, ...(body as object) })

  return null
}
