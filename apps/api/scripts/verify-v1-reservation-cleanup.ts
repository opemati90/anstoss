import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { AccountMediaDeletionWorker } from '../src/assets/account-media-deletion.worker'
import { reservePrivateV1Upload } from '../src/media/private-v1-reservations'
import { newOwnedPrivateV1Key } from '../src/media/private-v1-owner'
import { lockMediaObject } from '../src/assets/media-object-lock'

async function main() {
  process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'true'
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost'); assert.equal(url.port, '55443')
  assert.equal(url.pathname, '/anstoss_retention_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  try {
    const [identity] = await db.$queryRaw<Array<{ database: string; data_dir: string }>>`
      SELECT current_database() AS database, current_setting('data_directory') AS data_dir
    `
    assert.equal(identity.database, 'anstoss_retention_test')
    assert.equal(identity.data_dir, `${url.searchParams.get('host')}/data`)
    const id = `synthetic-${randomUUID()}`
    await db.user.create({ data: { id, name: 'Synthetic reservation owner' } })
    let objectKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId: id, targetId: id,
      ownerId: id, kind: 'image' }, 'test.png')
    await reservePrivateV1Upload(db as never, id, objectKey, { kind: 'image' })
    let onClaim: (() => void) | undefined
    const queue = {
      findMany: (args: any) => db.accountMediaDeletion.findMany({ ...args,
        where: { AND: [args.where, { objectKey }] } }),
      updateMany: async (args: any) => {
        const result = await db.accountMediaDeletion.updateMany(args)
        if (args.data.attempts && result.count === 1) onClaim?.()
        return result
      },
    }
    const prisma = { accountMediaDeletion: queue,
      $transaction: (fn: any, opts: any) => db.$transaction(fn, opts) }
    const retired: string[] = []
    const worker = new AccountMediaDeletionWorker(prisma as never,
      { deleteObjects: async (keys: string[]) => { retired.push(...keys) } } as never)
    await worker.runCycle()
    assert.equal(retired.length, 0, 'unexpired upload must not be retired')
    assert.ok(await db.accountMediaDeletion.findUnique({ where: { objectKey } }))
    await db.accountMediaDeletion.update({ where: { objectKey }, data: {
      availableAt: new Date(0), uploadExpiresAt: new Date(0),
    } })
    await worker.runCycle()
    assert.deepEqual(retired, [objectKey])
    assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey } }), null)
    await db.club.create({ data: { id, name: 'Synthetic club', slug: id } })
    const groupId = `${id}-group`, teamId = `${id}-team`, channelId = `${id}-channel`, conversationId = `${id}-conversation`
    await db.teamGroup.create({ data: { id: groupId, clubId: id, type: 'CUSTOM', displayName: 'Synthetic group' } })
    await db.team.create({ data: { id: teamId, clubId: id, groupId, name: 'Synthetic team', displayName: 'Synthetic team' } })
    await db.channel.create({ data: { id: channelId, clubId: id, teamId, kind: 'TEAM', slug: id, name: 'Synthetic channel' } })
    await db.conversation.create({ data: { id: conversationId, clubId: id } })
    for (const type of ['chat', 'dm'] as const) {
      objectKey = newOwnedPrivateV1Key({ targetType: type, clubId: id,
        targetId: type === 'chat' ? teamId : conversationId, ownerId: id, kind: 'image' }, 'live.png')
      await reservePrivateV1Upload(db as never, id, objectKey, { kind: 'image' })
      const attachmentUrl = `https://private-media.anstoss.invalid/${objectKey}`
      if (type === 'chat') await db.message.create({ data: { clubId: id, teamId, channelId, senderId: id,
        content: '', messageType: 'IMAGE', attachmentUrl } })
      else await db.directMessage.create({ data: { conversationId, senderId: id, content: '', messageType: 'IMAGE', attachmentUrl } })
      await db.accountMediaDeletion.update({ where: { objectKey }, data: { availableAt: new Date(0), uploadExpiresAt: new Date(0) } })
      await worker.runCycle()
      assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey } }), null, `${type} reservation adopted`)
      assert.ok(!retired.includes(objectKey), `${type} live attachment must remain`)
    }
    // An old writer holds the object lock, then commits its live message
    // after cleanup has claimed the reservation but before cleanup gets the
    // same lock. The worker must see and adopt that committed message.
    objectKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId: id, targetId: teamId,
      ownerId: id, kind: 'image' }, 'race.png')
    await reservePrivateV1Upload(db as never, id, objectKey, { kind: 'image' })
    await db.accountMediaDeletion.update({ where: { objectKey }, data: { availableAt: new Date(0), uploadExpiresAt: new Date(0) } })
    let unlock!: () => void, locked!: () => void, claimed!: () => void
    const waitUnlock = new Promise<void>((resolve) => { unlock = resolve })
    const waitLocked = new Promise<void>((resolve) => { locked = resolve })
    const waitClaimed = new Promise<void>((resolve) => { claimed = resolve })
    onClaim = claimed
    const writer = db.$transaction(async (tx) => {
      await lockMediaObject(tx, objectKey)
      locked()
      await waitUnlock
      await tx.message.create({ data: { clubId: id, teamId, channelId, senderId: id, content: '',
        messageType: 'IMAGE', attachmentUrl: `https://private-media.anstoss.invalid/${objectKey}` } })
    }, { timeout: 20_000 })
    await waitLocked
    const cleanup = worker.runCycle()
    await waitClaimed
    unlock()
    await writer
    await cleanup
    assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey } }), null)
    assert.ok(!retired.includes(objectKey), 'a message committed while cleanup waits must survive')
    onClaim = undefined
    const otherId = `${id}-other`
    await db.user.create({ data: { id: otherId, name: 'Synthetic other sender' } })
    for (const mismatch of ['sender', 'scope', 'kind', 'url'] as const) {
      objectKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId: id,
        targetId: mismatch === 'scope' ? `${id}-different-team` : teamId, ownerId: id, kind: 'image' }, `${mismatch}.png`)
      await reservePrivateV1Upload(db as never, id, objectKey, { kind: 'image' })
      const attachmentUrl = `${mismatch === 'url' ? 'https://wrong.invalid' : 'https://private-media.anstoss.invalid'}/${objectKey}`
      await db.message.create({ data: { clubId: id, teamId, channelId, senderId: mismatch === 'sender' ? otherId : id,
        content: '', messageType: mismatch === 'kind' ? 'VIDEO' : 'IMAGE', attachmentUrl } })
      await db.accountMediaDeletion.update({ where: { objectKey }, data: { availableAt: new Date(0), uploadExpiresAt: new Date(0) } })
      await worker.runCycle()
      assert.ok(await db.accountMediaDeletion.findUnique({ where: { objectKey } }), `${mismatch} reservation held`)
      assert.ok(!retired.includes(objectKey), `${mismatch} ambiguous reference must remain untouched`)
    }
    objectKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId: id, targetId: teamId,
      ownerId: id, kind: 'image' }, 'bridge.png')
    process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'false'
    await reservePrivateV1Upload(db as never, id, objectKey, { kind: 'image' })
    await db.accountMediaDeletion.update({ where: { objectKey }, data: { uploadExpiresAt: new Date(0) } })
    await worker.runCycle()
    assert.ok(await db.accountMediaDeletion.findUnique({ where: { objectKey } }), 'bridge phase retains pending intent')
    process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'true'
    await worker.runCycle()
    assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey } }), null, 'enabled worker picks up paused intent')
    assert.ok(retired.includes(objectKey))
    process.stdout.write('PASS: orphan expiry and mixed-version channel/DM adoption via real PostgreSQL (storage mocked).\n')
  } finally { await db.$disconnect() }
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
