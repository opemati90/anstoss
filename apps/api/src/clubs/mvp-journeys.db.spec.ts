import { randomBytes, randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TenantInterceptor } from '../prisma/tenant.interceptor'
import { tenantContext } from '../prisma/tenant.context'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { RolesGuard } from '../auth/roles.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { AgeGateService } from '../auth/age-gate.service'
import { signSessionToken } from '../auth/otp/jwt.util'
import { AppExceptionFilter } from '../logging/app-exception.filter'
import { AuditService } from '../audit/audit.service'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import { TeamsService } from '../teams/teams.service'
import { TeamsController } from '../teams/teams.controller'
import { UsersService } from '../users/users.service'
import { UsersController } from '../users/users.controller'
import { MemberExportService } from '../users/member-export'
import { R2Provider } from '../assets/r2.provider'
import { queueMediaDeletion } from '../assets/media-deletion.service'
import { EventsController } from '../events/events.controller'
import { EventsService } from '../events/events.service'
import { ContributionsService } from '../contributions/contributions.service'
import { ChatService } from '../chat/chat.service'
import { MarketplaceController } from '../marketplace/marketplace.controller'
import { MarketplaceService } from '../marketplace/marketplace.service'
import { PlayerSearchService } from '../marketplace/player-search.service'
import { ClubsService } from './clubs.service'
import { JoinRequestsService } from './join-requests.service'
import { JoinRequestsController } from './join-requests.controller'
import { MeJoinRequestsController } from './me-join-requests.controller'

// Explicit opt-in only. NEVER use DATABASE_URL: these tests create/delete fixtures.
const databaseUrl = process.env.ANSTOSS_MVP_TEST_DATABASE_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (target.hostname !== '127.0.0.1' || !target.pathname.endsWith('_test')) {
    throw new Error('MVP journeys require an isolated localhost *_test database')
  }
}

/**
 * Real HTTP, signed sessions, auth/role/age guards, tenant middleware, domain
 * services and PostgreSQL. Outbound push/socket transports are stubbed. Dependencies outside
 * these routes throw if accidentally exercised rather than simulating success.
 * Does not claim production, mobile UI, OTP delivery or push delivery coverage.
 */
