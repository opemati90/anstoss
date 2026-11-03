import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { ChatService } from '../src/chat/chat.service'
import { DmService } from '../src/dm/dm.service'
import { newOwnedPrivateV1Key } from '../src/media/private-v1-owner'
import { reservePrivateV1Upload } from '../src/media/private-v1-reservations'

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
    const indexes = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN
        ('Message_owned_v1_attachment_unique', 'DirectMessage_owned_v1_attachment_unique',
         'Message_attachmentUrl_lookup', 'DirectMessage_attachmentUrl_lookup')
    `
    assert.equal(indexes.length, 4, 'all four attachment indexes must be installed')
    const prefix = `synthetic-${randomUUID()}`
    const clubId = `${prefix}-club`, userId = `${prefix}-user`, teamId = `${prefix}-team`
    const groupId = `${prefix}-group`, channelId = `${prefix}-channel`, conversationId = `${prefix}-conversation`
    await db.user.create({ data: { id: userId, name: 'Synthetic sender' } })
    await db.club.create({ data: { id: clubId, name: 'Synthetic club', slug: clubId } })
    await db.teamGroup.create({ data: { id: groupId, clubId, type: 'CUSTOM', displayName: 'Synthetic group' } })
    await db.team.create({ data: { id: teamId, clubId, groupId, name: 'Synthetic team', displayName: 'Synthetic team' } })
    await db.channel.create({ data: { id: channelId, clubId, teamId, kind: 'TEAM', slug: prefix, name: 'Synthetic channel' } })
    await db.conversation.create({ data: { id: conversationId, clubId } })
    const r2 = { enabled: true, objectKeyFromUrl: (value: string) => value.replace('https://private-media.anstoss.invalid/', ''),
      assertStoredObject: async () => undefined }
    let broadcasts = 0, emissions = 0
    const gateway = { broadcastChatEvent: () => { broadcasts++ }, emitInboxUpdateForChannel: async () => undefined }
    const channels = { assertWritable: async () => undefined, listChannelReaderIds: async () => [] }
    const chat = new ChatService(db as never, { assertReadableAccess: async () => ({ team: { clubId } }) } as never,
      gateway as never, {} as never, channels as never, {} as never, r2 as never)
    const chatKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId, targetId: teamId, ownerId: userId, kind: 'image' }, 'image.png')
    await reservePrivateV1Upload(db as never, userId, chatKey, { kind: 'image' })
    const chatInput = { teamId, channelId, messageType: 'IMAGE' as const, attachmentUrl: `https://private-media.anstoss.invalid/${chatKey}` }
    const [a, b] = await Promise.all([chat.postMedia(userId, chatInput), chat.postMedia(userId, chatInput)])
    assert.equal(a.id, b.id); assert.equal(broadcasts, 2)
    assert.equal(await db.message.count({ where: { attachmentUrl: chatInput.attachmentUrl } }), 1)
    await assert.rejects(db.message.create({ data: { teamId, clubId, channelId, senderId: userId, content: '',
      messageType: 'IMAGE', attachmentUrl: chatInput.attachmentUrl } }), (error: any) => error.code === 'P2002')
    await assert.rejects(chat.postMedia(userId, { ...chatInput, content: 'different' }), /already been used/)
    const oldChatKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId, targetId: teamId, ownerId: userId, kind: 'image' }, 'old.png')
    await reservePrivateV1Upload(db as never, userId, oldChatKey, { kind: 'image' })
    const oldChatInput = { ...chatInput, attachmentUrl: `https://private-media.anstoss.invalid/${oldChatKey}` }
    const oldChat = await db.message.create({ data: { teamId, clubId, channelId, senderId: userId, content: '',
      messageType: 'IMAGE', attachmentUrl: oldChatInput.attachmentUrl } })
    assert.equal((await chat.postMedia(userId, oldChatInput)).id, oldChat.id)
    assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey: oldChatKey } }), null)

    const dm = new DmService(db as never, {} as never, r2 as never, { emit: () => { emissions++ } } as never)
    const internals = dm as any
    internals.assertConversationAccess = async () => ({ clubId })
    internals.assertCanMessageConversation = async () => undefined
    internals.lockWritableConversation = async () => ({ clubId })
    const dmKey = newOwnedPrivateV1Key({ targetType: 'dm', clubId, targetId: conversationId, ownerId: userId, kind: 'image' }, 'image.png')
    await reservePrivateV1Upload(db as never, userId, dmKey, { kind: 'image' })
    const dmInput = { messageType: 'IMAGE' as const, attachmentUrl: `https://private-media.anstoss.invalid/${dmKey}` }
    const [c, d] = await Promise.all([dm.sendMessage(userId, clubId, conversationId, dmInput), dm.sendMessage(userId, clubId, conversationId, dmInput)])
    assert.equal(c.id, d.id); assert.equal(emissions, 2)
    assert.equal(await db.directMessage.count({ where: { attachmentUrl: dmInput.attachmentUrl } }), 1)
    await assert.rejects(db.directMessage.create({ data: { conversationId, senderId: userId, content: '',
      messageType: 'IMAGE', attachmentUrl: dmInput.attachmentUrl } }), (error: any) => error.code === 'P2002')
    await assert.rejects(dm.sendMessage(userId, clubId, conversationId, { ...dmInput, content: 'different' }), /already been used/)
    const oldDmKey = newOwnedPrivateV1Key({ targetType: 'dm', clubId, targetId: conversationId, ownerId: userId, kind: 'image' }, 'old.png')
    await reservePrivateV1Upload(db as never, userId, oldDmKey, { kind: 'image' })
    const oldDmInput = { ...dmInput, attachmentUrl: `https://private-media.anstoss.invalid/${oldDmKey}` }
    const oldDm = await db.directMessage.create({ data: { conversationId, senderId: userId, content: '',
      messageType: 'IMAGE', attachmentUrl: oldDmInput.attachmentUrl } })
    assert.equal((await dm.sendMessage(userId, clubId, conversationId, oldDmInput)).id, oldDm.id)
    assert.equal(await db.accountMediaDeletion.findUnique({ where: { objectKey: oldDmKey } }), null)
    process.stdout.write('PASS: concurrent invocations converge; database indexes reject duplicate channel/DM media (authorization mocked).\n')
  } finally { await db.$disconnect() }
}
main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
