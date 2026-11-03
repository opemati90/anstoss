import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrivateUploadLedger, PRIVATE_UPLOAD_PENDING_LIMIT } from '../src/assets/private-upload-ledger'
import { PrivateUploadPublisher } from '../src/assets/private-upload-publisher'
import { PrivateUploadCoordinator } from '../src/assets/private-upload-coordinator'
import { PrivateUploadCleanup } from '../src/assets/private-upload-cleanup'
import { PrivateUploadCleanupBatch } from '../src/assets/private-upload-cleanup-batch'
import { retireMessageUpload } from '../src/assets/private-upload-retirement'
import { cancelAccountPrivateUploads, findAccountPrivateUploads } from '../src/assets/private-upload-account-erasure'
import { DmService } from '../src/dm/dm.service'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId, tenantContext } from '../src/prisma/tenant.context'

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.match(
    url.searchParams.get('host') ?? '',
    /^\/private\/tmp\/anstoss-erasure-db\.[A-Za-z0-9]+$/,
  )
  const prisma = new PrismaClient()
  prisma.$use(createTenantMiddleware(getClubId) as never)
  const ledger = new PrivateUploadLedger()
  const clubId = `upload-test-${randomUUID()}`
  const ownerId = `upload-test-${randomUUID()}`
  const peerId = `upload-test-${randomUUID()}`
  const otherClubId = `upload-test-${randomUUID()}`
  try {
    await tenantContext.run({ clubId, userId: ownerId }, async () => {
      const intent = await prisma.$transaction((tx) =>
        ledger.reserve(tx, {
          clubId,
          ownerId,
          targetId: 'synthetic-channel',
          targetType: 'CHANNEL',
          contentType: 'image/png',
          expectedBytes: 42,
        }),
      )
      const scope = { id: intent.id, clubId, ownerId }
      const claims = await Promise.all(
        Array.from({ length: 8 }, () =>
          prisma.$transaction((tx) => ledger.begin(tx, scope, 'initiate'), { maxWait: 10_000 }),
        ),
      )
      const winners = claims.filter((claim) => claim !== null)
      assert.equal(winners.length, 1, 'Only one replica can initiate storage')
      await assert.rejects(
        prisma.$transaction((tx) => ledger.cancel(tx, { ...scope, clubId: 'other-club' })),
        /tenant mismatch/,
      )
      assert.equal(
        await prisma.$transaction((tx) => ledger.cancel(tx, { ...scope, ownerId: 'other-owner' })),
        false,
      )

      // Simulate process restart by using a new ledger after cancellation.
      await prisma.$transaction((tx) => ledger.cancel(tx, scope))
      const restarted = new PrivateUploadLedger()
      assert.equal(await prisma.$transaction((tx) => restarted.begin(tx, scope, 'initiate')), null)
      assert.equal(
        await prisma.$transaction((tx) =>
          restarted.settle(tx, scope, 'initiate', winners[0]!.operationId, 'provider-upload'),
        ),
        true,
      )
      assert.equal(await prisma.$transaction((tx) => restarted.begin(tx, scope, 'complete')), null)
      const abort = await prisma.$transaction((tx) => restarted.begin(tx, scope, 'abort'))
      assert.ok(abort)
      assert.equal(
        await prisma.$transaction((tx) => restarted.settle(tx, scope, 'abort', abort.operationId)),
        true,
      )
      assert.equal(
        (await prisma.privateMediaUpload.findFirstOrThrow({ where: scope })).state,
        'ABORTED',
      )

      const before = await prisma.privateMediaUpload.count({ where: { clubId, ownerId } })
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await ledger.reserve(tx, {
            clubId,
            ownerId,
            targetId: 'rollback',
            targetType: 'DM',
            contentType: 'image/png',
            expectedBytes: 42,
          })
          throw new Error('synthetic rollback')
        }),
        /synthetic rollback/,
      )
      assert.equal(await prisma.privateMediaUpload.count({ where: { clubId, ownerId } }), before)

      // Actual relational predicates, not mocked findFirst results. This is a
      // database fixture, not proof of HTTP authorization or live provider I/O.
      await prisma.club.create({ data: { id: clubId, name: 'Upload test', slug: clubId } })
      await prisma.club.create({ data: { id: otherClubId, name: 'Other upload test', slug: otherClubId } })
      await prisma.user.createMany({ data: [
        { id: ownerId, name: 'Synthetic uploader', dateOfBirth: new Date('1990-01-01') },
        { id: peerId, name: 'Synthetic reporter', dateOfBirth: new Date('1990-01-01') },
      ] })
      await prisma.membership.createMany({ data: [
        { clubId, userId: ownerId, role: 'PLAYER' }, { clubId, userId: peerId, role: 'PLAYER' },
      ] })
      const conversation = await prisma.conversation.create({ data: { clubId } })
      await prisma.conversationParticipant.createMany({ data: [
        { conversationId: conversation.id, userId: ownerId },
        { conversationId: conversation.id, userId: peerId },
      ] })
      const foreignConversation = await prisma.conversation.create({ data: { clubId: otherClubId } })
      const media = await prisma.$transaction((tx) => ledger.reserve(tx, {
        clubId, ownerId, targetId: conversation.id, targetType: 'DM', contentType: 'image/png', expectedBytes: 42,
      }))
      const mediaScope = { clubId, ownerId, id: media.id }
      const dm = new DmService(prisma as never, {} as never)
      const authorizeFixture = (tx: Parameters<DmService['authorizePrivateUpload']>[3]) =>
        dm.authorizePrivateUpload(ownerId, clubId, conversation.id, tx)
      let initiations = 0
      let completions = 0
      const coordinator = new PrivateUploadCoordinator(prisma, {
        signPart: async () => { throw new Error('Signing not used in this fixture') },
        initiate: async () => {
          initiations++
          assert.equal((await prisma.privateMediaUpload.findFirstOrThrow({ where: mediaScope })).state, 'INITIATING')
          return 'synthetic-provider'
        },
        complete: async () => {
          completions++
          assert.equal((await prisma.privateMediaUpload.findFirstOrThrow({ where: mediaScope })).state, 'FINALIZING')
        },
      })
      for (const operation of ['initiate', 'complete'] as const) {
        const outcomes = await Promise.all(Array.from({ length: 3 }, () => coordinator.advance(mediaScope, operation, authorizeFixture)))
        assert.equal(outcomes.filter((value) => value === 'settled').length, 1)
      }
      assert.equal(initiations, 1, 'only one storage initiation after committed claim')
      assert.equal(completions, 1, 'only one storage completion after committed claim')
      const attachmentUrl = `https://private-media.anstoss.invalid/${media.objectKey}`
      for (const overrides of [
        { senderId: peerId }, { conversationId: foreignConversation.id },
        { attachmentUrl: 'https://wrong.invalid/file' }, { deletedAt: new Date() },
        { messageType: 'TEXT' as const },
      ]) {
        const invalid = await prisma.directMessage.create({ data: {
          conversationId: conversation.id, senderId: ownerId, content: '',
          attachmentUrl, messageType: 'IMAGE', ...overrides,
        } })
        assert.equal(await prisma.$transaction((tx) => ledger.attach(tx, mediaScope, invalid.id)), false)
        await prisma.directMessage.delete({ where: { id: invalid.id } })
      }
      class RefusingLedger extends PrivateUploadLedger {
        async attach() { return false }
      }
      const refusingPublisher = new PrivateUploadPublisher(prisma, new RefusingLedger())
      await assert.rejects(refusingPublisher.publish(mediaScope, { messageType: 'IMAGE' }, authorizeFixture), /could not be attached/)
      assert.equal(await prisma.directMessage.count({ where: { conversationId: conversation.id } }), 0, 'failed binding rolls back message INSERT')
      assert.equal((await prisma.privateMediaUpload.findFirstOrThrow({ where: mediaScope })).state, 'READY')
      await prisma.membership.deleteMany({ where: { clubId, userId: peerId } })
      await assert.rejects(new PrivateUploadPublisher(prisma).publish(mediaScope, { messageType: 'IMAGE' }, authorizeFixture), /Not a member/)
      await prisma.membership.create({ data: { clubId, userId: peerId, role: 'PLAYER' } })
      const block = await prisma.userBlock.create({ data: { blockerUserId: peerId, blockedUserId: ownerId } })
      await assert.rejects(new PrivateUploadPublisher(prisma).publish(mediaScope, { messageType: 'IMAGE' }, authorizeFixture), /Cannot send messages/)
      await prisma.userBlock.delete({ where: { id: block.id } })
      await prisma.user.update({ where: { id: peerId }, data: { dateOfBirth: new Date() } })
      await assert.rejects(new PrivateUploadPublisher(prisma).publish(mediaScope, { messageType: 'IMAGE' }, authorizeFixture), /minors|guardian|consent|Not a member/i)
      await prisma.user.update({ where: { id: peerId }, data: { dateOfBirth: new Date('1990-01-01') } })
      assert.equal(await prisma.directMessage.count({ where: { conversationId: conversation.id } }), 0)
      const publisher = new PrivateUploadPublisher(prisma)
      const publications = await Promise.all(Array.from({ length: 3 }, () =>
        publisher.publish(mediaScope, { messageType: 'IMAGE' }, authorizeFixture)))
      const message = publications[0]
      assert.equal(new Set(publications.map((item) => item.id)).size, 1, 'concurrent retries return the same message')
      assert.equal(publications.filter((item) => !item.replayed).length, 1, 'only one publication requests delivery')
      assert.equal(await prisma.directMessage.count({ where: { conversationId: conversation.id } }), 1)
      await assert.rejects(publisher.publish(mediaScope, { messageType: 'IMAGE', content: 'changed' }, authorizeFixture), /already published/)
      const replayBlock = await prisma.userBlock.create({ data: { blockerUserId: peerId, blockedUserId: ownerId } })
      await assert.rejects(publisher.publish(mediaScope, { messageType: 'IMAGE' }, authorizeFixture), /Cannot send messages/)
      await prisma.userBlock.delete({ where: { id: replayBlock.id } })
      const binding = { clubId, messageId: message.id, targetType: 'DM' as const, targetId: conversation.id }
      await assert.rejects(prisma.$transaction(async (tx) => {
        await retireMessageUpload(tx, binding)
        throw new Error('synthetic rollback')
      }), /synthetic rollback/)
      assert.equal((await prisma.privateMediaUpload.findFirstOrThrow({ where: mediaScope })).cancelRequestedAt, null)
      await prisma.$transaction((tx) => retireMessageUpload(tx, binding))
      let removals = 0
      const cleanup = new PrivateUploadCleanup(prisma, {
        remove: async () => {
          removals++
          assert.equal((await prisma.privateMediaUpload.findFirstOrThrow({ where: mediaScope })).state, 'REMOVING')
        },
        abort: async () => { throw new Error('Unexpected abort') },
        discover: async () => { throw new Error('Unexpected discovery') },
        observeObject: async () => ({ kind: 'not_observed' as const }),
        observeMultipart: async () => ({ kind: 'not_observed' as const }),
      })
      assert.equal(await cleanup.run(mediaScope), 'held', 'live message holds media')
      assert.equal(removals, 0)
      const report = await prisma.directMessageReport.create({ data: {
        directMessageId: message.id, reporterUserId: peerId, reason: 'synthetic test', evidenceAttachmentUrl: attachmentUrl,
      } })
      await prisma.directMessage.update({ where: { id: message.id }, data: { attachmentUrl: null } })
      assert.equal(await cleanup.run(mediaScope), 'held', 'report holds media after attachment retention clears the reference')
      assert.equal(removals, 0)
      await prisma.directMessageReport.update({ where: { id: report.id }, data: { evidencePurgedAt: new Date(), evidenceAttachmentUrl: null } })
      assert.equal(await cleanup.run(mediaScope), 'removed', 'cleared holds permit removal')
      assert.equal(removals, 1)
      assert.equal(await cleanup.run(mediaScope), 'removed')
      assert.equal(removals, 1, 'terminal cleanup does not repeat provider write')
      assert.equal(await prisma.$transaction((tx) => retireMessageUpload(tx, binding)), true, 'retirement retries remain idempotent')
      const pendingBefore = await prisma.privateMediaUpload.count({
        where: { clubId, ownerId, state: { notIn: ['ATTACHED', 'REMOVED'] } },
      })
      const reservations = await Promise.allSettled(Array.from({ length: 12 }, () =>
        prisma.$transaction((tx) => ledger.reserve(tx, {
          clubId, ownerId, targetId: conversation.id, targetType: 'DM', contentType: 'image/png', expectedBytes: 42,
        }), { maxWait: 10_000 })))
      assert.equal(reservations.filter((result) => result.status === 'fulfilled').length,
        PRIVATE_UPLOAD_PENDING_LIMIT - pendingBefore, 'concurrent reservation cap cannot overrun')
      for (const result of reservations) {
        if (result.status === 'rejected') assert.equal(result.reason?.getStatus?.(), 429)
      }
      assert.equal(await prisma.privateMediaUpload.count({
        where: { clubId, ownerId, state: { notIn: ['ATTACHED', 'REMOVED'] } },
      }), PRIVATE_UPLOAD_PENDING_LIMIT)
      await prisma.privateMediaUpload.updateMany({
        where: { clubId, ownerId, state: 'RESERVED' }, data: { expiresAt: new Date(0) },
      })
      const batch = new PrivateUploadCleanupBatch(prisma, cleanup)
      const firstBatch = await batch.run(clubId)
      assert.equal(firstBatch.outcomes.removed, PRIVATE_UPLOAD_PENDING_LIMIT - pendingBefore)
      assert.equal(firstBatch.outcomes['awaiting-part-cleanup'], 1,
        'ambiguous aborted session remains charged pending definitive cleanup')
      assert.equal((await batch.run(clubId)).selected, 0, 'persisted schedule prevents immediate reselection')

      const foreign = await tenantContext.run({ clubId: otherClubId, userId: ownerId }, () =>
        prisma.$transaction((tx) => ledger.reserve(tx, {
          clubId: otherClubId, ownerId, targetId: foreignConversation.id,
          targetType: 'DM', contentType: 'image/png', expectedBytes: 42,
        })))
      const unrelated = await tenantContext.run({ clubId: otherClubId, userId: peerId }, () =>
        prisma.$transaction((tx) => ledger.reserve(tx, {
          clubId: otherClubId, ownerId: peerId, targetId: foreignConversation.id,
          targetType: 'DM', contentType: 'image/png', expectedBytes: 42,
        })))
      await assert.rejects(prisma.$transaction(async (tx) => {
        const inventory = await findAccountPrivateUploads(tx, ownerId)
        assert.ok(inventory.some((item) => item.id === foreign.id), 'inventory includes another club despite ambient tenant')
        assert.ok(inventory.every((item) => item.ownerId === ownerId), 'inventory excludes other owners')
        await cancelAccountPrivateUploads(tx, ownerId, inventory, [])
        throw new Error('synthetic erasure rollback')
      }), /synthetic erasure rollback/)
      await tenantContext.run({ clubId: otherClubId, userId: ownerId }, async () => {
        const afterRollback = await prisma.privateMediaUpload.findFirstOrThrow({ where: { id: foreign.id } })
        assert.equal(afterRollback.cancelRequestedAt, null, 'erasure rollback preserves upload')
      })
      await prisma.$transaction(async (tx) => {
        const inventory = await findAccountPrivateUploads(tx, ownerId)
        await cancelAccountPrivateUploads(tx, ownerId, inventory, [])
      })
      await tenantContext.run({ clubId: otherClubId, userId: ownerId }, async () => {
        const after = await prisma.privateMediaUpload.findFirstOrThrow({ where: { id: foreign.id } })
        const untouched = await prisma.privateMediaUpload.findFirstOrThrow({ where: { id: unrelated.id } })
        assert.equal(after.state, 'REMOVED')
        assert.equal(untouched.cancelRequestedAt, null, 'other owner is untouched')
      })
    })
  } finally {
    try {
      await tenantContext.run({ clubId, userId: ownerId }, async () => {
        await prisma.privateMediaUpload.deleteMany({ where: { clubId, ownerId } })
        await tenantContext.run({ clubId: otherClubId, userId: ownerId }, () =>
          prisma.privateMediaUpload.deleteMany({ where: { clubId: otherClubId, ownerId: { in: [ownerId, peerId] } } }))
        await prisma.club.deleteMany({ where: { id: { in: [clubId, otherClubId] } } })
        await prisma.user.deleteMany({ where: { id: { in: [ownerId, peerId] } } })
      })
    } finally {
      await prisma.$disconnect()
    }
  }
  console.log(
    'PASS: local PostgreSQL upload ledger: concurrent claims/publication retries, cross-club erasure isolation, cancellation, rollback, real message binding, live/evidence holds, fixture cleanup',
  )
}

void main().catch((error: unknown) => {
  console.error('Private upload ledger verification failed:', error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
})
