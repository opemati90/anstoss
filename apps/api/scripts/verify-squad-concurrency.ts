import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'
import { EventsService } from '../src/events/events.service'
import { TeamsService } from '../src/teams/teams.service'
import { UsersService } from '../src/users/users.service'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId, tenantContext } from '../src/prisma/tenant.context'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { AgeGateService } from '../src/auth/age-gate.service'
import { launchClubParticipantWhere } from '../src/auth/launch-access-policy'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function main() {
  // Refuse normal developer, staging and production databases.
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/)
  assert.equal(LAUNCH_FEATURES.youthParticipation, false, 'exercise actual launch defaults, not future test fixtures')
  assert.equal(LAUNCH_FEATURES.healthReporting, false)
  const db = new PrismaClient()
  db.$use(createTenantMiddleware(getClubId) as never)
  const clubId = `squad-${randomUUID()}`
  const coachId = `coach-${randomUUID()}`
  const playerId = `player-${randomUUID()}`
  let gate: { held: ReturnType<typeof deferred>; attempted: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; first: boolean; acquired: boolean; competing: boolean } | null = null
  let beforeTransaction: (() => Promise<void>) | undefined
  const proxied = new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') {
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) => {
        if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = undefined; await hook() }
        return target.$transaction(async (tx) => callback(new Proxy(tx, {
          get(transaction, property) {
            const original = Reflect.get(transaction, property)
            if (property !== '$executeRaw') return typeof original === 'function' ? original.bind(transaction) : original
            return async (...args: unknown[]) => {
              const sql = Array.isArray(args[0]) ? args[0].join('') : ''
              const current = gate
              const matches = current && sql.includes('pg_advisory_xact_lock(hashtext(') && args.includes(playerId)
              if (matches && !current.first) {
                current.first = true
                const result = await Reflect.apply(original, transaction, args)
                current.acquired = true
                current.held.resolve()
                await current.release.promise
                return result
              }
              if (matches) { current.competing = true; current.attempted.resolve() }
              return Reflect.apply(original, transaction, args)
            }
          },
        })), { timeout: 15_000, ...options })
      }
    },
  })
  const teams = new TeamsService(proxied as never)
  const events = new EventsService(proxied as never, teams,
    { getOverdueContributionsForUser: async () => [] } as never,
    { sendToUserLocalized: async () => undefined } as never,
    { emitEventUpsert: () => undefined, emitRsvpUpdate: async () => undefined } as never,
    {} as never)
  const notifications: string[][] = []
  // Inspect postcommit recipient plans; this verifier does not contact Expo.
  ;(events as unknown as { notifySquadNominated: (event: unknown, ids: string[]) => Promise<void> }).notifySquadNominated = async (_event, ids) => { notifications.push(ids) }
  const users = new UsersService(proxied as never, teams, {} as never, {} as never, {} as never)
  try {
    await tenantContext.run({ clubId, userId: coachId }, async () => {
      await db.club.create({ data: { id: clubId, name: 'Synthetic squad fixture', slug: clubId } })
      await db.user.createMany({ data: [coachId, playerId].map((id) => ({ id, name: 'Synthetic adult', dateOfBirth: new Date('1990-01-01') })) })
      await db.membership.create({ data: { clubId, userId: coachId, role: 'OWNER' } })
      const group = await db.teamGroup.create({ data: { clubId, type: 'CUSTOM', displayName: 'Fixture' } })
      const team = await db.team.create({ data: { clubId, groupId: group.id, name: 'Fixture', displayName: 'Fixture' } })
      const otherTeam = await db.team.create({ data: { clubId, groupId: group.id, name: 'Borrower', displayName: 'Borrower' } })
      const event = await db.event.create({ data: { clubId, teamId: team.id, createdById: coachId, title: 'Synthetic match', date: new Date(Date.now() + 86400_000) } })
      const reset = async () => {
        notifications.length = 0
        await db.event.update({ where: { id: event.id }, data: { cancelledAt: null, archivedAt: null, squadPublishedAt: null } })
        await db.membership.update({ where: { userId_clubId: { userId: coachId, clubId } }, data: { role: 'OWNER' } })
        await db.user.update({ where: { id: playerId }, data: { deletedAt: null, email: null, name: 'Synthetic adult', dateOfBirth: new Date('1990-01-01') } })
        await db.membership.upsert({ where: { userId_clubId: { userId: playerId, clubId } }, create: { clubId, userId: playerId, role: 'PLAYER' }, update: { role: 'PLAYER' } })
        await db.teamAccess.upsert({ where: { teamId_userId_role: { teamId: team.id, userId: playerId, role: 'PLAYER' } },
          create: { clubId, teamId: team.id, userId: playerId, role: 'PLAYER', status: 'ACTIVE' }, update: { status: 'ACTIVE' } })
        await db.teamMember.upsert({ where: { teamId_userId: { teamId: team.id, userId: playerId } }, create: { teamId: team.id, userId: playerId }, update: {} })
        await db.teamAccess.updateMany({ where: { teamId: otherTeam.id, userId: playerId }, data: { status: 'REVOKED' } })
        await db.rsvp.upsert({ where: { eventId_userId: { eventId: event.id, userId: playerId } },
          create: { eventId: event.id, userId: playerId, status: 'YES' }, update: { status: 'YES', nominated: false, squadDroppedAt: null } })
      }
      const nominate = () => events.updateSquad(clubId, event.id, coachId, { userIds: [playerId], publish: true })
      const decline = () => events.upsertRsvp(event.id, playerId, 'NO')
      // Actual PostgreSQL predicates must distinguish disabled guardian-only
      // participation from an adult with an independent player role.
      await reset()
      await db.membership.update({ where: { userId_clubId: { userId: playerId, clubId } }, data: { role: 'PARENT' } })
      const adultWhere = { id: playerId, ...launchClubParticipantWhere(clubId) }
      assert.equal(await db.user.count({ where: adultWhere }), 1, 'independent adult player remains visible')
      await db.teamAccess.updateMany({ where: { teamId: team.id, userId: playerId }, data: { status: 'REVOKED' } })
      assert.equal(await db.user.count({ where: adultWhere }), 0, 'guardian-only membership must not expand adult participation')
      assert.equal((await new AgeGateService(db as never).evaluate(playerId, { clubId })).allowed, false)
      await reset()
      for (const dateOfBirth of [new Date('2012-01-01'), null]) {
        await db.user.update({ where: { id: playerId }, data: { dateOfBirth, adultConfirmedAt: new Date() } })
        assert.equal(await db.user.count({ where: { id: playerId, ...launchClubParticipantWhere(clubId) } }), 0)
        assert.equal((await new AgeGateService(db as never).evaluate(playerId, { clubId })).allowed, false)
        await assert.rejects(decline)
        await assert.rejects(() => teams.createPlayerLoan(clubId, team.id, coachId, { playerUserId: playerId, targetTeamId: otherTeam.id }))
        assert.equal(await db.teamAccess.count({ where: { teamId: otherTeam.id, userId: playerId } }), 0)
        assert.equal((await db.user.findUniqueOrThrow({ where: { id: playerId } })).deletedAt, null)
      }
      await reset()
      await db.rsvp.update({ where: { eventId_userId: { eventId: event.id, userId: playerId } }, data: { reason: 'injured', note: 'Synthetic historical note' } })
      const safeReply = await decline()
      assert.equal((safeReply as { reason?: string | null }).reason, null)
      const historicalReply = await db.rsvp.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })
      assert.equal(historicalReply.reason, 'injured'); assert.equal(historicalReply.note, 'Synthetic historical note')
      const ordered = async (first: () => Promise<unknown>, second: () => Promise<unknown>) => {
        const current = { held: deferred(), attempted: deferred(), release: deferred(), first: false, acquired: false, competing: false }
        gate = current
        const firstJob = first()
        let secondJob: Promise<unknown> | undefined
        const timeout = setTimeout(() => { current.held.resolve(); current.attempted.resolve(); current.release.resolve() }, 10_000)
        try {
          await current.held.promise
          assert.ok(current.acquired, 'first service must acquire the actual player lifecycle lock')
          secondJob = second()
          await current.attempted.promise
          assert.ok(current.competing, 'second service must attempt the same lock before the first is released')
          current.release.resolve()
          await Promise.all([firstJob, secondJob])
        } finally {
          current.release.resolve()
          clearTimeout(timeout)
          await Promise.allSettled([firstJob, ...(secondJob ? [secondJob] : [])])
          gate = null
        }
      }
      await reset()
      await ordered(decline, nominate)
      let reply = await db.rsvp.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })
      assert.equal(reply.status, 'NO'); assert.equal(reply.nominated, false)
      assert.equal(notifications.length, 0)
      await reset()
      await ordered(nominate, decline)
      reply = await db.rsvp.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })
      assert.equal(reply.status, 'NO'); assert.equal(reply.nominated, false); assert.ok(reply.squadDroppedAt)
      await reset()
      await Promise.all(Array.from({ length: 6 }, nominate))
      assert.equal(notifications.length, 1, 'simultaneous publishes must not duplicate nominations')

      for (const change of ['revoked', 'cancelled', 'archived']) {
        await reset()
        beforeTransaction = async () => {
          if (change === 'revoked') await db.membership.update({ where: { userId_clubId: { userId: coachId, clubId } }, data: { role: 'PLAYER' } })
          else await db.event.update({ where: { id: event.id }, data: change === 'cancelled' ? { cancelledAt: new Date() } : { archivedAt: new Date() } })
        }
        await assert.rejects(nominate)
        assert.equal((await db.rsvp.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })).nominated, false)
        assert.equal(notifications.length, 0)
      }

      // The same player lock serializes BOTH insertion and reactivation of a loan.
      for (const kind of ['new', 'reactivated']) {
        await reset()
        if (kind === 'new') await db.teamAccess.deleteMany({ where: { teamId: otherTeam.id, userId: playerId } })
        await ordered(() => teams.createPlayerLoan(clubId, team.id, coachId, { playerUserId: playerId, targetTeamId: otherTeam.id }), nominate)
        assert.equal((await db.rsvp.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: playerId } } })).nominated, false)
        assert.equal(notifications.length, 0)
      }
      for (const deletionFirst of [true, false]) {
        await reset()
        await ordered(deletionFirst ? () => users.deleteAccount(playerId) : nominate,
          deletionFirst ? nominate : () => users.deleteAccount(playerId))
        assert.ok((await db.user.findUniqueOrThrow({ where: { id: playerId } })).deletedAt)
        assert.equal(await db.rsvp.count({ where: { eventId: event.id, userId: playerId } }), 0)
      }
      console.log('PASS: default 18+ predicates and rejected youth/no-DOB writes, preserved historical health fields; real service decline/squad orderings, six concurrent publishes, authority/cancel/archive rechecks, new/reactivated loan exclusion and both account-deletion orderings')
    })
  } finally {
    await tenantContext.run({ clubId, userId: coachId }, async () => { await db.club.deleteMany({ where: { id: clubId } }) })
    await db.user.deleteMany({ where: { id: { in: [coachId, playerId] } } })
    await db.$disconnect()
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1 })
