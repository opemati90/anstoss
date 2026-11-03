import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { ChannelsService } from '../src/channels/channels.service'
import { ClubsService } from '../src/clubs/clubs.service'
import { PrivateChatMediaFacade } from '../src/assets/private-chat-media-facade'
import { PrivateUploadReads } from '../src/assets/private-upload-reads'
import { tenantContext } from '../src/prisma/tenant.context'
import { createTenantMiddleware } from '../src/prisma/tenant.middleware'
import { getClubId } from '../src/prisma/tenant.context'

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, 'localhost')
  assert.equal(url.port, '55443')
  assert.equal(url.pathname, '/anstoss_retention_test')
  assert.match(url.searchParams.get('host') ?? '', /^\/private\/tmp\/anstoss-retention-db\.[A-Za-z0-9]+$/)
  const db = new PrismaClient()
  db.$use(createTenantMiddleware(getClubId) as never)
  const prefix = `synthetic-${randomUUID()}`
  const clubId = `${prefix}-club`, userId = `${prefix}-user`, senderId = `${prefix}-sender`
  const teamId = `${prefix}-team`, groupId = `${prefix}-group`, channelId = `${prefix}-channel`
  const messageId = `${prefix}-message`, uploadId = randomUUID(), key = `private-chat/v2/${uploadId}`
  const marker = `https://private-media.anstoss.invalid/${key}`
  let signatures = 0
  let readerPid = 0
  let entered!: () => void
  let release!: () => void
  const signing = new Promise<void>((resolve) => { entered = resolve })
  const hold = new Promise<void>((resolve) => { release = resolve })
  try {
    await tenantContext.run({ clubId, userId }, async () => {
      await db.user.createMany({ data: [userId, senderId].map((id) => ({ id, name: 'Synthetic person', dateOfBirth: new Date('1990-01-01') })) })
      await db.club.create({ data: { id: clubId, name: 'Synthetic club', slug: clubId } })
      await db.teamGroup.create({ data: { id: groupId, clubId, type: 'CUSTOM', displayName: 'Synthetic group' } })
      await db.team.create({ data: { id: teamId, clubId, groupId, name: 'Synthetic team', displayName: 'Synthetic team' } })
      await db.membership.createMany({ data: [{ clubId, userId, role: 'PLAYER' }, { clubId, userId: senderId, role: 'OWNER' }] })
      await db.teamAccess.create({ data: { clubId, teamId, userId, role: 'PLAYER', phase: 'FULL', status: 'ACTIVE' } })
      await db.channel.create({ data: { id: channelId, clubId, teamId, kind: 'TEAM', slug: prefix, name: 'Synthetic channel' } })
      await db.message.create({ data: { id: messageId, clubId, teamId, channelId, senderId, content: '', messageType: 'IMAGE', attachmentUrl: marker } })
      await db.privateMediaUpload.create({ data: { id: uploadId, clubId, ownerId: senderId, targetId: channelId,
        targetType: 'CHANNEL', objectKey: key, contentType: 'image/png', expectedBytes: 10, state: 'ATTACHED',
        uploadId: 'synthetic-session', messageId, expiresAt: new Date(0) } })
      const channels = new ChannelsService(db as never, {} as never, { emit: () => undefined } as never)
      const readerDb = { $transaction: (fn: (tx: any) => Promise<unknown>, options?: object) => db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
        readerPid = row.pid
        return fn(tx)
      }, options) }
      const reader = new PrivateUploadReads(readerDb as never, { signGet: async () => {
        signatures++; entered(); await hold; return 'https://synthetic.invalid/signed'
      } })
      const facade = new PrivateChatMediaFacade(channels, {} as never, {} as never, reader, {} as never)
      const actor = { userId, clubId }
      const target = { kind: 'CHANNEL' as const, teamId, channelId }
      const pendingRead = facade.read(actor, target, messageId)
      void pendingRead.catch(() => undefined)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([signing, pendingRead.then(() => { throw new Error('Signing callback was not reached') }),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Signing callback timed out')), 10_000) })])
      } finally { if (timer) clearTimeout(timer) }
      let revokeReady!: (pid: number) => void
      const revokerStarted = new Promise<number>((resolve) => { revokeReady = resolve })
      const revokerDb = { $transaction: (fn: (tx: any) => Promise<unknown>, options?: object) => db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
        revokeReady(row.pid)
        return fn(tx)
      }, { timeout: 20_000, ...options }) }
      const clubs = new ClubsService(revokerDb as never, { emit: () => undefined } as never)
      const revoke = clubs.removeMemberFromClub(senderId, clubId, userId)
      void revoke.catch(() => undefined)
      try {
        const revokePid = await Promise.race([revokerStarted, revoke.then(() => { throw new Error('Revocation did not reach its lock') })])
        let blocked = false
        for (let attempt = 0; attempt < 100; attempt++) {
          const [row] = await db.$queryRaw<Array<{ blocked: boolean }>>`
            SELECT ${readerPid}::integer = ANY(pg_blocking_pids(${revokePid}::integer)) AS blocked
          `
          if (row.blocked) { blocked = true; break }
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        assert.ok(blocked, 'revocation must wait behind the signing authorization transaction')
      } finally { release() }
      assert.deepEqual(await pendingRead, { url: 'https://synthetic.invalid/signed' })
      await revoke
      await assert.rejects(facade.read(actor, target, messageId),
        (error: unknown) => typeof (error as { getStatus?: unknown })?.getStatus === 'function'
          && (error as { getStatus: () => number }).getStatus() === 403)
      assert.equal(signatures, 1, 'revoked access must not receive a new capability')
      process.stdout.write('PASS: signing and revocation serialize; revoked access receives no new capability.\n')
    })
  } finally { release(); await db.$disconnect() }
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
