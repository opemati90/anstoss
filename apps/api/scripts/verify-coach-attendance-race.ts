import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { CoachAttendanceService } from '../src/events/coach-attendance.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { TeamsService } from '../src/teams/teams.service'
import { EventsService } from '../src/events/events.service'
import { ForbiddenException } from '@nestjs/common'

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  const clubId = `attendance-${randomUUID()}`
  const coachId = `attendance-${randomUUID()}`
  const playerId = `attendance-${randomUUID()}`
  try {
    await db.club.create({ data: { id: clubId, name: 'Synthetic attendance test', slug: clubId } })
    await db.user.createMany({ data: [coachId, playerId].map((id) => ({ id, name: 'Synthetic fixture' })) })
    const group = await db.teamGroup.create({ data: { clubId, type: 'CUSTOM', displayName: 'Fixture' } })
    const team = await db.team.create({ data: { clubId, groupId: group.id, name: 'Fixture', displayName: 'Fixture' } })
    const event = await db.event.create({ data: { clubId, teamId: team.id, createdById: coachId, title: 'Fixture', date: new Date(Date.now() - 60000) } })
    const service = new CoachAttendanceService(db as unknown as PrismaService,
      { assertEventManagementAccess: async () => undefined } as unknown as TeamsService,
      { assertCurrentPlayerEligibility: async (_tx: unknown, _club: string, _team: string, _event: string, id: string) => {
        if (id !== playerId) throw new ForbiddenException('Not eligible')
      } } as unknown as EventsService)
    const operationId = randomUUID()
    const [a, b] = await Promise.all([
      service.record(clubId, event.id, coachId, playerId, 'PRESENT', null, operationId),
      service.record(clubId, event.id, coachId, playerId, 'PRESENT', null, operationId),
    ])
    assert.ok(a && b)
    assert.equal(await db.coachAttendanceChange.count({ where: { eventId: event.id } }), 1)
    assert.equal((await db.coachAttendance.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })).version, 1)
    await service.record(clubId, event.id, coachId, playerId, 'PRESENT', 1, randomUUID())
    await assert.rejects(service.record(clubId, event.id, coachId, playerId, 'ABSENT', 1, randomUUID()), /Attendance changed/)
    assert.equal((await db.coachAttendance.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })).version, 2)
    const missing = `nonexistent-${randomUUID()}`
    const rejectedId = randomUUID()
    await assert.doesNotReject(service.record(clubId, event.id, coachId, missing, 'PRESENT', null, rejectedId))
    const rejection = await db.coachAttendanceRejection.findUniqueOrThrow({ where: { operationId: rejectedId } })
    assert.deepEqual(Object.keys(rejection).sort(), ['actorId', 'createdAt', 'eventId', 'operationId'])
    assert.equal(await db.coachAttendanceChange.count({ where: { userId: missing } }), 0)
    const cancelledId = randomUUID()
    await db.event.update({ where: { id: event.id }, data: { cancelledAt: new Date() } })
    assert.deepEqual(await service.record(clubId, event.id, coachId, playerId, 'ABSENT', 2, cancelledId), { settled: true, rejected: true })
    await db.event.update({ where: { id: event.id }, data: { cancelledAt: null } })
    assert.deepEqual(await service.record(clubId, event.id, coachId, playerId, 'ABSENT', 2, cancelledId), { settled: true, rejected: true })
    assert.equal((await db.coachAttendance.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })).version, 2)
    console.log('PASS: isolated PostgreSQL replay, stale-write fencing, target-free rejection and cancelled-operation fencing (authorization mocked)')
  } finally {
    await db.club.deleteMany({ where: { id: clubId } })
    await db.user.deleteMany({ where: { id: { in: [coachId, playerId] } } })
    await db.$disconnect()
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
