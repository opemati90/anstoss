/**
 * Test fixture for the Wechselbörse specs: one in-memory database (see
 * fake-prisma.ts, which EVALUATES where clauses) shared by the real
 * MarketplaceService, JoinRequestsService, ClubEntitlementsService,
 * TeamsService and AgeGateService, so a spec fails when a query filters on
 * the wrong club, team, status, phase or date.
 */
import { AgeGateService } from '../auth/age-gate.service'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import { JoinRequestsService } from '../clubs/join-requests.service'
import { MarketplaceService } from '../marketplace/marketplace.service'
import { TeamsService } from '../teams/teams.service'
import { createFakePrisma, dobForAge, type Relations } from './fake-prisma'

const DAY = 24 * 60 * 60 * 1000

export const WECHSEL_RELATIONS: Relations = {
  trialInvite: {
    freeAgentProfile: { model: 'freeAgentProfile', from: 'freeAgentProfileId', to: 'id' },
    club: { model: 'club', from: 'clubId', to: 'id' },
    team: { model: 'team', from: 'teamId', to: 'id' },
    sender: { model: 'user', from: 'sentByUserId', to: 'id' },
    joinRequest: { model: 'joinRequest', from: 'id', to: 'trialInviteId' },
  },
  freeAgentProfile: {
    user: { model: 'user', from: 'userId', to: 'id' },
    experience: { model: 'freeAgentExperience', from: 'id', to: 'profileId', many: true },
    media: { model: 'freeAgentMedia', from: 'id', to: 'profileId', many: true },
  },
  freeAgentMedia: { profile: { model: 'freeAgentProfile', from: 'profileId', to: 'id' } },
  team: { group: { model: 'teamGroup', from: 'groupId', to: 'id' } },
  user: {
    memberships: { model: 'membership', from: 'id', to: 'userId', many: true },
    teamAccess: { model: 'teamAccess', from: 'id', to: 'userId', many: true },
  },
  membership: { user: { model: 'user', from: 'userId', to: 'id' } },
  joinRequest: {
    user: { model: 'user', from: 'userId', to: 'id' },
    trialInvite: { model: 'trialInvite', from: 'trialInviteId', to: 'id' },
    club: { model: 'club', from: 'clubId', to: 'id' },
  },
  guardianRelationship: { player: { model: 'user', from: 'playerUserId', to: 'id' } },
  rosterSlot: { team: { model: 'team', from: 'teamId', to: 'id' } },
  playerSearch: {
    team: { model: 'team', from: 'teamId', to: 'id' },
    club: { model: 'club', from: 'clubId', to: 'id' },
  },
}

export const inDays = (days: number) => new Date(Date.now() + days * DAY)

type SeedOverrides = Partial<Record<string, Array<Record<string, any>>>>

/**
 * SV Albatros: Herren II (coach Mara Schulz) and B-Jugend U17 (coach Jonas
 * Beck), owner Frank Weber, member Lukas Hoffmann (player). Free agents:
 * Tim Weber (24), Luca Brandt (17), Noah Kaya (15, legacy profile).
 */