const databaseTests = databaseUrl ? describe : describe.skip
databaseTests('MVP account synchronization over HTTP and PostgreSQL', () => {
  const runId = `mvp-${randomUUID()}`
  const secretBefore = process.env.AUTH_JWT_SECRET
  const users: string[] = []
  const clubs: string[] = []
  const deletionKeys: string[] = []
  let fixtures: PrismaClient
  let app: INestApplication | undefined
  let baseUrl: string
  let clubId: string
  let teamId: string
  let otherClubId: string
  let otherTeamId: string
  let adminId: string
  let coachId: string
  let foreignAdminId: string
  const push = {
    sendToUserLocalized: jest.fn().mockResolvedValue(undefined),
    sendToUser: jest.fn().mockResolvedValue(undefined),
    sendToTeamRendered: jest.fn().mockResolvedValue(undefined),
  }
  const eventsTransport = { emitEventUpsert: jest.fn(), emitRsvpUpdate: jest.fn() }
  const chatTransport = { emitServerMessage: jest.fn() }
  let notices: jest.SpyInstance

  const unused = (name: string): never =>
    new Proxy(
      {},
      {
        get: (_target, property) => {
          // Nest probes lifecycle hooks and thenables even on value providers.
          if (
            [
              'then',
              'onModuleInit',
              'onModuleDestroy',
              'onApplicationBootstrap',
              'onApplicationShutdown',
              'beforeApplicationShutdown',
            ].includes(String(property))
          ) {
            return undefined
          }
          throw new Error(`Unexpected dependency in MVP journey: ${name}.${String(property)}`)
        },
      },
    ) as never

  async function newUser(label: string) {
    const user = await fixtures.user.create({
      data: {
        name: `${runId}-${label}`,
        dateOfBirth: new Date('1990-01-15'),
        preferredLanguage: 'de',
      },
    })
    users.push(user.id)
    return user.id
  }

  async function http(userId: string | null, path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { Authorization: `Bearer ${signSessionToken(userId)}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }

  const requestsPath = () => `/clubs/${clubId}/join-requests`
  async function requestJoin(playerId: string) {
    const response = await http(playerId, requestsPath(), 'POST', { teamId, role: 'PLAYER' })
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ status: 'PENDING', userId: playerId, teamId })
    return response.body as { id: string; revision: number }
  }

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = randomBytes(48).toString('hex')
    // Fixture client intentionally has no tenant middleware; application client does.
    fixtures = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    await fixtures.$connect()
    adminId = await newUser('admin')
    coachId = await newUser('coach')
    foreignAdminId = await newUser('foreign-admin')
    for (const suffix of ['club', 'other-club']) {
      const club = await fixtures.club.create({
        data: { name: `${runId}-${suffix}`, slug: `${runId}-${suffix}` },
      })
      clubs.push(club.id)
      const group = await fixtures.teamGroup.create({
        data: { clubId: club.id, type: 'SENIOR', displayName: 'Herren' },
      })
      const team = await fixtures.team.create({
        data: { clubId: club.id, groupId: group.id, name: 'herren', displayName: '1. Herren' },
      })
      if (suffix === 'club') {
        clubId = club.id
        teamId = team.id
      } else {
        otherClubId = club.id
        otherTeamId = team.id
      }
    }
    await fixtures.membership.createMany({
      data: [
        { clubId, userId: adminId, role: 'ADMIN' },
        { clubId, userId: coachId, role: 'COACH' },
        { clubId: otherClubId, userId: foreignAdminId, role: 'ADMIN' },
      ],
    })
    await fixtures.teamAccess.create({
      data: { clubId, teamId, userId: coachId, role: 'HEAD_COACH', status: 'ACTIVE' },
    })

    const prisma = new PrismaService({ datasources: { db: { url: databaseUrl! } } })
    const audit = new AuditService(prisma)
    const entitlements = new ClubEntitlementsService(prisma, audit)
    const teams = new TeamsService(prisma, undefined, entitlements)
    const joins = new JoinRequestsService(
      prisma,
      audit,
      push as never,
      unused('cache'),
      entitlements,
    )
    const account = new UsersService(
      prisma,
      teams,
      unused('clubs'),
      unused('invites'),
      unused('marketplace'),
    )
    const contributions = new ContributionsService(prisma, audit, push as never, entitlements)
    const chat = new ChatService(
      prisma,
      teams,
      chatTransport as never,
      push as never,
      unused('channels'),
      unused('billing'),
    )
    notices = jest.spyOn(chat, 'postSystemNotice') // calls through; awaits asynchronous persistence below
    const events = new EventsService(
      prisma,
      teams,
      contributions,
      push as never,
      eventsTransport as never,
      chat,
    )
    const marketplace = new MarketplaceService(
      prisma,
      push as never,
      entitlements,
      new AgeGateService(prisma),
    )
    const module = await Test.createTestingModule({
      controllers: [
        JoinRequestsController,
        MeJoinRequestsController,
        UsersController,
        TeamsController,
        EventsController,
        MarketplaceController,
      ],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: JoinRequestsService, useValue: joins },
        { provide: UsersService, useValue: account },
        { provide: TeamsService, useValue: teams },
        { provide: EventsService, useValue: events },
        { provide: MarketplaceService, useValue: marketplace },
        { provide: PlayerSearchService, useValue: new PlayerSearchService(prisma) },
        { provide: ClubsService, useValue: new ClubsService(prisma) },
        { provide: R2Provider, useValue: unused('r2') },
        { provide: MemberExportService, useValue: unused('member export') },
        ClerkAuthGuard,
        RolesGuard,
        AgeGateService,
        AgeGateGuard,
        { provide: APP_GUARD, useExisting: AgeGateGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
      ],
    }).compile()
    app = module.createNestApplication({ logger: false })
    app.useGlobalFilters(new AppExceptionFilter({ error: jest.fn(), warn: jest.fn() } as never))
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  }, 30_000)

  afterAll(async () => {
    try {
      await app?.close()
      if (fixtures) {
        // Only identifiers allocated by this run; never truncate/reset a database.
        await fixtures.club.deleteMany({ where: { id: { in: clubs } } })
        await fixtures.user.deleteMany({ where: { id: { in: users } } })
        await fixtures.mediaDeletionJob.deleteMany({ where: { objectKey: { in: deletionKeys } } })
      }
    } finally {
      await fixtures?.$disconnect()
      if (secretBefore === undefined) delete process.env.AUTH_JWT_SECRET
      else process.env.AUTH_JWT_SECRET = secretBefore
    }
  })

  it('atomically erases recruitment media references and retains durable storage cleanup', async () => {
    const candidateId = await newUser('media-erasure')
    const profile = await fixtures.freeAgentProfile.create({ data: { userId: candidateId } })
    const key = `users/${candidateId}/free-agent/video/test.mp4`
    deletionKeys.push(key)
    const media = await fixtures.freeAgentMedia.create({
      data: { profileId: profile.id, type: 'VIDEO', url: `https://storage.invalid/${key}` },
    })
    // No external storage calls: verifies real PostgreSQL transactions, not R2 delivery.
    const service = new MarketplaceService(
      app!.get(PrismaService),
      push as never,
      undefined,
      undefined,
      { objectKeyFromUrl: (url: string) => url.replace('https://storage.invalid/', '') } as never,
    )
    await expect(
      fixtures.$transaction(async (tx) => {
        await queueMediaDeletion(tx, [key])
        await tx.freeAgentMedia.delete({ where: { id: media.id } })
        throw new Error('simulated transaction failure')
      }),
    ).rejects.toThrow('simulated transaction failure')
    expect(await fixtures.freeAgentMedia.findUnique({ where: { id: media.id } })).not.toBeNull()
    expect(await fixtures.mediaDeletionJob.count({ where: { objectKey: key } })).toBe(0)

    const before = Date.now()
    await service.deleteMedia(candidateId, media.id)
    expect(await fixtures.freeAgentMedia.findUnique({ where: { id: media.id } })).toBeNull()
    const job = await fixtures.mediaDeletionJob.findUniqueOrThrow({ where: { objectKey: key } })
    expect(job.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000)
    await fixtures.$transaction((tx) => queueMediaDeletion(tx, [key, key]))
    expect(await fixtures.mediaDeletionJob.count({ where: { objectKey: key } })).toBe(1)
  })

  it('authenticates real sessions and denies anonymous requests', async () => {
    expect((await http(null, '/me')).status).toBe(401)
    expect((await http(null, requestsPath())).status).toBe(401)
    expect((await http(adminId, '/me')).body.id).toBe(adminId)
  })

  it('synchronizes player request → admin approval → refreshed account and team access', async () => {
    const playerId = await newUser('approved-player')
    expect((await http(playerId, `/clubs/${clubId}/team-groups`)).status).toBe(403)
    const request = await requestJoin(playerId)
    const pendingAccount = await http(playerId, '/me')
    expect(pendingAccount.body.pendingJoinRequest).toEqual({ id: request.id, clubId })
    expect(pendingAccount.body.teamMembers).toEqual([])
    const adminQueue = await http(adminId, requestsPath())
    expect(adminQueue.status).toBe(200)
    expect(adminQueue.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: request.id, revision: request.revision }),
      ]),
    )
    const approvePath = `${requestsPath()}/${request.id}/approve`
    for (const deniedId of [playerId, coachId, foreignAdminId]) {
      expect(
        (await http(deniedId, approvePath, 'POST', { revision: request.revision })).status,
      ).toBe(403)
    }
    expect(await http(adminId, approvePath, 'POST', { revision: request.revision })).toEqual({
      status: 201,
      body: { status: 'APPROVED' },
    })
    const refreshed = await http(playerId, '/me')
    expect(refreshed.status).toBe(200)
    expect(refreshed.body.pendingJoinRequest).toBeNull()
    expect(refreshed.body.memberships).toEqual(
      expect.arrayContaining([expect.objectContaining({ clubId, role: 'PLAYER' })]),
    )
    expect(refreshed.body.teamMembers).toEqual([
      expect.objectContaining({
        role: 'PLAYER',
        status: 'ACTIVE',
        phase: 'FULL',
        team: expect.objectContaining({ id: teamId, clubId }),
      }),
    ])
    const poll = await http(playerId, '/me/join-requests/active')
    expect(poll.body).toMatchObject({
      request: null,
      lastDecision: { id: request.id, status: 'APPROVED' },
    })
    expect((await http(playerId, `/clubs/${clubId}/team-groups`)).status).toBe(200)
    expect((await http(playerId, `/clubs/${otherClubId}/team-groups`)).status).toBe(403)
    expect((await http(adminId, requestsPath())).body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: request.id })]),
    )
    expect((await http(adminId, approvePath, 'POST', { revision: request.revision })).status).toBe(
      404,
    )
    expect(await fixtures.teamAccess.count({ where: { userId: playerId, teamId } })).toBe(1)
    expect(await fixtures.teamMember.count({ where: { userId: playerId, teamId } })).toBe(1)
    expect(
      await fixtures.auditLog.count({
        where: {
          clubId,
          type: 'join_request.approved',
          metadata: { path: ['requestId'], equals: request.id },
        },
      }),
    ).toBe(1)
  })

  it('restores permanent team membership after an expired loan and inactive roster entry', async () => {
    const playerId = await newUser('returning-player')
    const team = await fixtures.team.findUniqueOrThrow({ where: { id: teamId } })
    const source = await fixtures.team.create({
      data: { clubId, groupId: team.groupId, name: `${runId}-loan-source`, displayName: 'Loan source' },
    })
    await fixtures.teamAccess.create({ data: {
      clubId, teamId, userId: playerId, role: 'PLAYER', phase: 'TRIAL', status: 'REVOKED',
      loanedFromTeamId: source.id,
      loanStartDate: new Date(Date.now() - 2 * 86400000),
      loanEndDate: new Date(Date.now() - 86400000),
    } })
    await fixtures.teamMember.create({ data: { teamId, userId: playerId, operationalStatus: 'INACTIVE' } })
    const request = await requestJoin(playerId)
    expect((await http(adminId, `${requestsPath()}/${request.id}/approve`, 'POST', {
      revision: request.revision,
    })).status).toBe(201)
    expect((await http(playerId, '/me')).body.teamMembers).toEqual([
      expect.objectContaining({ role: 'PLAYER', phase: 'FULL', status: 'ACTIVE' }),
    ])
    expect(await fixtures.teamAccess.findUnique({
      where: { teamId_userId_role: { teamId, userId: playerId, role: 'PLAYER' } },
    })).toMatchObject({ loanedFromTeamId: null, loanStartDate: null, loanEndDate: null })
    expect(await fixtures.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: playerId } },
    })).toMatchObject({ operationalStatus: 'ACTIVE' })
  })

  it('rejects cross-club team injection without creating a pending request', async () => {
    const playerId = await newUser('foreign-team')
    const response = await http(playerId, requestsPath(), 'POST', { teamId: otherTeamId })
    expect([400, 404]).toContain(response.status)
    expect(await fixtures.joinRequest.count({ where: { userId: playerId } })).toBe(0)
  })

  it('returns rejection to the applicant and refuses a stale approval after reapplication', async () => {
    const playerId = await newUser('reapplied-player')
    const first = await requestJoin(playerId)
    expect(
      (
        await http(adminId, `${requestsPath()}/${first.id}/reject`, 'POST', {
          revision: first.revision,
          reason: 'Bitte Mannschaft prüfen',
        })
      ).status,
    ).toBe(201)
    expect((await http(playerId, '/me/join-requests/active')).body).toMatchObject({
      request: null,
      lastDecision: { status: 'REJECTED', reason: 'Bitte Mannschaft prüfen' },
    })
    expect((await http(playerId, '/me')).body.memberships).toEqual([])
    const second = await requestJoin(playerId)
    expect(second.id).toBe(first.id)
    expect(second.revision).toBeGreaterThan(first.revision)
    expect(
      (
        await http(adminId, `${requestsPath()}/${first.id}/approve`, 'POST', {
          revision: first.revision,
        })
      ).status,
    ).toBe(404)
    expect((await http(playerId, '/me/join-requests/active')).body.request.id).toBe(second.id)
    expect(await fixtures.membership.count({ where: { userId: playerId } })).toBe(0)
  })

  it('withdraws only the caller’s request and never grants access after withdrawal', async () => {
    const playerId = await newUser('withdrawn-player')
    const strangerId = await newUser('stranger')
    const request = await requestJoin(playerId)
    const path = `${requestsPath()}/${request.id}`
    expect((await http(strangerId, `${path}/withdraw`, 'POST')).status).toBe(404)
    expect((await http(playerId, `${path}/withdraw`, 'POST')).status).toBe(201)
    expect((await http(playerId, '/me/join-requests/active')).body).toEqual({
      request: null,
      lastDecision: null,
    })
    expect(
      (await http(adminId, `${path}/approve`, 'POST', { revision: request.revision })).status,
    ).toBe(404)
    expect(await fixtures.membership.count({ where: { userId: playerId } })).toBe(0)
  })

  it('synchronizes coach event → player RSVP → coach counts, then reschedule and reconfirmation', async () => {
    const playerId = await newUser('rsvp-player')
    const request = await requestJoin(playerId)
    expect(
      (
        await http(adminId, `${requestsPath()}/${request.id}/approve`, 'POST', {
          revision: request.revision,
        })
      ).status,
    ).toBe(201)
    // Explicit administrator approval completes normal membership. Only the
    // separate free-agent trial flow grants restricted TRIAL access.
    const account = await http(playerId, '/me')
    const accessId = account.body.teamMembers[0].id
    const decisionPath = `/clubs/${clubId}/team-access/${accessId}/decision`
    expect((await http(playerId, decisionPath, 'POST', { decision: 'ACCEPT' })).status).toBe(403)
    expect((await http(playerId, '/me')).body.teamMembers[0]).toMatchObject({
      phase: 'FULL',
      status: 'ACTIVE',
    })
    const eventsPath = `/clubs/${clubId}/events`
    const date = new Date(Date.now() + 3 * 86400000).toISOString()
    const input = { type: 'MATCH', teamId, date, opponent: 'Testgegner', homeAway: 'HOME' }
    expect((await http(playerId, eventsPath, 'POST', input)).status).toBe(403)
    const created = await http(coachId, eventsPath, 'POST', input)
    expect(created.status).toBe(201)
    const path = `${eventsPath}/${created.body.id}`
    expect((await http(playerId, `${eventsPath}?teamId=${teamId}`)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id, date, myRsvp: null }),
      ]),
    )
    expect((await http(playerId, `${path}/rsvp`, 'PUT', { status: 'YES' })).status).toBe(200)
    expect((await http(coachId, `${path}/rsvp-summary`)).body).toEqual({ yes: 1, maybe: 0, no: 0 })
    expect((await http(coachId, `${eventsPath}?teamId=${teamId}`)).body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.body.id, yesCount: 1 })]),
    )
    const newDate = new Date(Date.now() + 4 * 86400000).toISOString()
    expect((await http(playerId, path, 'PATCH', { date: newDate })).status).toBe(403)
    expect((await http(coachId, path, 'PATCH', { date: newDate })).status).toBe(200)
    await Promise.all(notices.mock.results.map((result) => result.value))
    const rescheduledFeed = await http(playerId, `${eventsPath}?teamId=${teamId}`)
    expect(rescheduledFeed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id, date: newDate, myRsvpStale: true }),
      ]),
    )
    expect(
      await fixtures.message.count({
        where: { clubId, teamId, senderId: coachId, messageType: 'SYSTEM' },
      }),
    ).toBeGreaterThan(0)
    expect(chatTransport.emitServerMessage).toHaveBeenCalled()
    expect((await http(playerId, `${path}/rsvp`, 'PUT', { status: 'MAYBE' })).status).toBe(200)
    // Retrying the same response must update one row, not duplicate a player/count.
    expect((await http(playerId, `${path}/rsvp`, 'PUT', { status: 'MAYBE' })).status).toBe(200)
    expect(
      await fixtures.rsvp.count({ where: { eventId: created.body.id, userId: playerId } }),
    ).toBe(1)
    expect((await http(coachId, `${path}/rsvp-summary`)).body).toEqual({ yes: 0, maybe: 1, no: 0 })
    expect((await http(playerId, `${eventsPath}?teamId=${teamId}`)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id, myRsvp: 'MAYBE', myRsvpStale: false }),
      ]),
    )
    expect((await http(foreignAdminId, `${path}/rsvp`, 'PUT', { status: 'YES' })).status).toBe(403)
    expect(eventsTransport.emitRsvpUpdate).toHaveBeenCalledWith(teamId, created.body.id)

    const lineup = {
      formation: '4-4-2',
      starters: [{ userId: playerId, name: 'Testspieler', slotId: 'GK', number: 1 }],
      bench: [],
    }
    expect((await http(playerId, `${path}/lineup`, 'PUT', lineup)).status).toBe(403)
    expect((await http(coachId, `${path}/lineup`, 'PUT', lineup)).status).toBe(200)
    // Draft stays private until the coach publishes the squad.
    expect((await http(playerId, `${path}/lineup`)).body).toBeNull()
    expect(
      (await http(coachId, `${path}/squad`, 'PUT', { userIds: [playerId], publish: true })).status,
    ).toBe(200)
    expect((await http(playerId, `${path}/lineup`)).body).toMatchObject(lineup)
    expect((await http(foreignAdminId, `${path}/lineup`)).status).toBe(403)
  })

  it('synchronizes free-agent visibility → trial → offer → admin-approved full roster access', async () => {
    const agentId = await newUser('free-agent')
    const strangerId = await newUser('free-agent-stranger')
    expect(
      (await http(agentId, '/me/registration-role', 'PATCH', { registrationRole: 'FREE_AGENT' }))
        .status,
    ).toBe(200)
    const profile = await http(agentId, '/me/free-agent-profile', 'POST', {
      city: 'Berlin',
      postalCode: '12435',
      bio: 'Testprofil',
      visibility: 'PRIVATE',
      isOnTransferList: true,
    })
    expect(profile.status).toBe(201)
    const profilePath = `/free-agents/${profile.body.id}`
    expect((await http(coachId, profilePath)).status).toBe(404)
    expect(
      (await http(agentId, '/me/free-agent-profile', 'PATCH', { visibility: 'CLUB_ONLY' })).status,
    ).toBe(200)
    expect((await http(strangerId, profilePath)).status).toBe(404)
    const visible = await http(coachId, profilePath)
    expect(visible.status).toBe(200)
    expect(visible.body.postalCode).toBeNull()

    const eventsPath = `/clubs/${clubId}/events`
    const session = await http(coachId, eventsPath, 'POST', {
      type: 'TRAINING',
      teamId,
      date: new Date(Date.now() + 5 * 86400000).toISOString(),
    })
    expect(session.status).toBe(201)
    const invitesPath = `/clubs/${clubId}/trial-invites`
    const inviteInput = {
      teamId,
      freeAgentProfileId: profile.body.id,
      sessionEventIds: [session.body.id],
    }
    expect((await http(strangerId, invitesPath, 'POST', inviteInput)).status).toBe(403)
    const invitation = await http(coachId, invitesPath, 'POST', inviteInput)
    expect(invitation.status).toBe(201)
    const invitePath = `/trial-invites/${invitation.body.id}`
    expect((await http(agentId, '/me/trial-invites')).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: invitation.body.id, status: 'PENDING' }),
      ]),
    )
    expect((await http(strangerId, invitePath, 'PATCH', { status: 'ACCEPTED' })).status).toBe(404)
    expect((await http(agentId, invitePath, 'PATCH', { status: 'ACCEPTED' })).status).toBe(200)
    const trialAccount = await http(agentId, '/me')
    expect(trialAccount.body.memberships).toEqual([])
    expect(trialAccount.body.teamMembers[0]).toMatchObject({ phase: 'TRIAL', status: 'ACTIVE' })
    const trialFeed = await http(agentId, `${eventsPath}?teamId=${teamId}`)
    expect(trialFeed.status).toBe(200)
    expect(trialFeed.body.map((event: { id: string }) => event.id)).toEqual([session.body.id])
    // Neither staff nor the player may skip membership review via roster acceptance.
    expect(
      (
        await http(
          coachId,
          `/clubs/${clubId}/team-access/${trialAccount.body.teamMembers[0].id}/decision`,
          'POST',
          { decision: 'ACCEPT' },
        )
      ).status,
    ).toBe(400)
    expect(
      (await http(coachId, `${invitesPath}/${invitation.body.id}`, 'PATCH', { action: 'offer' }))
        .status,
    ).toBe(200)
    expect((await http(agentId, invitePath)).body.status).toBe('OFFERED')
    expect((await http(agentId, invitePath, 'PATCH', { status: 'ACCEPT_OFFER' })).status).toBe(200)
    const applicationInput = {
      teamId,
      role: 'PLAYER',
      trialInviteId: invitation.body.id,
      street: 'Teststraße 1',
      postalCode: '12435',
      city: 'Berlin',
      phone: '+4900000000',
      nationality: 'Deutsch',
    }
    expect((await http(agentId, requestsPath(), 'POST', applicationInput)).status).toBe(400)
    const application = await http(agentId, requestsPath(), 'POST', {
      ...applicationInput,
      sepaConsent: true,
    })
    expect(application.status).toBe(201)
    expect(
      (
        await http(adminId, `${requestsPath()}/${application.body.id}/approve`, 'POST', {
          revision: application.body.revision,
        })
      ).status,
    ).toBe(201)
    const joined = await http(agentId, '/me')
    expect(joined.body.memberships).toEqual(
      expect.arrayContaining([expect.objectContaining({ clubId, role: 'PLAYER' })]),
    )
    expect(joined.body.teamMembers[0]).toMatchObject({ phase: 'FULL', status: 'ACTIVE' })
    expect((await http(agentId, invitePath)).body.status).toBe('JOINED')
    expect((await http(coachId, invitesPath)).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: invitation.body.id, status: 'JOINED' }),
      ]),
    )
    expect((await http(agentId, '/me/free-agent-profile')).body.isOnTransferList).toBe(false)
    expect(await fixtures.teamMember.count({ where: { userId: agentId, teamId } })).toBe(1)
    // Removing a member invalidates old invitations as well as their access.
    const staleInvite = await fixtures.trialInvite.create({
      data: {
        clubId,
        teamId,
        freeAgentProfileId: profile.body.id,
        sentByUserId: coachId,
        status: 'PENDING',
        sessionEventIds: [session.body.id],
        expiresAt: new Date(Date.now() + 86400000),
      },
    })
    // Legacy/previously listed profile must not be republished by removal.
    await fixtures.freeAgentProfile.update({
      where: { id: profile.body.id },
      data: { isOnTransferList: true },
    })
    await tenantContext.run({ clubId, userId: adminId }, () =>
      app!.get(ClubsService).removeMemberFromClub(adminId, clubId, agentId),
    )
    expect((await http(agentId, '/me')).body.memberships).toEqual([])
    expect((await http(agentId, `${eventsPath}?teamId=${teamId}`)).status).toBe(403)
    expect(
      (await fixtures.trialInvite.findUniqueOrThrow({ where: { id: staleInvite.id } })).status,
    ).toBe('REVOKED')
    expect(
      (await http(agentId, `/trial-invites/${staleInvite.id}`, 'PATCH', { status: 'ACCEPTED' }))
        .status,
    ).toBe(400)
    expect((await http(agentId, '/me/free-agent-profile')).body.isOnTransferList).toBe(false)
  })

  it('coach recruitment stays independent until an admin approves the role-bound offer', async () => {
    const candidateId = await newUser('independent-coach')
    await http(candidateId, '/me/registration-role', 'PATCH', { registrationRole: 'FREE_AGENT' })
    const profile = await http(candidateId, '/me/free-agent-profile', 'POST', {
      recruitmentRole: 'COACH',
      city: 'Berlin',
      postalCode: '12435',
      visibility: 'CLUB_ONLY',
      isOnTransferList: true,
    })
    expect(profile.status).toBe(201)
    expect(profile.body.recruitmentRole).toBe('COACH')
    expect((await http(candidateId, '/me')).body.memberships).toEqual([])
    const vacancies = `/clubs/${clubId}/player-searches`
    const vacancy = await http(adminId, vacancies, 'POST', {
      teamId,
      recruitmentRole: 'COACH',
      positions: [],
      note: 'Assistenz gesucht',
    })
    expect(vacancy.status).toBe(201)
    expect((await http(candidateId, '/player-searches?recruitmentRole=COACH')).body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: vacancy.body.id, recruitmentRole: 'COACH' }),
      ]),
    )
    expect(
      (await http(candidateId, '/player-searches?recruitmentRole=PLAYER')).body.items,
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: vacancy.body.id })]))
    const session = await http(coachId, `/clubs/${clubId}/events`, 'POST', {
      type: 'TRAINING',
      teamId,
      date: new Date(Date.now() + 5 * 86400000).toISOString(),
    })
    const invitation = await http(coachId, `/clubs/${clubId}/trial-invites`, 'POST', {
      teamId,
      freeAgentProfileId: profile.body.id,
      playerSearchId: vacancy.body.id,
      sessionEventIds: [session.body.id],
    })
    expect(invitation.status).toBe(201)
    const invitePath = `/trial-invites/${invitation.body.id}`
    expect((await http(candidateId, invitePath, 'PATCH', { status: 'ACCEPTED' })).status).toBe(200)
    // An interview/training visit grants neither player nor staff privileges.
    expect((await http(candidateId, '/me')).body.teamMembers).toEqual([])
    expect((await http(candidateId, `/clubs/${clubId}/events?teamId=${teamId}`)).status).toBe(403)
    expect(
      (await http(coachId, `/clubs/${clubId}${invitePath}`, 'PATCH', { action: 'offer' })).status,
    ).toBe(200)
    // Subsequent profile edits cannot change the role the club offered.
    await http(candidateId, '/me/free-agent-profile', 'PATCH', { recruitmentRole: 'PLAYER' })
    const application = await http(candidateId, requestsPath(), 'POST', {
      teamId,
      trialInviteId: invitation.body.id,
      role: 'PLAYER',
    })
    expect(application.status).toBe(201)
    expect(application.body.role).toBe('ASSISTANT_COACH')
    const approval = `${requestsPath()}/${application.body.id}/approve`
    expect(
      (await http(coachId, approval, 'POST', { revision: application.body.revision })).status,
    ).toBe(403)
    expect(
      (await http(adminId, approval, 'POST', { revision: application.body.revision })).status,
    ).toBe(201)
    const account = (await http(candidateId, '/me')).body
    expect(account.memberships).toEqual(
      expect.arrayContaining([expect.objectContaining({ clubId, role: 'COACH' })]),
    )
    expect(account.teamMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'ASSISTANT_COACH', status: 'ACTIVE' }),
      ]),
    )
    expect(await fixtures.teamMember.count({ where: { userId: candidateId, teamId } })).toBe(0)
    expect((await http(candidateId, '/me/free-agent-profile')).body.isOnTransferList).toBe(false)
  })

  it('last-club removal opens the independent portal without publishing a profile or touching another club', async () => {
    const playerId = await newUser('removed-player')
    await fixtures.user.update({ where: { id: playerId }, data: { registrationRole: 'PLAYER' } })
    await fixtures.membership.createMany({
      data: [
        { userId: playerId, clubId, role: 'PLAYER' },
        { userId: playerId, clubId: otherClubId, role: 'PLAYER' },
      ],
    })
    const service = app!.get(ClubsService)
    await tenantContext.run({ clubId, userId: adminId }, () =>
      service.removeMemberFromClub(adminId, clubId, playerId),
    )
    const stillMember = (await http(playerId, '/me')).body
    expect(stillMember.registrationRole).toBe('PLAYER')
    expect(stillMember.memberships.map((member: { clubId: string }) => member.clubId)).toEqual([
      otherClubId,
    ])
    await tenantContext.run({ clubId: otherClubId, userId: foreignAdminId }, () =>
      service.removeMemberFromClub(foreignAdminId, otherClubId, playerId),
    )
    const independent = (await http(playerId, '/me')).body
    expect(independent.registrationRole).toBe('FREE_AGENT')
    expect(independent.memberships).toEqual([])
    expect(independent.teamMembers).toEqual([])
    expect(await fixtures.freeAgentProfile.count({ where: { userId: playerId } })).toBe(0)
  })
})
