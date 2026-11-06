import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { ChannelsService } from '../src/channels/channels.service'
import { ClubsService } from '../src/clubs/clubs.service'
import { PrivateUploadCoordinator } from '../src/assets/private-upload-coordinator'
import { PrivateUploadLedger, type PrivateUploadScope } from '../src/assets/private-upload-ledger'
import { PrivateUploadPublisher } from '../src/assets/private-upload-publisher'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId, tenantContext } from '../src/prisma/tenant.context'

function latch() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => { release = resolve })
  return { wait, release }
}

async function reached(signal: Promise<void>, operation: Promise<unknown>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      signal,
      operation.then(() => { throw new Error(`${label} was not reached`) }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000) }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.equal(url.port, '55443')
  assert.equal(url.pathname, '/anstoss_retention_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  db.$use(createTenantMiddleware(getClubId) as never)
  const prefix = `synthetic-${randomUUID()}`
  const clubId = `${prefix}-club`, userId = `${prefix}-user`, ownerId = `${prefix}-owner`, teamId = `${prefix}-team`
  const channelId = `${prefix}-channel`, groupId = `${prefix}-group`
  try {
    const [identity] = await db.$queryRaw<Array<{ database: string; data_dir: string }>>`
      SELECT current_database() AS database, current_setting('data_directory') AS data_dir
    `
    assert.equal(identity.database, 'anstoss_retention_test')
    assert.match(identity.data_dir, /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+\/data$/)
    assert.equal(identity.data_dir, `${url.searchParams.get('host')}/data`)
    await tenantContext.run({ clubId, userId }, async () => {
      await db.user.create({ data: { id: userId, name: 'Synthetic user', dateOfBirth: new Date('1990-01-01') } })
      await db.user.create({ data: { id: ownerId, name: 'Synthetic owner', dateOfBirth: new Date('1990-01-01') } })
      await db.club.create({ data: { id: clubId, name: 'Synthetic club', slug: clubId } })
      await db.teamGroup.create({ data: { id: groupId, clubId, type: 'CUSTOM', displayName: 'Synthetic group' } })
      await db.team.create({ data: { id: teamId, clubId, groupId, name: 'Synthetic team', displayName: 'Synthetic team' } })
      await db.membership.create({ data: { clubId, userId, role: 'PLAYER' } })
      await db.membership.create({ data: { clubId, userId: ownerId, role: 'OWNER' } })
      await db.teamAccess.create({ data: { clubId, teamId, userId, role: 'PLAYER', phase: 'FULL', status: 'ACTIVE' } })
      await db.channel.create({ data: { id: channelId, clubId, teamId, kind: 'TEAM', slug: prefix, name: 'Synthetic channel' } })
      const channels = new ChannelsService(db as never, {} as never, { emit: () => undefined } as never)
      const authorize = (tx: any) => channels.authorizePrivateUpload(userId, clubId, teamId, channelId, 'write', tx)
      async function reservation() {
        const id = randomUUID()
        await db.privateMediaUpload.create({ data: { id, clubId, ownerId: userId, targetId: channelId,
          targetType: 'CHANNEL', objectKey: `private-chat/v2/${id}`, contentType: 'image/png', expectedBytes: 10,
          state: 'UPLOADING', uploadId: 'synthetic-session', expiresAt: new Date(Date.now() + 600_000) } })
        return { id, clubId, ownerId: userId }
      }

      const beforeClaim = await reservation()
      const preparationEntered = latch(), releasePreparation = latch()
      let completions = 0
      const storage = {
        initiate: async () => 'synthetic-session', signPart: async () => 'https://synthetic.invalid',
        prepareComplete: async () => { preparationEntered.release(); await releasePreparation.wait; return 'synthetic-etag' },
        completePrepared: async () => { completions++ },
      }
      const coordinator = new PrivateUploadCoordinator(db, storage)
      const pending = coordinator.advance(beforeClaim, 'complete', authorize)
      try {
        await reached(preparationEntered.wait, pending, 'Preparation')
        await coordinator.cancel(beforeClaim, authorize)
      } finally { releasePreparation.release() }
      assert.equal(await pending, 'unchanged')
      assert.equal(completions, 0, 'cancelled preparation must never dispatch completion')

      const duringCompletion = await reservation()
      const completionEntered = latch(), releaseCompletion = latch()
      const coordinator2 = new PrivateUploadCoordinator(db, { ...storage,
        prepareComplete: async () => 'synthetic-etag',
        completePrepared: async () => { completions++; completionEntered.release(); await releaseCompletion.wait },
      })
      const inflight = coordinator2.advance(duringCompletion, 'complete', authorize)
      try {
        await reached(completionEntered.wait, inflight, 'Completion')
        await coordinator2.cancel(duringCompletion, authorize)
      } finally { releaseCompletion.release() }
      assert.equal(await inflight, 'settled')
      const settled = await db.privateMediaUpload.findUniqueOrThrow({ where: { id: duringCompletion.id } })
      assert.equal(settled.state, 'READY')
      assert.ok(settled.cancelRequestedAt, 'provider receipt must not clear concurrent cancellation')
      await assert.rejects(new PrivateUploadPublisher(db).publish(duringCompletion,
        { messageType: 'IMAGE' }, authorize), /not ready/)

      // Isolate the upload lock itself from the channel membership locks, so
      // PostgreSQL must show cancellation blocked by the completion claim.
      const contested = await reservation()
      const claimLocked = latch(), releaseClaim = latch(), sent = latch(), finishProvider = latch()
      let completionPid = 0
      let cancelPid = 0
      const cancelStarted = latch()
      const transactionDb = (kind: 'completion' | 'cancel') => ({
        $transaction: (fn: (tx: any) => Promise<unknown>, options?: object) => db.$transaction(async (tx) => {
          const [entry] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
          if (kind === 'completion') completionPid = entry.pid
          else { cancelPid = entry.pid; cancelStarted.release() }
          return fn(tx)
        }, { timeout: 20_000, ...options }),
      })
      class HeldLedger extends PrivateUploadLedger {
        async begin(tx: Parameters<PrivateUploadLedger['begin']>[0], scope: PrivateUploadScope,
          operation: Parameters<PrivateUploadLedger['begin']>[2]) {
          await this.snapshot(tx, scope)
          claimLocked.release()
          await releaseClaim.wait
          return super.begin(tx, scope, operation)
        }
      }
      const simpleAuthorization = async () => ({ userId, clubId, targetId: channelId, targetType: 'CHANNEL' as const, teamId })
      const heldCoordinator = new PrivateUploadCoordinator(transactionDb('completion') as never, { ...storage,
        prepareComplete: async () => 'synthetic-etag',
        completePrepared: async () => { sent.release(); await finishProvider.wait },
      }, new HeldLedger())
      const canceller = new PrivateUploadCoordinator(transactionDb('cancel') as never, storage)
      const completing = heldCoordinator.advance(contested, 'complete', simpleAuthorization)
      let cancelling: Promise<unknown> | undefined
      try {
        await reached(claimLocked.wait, completing, 'Claim lock')
        cancelling = canceller.cancel(contested, simpleAuthorization)
        await reached(cancelStarted.wait, cancelling, 'Cancellation transaction')
        let blocked = false
        for (let attempt = 0; attempt < 100; attempt++) {
          const [entry] = await db.$queryRaw<Array<{ blocked: boolean }>>`
            SELECT ${completionPid}::integer = ANY(pg_blocking_pids(${cancelPid}::integer)) AS blocked
          `
          if (entry.blocked) { blocked = true; break }
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        assert.ok(blocked, 'cancellation must wait on the completion claim transaction')
      } finally { releaseClaim.release() }
      try {
        await reached(sent.wait, completing, 'Provider completion')
        await cancelling
      } finally { finishProvider.release() }
      assert.equal(await completing, 'settled')
      assert.ok((await db.privateMediaUpload.findUniqueOrThrow({ where: { id: contested.id } })).cancelRequestedAt)

      const lostReceipt = await reservation()
      let dispatched = 0
      const coordinator3 = new PrivateUploadCoordinator(db, { ...storage,
        prepareComplete: async () => 'synthetic-etag',
        completePrepared: async () => { dispatched++; throw new Error('synthetic timeout') },
      })
      assert.equal(await coordinator3.advance(lostReceipt, 'complete', authorize), 'unknown')
      assert.equal(await coordinator3.advance(lostReceipt, 'complete', authorize), 'unchanged')
      assert.equal(dispatched, 1, 'unknown completion must not be dispatched twice')
      const uncertain = await db.privateMediaUpload.findUniqueOrThrow({ where: { id: lostReceipt.id } })
      assert.equal(uncertain.state, 'FINALIZING')
      assert.ok(uncertain.operationId)

      // Account erasure owns the raw user lock before it takes destination
      // locks. Publishing must wait on that lock before invoking authorization.
      const publication = await reservation()
      await db.privateMediaUpload.update({ where: { id: publication.id }, data: { state: 'READY' } })
      const lifecycleLocked = latch(), releaseLifecycle = latch()
      const erasureLock = db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
        lifecycleLocked.release()
        await releaseLifecycle.wait
      }, { timeout: 15_000 })
      let authorized = false
      try {
        await reached(lifecycleLocked.wait, erasureLock, 'Account lifecycle lock')
        const boundedDb = { $transaction: (fn: (tx: any) => Promise<unknown>) => db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '100ms'`
          return fn(tx)
        }) }
        await assert.rejects(new PrivateUploadPublisher(boundedDb as never).publish(publication,
          { messageType: 'IMAGE' }, async (tx) => { authorized = true; return authorize(tx) }), /lock timeout/i)
        assert.equal(authorized, false, 'destination authorization must wait behind account lifecycle')
      } finally { releaseLifecycle.release() }
      await erasureLock
      assert.equal((await db.privateMediaUpload.findUniqueOrThrow({ where: { id: publication.id } })).state, 'READY')

      const revoked = await reservation()
      const revokePreparation = latch(), finishRevokePreparation = latch()
      let revokeCompletions = 0
      const revokeCoordinator = new PrivateUploadCoordinator(db, { ...storage,
        prepareComplete: async () => { revokePreparation.release(); await finishRevokePreparation.wait; return 'synthetic-etag' },
        completePrepared: async () => { revokeCompletions++ },
      })
      const revokePending = revokeCoordinator.advance(revoked, 'complete', authorize)
      try {
        await reached(revokePreparation.wait, revokePending, 'Revocation preparation')
        const clubs = new ClubsService(db as never, { emit: () => undefined } as never)
        await clubs.removeMemberFromClub(ownerId, clubId, userId)
      } finally { finishRevokePreparation.release() }
      await assert.rejects(revokePending)
      assert.equal(revokeCompletions, 0, 'revoked membership must not dispatch completion')
      process.stdout.write('PASS: PostgreSQL serializes account lifecycle locking and publication, upload claims and cancellation; revoked access cannot finish; uncertain completions are not retried.\n')
    })
  } finally { await db.$disconnect() }
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
