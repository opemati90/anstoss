import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { ChatRetentionWorker, RetentionSweepError } from '../src/chat/chat-retention.worker'
import { newOwnedPrivateV1Key } from '../src/media/private-v1-owner'
import { R2Provider } from '../src/assets/r2.provider'

async function main() {
  // Synthetic fixtures only: never run this verifier against a real database.
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.equal(url.port, '55443')
  assert.equal(url.pathname, '/anstoss_retention_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  const prefix = `retention-${randomUUID()}`
  const clubId = `${prefix}-club`, userId = `${prefix}-user`, groupId = `${prefix}-group`
  const teamId = `${prefix}-team`, channelId = `${prefix}-channel`, messageId = `${prefix}-message`
  const conversationId = `${prefix}-conversation`, dmId = `${prefix}-dm`, uploadId = randomUUID()
  const old = new Date('2020-01-01T00:00:00Z')
  const marker = `https://private-media.anstoss.invalid/private-chat/v2/${uploadId}`
  try {
    const [identity] = await db.$queryRaw<Array<{ database: string; data_dir: string }>>`
      SELECT current_database() AS database, current_setting('data_directory') AS data_dir
    `
    assert.equal(identity.database, 'anstoss_retention_test')
    assert.equal(identity.data_dir, `${url.searchParams.get('host')}/data`)
    await db.user.create({ data: { id: userId, name: 'Synthetic person' } })
    await db.club.create({ data: { id: clubId, name: 'Synthetic club', slug: clubId,
      chatRetentionSettings: { create: { enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 } } } })
    await db.teamGroup.create({ data: { id: groupId, clubId, type: 'CUSTOM', displayName: 'Synthetic group' } })
    await db.team.create({ data: { id: teamId, clubId, groupId, name: 'Synthetic team', displayName: 'Synthetic team' } })
    await db.channel.create({ data: { id: channelId, clubId, teamId, kind: 'TEAM', slug: prefix, name: 'Synthetic channel' } })
    await db.message.create({ data: { id: messageId, clubId, teamId, channelId, senderId: userId,
      content: 'synthetic', messageType: 'IMAGE', attachmentUrl: marker, createdAt: old } })
    await db.privateMediaUpload.create({ data: { id: uploadId, clubId, ownerId: userId, targetId: channelId,
      targetType: 'CHANNEL', objectKey: `private-chat/v2/${uploadId}`, contentType: 'image/png', expectedBytes: 42,
      state: 'ATTACHED', uploadId: 'synthetic-provider-id', messageId, expiresAt: old } })
    await db.conversation.create({ data: { id: conversationId, clubId } })
    await db.directMessage.create({ data: { id: dmId, conversationId, senderId: userId, content: 'synthetic',
      messageType: 'IMAGE', attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/missing', createdAt: old } })

    const worker = new ChatRetentionWorker(db as never, {} as never)
    await assert.rejects(worker.purgeExpired(new Date('2026-01-01T00:00:00Z')), RetentionSweepError)
    const [message, upload, dm] = await Promise.all([
      db.message.findUniqueOrThrow({ where: { id: messageId } }),
      db.privateMediaUpload.findUniqueOrThrow({ where: { id: uploadId } }),
      db.directMessage.findUniqueOrThrow({ where: { id: dmId } }),
    ])
    assert.equal(message.attachmentUrl, marker, 'earlier channel reference must roll back')
    assert.equal(message.deletedAt, null, 'earlier channel deletion must roll back')
    assert.equal(upload.cancelRequestedAt, null, 'earlier upload retirement must roll back')
    assert.ok(dm.attachmentUrl, 'unbound DM reference must remain')
    process.stdout.write('PASS: PostgreSQL rolled back channel mutations when the later DM binding failed.\n')

    const ownedKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId, targetId: teamId,
      ownerId: userId, kind: 'image' }, 'synthetic.png')
    const forgedKey = newOwnedPrivateV1Key({ targetType: 'dm', clubId, targetId: conversationId,
      ownerId: `${prefix}-other`, kind: 'image' }, 'synthetic.png')
    const ownedUrl = `https://private-media.anstoss.invalid/${ownedKey}`
    const forgedUrl = `https://private-media.anstoss.invalid/${forgedKey}`
    await db.message.update({ where: { id: messageId }, data: { attachmentUrl: ownedUrl } })
    await db.directMessage.update({ where: { id: dmId }, data: { attachmentUrl: forgedUrl } })
    const ownedWorker = new ChatRetentionWorker(db as never, new R2Provider())
    await assert.rejects((ownedWorker as any).purgeClubWithRetry(
      { clubId, enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 },
      new Date('2026-01-01T00:00:00Z')))
    assert.equal((await db.message.findUniqueOrThrow({ where: { id: messageId } })).attachmentUrl, ownedUrl)
    assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey: ownedKey } }), null,
      'outbox entry from the earlier valid attachment must roll back')
    assert.equal((await db.directMessage.findUniqueOrThrow({ where: { id: dmId } })).attachmentUrl, forgedUrl)
    process.stdout.write('PASS: forged later attachment rolls back the earlier valid v1 retirement.\n')
    await db.message.update({ where: { id: messageId }, data: { attachmentUrl: marker } })

    let release!: () => void
    let ready!: (pid: number) => void
    const hold = new Promise<void>((resolve) => { release = resolve })
    const locked = new Promise<number>((resolve) => { ready = resolve })
    const writer = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-retention-settings:${clubId}`}))`
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.clubChatRetentionSettings.update({ where: { clubId }, data: { enabled: false } })
      ready(row.pid)
      await hold
    }, { timeout: 20_000 })
    const writerPid = await locked
    const sweep = (worker as any).purgeClubWithRetry({ clubId, enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 },
      new Date('2026-01-01T00:00:00Z')) as Promise<unknown>
    void sweep.catch(() => undefined)
    try {
      let blocked = false
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await db.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${writerPid}::integer = ANY(pg_blocking_pids(pid))) AS blocked
        `
        if (row.blocked) { blocked = true; break }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      assert.ok(blocked, 'the sweep must actually wait on the settings writer')
    } finally { release() }
    await writer
    assert.deepEqual(await sweep, { messagesDeleted: 0, attachmentsPurged: 0 })
    assert.equal((await db.message.findUniqueOrThrow({ where: { id: messageId } })).attachmentUrl, marker)
    process.stdout.write('PASS: a concurrent settings disable blocks the sweep and is respected after retry.\n')
  } finally { await db.$disconnect() }
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
