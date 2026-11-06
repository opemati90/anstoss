import assert from 'node:assert/strict'
import { Controller, ExecutionContext, Get, UseGuards } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../src/prisma/prisma.service'
import { tenantContext } from '../src/prisma/tenant.context'
import { JoinRequestsService } from '../src/clubs/join-requests.service'
import { JoinRequestsController } from '../src/clubs/join-requests.controller'
import { MeJoinRequestsController } from '../src/clubs/me-join-requests.controller'
import { ClubsService } from '../src/clubs/clubs.service'
import { TeamsService } from '../src/teams/teams.service'
import { EventsService } from '../src/events/events.service'
import { EventsController } from '../src/events/events.controller'
import { ClubEntitlementsService } from '../src/billing/club-entitlements.service'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { AgeGateGuard } from '../src/auth/age-gate.guard'
import { RolesGuard } from '../src/auth/roles.guard'
import { UsersService } from '../src/users/users.service'
import { CurrentUser } from '../src/auth/user.decorator'
import type { NextFunction, Request, Response } from 'express'

@Controller()
@UseGuards(ClerkAuthGuard)
class FixtureProfileController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.users.getMe(user.id)
  }
}

// An explicitly isolated database and localhost listener are mandatory: this
// server has synthetic authentication and must never be deployed.
async function main() {
  // A local fixture process must never be able to send real mail.
  delete process.env.RESEND_API_KEY
  delete process.env.RESEND_FROM_EMAIL
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(process.env.ANSTOSS_SIMULATOR_FIXTURES, '1')
  assert.equal(process.env.NODE_ENV, 'test')
  assert.equal(databaseUrl.hostname, 'localhost')
  assert.equal(databaseUrl.pathname, '/anstoss_simulator_fixtures')
  assert.match(databaseUrl.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-flow-db\.[A-Za-z0-9]+$/)
  const clubId = 'club-e2e-sv-albatros'
  const teamId = 'team-e2e-senior-1'
  const adminId = 'user-admin-1'
  const coachId = 'user-coach-1'
  const playerId = 'user-player-1'
  const applicantId = 'user-player-signup'
  const db = new PrismaService()
  await db.onModuleInit()
  const marker = await db.$queryRaw<Array<{ marker: string }>>`SELECT marker FROM simulator_fixture_sentinel WHERE marker = 'anstoss-isolated-simulator-only'`
  assert.equal(marker.length, 1, 'Dedicated simulator database sentinel missing')
  await tenantContext.run({ clubId, userId: adminId }, async () => {
    await db.club.upsert({ where: { id: clubId }, update: {}, create: { id: clubId, name: 'SV Albatros', slug: 'sv-albatros-simulator' } })
    for (const [id, name] of [[adminId, 'Admin'], [coachId, 'Coach Albrecht'], [playerId, 'Julian Becker'], [applicantId, 'Julian Becker']]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, name, dateOfBirth: new Date('1990-01-01T00:00:00Z') } })
    }
    for (const [userId, role] of [[adminId, 'OWNER'], [coachId, 'COACH'], [playerId, 'PLAYER']] as const) {
      await db.membership.upsert({ where: { userId_clubId: { userId, clubId } }, update: {}, create: { userId, clubId, role } })
    }
    const group = await db.teamGroup.upsert({ where: { id: 'simulator-group' }, update: {}, create: { id: 'simulator-group', clubId, type: 'CUSTOM', displayName: 'Senior' } })
    await db.team.upsert({ where: { id: teamId }, update: {}, create: { id: teamId, clubId, groupId: group.id, name: 'Senior Team', displayName: 'Senior Team' } })
    for (const [userId, role] of [[coachId, 'HEAD_COACH'], [playerId, 'PLAYER']] as const) {
      await db.teamAccess.upsert({ where: { teamId_userId_role: { teamId, userId, role } }, update: {}, create: { teamId, clubId, userId, role, phase: 'FULL', status: 'ACTIVE' } })
    }
    await db.teamMember.upsert({ where: { teamId_userId: { teamId, userId: playerId } }, update: {}, create: { teamId, userId: playerId } })
    await db.event.upsert({ where: { id: 'event-match-away' }, update: {}, create: { id: 'event-match-away', clubId, teamId, createdById: coachId,
      type: 'MATCH', title: '@ FC Stahl Brandenburg', date: new Date(Date.now() + 86400_000) } })
  })
  const push = { sendToUserLocalized: async () => undefined, sendToTeamRendered: async () => undefined }
  const gateway = { emitEventUpsert: () => undefined, emitRsvpUpdate: () => undefined }
  const teams = new TeamsService(db)
  const join = new JoinRequestsService(db, {} as never, push as never, {} as never, new ClubEntitlementsService(db, {} as never))
  const events = new EventsService(db, teams, { getOverdueContributionsForUser: async () => [] } as never, push as never, gateway as never, {} as never)
  const users = new UsersService(db, teams, {} as never, {} as never, {} as never)
  const fixtureAuth = { canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    const id = request.headers['x-fixture-user']
    if (![adminId, coachId, playerId, applicantId].includes(id)) return false
    request.user = { id }
    return true
  } }
  const module = await Test.createTestingModule({ controllers: [JoinRequestsController, MeJoinRequestsController, EventsController, FixtureProfileController], providers: [
    { provide: PrismaService, useValue: db }, { provide: JoinRequestsService, useValue: join },
    { provide: EventsService, useValue: events }, { provide: ClubsService, useValue: {} }, RolesGuard,
    { provide: UsersService, useValue: users },
  ] }).overrideGuard(ClerkAuthGuard).useValue(fixtureAuth)
    .overrideGuard(AgeGateGuard).useValue({ canActivate: () => true }).compile()
  const app = module.createNestApplication()
  app.use((request: Request, response: Response, next: NextFunction) => {
    const pathname = request.path
    const method = request.method
    const allowed = (method === 'GET' && (pathname === '/me' || pathname === '/me/join-requests/active'))
      || (['GET', 'POST'].includes(method) && pathname === `/clubs/${clubId}/join-requests`)
      || (method === 'POST' && new RegExp(`^/clubs/${clubId}/join-requests/[A-Za-z0-9_-]+/approve$`).test(pathname))
      || (method === 'GET' && new RegExp(`^/clubs/${clubId}/events/event-match-away(?:/(?:rsvp-summary|attendance))?$`).test(pathname))
      || (method === 'PUT' && pathname === `/clubs/${clubId}/events/event-match-away/rsvp`)
    if (!allowed) return response.sendStatus(404)
    tenantContext.run({ clubId, userId: request.get('x-fixture-user') ?? '' }, next)
  })
  await app.listen(31337, '127.0.0.1')
  console.log('Simulator-only fixture API listening on 127.0.0.1:31337; identity and notifications are synthetic.')
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
