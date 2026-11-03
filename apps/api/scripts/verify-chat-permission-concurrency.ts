import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { ChatService } from '../src/chat/chat.service'
import { ChannelsService } from '../src/channels/channels.service'
import { ClubsService } from '../src/clubs/clubs.service'
import { DmService } from '../src/dm/dm.service'
import { TeamsService } from '../src/teams/teams.service'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId, tenantContext } from '../src/prisma/tenant.context'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

type Hook = {
  label: string
  method: '$executeRaw' | '$queryRaw'
  matches: (args: unknown[]) => boolean
  stage: 'before' | 'after'
  pause: boolean
  ready: ReturnType<typeof deferred>
  release: ReturnType<typeof deferred>
  pid?: number
  triggered: boolean
}

function hook(label: string, method: Hook['method'], matches: Hook['matches'], stage: Hook['stage'], pause: boolean): Hook {
  return { label, method, matches, stage, pause, ready: deferred(), release: deferred(), triggered: false }
}

function sqlContains(args: unknown[], text: string) {
  return Array.isArray(args[0]) && args[0].join('').includes(text)
}

async function main() {
  // This verifier mutates fixtures. Refuse every database except the explicit
  // isolated socket/port/test DB used for the local erasure regression run.
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.equal(url.port, '55442')
  assert.equal(url.pathname, '/anstoss_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  db.$use(createTenantMiddleware(getClubId) as never)
  const clubId = `chat-lock-${randomUUID()}`
  const adminId = `chat-lock-${randomUUID()}`
  const actorId = `chat-lock-${randomUUID()}`
  const peerId = `chat-lock-${randomUUID()}`
  const hooks: Hook[] = []
  const events = { emit: () => undefined }
  const client = (label: string) => new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') {
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) =>
        target.$transaction(async (tx) => callback(new Proxy(tx, {
          get(transaction, property) {
            const original = Reflect.get(transaction, property)
            if (property !== '$executeRaw' && property !== '$queryRaw') {
              return typeof original === 'function' ? original.bind(transaction) : original
            }
            return async (...args: unknown[]) => {
              const current = hooks.find((item) => item.label === label && item.method === property
                && !item.triggered && item.matches(args))
              const enter = async () => {
                if (!current) return
                current.triggered = true
                const [backend] = await transaction.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
                current.pid = backend.pid
                current.ready.resolve()
                if (current.pause) await current.release.promise
              }
              if (current?.stage === 'before') await enter()
              const result = await Reflect.apply(original, transaction, args)
              if (current?.stage === 'after') await enter()
              return result
            }
          },
        })), { maxWait: 10_000, timeout: 15_000, ...options })
    },
  })

  const channelDb = client('channel')
  const teams = new TeamsService(db as never)
  const channels = new ChannelsService(db as never, teams, events as never)
  const chat = new ChatService(channelDb as never, teams,
    { broadcastChatEvent: () => undefined, emitInboxUpdateForChannel: async () => undefined } as never,
    { sendToUserLocalized: async () => undefined } as never,
    channels, { getEntitlements: async () => ({ features: ['lineup_builder_pro'] }) } as never)
  const dm = new DmService(client('dm') as never, {} as never, undefined, events as never)
  const clubs = new ClubsService(client('removal') as never, events as never)
  const assignmentTeams = new TeamsService(client('assignment') as never)

  const waitFor = async (promise: Promise<void>, description: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([promise, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 8_000)
      })])
    } finally { if (timer) clearTimeout(timer) }
  }
  const waitForBlocked = async (waiter: Hook, holder: Hook) => {
    assert.ok(waiter.pid && holder.pid, 'both transactions must have real PostgreSQL backend IDs')
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      const [row] = await db.$queryRaw<Array<{ blockers: number[] }>>`SELECT pg_blocking_pids(${waiter.pid}::integer) AS blockers`
      if (row.blockers.includes(holder.pid)) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.fail('Competing service did not actually wait behind the fixture lock')
  }
  const race = async (
    holder: Hook, first: () => Promise<unknown>, waiter: Hook, second: () => Promise<unknown>,
    expected: ['fulfilled' | 'rejected', 'fulfilled' | 'rejected'],
  ) => {
    hooks.push(holder, waiter)
    const firstJob = first()
    void firstJob.catch(() => undefined)
    let secondJob: Promise<unknown> | undefined
    try {
      await waitFor(holder.ready.promise, 'first service lock')
      secondJob = second()
      void secondJob.catch(() => undefined)
      await waitFor(waiter.ready.promise, 'second service lock attempt')
      await waitForBlocked(waiter, holder)
      holder.release.resolve()
      const outcomes = await Promise.allSettled([firstJob, secondJob])
      assert.deepEqual(outcomes.map((item) => item.status), expected)
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          assert.doesNotMatch(String(outcome.reason), /deadlock|transaction.*closed|timeout/i)
          assert.equal(outcome.reason?.getStatus?.(), 403, 'revocation must fail as authorization, not a DB error')
        }
      }
    } finally {
      holder.release.resolve()
      waiter.release.resolve()
      await Promise.allSettled([firstJob, ...(secondJob ? [secondJob] : [])])
      hooks.splice(0)
    }
  }

  try {
    await tenantContext.run({ clubId, userId: actorId }, async () => {
      await db.club.create({ data: { id: clubId, name: 'Synthetic chat-lock fixture', slug: clubId } })
      await db.user.createMany({ data: [adminId, actorId, peerId].map((id) => ({ id, name: 'Synthetic adult', dateOfBirth: new Date('1990-01-01') })) })
      await db.membership.createMany({ data: [
        { clubId, userId: adminId, role: 'OWNER' }, { clubId, userId: actorId, role: 'COACH' },
        { clubId, userId: peerId, role: 'PLAYER' },
      ] })
      const group = await db.teamGroup.create({ data: { clubId, type: 'CUSTOM', displayName: 'Fixture' } })
      const team = await db.team.create({ data: { clubId, groupId: group.id, name: 'Fixture', displayName: 'Fixture' } })
      const custom = await db.channel.create({ data: { clubId, teamId: team.id, slug: 'fixture-custom', kind: 'CUSTOM', name: 'Fixture', visibility: 'MEMBERS' } })
      const clubChannel = await db.channel.create({ data: { clubId, teamId: null, slug: 'fixture-club', kind: 'CLUB_NEWS', name: 'Club fixture', visibility: 'MEMBERS' } })
      const conversation = await db.conversation.create({ data: { clubId } })
      await db.conversationParticipant.createMany({ data: [actorId, peerId].map((userId) => ({ userId, conversationId: conversation.id })) })
      const event = await db.event.create({ data: {
        clubId, teamId: team.id, createdById: adminId, title: 'Synthetic saved lineup', date: new Date(),
        lineup: { formation: '4-3-3', starters: [{ name: 'Synthetic player', position: 'GK' }] },
      } })
      const reset = async () => {
        await db.membership.upsert({ where: { userId_clubId: { userId: actorId, clubId } },
          create: { clubId, userId: actorId, role: 'COACH' }, update: { role: 'COACH' } })
        await db.teamAccess.upsert({ where: { teamId_userId_role: { teamId: team.id, userId: actorId, role: 'HEAD_COACH' } },
          create: { clubId, teamId: team.id, userId: actorId, role: 'HEAD_COACH', phase: 'FULL', status: 'ACTIVE' },
          update: { phase: 'FULL', status: 'ACTIVE' } })
        await db.channelMember.createMany({ data: [adminId, actorId, peerId].map((userId) => ({ userId, channelId: custom.id })), skipDuplicates: true })
        await db.message.deleteMany({ where: { clubId } })
        await db.directMessage.deleteMany({ where: { conversationId: conversation.id } })
      }
      const share = () => chat.postLineup(actorId, { teamId: team.id, channelId: custom.id, formation: '4-3-3', xi: 'Synthetic XI' })
      const send = () => dm.sendMessage(actorId, clubId, conversation.id, { messageType: 'LINEUP', lineup: { source: 'EVENT', eventId: event.id } })
      const remove = () => clubs.removeMemberFromClub(adminId, clubId, actorId)
      const assign = () => assignmentTeams.updateTeamCoachAssignments(clubId, team.id, adminId, { headCoachUserId: null, assistantCoachUserIds: [] })
      const memberLock = () => hook('channel', '$queryRaw', (args) => sqlContains(args, 'FROM "ChannelMember"') && args.includes(actorId), 'after', true)
      const ownerLock = (label: string, stage: Hook['stage'], pause: boolean) => hook(label, '$executeRaw', (args) => args.includes(`owner:${clubId}`), stage, pause)
      const coachLock = (label: string, stage: Hook['stage'], pause: boolean) => hook(label, '$executeRaw', (args) => args.includes(`coach-assignments:${team.id}`), stage, pause)

      // Hold the production helper's actual FOR SHARE lock. Both explicit
      // group removal and the stale purge's DELETE must contend, not proceed.
      for (const mutation of ['share', 'delete'] as const) {
        await reset()
        const message = await db.message.create({ data: { clubId, teamId: team.id, channelId: custom.id, senderId: actorId, content: 'Synthetic own message' } })
        const held = memberLock()
        hooks.push(held)
        const operation = mutation === 'share' ? share() : chat.deleteMessage(actorId, message.id)
        void operation.catch(() => undefined)
        try {
          await waitFor(held.ready.promise, 'channel member row lock')
          await assert.rejects(db.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout = '150ms'`
            await new ChannelsService(tx as never, teams, events as never).removeChannelMember(adminId, clubId, custom.id, actorId)
          }), /lock timeout/)
          await assert.rejects(db.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout = '150ms'`
            await tx.channelMember.deleteMany({ where: { channelId: custom.id, userId: actorId } })
          }), /lock timeout/)
        } finally {
          held.release.resolve()
          await operation
          hooks.splice(0)
        }
      }

      // Removal first: the mutator blocks on the concrete membership row,
      // then observes the committed revocation and refuses to write.
      await reset()
      const own = await db.message.create({ data: { clubId, teamId: team.id, channelId: custom.id, senderId: actorId, content: 'Keep after removal' } })
      const memberDeleted = hook('member-removal', '$executeRaw', () => false, 'after', true)
      const memberAttempt = hook('channel', '$queryRaw', (args) => sqlContains(args, 'FROM "ChannelMember"'), 'before', false)
      await race(memberDeleted, () => db.$transaction(async (tx) => {
        await new ChannelsService(tx as never, teams, events as never).removeChannelMember(adminId, clubId, custom.id, actorId)
        const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
        memberDeleted.pid = backend.pid
        memberDeleted.ready.resolve()
        await memberDeleted.release.promise
      }, { timeout: 15_000 }), memberAttempt, () => chat.deleteMessage(actorId, own.id), ['fulfilled', 'rejected'])
      assert.equal((await db.message.findUniqueOrThrow({ where: { id: own.id } })).deletedAt, null)

      // Real assignment synchronization and actual sharing in both winner
      // orders. The losing share must recheck FULL authority after its wait.
      await reset()
      await race(coachLock('channel', 'after', true), share,
        coachLock('assignment', 'before', false), assign, ['fulfilled', 'fulfilled'])
      assert.equal(await db.message.count({ where: { clubId } }), 1)
      await reset()
      await race(coachLock('assignment', 'after', true), assign,
        coachLock('channel', 'before', false), share, ['fulfilled', 'rejected'])
      assert.equal(await db.message.count({ where: { clubId } }), 0)

      // Club messages use teamId solely as a storage anchor: coaching that
      // team must not authorize deletion of somebody else's club-wide post.
      await reset()
      const clubMessage = await db.message.create({ data: { clubId, teamId: team.id, channelId: clubChannel.id, senderId: adminId, content: 'Club announcement' } })
      await assert.rejects(chat.deleteMessage(actorId, clubMessage.id), /Only the sender or a coach/)
      assert.equal((await db.message.findUniqueOrThrow({ where: { id: clubMessage.id } })).deletedAt, null)

      // With the old dm-access -> owner order, removal-first deadlocked here:
      // each transaction held the lock the other needed. The corrected send
      // waits on owner BEFORE taking either participant-access lock.
      await reset()
      await race(ownerLock('removal', 'after', true), remove,
        ownerLock('dm', 'before', false), send, ['fulfilled', 'rejected'])
      assert.equal(await db.directMessage.count({ where: { conversationId: conversation.id } }), 0)
      await reset()
      await race(ownerLock('dm', 'after', true), send,
        ownerLock('removal', 'before', false), remove, ['fulfilled', 'fulfilled'])
      assert.equal(await db.directMessage.count({ where: { conversationId: conversation.id } }), 1)
    })
  } finally {
    for (const current of hooks) current.release.resolve()
    try {
      await tenantContext.run({ clubId, userId: actorId }, async () => {
        await db.club.deleteMany({ where: { id: clubId } })
        await db.user.deleteMany({ where: { id: { in: [adminId, actorId, peerId] } } })
      })
    } finally { await db.$disconnect() }
  }
  console.log('PASS: isolated PostgreSQL chat permission concurrency: actual member row contention, revoke-before-delete denial, coach share/revoke ordering, club-anchor isolation, and DM lineup/member-removal ordering in both directions; synthetic fixtures removed')
}

void main().catch((error: unknown) => {
  console.error('Chat permission concurrency verification failed:', error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
})
