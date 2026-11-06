import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../src/prisma/prisma.service'
import { tenantContext } from '../src/prisma/tenant.context'
import { JoinRequestsService } from '../src/clubs/join-requests.service'
import { TeamsService } from '../src/teams/teams.service'
import { EventsService } from '../src/events/events.service'
import { ClubEntitlementsService } from '../src/billing/club-entitlements.service'

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

      const request = await join.create(playerId, clubId, { role: 'PLAYER', teamId: team.id })
      assert((await join.listPending(clubId)).some((item) => item.id === request.id))
      await join.approve(clubId, request.id, adminId, { revision: request.revision })
      const access = await db.teamAccess.findFirstOrThrow({ where: { teamId: team.id, userId: playerId } })
      assert.equal(access.status, 'ACTIVE')
      assert.equal(access.phase, 'FULL')
      const event = await events.create({ clubId, teamId: team.id, createdById: coachId,
        type: 'TRAINING', title: 'Synthetic training', date: new Date(Date.now() + 86_400_000) })
      await events.upsertRsvp(event.id, playerId, 'YES')
      const summary = await events.getRsvpSummary(event.id, coachId)
      assert.equal(summary.yes, 1)
      const attendance = await events.getAttendance(clubId, event.id, coachId)
      assert(attendance.rsvps.some((item) => item.userId === playerId && item.status === 'YES'))
      console.log('PASS: real database and services: player request → admin approval → active team access → player RSVP → coach summary and attendance')
      console.log('External pushes, payment checks, HTTP authentication and mobile clients are not exercised.')
    })
  } finally {
    await db.onModuleDestroy()
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
