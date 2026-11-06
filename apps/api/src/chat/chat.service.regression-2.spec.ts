import { ChatService } from './chat.service'
import { Logger } from '@nestjs/common'
import { newOwnedPrivateV1Key } from '../media/private-v1-owner'

const ownedKey = newOwnedPrivateV1Key({ targetType: 'chat', clubId: 'club-1', targetId: 'team-1', ownerId: 'user-1', kind: 'image' }, 'x.png')

// Regression: ISSUE-007 — arbitrary/foreign URLs could be persisted as chat media.
// Found by the launch adversarial audit on 2026-08-21.
describe('ChatService media upload binding', () => {
  it('returns the existing attachment and repairs realtime delivery on an identical retry', async () => {
    const tx = { $executeRaw: jest.fn(), user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      channel: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', clubId: 'club-1' }) },
      accountMediaDeletion: { findUnique: jest.fn().mockResolvedValue(null) },
      message: { findFirst: jest.fn().mockResolvedValue({ id: 'saved', clubId: 'club-1', teamId: 'team-1',
        channelId: 'ch-1', senderId: 'user-1', content: '', messageType: 'IMAGE', attachmentMeta: null,
        replyToId: null, deletedAt: null }), create: jest.fn() } }
    const prisma = { $transaction: jest.fn(async (callback) => callback(tx)), channel: tx.channel }
    const gateway = { broadcastChatEvent: jest.fn(), emitInboxUpdateForChannel: jest.fn() }
    const r2 = { enabled: true, objectKeyFromUrl: jest.fn().mockReturnValue(ownedKey), assertStoredObject: jest.fn() }
    const service = new ChatService(prisma as never,
      { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }) } as never,
      gateway as never, {} as never, { assertWritable: jest.fn(), authorizePrivateUpload: jest.fn() } as never, {} as never, r2 as never)
    jest.spyOn(service, 'serializeMessage').mockResolvedValue({ id: 'saved' } as never)
    await expect(service.postMedia('user-1', { teamId: 'team-1', channelId: 'ch-1', messageType: 'IMAGE',
      attachmentUrl: 'https://assets.example/x.png' })).resolves.toEqual({ id: 'saved' })
    expect(tx.message.create).not.toHaveBeenCalled()
    expect(gateway.broadcastChatEvent).toHaveBeenCalledTimes(1)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(gateway.emitInboxUpdateForChannel).toHaveBeenCalledWith('ch-1')
  })
  it('rejects a same-team member attempting to post someone else’s upload', async () => {
    const r2 = { enabled: true, objectKeyFromUrl: jest.fn().mockReturnValue(ownedKey), assertStoredObject: jest.fn() }
    const service = new ChatService({} as never,
      { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }) } as never,
      {} as never, {} as never, {} as never, {} as never, r2 as never)
    await expect(service.postMedia('other-user', {
      teamId: 'team-1', channelId: 'ch-1', messageType: 'IMAGE', attachmentUrl: 'https://assets.example/x.png',
    })).rejects.toThrow('Attachment does not belong to this team upload')
    expect(r2.assertStoredObject).not.toHaveBeenCalled()
  })
  it('does not consume or publish an upload when channel access is revoked under the transaction', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      accountMediaDeletion: { findUnique: jest.fn(), deleteMany: jest.fn() },
      message: { findFirst: jest.fn(), create: jest.fn() },
    }
    const channels = {
      assertWritable: jest.fn().mockResolvedValue(undefined),
      authorizePrivateUpload: jest.fn().mockRejectedValue(new Error('channel access revoked')),
    }
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
      channel: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', clubId: 'club-1' }) },
    }
    const r2 = { enabled: true, objectKeyFromUrl: jest.fn().mockReturnValue(ownedKey), assertStoredObject: jest.fn() }
    const service = new ChatService(prisma as never,
      { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }) } as never,
      {} as never, {} as never, channels as never, {} as never, r2 as never)

    await expect(service.postMedia('user-1', {
      teamId: 'team-1', channelId: 'ch-1', messageType: 'IMAGE', attachmentUrl: 'https://assets.example/x.png',
    })).rejects.toThrow('channel access revoked')
    expect(channels.authorizePrivateUpload).toHaveBeenCalledWith('user-1', 'club-1', 'team-1', 'ch-1', 'write', tx)
    expect(tx.accountMediaDeletion.findUnique).not.toHaveBeenCalled()
    expect(tx.accountMediaDeletion.deleteMany).not.toHaveBeenCalled()
    expect(tx.message.create).not.toHaveBeenCalled()
  })
  it('serializes the persisted response through the supplied transaction client', async () => {
    const prisma = { message: { findUniqueOrThrow: jest.fn().mockRejectedValue(new Error('root client must not be used')) } }
    const tx = { message: { findUniqueOrThrow: jest.fn().mockResolvedValue({
      id: 'message-1', teamId: 'team-1', clubId: 'club-1', channelId: 'ch-1', senderId: 'user-1',
      content: '', messageType: 'IMAGE', attachmentUrl: 'https://private-media.anstoss.invalid/test',
      attachmentMeta: { sizeBytes: 100 }, replyToId: null, isAnnouncement: false, isPinned: false,
      editedAt: null, deletedAt: null, createdAt: new Date('2026-10-27T10:00:00Z'),
      sender: { name: 'Mina', avatarUrl: null }, reactions: [], reads: [], replyTo: null,
    }) } }
    const service = new ChatService(prisma as never, {} as never, {} as never,
      {} as never, {} as never, {} as never)
    await expect(service.serializeMessage('user-1', 'message-1', tx as never)).resolves.toMatchObject({
      id: 'message-1', senderName: 'Mina', messageType: 'IMAGE',
      createdAt: '2026-10-27T10:00:00.000Z', reactions: [], readCount: 0, readByMe: false,
    })
    expect(tx.message.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'message-1' } }))
    expect(prisma.message.findUniqueOrThrow).not.toHaveBeenCalled()
  })
  it.each([
    { teamId: 'team-1', failure: 'none' },
    { teamId: null, failure: 'none' },
    { teamId: 'team-1', failure: 'sender' },
    { teamId: null, failure: 'sender' },
    { teamId: 'team-1', failure: 'reply' },
    { teamId: 'team-1', failure: 'readers' },
    { teamId: 'team-1', failure: 'push' },
    { teamId: 'team-1', failure: 'broadcast' },
    { teamId: 'team-1', failure: 'inbox-sync' },
    { teamId: 'team-1', failure: 'inbox-async' },
    { teamId: 'team-1', failure: 'serialize' },
  ])('returns persisted media for valid channels even if push preparation fails (%j)', async ({ teamId, failure }) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(0),
        $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]),
        user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
        channel: { findUnique: jest.fn().mockResolvedValue({ teamId, clubId: 'club-1' }) },
        accountMediaDeletion: { findUnique: jest.fn().mockResolvedValue({ uploadState: 'PENDING' }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        message: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'message-1' }) },
      }
      const prisma = {
        $transaction: jest.fn(async (callback) => callback(tx)),
        channel: tx.channel,
        message: {
          findFirst: jest.fn().mockResolvedValue({ id: 'parent-1' }),
          findUnique: jest.fn().mockRejectedValue(new Error('reply lookup unavailable')),
        },
        user: { findUnique: failure === 'sender'
          ? jest.fn().mockRejectedValue(new Error('notification lookup unavailable'))
          : jest.fn().mockResolvedValue({ name: 'Mina' }) },
      }
      const gateway = {
        broadcastChatEvent: failure === 'broadcast'
          ? jest.fn(() => { throw new Error('realtime unavailable') }) : jest.fn(),
        emitInboxUpdateForChannel: failure === 'inbox-sync'
          ? jest.fn(() => { throw new Error('inbox unavailable') })
          : failure === 'inbox-async' ? jest.fn().mockRejectedValue(new Error('inbox unavailable')) : jest.fn(),
      }
      const channels = {
        assertWritable: jest.fn().mockResolvedValue(undefined),
        authorizePrivateUpload: jest.fn().mockResolvedValue(undefined),
        listChannelReaderIds: failure === 'readers'
          ? jest.fn().mockRejectedValue(new Error('readers lookup unavailable'))
          : jest.fn().mockResolvedValue(['user-1', 'user-2']),
      }
      const push = { sendToUserLocalized: failure === 'push'
        ? jest.fn().mockRejectedValue(new Error('push unavailable'))
        : jest.fn().mockResolvedValue(undefined) }
      const r2 = {
        enabled: true,
        objectKeyFromUrl: jest.fn().mockReturnValue(ownedKey),
        assertStoredObject: jest.fn().mockResolvedValue(undefined),
      }
      const service = new ChatService(prisma as never,
        { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }) } as never,
        gateway as never, push as never, channels as never, {} as never, r2 as never)
      const serialized = { id: 'message-1' }
      const serialize = jest.spyOn(service, 'serializeMessage')
      if (failure === 'serialize') serialize.mockRejectedValue(new Error('response preparation failed'))
      else serialize.mockResolvedValue(serialized as never)
      const result = service.postMedia('user-1', {
        teamId: 'team-1', channelId: 'ch-1', messageType: 'IMAGE', attachmentUrl: 'https://assets.example/x.png',
        ...(failure === 'reply' ? { replyToId: 'parent-1' } : {}),
      })
      if (failure === 'serialize') {
        await expect(result).rejects.toThrow('response preparation failed')
        // The owned transaction rejects: Prisma rolls back its INSERT. This
        // mock verifies the boundary, not PostgreSQL rollback itself.
        await expect(prisma.$transaction.mock.results[0].value).rejects.toThrow('response preparation failed')
        expect(serialize).toHaveBeenCalledWith('user-1', 'message-1', tx)
        expect(gateway.broadcastChatEvent).not.toHaveBeenCalled()
        expect(gateway.emitInboxUpdateForChannel).not.toHaveBeenCalled()
        expect(push.sendToUserLocalized).not.toHaveBeenCalled()
        return
      }
      await expect(result).resolves.toEqual(serialized)
      expect(channels.authorizePrivateUpload).toHaveBeenCalledWith('user-1', 'club-1', 'team-1', 'ch-1', 'write', tx)
      expect(serialize).toHaveBeenCalledWith('user-1', 'message-1', tx)
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(tx.message.create).toHaveBeenCalledTimes(1)
      expect(gateway.broadcastChatEvent).toHaveBeenCalledTimes(1)
      if (['sender', 'reply', 'readers', 'push'].includes(failure)) {
        expect(warn).toHaveBeenCalledWith('Media message notification failed after persistence')
        expect(push.sendToUserLocalized).toHaveBeenCalledTimes(failure === 'push' ? 1 : 0)
      } else {
        if (failure === 'broadcast') expect(warn).toHaveBeenCalledWith('Media message realtime broadcast failed after persistence')
        if (failure.startsWith('inbox-')) expect(warn).toHaveBeenCalledWith('Media message inbox update failed after persistence')
        expect(push.sendToUserLocalized).toHaveBeenCalledWith('user-2', 'CHAT_ATTACHMENT',
          { senderName: 'Mina', kind: 'IMAGE', caption: null },
          { kind: 'MEDIA_MESSAGE', clubId: 'club-1', messageId: 'message-1', teamId: 'team-1', channelId: 'ch-1' },
          { clubId: 'club-1', category: 'chat' })
      }
    } finally { warn.mockRestore() }
  })
  it.each([
    null,
    { teamId: 'team-2', clubId: 'club-1' },
    { teamId: 'team-1', clubId: 'club-2' },
    { teamId: null, clubId: 'club-2' },
  ])('rejects changed channel binding inside the transaction (%j)', async (currentChannel) => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      channel: { findUnique: jest.fn().mockResolvedValue(currentChannel) },
      message: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
      channel: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', clubId: 'club-1' }) },
    }
    const r2 = {
      enabled: true,
      objectKeyFromUrl: jest.fn().mockReturnValue(ownedKey),
      assertStoredObject: jest.fn().mockResolvedValue(undefined),
    }
    const service = new ChatService(prisma as never,
      { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }) } as never,
      {} as never, {} as never, { assertWritable: jest.fn().mockResolvedValue(undefined), authorizePrivateUpload: jest.fn() } as never,
      {} as never, r2 as never)
    await expect(service.postMedia('user-1', {
      teamId: 'team-1', channelId: 'ch-1', messageType: 'IMAGE', attachmentUrl: 'https://assets.example/x.png',
    })).rejects.toThrow(currentChannel ? 'Channel does not belong to this team' : 'Channel not found')
    expect(tx.channel.findUnique).toHaveBeenCalledWith({
      where: { id: 'ch-1' }, select: { teamId: true, clubId: true },
    })
    expect(tx.message.create).not.toHaveBeenCalled()
    expect(r2.assertStoredObject).toHaveBeenCalledTimes(1)
  })
  it.each([
    { deleted: false, retiring: false }, { deleted: true, retiring: false }, { deleted: false, retiring: true },
  ])('rechecks lifecycle/storage under locks (%j)', async ({ deleted, retiring }) => {
    const prisma = {
      $transaction: jest.fn(), $executeRaw: jest.fn().mockResolvedValue(0),
      message: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      accountMediaDeletion: { findUnique: jest.fn().mockResolvedValue(retiring ? { objectKey: 'key' } : null) },
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: deleted ? new Date() : null }) },
      channel: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1', clubId: 'club-1' }) },
    }
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma))
    const r2 = {
      enabled: true,
      objectKeyFromUrl: jest.fn().mockReturnValue(ownedKey),
      assertStoredObject: jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('retired')),
    }
    const service = new ChatService(prisma as never,
      { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }) } as never,
      {} as never, {} as never, { assertWritable: jest.fn().mockResolvedValue(undefined), authorizePrivateUpload: jest.fn() } as never,
      {} as never, r2 as never)
    await expect(service.postMedia('user-1', {
      teamId: 'team-1', channelId: 'ch-1', messageType: 'IMAGE', attachmentUrl: 'https://assets.example/x.png',
    })).rejects.toThrow(deleted ? 'Account unavailable' : retiring ? 'Attachment is being removed; upload it again' : 'Attachment upload is invalid or incomplete')
    expect(prisma.$executeRaw.mock.calls[0]).toContain('user-1')
    if (!deleted && !retiring) {
      expect(prisma.$executeRaw.mock.calls[2]).toContain(`media-object:${ownedKey}`)
      expect(r2.assertStoredObject.mock.invocationCallOrder[1]).toBeGreaterThan(prisma.$executeRaw.mock.invocationCallOrder[2])
    } else expect(r2.assertStoredObject).toHaveBeenCalledTimes(1)
    expect(prisma.message.create).not.toHaveBeenCalled()
  })
  it('rejects an attachment outside the caller team namespace before persisting', async () => {
    const prisma = { message: { create: jest.fn() } }
    const teams = {
      assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }),
    }
    const r2 = {
      objectKeyFromUrl: jest.fn().mockReturnValue('chat/club-2/team-2/image/x.png'),
      assertStoredObject: jest.fn(),
    }
    const service = new ChatService(
      prisma as never,
      teams as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      r2 as never,
    )

    await expect(
      service.postMedia('user-1', {
        teamId: 'team-1',
        channelId: 'ch-1',
        messageType: 'IMAGE',
        attachmentUrl: 'https://assets.example/foreign.png',
      }),
    ).rejects.toThrow('Attachment does not belong to this team upload')
    expect(prisma.message.create).not.toHaveBeenCalled()
    expect(r2.assertStoredObject).not.toHaveBeenCalled()
  })

  it('requires the uploaded object metadata to pass server-side inspection', async () => {
    const prisma = { message: { create: jest.fn() } }
    const teams = {
      assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }),
    }
    const r2 = {
      objectKeyFromUrl: jest.fn().mockReturnValue(ownedKey),
      assertStoredObject: jest.fn().mockRejectedValue(new Error('too large')),
    }
    const service = new ChatService(
      prisma as never,
      teams as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      r2 as never,
    )

    await expect(
      service.postMedia('user-1', {
        teamId: 'team-1',
        channelId: 'ch-1',
        messageType: 'IMAGE',
        attachmentUrl: 'https://assets.example/x.png',
      }),
    ).rejects.toThrow('Attachment upload is invalid or incomplete')
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('L3: refuses a media post without a channel before touching storage', async () => {
    const prisma = { message: { create: jest.fn() } }
    const teams = { assertReadableAccess: jest.fn() }
    const r2 = { objectKeyFromUrl: jest.fn(), assertStoredObject: jest.fn() }
    const service = new ChatService(
      prisma as never,
      teams as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      r2 as never,
    )
    await expect(
      service.postMedia('user-1', {
        teamId: 'team-1',
        messageType: 'IMAGE',
        attachmentUrl: 'https://assets.example/x.png',
      }),
    ).rejects.toThrow('Channel required')
    expect(teams.assertReadableAccess).not.toHaveBeenCalled()
    expect(prisma.message.create).not.toHaveBeenCalled()
  })
})
