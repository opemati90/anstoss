import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../src/prisma/prisma.service'
import { tenantContext } from '../src/prisma/tenant.context'
import { JoinRequestsService } from '../src/clubs/join-requests.service'
import { TeamsService } from '../src/teams/teams.service'
import { EventsService } from '../src/events/events.service'
import { ClubEntitlementsService } from '../src/billing/club-entitlements.service'
import { Test } from '@nestjs/testing'
import { ExecutionContext, INestApplication } from '@nestjs/common'
import { JoinRequestsController } from '../src/clubs/join-requests.controller'
import { ClubsService } from '../src/clubs/clubs.service'
import { EventsController } from '../src/events/events.controller'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { AgeGateGuard } from '../src/auth/age-gate.guard'
import { RolesGuard } from '../src/auth/roles.guard'

// This verifier must never write to a real database.
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-flow-db\.[A-Za-z0-9]+$/)
  const db = new PrismaService()
  await db.onModuleInit()
  const prefix = `role-sync-${randomUUID()}`
  const clubId = `${prefix}-club`
  const adminId = `${prefix}-admin`
  const coachId = `${prefix}-coach`
  const playerId = `${prefix}-player`
  const noopPush = { sendToUserLocalized: async () => undefined, sendToTeamRendered: async () => undefined }
  const gateway = { emitEventUpsert: () => undefined, emitRsvpUpdate: () => undefined }
  let app: INestApplication | undefined
  try {
    await tenantContext.run({ clubId, userId: adminId }, async () => {
      await db.club.create({ data: { id: clubId, name: 'Synthetic club', slug: clubId } })
      await db.user.createMany({ data: [adminId, coachId, playerId].map((id) => ({
        id, name: id, dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      })) })
      await db.membership.createMany({ data: [
        { clubId, userId: adminId, role: 'OWNER' },
        { clubId, userId: coachId, role: 'COACH' },
      ] })
      const group = await db.teamGroup.create({ data: { clubId, type: 'CUSTOM', displayName: 'Synthetic' } })
      const team = await db.team.create({ data: { clubId, groupId: group.id, name: 'Synthetic', displayName: 'Synthetic' } })
      await db.teamAccess.create({ data: { clubId, teamId: team.id, userId: coachId, role: 'HEAD_COACH', phase: 'FULL', status: 'ACTIVE' } })
      const entitlements = new ClubEntitlementsService(db, {} as never)
      const join = new JoinRequestsService(db, {} as never, noopPush as never, {} as never, entitlements)
      const teams = new TeamsService(db)
      const events = new EventsService(db, teams, { getOverdueContributionsForUser: async () => [] } as never,
        noopPush as never, gateway as never, {} as never)

      // Header-based synthetic identity exists only in this local verifier.
      const fixtureAuth = { canActivate: (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest()
        const id = request.headers['x-fixture-user']
        if (![adminId, coachId, playerId].includes(id)) return false
        request.user = { id }
        return true
      } }
      const module = await Test.createTestingModule({
        controllers: [JoinRequestsController, EventsController],
        providers: [
          { provide: PrismaService, useValue: db },
          { provide: JoinRequestsService, useValue: join },
          { provide: EventsService, useValue: events },
          { provide: ClubsService, useValue: {} },
          RolesGuard,
        ],
      }).overrideGuard(ClerkAuthGuard).useValue(fixtureAuth)
        .overrideGuard(AgeGateGuard).useValue({ canActivate: () => true }).compile()
      app = module.createNestApplication()
      await app.listen(0, '127.0.0.1')
      const address = app.getHttpServer().address()
      assert(address && typeof address !== 'string')
      const base = `http://127.0.0.1:${address.port}/clubs/${clubId}`
      const requestAs = async (id: string, path: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
        method, headers: { 'content-type': 'application/json', 'x-fixture-user': id },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const created = await requestAs(playerId, '/join-requests', 'POST', { role: 'PLAYER', teamId: team.id })
      assert.equal(created.status, 201, await created.clone().text())
      const request = await created.json()
      const forbidden = await requestAs(playerId, '/join-requests')
      assert.equal(forbidden.status, 403)
      const forbiddenApproval = await requestAs(playerId, `/join-requests/${request.id}/approve`, 'POST', { revision: request.revision })
      assert.equal(forbiddenApproval.status, 403)
      const pending = await requestAs(adminId, '/join-requests')
      assert.equal(pending.status, 200, await pending.clone().text())
      assert((await pending.json()).some((item: { id: string }) => item.id === request.id))
      const approved = await requestAs(adminId, `/join-requests/${request.id}/approve`, 'POST', { revision: request.revision })
      assert.equal(approved.status, 201, await approved.clone().text())
      const access = await db.teamAccess.findFirstOrThrow({ where: { teamId: team.id, userId: playerId } })
      assert.equal(access.status, 'ACTIVE')
      assert.equal(access.phase, 'FULL')
      const eventResponse = await requestAs(coachId, '/events', 'POST', { teamId: team.id,
        type: 'TRAINING', title: 'Synthetic training', date: new Date(Date.now() + 86_400_000).toISOString() })
      assert.equal(eventResponse.status, 201, await eventResponse.clone().text())
      const event = await eventResponse.json()
      const rsvp = await requestAs(playerId, `/events/${event.id}/rsvp`, 'PUT', { status: 'YES' })
      assert.equal(rsvp.status, 200, await rsvp.clone().text())
      const summaryResponse = await requestAs(coachId, `/events/${event.id}/rsvp-summary`)
      assert.equal(summaryResponse.status, 200, await summaryResponse.clone().text())
      const summary = await summaryResponse.json()
      assert.equal(summary.yes, 1)
      const attendanceResponse = await requestAs(coachId, `/events/${event.id}/attendance`)
      assert.equal(attendanceResponse.status, 200, await attendanceResponse.clone().text())
      const attendance = await attendanceResponse.json()
      assert(attendance.rsvps.some((item: { userId: string; status: string }) => item.userId === playerId && item.status === 'YES'))
      const changed = await requestAs(playerId, `/events/${event.id}/rsvp`, 'PUT', { status: 'MAYBE' })
      assert.equal(changed.status, 200, await changed.clone().text())
      const updatedSummary = await requestAs(coachId, `/events/${event.id}/rsvp-summary`)
      assert.equal(updatedSummary.status, 200, await updatedSummary.clone().text())
      assert.deepEqual(await updatedSummary.json(), { yes: 0, maybe: 1, no: 0 })
      console.log('PASS: real HTTP controllers, role guard, database and services: player request → admin approval → team access → player RSVP → coach summary and attendance')
      console.log('Identity verification, global guards, external pushes, payment checks and mobile clients are not exercised.')
    })
  } finally {
    await app?.close()
    await db.onModuleDestroy()
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
