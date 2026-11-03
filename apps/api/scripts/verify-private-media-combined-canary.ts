import assert from 'node:assert/strict'
import { HttpException } from '@nestjs/common'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { R2Provider } from '../src/assets/r2.provider'
import { MediaController } from '../src/media/media.controller'
import { ChatService } from '../src/chat/chat.service'
import { DmService } from '../src/dm/dm.service'
import { retireLegacyChatMedia } from '../src/assets/legacy-chat-media-retirement'
import { AccountMediaDeletionWorker } from '../src/assets/account-media-deletion.worker'
import { isOwnedPrivateV1Key } from '../src/media/private-v1-owner'
import { TeamsService } from '../src/teams/teams.service'
import { ChannelsService } from '../src/channels/channels.service'

/** Synthetic private objects + disposable local DB only; on uncertainty retain everything. */
async function main() {
  assert.equal(process.argv[2], '--synthetic-private-media')
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost'); assert.equal(url.port, '55443')
  assert.equal(url.pathname, '/anstoss_retention_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+$/)
  const env = { ...process.env, RAILWAY_CALLER: 'skill:use-railway@1.3.7', RAILWAY_AGENT_SESSION: 'anstoss-media-20261103' }
  const railway = (...args: string[]) => JSON.parse(execFileSync('/opt/homebrew/bin/railway', args,
    { encoding: 'utf8', env, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }))
  assert.equal(railway('status', '--json').id, 'fc1f6c05-d556-48ad-bc8c-a59b4e7a99b4')
  const config = railway('variable', 'list', '--service', '373adb45-3ab1-4076-b2b9-72f1590ba1b3', '--environment', 'production', '--json')
  const names = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
    'R2_QUARANTINE_BUCKET', 'R2_QUARANTINE_ACCESS_KEY_ID', 'R2_QUARANTINE_SECRET_ACCESS_KEY', 'R2_QUARANTINE_JURISDICTION']
  for (const name of names) { assert.ok(config[name], `Required storage setting missing: ${name}`); process.env[name] = config[name] }
  assert.equal(config.R2_QUARANTINE_JURISDICTION, 'eu')
  assert.notEqual(config.R2_BUCKET_NAME, config.R2_QUARANTINE_BUCKET)
  assert.match(config.R2_ACCOUNT_ID, /^[0-9a-f]{32}$/i)
  const assertPrivateUrl = (value: string, key: string) => {
    const parsed = new URL(value)
    const endpoint = `${config.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`
    const path = decodeURIComponent(parsed.pathname)
    assert.equal(parsed.protocol, 'https:')
    assert.ok((parsed.hostname === endpoint && path === `/${config.R2_QUARANTINE_BUCKET}/${key}`)
      || (parsed.hostname === `${config.R2_QUARANTINE_BUCKET}.${endpoint}` && path === `/${key}`), 'unexpected private storage destination')
  }
  process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'true'
  const db = new PrismaClient()
  try {
    const [identity] = await db.$queryRaw<Array<{ database: string; data_dir: string }>>`
      SELECT current_database() AS database, current_setting('data_directory') AS data_dir
    `
    assert.equal(identity.database, 'anstoss_retention_test')
    assert.equal(identity.data_dir, `${url.searchParams.get('host')}/data`)
    const id = `canary-${randomUUID()}`, peerId = `${id}-peer`, outsiderId = `${id}-outsider`, groupId = `${id}-group`, teamId = `${id}-team`
    const channelId = `${id}-channel`, conversationId = `${id}-conversation`
    process.stdout.write(`Synthetic media canary ID: ${id}\n`)
    await db.user.createMany({ data: [id, peerId, outsiderId].map((userId) => ({ id: userId,
      name: 'Synthetic canary', dateOfBirth: new Date('1990-01-01') })) })
    await db.club.create({ data: { id, name: 'Synthetic canary', slug: id } })
    await db.teamGroup.create({ data: { id: groupId, clubId: id, type: 'CUSTOM', displayName: 'Synthetic group' } })
    await db.team.create({ data: { id: teamId, clubId: id, groupId, name: 'Synthetic team', displayName: 'Synthetic team' } })
    await db.channel.create({ data: { id: channelId, clubId: id, teamId, kind: 'TEAM', slug: id, name: 'Synthetic channel' } })
    await db.conversation.create({ data: { id: conversationId, clubId: id } })
    await db.membership.createMany({ data: [id, peerId].map((userId) => ({ userId, clubId: id, role: 'PLAYER' })) })
    await db.teamAccess.createMany({ data: [id, peerId].map((userId) => ({ userId, clubId: id, teamId,
      role: 'PLAYER', status: 'ACTIVE', phase: 'FULL' })) })
    await db.conversationParticipant.createMany({ data: [id, peerId].map((userId) => ({ userId, conversationId })) })
    const r2 = new R2Provider()
    const events = { emit: () => undefined }
    const teams = new TeamsService(db as never)
    const channels = new ChannelsService(db as never, teams, events as never)
    const controller = new MediaController(teams, r2, channels, db as never)
    const gateway = { broadcastChatEvent: () => undefined, emitInboxUpdateForChannel: async () => undefined }
    const chat = new ChatService(db as never, teams, gateway as never, {} as never, channels, {} as never, r2)
    const dm = new DmService(db as never, {} as never, r2, events as never)
    for (const type of ['chat', 'dm'] as const) {
      const input = { kind: 'image' as const, contentType: 'image/png', sizeBytes: 4, filename: 'canary.png' }
      const presigned = type === 'chat' ? await controller.presign({ id }, teamId, input, '1')
        : await dm.presignMedia(id, id, conversationId, input)
      assert.ok(presigned.enabled && presigned.uploadUrl && presigned.publicUrl)
      assert.ok(isOwnedPrivateV1Key(presigned.objectKey, { targetType: type, clubId: id,
        targetId: type === 'chat' ? teamId : conversationId, ownerId: id, kind: 'image' }))
      assert.ok(presigned.objectKey.startsWith(`${type}/${id}/${type === 'chat' ? teamId : conversationId}/image/`))
      assert.equal(presigned.publicUrl, `https://private-media.anstoss.invalid/${presigned.objectKey}`)
      assert.equal(r2.objectKeyFromUrl(presigned.publicUrl), presigned.objectKey)
      assertPrivateUrl(presigned.uploadUrl, presigned.objectKey)
      assert.equal(presigned.uploadHeaders?.['If-None-Match'], '*')
      assert.ok(new URL(presigned.uploadUrl).searchParams.get('X-Amz-SignedHeaders')?.split(';').includes('if-none-match'))
      assert.ok(await db.accountMediaDeletion.findUnique({ where: { objectKey: presigned.objectKey } }))
      const put = await fetch(presigned.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png',
        'Content-Length': '4', ...presigned.uploadHeaders }, body: new Uint8Array([1, 2, 3, 4]), redirect: 'error', signal: AbortSignal.timeout(30_000) })
      assert.equal(put.status, 200)
      const message = type === 'chat' ? await chat.postMedia(id, { teamId, channelId, messageType: 'IMAGE', attachmentUrl: presigned.publicUrl })
        : await dm.sendMessage(id, id, conversationId, { messageType: 'IMAGE', attachmentUrl: presigned.publicUrl })
      assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey: presigned.objectKey } }), null)
      const authorized = type === 'chat' ? await controller.getMessageMediaUrl({ id: peerId }, message.id, peerId)
        : await dm.getMediaUrl(peerId, id, conversationId, message.id)
      assert.ok(authorized.url)
      const denied = (error: unknown) => error instanceof HttpException && [403, 404].includes(error.getStatus())
      await assert.rejects(type === 'chat' ? controller.getMessageMediaUrl({ id: outsiderId }, message.id, outsiderId)
        : dm.getMediaUrl(outsiderId, id, conversationId, message.id), denied)
      await db.teamAccess.updateMany({ where: { userId: peerId, teamId }, data: { status: 'REVOKED' } })
      await db.membership.deleteMany({ where: { userId: peerId, clubId: id } })
      await assert.rejects(type === 'chat' ? controller.getMessageMediaUrl({ id: peerId }, message.id, peerId)
        : dm.getMediaUrl(peerId, id, conversationId, message.id), denied)
      await db.membership.create({ data: { userId: peerId, clubId: id, role: 'PLAYER' } })
      await db.teamAccess.updateMany({ where: { userId: peerId, teamId }, data: { status: 'ACTIVE' } })
      const readUrl = authorized.url
      assertPrivateUrl(readUrl, presigned.objectKey)
      const read = await fetch(readUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
      assert.equal(read.status, 200)
      assert.deepEqual([...new Uint8Array(await read.arrayBuffer())], [1, 2, 3, 4])
      await db.$transaction(async (tx) => {
        await retireLegacyChatMedia(tx, r2, presigned.publicUrl!, { kind: type, clubId: id,
          targetId: type === 'chat' ? teamId : conversationId, senderId: id, messageType: 'IMAGE' })
        if (type === 'chat') await tx.message.update({ where: { id: message.id }, data: { deletedAt: new Date(), attachmentUrl: null } })
        else await tx.directMessage.update({ where: { id: message.id }, data: { deletedAt: new Date(), attachmentUrl: null } })
      })
      const queue = {
        findMany: (args: any) => db.accountMediaDeletion.findMany({ ...args, where: { AND: [args.where, { objectKey: presigned.objectKey }] } }),
        updateMany: (args: any) => db.accountMediaDeletion.updateMany(args),
      }
      await new AccountMediaDeletionWorker({ accountMediaDeletion: queue,
        $transaction: (fn: any, opts: any) => db.$transaction(fn, opts) } as never, r2).runCycle()
      assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey: presigned.objectKey } }), null)
      const retiredUrl = await r2.presignGet(presigned.objectKey, 60)
      assertPrivateUrl(retiredUrl, presigned.objectKey)
      const retired = await fetch(retiredUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
      assert.equal(retired.status, 200)
      assert.equal((await retired.arrayBuffer()).byteLength, 0)
      assert.equal((await fetch(presigned.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png',
        'Content-Length': '4', ...presigned.uploadHeaders }, body: new Uint8Array([1, 2, 3, 4]), redirect: 'error', signal: AbortSignal.timeout(30_000) })).status, 412)
      process.stdout.write(`PASS: synthetic ${type} upload, authorized read, outsider/revocation rejection and retirement (service-level).\n`)
    }
  } finally { await db.$disconnect() }
}
main().catch(() => { process.stderr.write('Combined private-media canary failed or was uncertain; no further cleanup attempted.\n'); process.exitCode = 1 })