export function createWechselDb(overrides: SeedOverrides = {}) {
  const created = new Date(Date.now() - 30 * DAY)
  const user = (id: string, name: string, extra: Record<string, any> = {}) => ({
    id,
    name,
    email: `${id}@example.de`,
    avatarUrl: null,
    deletedAt: null,
    dateOfBirth: null,
    adultConfirmedAt: created,
    registrationRole: 'PLAYER',
    preferredLanguage: 'de',
    createdAt: created,
    ...extra,
  })
  const access = (id: string, teamId: string, userId: string, role: string, extra: Record<string, any> = {}) => ({
    id,
    clubId: 'club-1',
    teamId,
    userId,
    role,
    phase: 'FULL',
    status: 'ACTIVE',
    loanEndDate: null,
    loanedFromTeamId: null,
    createdAt: created,
    ...extra,
  })
  const session = (id: string, teamId: string, date: Date, extra: Record<string, any> = {}) => ({
    id,
    clubId: 'club-1',
    teamId,
    type: 'TRAINING',
    title: 'Training',
    date,
    location: 'Kunstrasen Albatros',
    cancelledAt: null,
    archivedAt: null,
    createdAt: created,
    ...extra,
  })
  const profile = (id: string, userId: string, extra: Record<string, any> = {}) => ({
    id,
    userId,
    position: 'MID',
    preferredFoot: 'RIGHT',
    city: 'Potsdam',
    bio: null,
    isOnTransferList: true,
    visibility: 'PUBLIC',
    postalCode: '14482',
    searchRadiusKm: 25,
    highestLeague: 'BEZIRKSLIGA',
    currentClubName: null,
    availableFrom: null,
    createdAt: created,
    updatedAt: created,
    ...extra,
  })

  const seed: Record<string, Array<Record<string, any>>> = {
    club: [{ id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' }],
    teamGroup: [
      { id: 'group-herren', displayName: 'Herren' },
      { id: 'group-jugend', displayName: 'Jugend' },
    ],
    team: [
      {
        id: 'team-herren',
        clubId: 'club-1',
        groupId: 'group-herren',
        name: 'Herren II',
        displayName: 'Herren II',
        ageGroup: 'Herren',
        leagueName: 'Kreisliga A',
      },
      {
        id: 'team-u17',
        clubId: 'club-1',
        groupId: 'group-jugend',
        name: 'B-Jugend',
        displayName: 'B-Jugend (U17)',
        ageGroup: 'B-Jugend (U17)',
        leagueName: null,
      },
    ],
    user: [
      user('owner', 'Frank Weber'),
      user('coach', 'Mara Schulz'),
      user('coach-u17', 'Jonas Beck'),
      user('member', 'Lukas Hoffmann', { dateOfBirth: dobForAge(22), adultConfirmedAt: null }),
      user('fa-adult', 'Tim Weber', {
        dateOfBirth: dobForAge(24),
        adultConfirmedAt: null,
        registrationRole: 'FREE_AGENT',
      }),
      user('fa-minor', 'Luca Brandt', {
        dateOfBirth: dobForAge(17),
        adultConfirmedAt: null,
        registrationRole: 'FREE_AGENT',
      }),
      user('fa-child', 'Noah Kaya', {
        dateOfBirth: dobForAge(15),
        adultConfirmedAt: null,
        registrationRole: 'FREE_AGENT',
      }),
      user('guardian', 'Sabine Brandt', { email: 'eltern.brandt@example.de' }),
      user('other-coach', 'Kai Neumann'),
    ],
    membership: [
      { id: 'm-owner', clubId: 'club-1', userId: 'owner', role: 'OWNER', operationalRoles: [] },
      { id: 'm-coach', clubId: 'club-1', userId: 'coach', role: 'COACH', operationalRoles: [] },
      { id: 'm-coach-u17', clubId: 'club-1', userId: 'coach-u17', role: 'COACH', operationalRoles: [] },
      { id: 'm-member', clubId: 'club-1', userId: 'member', role: 'PLAYER', operationalRoles: [] },
      // A coach of another club (SV Babelsberg 03).
      { id: 'm-other', clubId: 'club-2', userId: 'other-coach', role: 'COACH', operationalRoles: [] },
    ],
    teamAccess: [
      access('ta-coach', 'team-herren', 'coach', 'HEAD_COACH'),
      access('ta-coach-u17', 'team-u17', 'coach-u17', 'HEAD_COACH'),
      access('ta-member', 'team-herren', 'member', 'PLAYER'),
      { ...access('ta-other', 'team-other', 'other-coach', 'HEAD_COACH'), clubId: 'club-2' },
    ],
    event: [
      session('ev-1', 'team-herren', inDays(2)),
      session('ev-2', 'team-herren', inDays(5)),
      session('ev-other', 'team-herren', inDays(3), { type: 'MATCH', title: 'SV Babelsberg 03' }),
      session('ev-u17', 'team-u17', inDays(2)),
    ],
    freeAgentProfile: [
      profile('p-adult', 'fa-adult'),
      profile('p-minor', 'fa-minor', { visibility: 'CLUB_ONLY', postalCode: '14469' }),
      profile('p-child', 'fa-child'),
    ],
    freeAgentMedia: [],
    freeAgentExperience: [],
    trialInvite: [],
    joinRequest: [],
    parentalConsent: [],
    guardianRelationship: [],
    playerSearch: [
      {
        id: 'search-1',
        clubId: 'club-1',
        teamId: 'team-herren',
        positions: ['MID'],
        status: 'OPEN',
        createdByUserId: 'coach',
        expiresAt: null,
        createdAt: created,
      },
    ],
    entitlementGrant: [],
    planDefinition: [],
    rosterSlot: [],
    teamMember: [],
    auditLog: [],
  }
  for (const [model, rows] of Object.entries(overrides)) {
    seed[model] = [...(seed[model] ?? []), ...(rows ?? [])]
  }

  const db = createFakePrisma(seed, WECHSEL_RELATIONS)
  // JoinRequestsService.assertReviewerCanDecide reads memberships FOR UPDATE.
  db.$queryRaw = jest.fn(async (_strings: unknown, clubId: string) =>
    db.tables.membership
      .filter((row: any) => row.clubId === clubId)
      .map((row: any) => ({ userId: row.userId, role: row.role })),
  )

  // Column defaults Postgres would fill in.
  const withDefaults = (model: string, defaults: () => Record<string, any>) => {
    const create = db[model].create.getMockImplementation()
    db[model].create.mockImplementation(async (args: any) =>
      create({ ...args, data: { ...defaults(), ...args.data } }),
    )
  }
  withDefaults('joinRequest', () => ({ revision: 1, updatedAt: new Date() }))
  withDefaults('trialInvite', () => ({
    updatedAt: new Date(),
    respondedAt: null,
    feedback: null,
    rating: null,
    attended: null,
    decisionMessage: null,
    decidedAt: null,
  }))
  withDefaults('parentalConsent', () => ({ requestedAt: new Date(), guardianUserId: null }))

  const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
  const audit = { log: jest.fn().mockResolvedValue(undefined) }
  const cache = { reserve: jest.fn().mockResolvedValue(true) }
  const entitlements = new ClubEntitlementsService(db as never, audit as never)
  const ageGate = new AgeGateService(db as never)
  const marketplace = new MarketplaceService(db as never, push as never, entitlements, ageGate)
  const joinRequests = new JoinRequestsService(
    db as never,
    audit as never,
    push as never,
    cache as never,
    entitlements,
  )
  const teams = new TeamsService(db as never, undefined, entitlements)

  const row = (model: string, id: string): any => {
    const found = db.tables[model].find((r: any) => r.id === id)
    if (!found) throw new Error(`${model} ${id} missing`)
    return found
  }
  return { db, push, audit, entitlements, ageGate, marketplace, joinRequests, teams, row }
}

/** Seats the FREE plan (30) full with other FULL players, optionally minus `free`. */
export function fillSeats(db: ReturnType<typeof createFakePrisma>, free = 0) {
  const existing = db.tables.teamAccess.filter(
    (r: any) => r.clubId === 'club-1' && r.role === 'PLAYER' && r.phase === 'FULL' && r.status === 'ACTIVE',
  ).length
  for (let i = 0; i < 30 - existing - free; i += 1) {
    db.tables.teamAccess.push({
      id: `ta-seat-${i}`,
      clubId: 'club-1',
      teamId: 'team-herren',
      userId: `seat-${i}`,
      role: 'PLAYER',
      phase: 'FULL',
      status: 'ACTIVE',
      loanEndDate: null,
      createdAt: new Date(),
    })
  }
}
