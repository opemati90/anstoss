import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { assertAvailabilityOpen, lockAvailabilityAuthority, lockAvailabilityEvent } from '../src/events/availability-policy'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId, tenantContext } from '../src/prisma/tenant.context'

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  db.$use(createTenantMiddleware(getClubId) as never)
  const clubId = `availability-${randomUUID()}`
  const otherClubId = `availability-${randomUUID()}`
  const coachId = `availability-${randomUUID()}`
  const playerId = `availability-${randomUUID()}`
  const parentId = `availability-${randomUUID()}`
  try {
    await tenantContext.run({ clubId, userId: coachId }, async () => {
      await db.club.create({ data: { id: clubId, name: 'Synthetic availability test', slug: clubId } })
      await db.club.create({ data: { id: otherClubId, name: 'Other synthetic test', slug: otherClubId } })
      await db.user.createMany({ data: [coachId, playerId, parentId].map((id) => ({ id, name: 'Synthetic fixture' })) })
      await db.membership.createMany({ data: [
        { clubId, userId: coachId, role: 'COACH' }, { clubId, userId: playerId, role: 'PLAYER' },
      ] })
      const group = await db.teamGroup.create({ data: { clubId, type: 'CUSTOM', displayName: 'Fixture' } })
      const team = await db.team.create({ data: { clubId, groupId: group.id, name: 'Fixture', displayName: 'Fixture' } })
      const event = await db.event.create({ data: { clubId, teamId: team.id, createdById: coachId, title: 'Synthetic fixture', date: new Date(Date.now() + 86400_000) } })
      let release!: () => void
      let entered!: () => void
      const ready = new Promise<void>((resolve) => { entered = resolve })
      const hold = new Promise<void>((resolve) => { release = resolve })
      const policyWrite = db.$transaction(async (tx) => {
        await lockAvailabilityEvent(tx, event.id, clubId)
        await lockAvailabilityAuthority(tx, clubId, team.id, coachId)
        await tx.event.update({ where: { id: event.id }, data: { rsvpLocked: true } })
        entered()
        await hold
      }, { timeout: 15_000 })
      try {
        await ready
        // These queries must actually contend; no timing/sleep assertion.
        await assert.rejects(db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '100ms'`
          await lockAvailabilityEvent(tx, event.id, clubId)
          await tx.rsvp.create({ data: { eventId: event.id, userId: playerId, status: 'YES' } })
        }), /lock timeout/)
        await assert.rejects(db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '100ms'`
          await tx.membership.updateMany({ where: { clubId, userId: coachId }, data: { role: 'PLAYER' } })
        }), /lock timeout/)
      } finally { release() }
      await policyWrite
      await assert.rejects(db.$transaction(async (tx) => {
        const current = await lockAvailabilityEvent(tx, event.id, clubId)
        assertAvailabilityOpen(current)
        await tx.rsvp.create({ data: { eventId: event.id, userId: playerId, status: 'YES' } })
      }), /Availability is closed/)
      assert.equal(await db.rsvp.count({ where: { eventId: event.id } }), 0)
      await assert.rejects(db.$transaction((tx) => lockAvailabilityEvent(tx, event.id, otherClubId)), /Event not found/)
      const foreignLink = await tenantContext.run({ clubId: otherClubId, userId: parentId }, async () =>
        await db.guardianRelationship.create({ data: { clubId: otherClubId, parentUserId: parentId, playerUserId: playerId } }))
      assert.equal(foreignLink.clubId, otherClubId)
      await assert.rejects(db.$transaction((tx) => lockAvailabilityAuthority(tx, clubId, team.id, playerId, parentId)), /Guardian relationship unavailable/)
      const link = await db.guardianRelationship.create({ data: { clubId, parentUserId: parentId, playerUserId: playerId } })
      await db.$transaction((tx) => lockAvailabilityAuthority(tx, clubId, team.id, playerId, parentId))
      await db.guardianRelationship.delete({ where: { id: link.id } })
      await assert.rejects(db.$transaction((tx) => lockAvailabilityAuthority(tx, clubId, team.id, playerId, parentId)), /Guardian relationship unavailable/)
      console.log('PASS: real event-row contention, authority-row revocation contention, closed RSVP rollback, tenant isolation and guardian-link predicates')
    })
  } finally {
    for (const id of [clubId, otherClubId]) {
      await tenantContext.run({ clubId: id, userId: coachId }, () => db.club.deleteMany({ where: { id } }))
    }
    await db.user.deleteMany({ where: { id: { in: [coachId, playerId, parentId] } } })
    await db.$disconnect()
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
