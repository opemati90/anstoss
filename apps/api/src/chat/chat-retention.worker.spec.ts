import { ChatRetentionWorker, RetentionSweepError } from './chat-retention.worker'
import { newOwnedPrivateV1Key } from '../media/private-v1-owner'

function makePrisma(overrides: Record<string, unknown> = {}) {
  const defaultAttachmentBatch = [
    { id: 'msg-1', attachmentUrl: 'https://cdn.example/chat/club-1/a.jpg' },
    { id: 'msg-2', attachmentUrl: 'https://elsewhere.example/a.jpg' },
  ]
  const prisma: any = {
    club: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'club-1',
          chatRetentionSettings: {
            clubId: 'club-1',
            enabled: true,
            messageRetentionDays: 30,
            attachmentRetentionDays: 7,
          },
        },
        {
          id: 'club-2',
          chatRetentionSettings: {
            clubId: 'club-2',
            enabled: false,
            messageRetentionDays: 30,
            attachmentRetentionDays: 7,
          },
        },
        { id: 'club-3', chatRetentionSettings: null },
      ]),
    },
    message: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest
        .fn()
        .mockResolvedValueOnce(defaultAttachmentBatch)
        .mockResolvedValueOnce(defaultAttachmentBatch)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'old-msg-1' }, { id: 'old-msg-2' }])
        .mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 2 }),
    },
    messageTranslation: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    pollVote: {
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    pollOption: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    poll: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    directMessage: {
      count: jest.fn().mockResolvedValue(0),
      // 1st: DM attachment sweep (none), 2nd: expired DMs, then nothing.
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'dm-1' }])
        .mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    directMessageTranslation: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, clubId: string) => [{
      clubId, enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7,
    }]),
    ...overrides,
  }
  prisma.$transaction = jest.fn((operation: Array<Promise<unknown>> | ((tx: typeof prisma) => unknown)) =>
    typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
  )
  return prisma
}

function makeR2(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    objectKeyFromUrl: jest.fn((url: string) =>
      url.startsWith('https://cdn.example/')
        ? url.replace('https://cdn.example/', '')
        : null,
    ),
    deleteObjects: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('ChatRetentionWorker', () => {
  const now = new Date('2026-09-08T12:00:00.000Z')

  it.each(['CHANNEL', 'DM'] as const)('retires %s private attachments before clearing references', async (targetType) => {
    const marker = 'https://private-media.anstoss.invalid/private-chat/v2/upload'
    const item = { id: 'message', attachmentUrl: marker, channelId: 'channel', conversationId: 'conversation' }
    const upload = { id: 'upload', clubId: 'club-1', ownerId: 'sender', messageId: 'message', targetType,
      targetId: targetType === 'CHANNEL' ? 'channel' : 'conversation', state: 'ATTACHED', cancelRequestedAt: null }
    const prisma = makePrisma()
    prisma.message.findMany = jest.fn().mockResolvedValue([])
    prisma.directMessage.findMany = jest.fn().mockResolvedValue([])
    const model = targetType === 'CHANNEL' ? prisma.message : prisma.directMessage
    model.findMany.mockResolvedValueOnce([item]).mockResolvedValueOnce([item]).mockResolvedValue([])
    model.updateMany = jest.fn().mockResolvedValue({ count: 1 })
    prisma.privateMediaUpload = {
      findUnique: jest.fn().mockResolvedValue(upload), findFirst: jest.fn().mockResolvedValue(upload),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    }
    const r2 = makeR2()
    await new ChatRetentionWorker(prisma, r2 as never).purgeExpired(now)
    expect(prisma.privateMediaUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cancelRequestedAt: expect.any(Date) }),
    }))
    expect(prisma.privateMediaUpload.updateMany.mock.invocationCallOrder[0]).toBeLessThan(model.updateMany.mock.invocationCallOrder[0])
    expect(r2.deleteObjects).not.toHaveBeenCalled()
  })

  it.each(['CHANNEL', 'DM'] as const)('queues owned %s v1 attachments before clearing references', async (targetType) => {
    const targetId = targetType === 'CHANNEL' ? 'team' : 'conversation'
    const key = newOwnedPrivateV1Key({ targetType: targetType === 'CHANNEL' ? 'chat' : 'dm', clubId: 'club-1',
      targetId, ownerId: 'sender', kind: 'image' }, 'photo.png')
    const item = { id: 'message', attachmentUrl: `https://private-media.anstoss.invalid/${key}`, channelId: 'channel',
      teamId: 'team', conversationId: 'conversation', senderId: 'sender', messageType: 'IMAGE' }
    const prisma = makePrisma()
    prisma.message.findMany = jest.fn().mockResolvedValue([])
    prisma.directMessage.findMany = jest.fn().mockResolvedValue([])
    const model = targetType === 'CHANNEL' ? prisma.message : prisma.directMessage
    model.findMany.mockResolvedValueOnce([item]).mockResolvedValueOnce([item]).mockResolvedValue([])
    model.updateMany = jest.fn().mockResolvedValue({ count: 1 })
    prisma.accountMediaDeletion = { createMany: jest.fn().mockResolvedValue({ count: 1 }) }
    const r2 = makeR2({ objectKeyFromUrl: jest.fn().mockReturnValue(key) })
    await new ChatRetentionWorker(prisma, r2 as never).purgeExpired(now)
    expect(prisma.accountMediaDeletion.createMany).toHaveBeenCalledWith({ data: [{ objectKey: key }], skipDuplicates: true })
    expect(prisma.accountMediaDeletion.createMany.mock.invocationCallOrder[0]).toBeLessThan(model.updateMany.mock.invocationCallOrder[0])
    expect(r2.deleteObjects).not.toHaveBeenCalled()
  })

  it('does not drop a private reference when its ledger binding is missing', async () => {
    const item = { id: 'message', channelId: 'channel', attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/upload' }
    const prisma = makePrisma()
    prisma.message.findMany = jest.fn().mockResolvedValueOnce([item]).mockResolvedValueOnce([item]).mockResolvedValue([])
    prisma.directMessage.findMany = jest.fn().mockResolvedValue([])
    prisma.message.updateMany = jest.fn()
    prisma.privateMediaUpload = { findUnique: jest.fn().mockResolvedValue(null) }
    await expect(new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now))
      .rejects.toThrow('requires provenance review')
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
  })

  it('requires attachment-free messages both when selecting and rechecking text retention', async () => {
    const prisma = makePrisma()
    prisma.message.findMany = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'text' }]).mockResolvedValue([])
    prisma.directMessage.findMany = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'dm-text' }]).mockResolvedValue([])
    prisma.message.updateMany = jest.fn().mockResolvedValue({ count: 0 })
    prisma.directMessage.updateMany = jest.fn().mockResolvedValue({ count: 0 })
    const r2 = makeR2()
    await new ChatRetentionWorker(prisma, r2 as never).purgeExpired(now)
    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ attachmentUrl: null }) }))
    expect(prisma.directMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ attachmentUrl: null }) }))
    expect(prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ attachmentUrl: null }) }))
    expect(prisma.directMessage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ attachmentUrl: null }) }))
    expect(r2.deleteObjects).not.toHaveBeenCalled()
  })

  it('rejects a mixed batch before retiring a private upload or touching storage', async () => {
    const privateItem = { id: 'v2', channelId: 'channel', attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/upload' }
    const legacyItem = { id: 'legacy', channelId: 'channel', attachmentUrl: 'https://unknown.invalid/legacy.png' }
    const prisma = makePrisma()
    prisma.message.findMany = jest.fn().mockResolvedValueOnce([privateItem, legacyItem]).mockResolvedValueOnce([privateItem, legacyItem])
    prisma.privateMediaUpload = { findUnique: jest.fn() }
    const r2 = makeR2()
    await expect(new ChatRetentionWorker(prisma, r2 as never).purgeExpired(now)).rejects.toThrow('requires provenance review')
    expect(prisma.privateMediaUpload.findUnique).not.toHaveBeenCalled()
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
    expect(r2.deleteObjects).not.toHaveBeenCalled()
  })

  it.each(['CHANNEL', 'DM'] as const)('preflights all %s legacy attachments before any sweep mutation', async (type) => {
    const prisma = makePrisma()
    prisma.message.count.mockResolvedValue(type === 'CHANNEL' ? 1 : 0)
    prisma.directMessage.count.mockResolvedValue(type === 'DM' ? 1 : 0)
    const r2 = makeR2()
    await expect(new ChatRetentionWorker(prisma, r2 as never).purgeExpired(now)).rejects.toThrow('requires provenance review')
    expect(prisma.message.findMany).not.toHaveBeenCalled()
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
    expect(prisma.directMessage.updateMany).not.toHaveBeenCalled()
    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }))
  })

  it('retries a serialization conflict only up to the bounded limit', async () => {
    const prisma = makePrisma()
    prisma.$transaction = jest.fn().mockRejectedValue({ code: 'P2034' })
    await expect(new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now)).rejects.toThrow('one or more clubs')
    expect(prisma.$transaction).toHaveBeenCalledTimes(3)
  })

  it('continues to another club after an unexpected transaction failure', async () => {
    const prisma = makePrisma({ club: { findMany: jest.fn().mockResolvedValue([
      { id: 'a', chatRetentionSettings: { clubId: 'a', enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 } },
      { id: 'b', chatRetentionSettings: { clubId: 'b', enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 } },
    ]) } })
    prisma.$transaction = jest.fn().mockRejectedValueOnce(new Error('db failure'))
      .mockResolvedValueOnce({ messagesDeleted: 0, attachmentsPurged: 0 })
    await expect(new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now)).rejects.toThrow('one or more clubs')
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('reports committed counts and both failure categories when clubs have mixed outcomes', async () => {
    const prisma = makePrisma({ club: { findMany: jest.fn().mockResolvedValue(['blocked', 'failed', 'ok'].map((id) => ({
      id, chatRetentionSettings: { clubId: id, enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 },
    }))) } })
    prisma.message.count.mockResolvedValueOnce(1)
    const transaction = prisma.$transaction
    prisma.$transaction = jest.fn().mockImplementationOnce(transaction)
      .mockRejectedValueOnce(new Error('db failure'))
      .mockResolvedValueOnce({ messagesDeleted: 4, attachmentsPurged: 2 })
    let result: unknown
    try { await new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now) } catch (error) { result = error }
    expect(result).toBeInstanceOf(RetentionSweepError)
    expect((result as RetentionSweepError).summary).toEqual({
      messagesDeleted: 4, attachmentsPurged: 2, blockedClubIds: ['blocked'], failedClubIds: ['failed'],
    })
    expect((result as Error).message).toContain('one or more clubs')
  })

  it('retries a serialization conflict then returns the successful club result', async () => {
    const prisma = makePrisma()
    prisma.$transaction = jest.fn().mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValueOnce({ messagesDeleted: 3, attachmentsPurged: 1 })
    await expect(new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now))
      .resolves.toEqual({ messagesDeleted: 3, attachmentsPurged: 1 })
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it.each(['40001', '40P01'])('retries raw PostgreSQL conflict %s then succeeds', async (code) => {
    const prisma = makePrisma()
    prisma.$transaction = jest.fn().mockRejectedValueOnce({ code: 'P2010', meta: { code } })
      .mockResolvedValueOnce({ messagesDeleted: 1, attachmentsPurged: 0 })
    await expect(new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now))
      .resolves.toEqual({ messagesDeleted: 1, attachmentsPurged: 0 })
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('does not retry unrelated raw-query errors', async () => {
    const prisma = makePrisma()
    prisma.$transaction = jest.fn().mockRejectedValue({ code: 'P2010', meta: { code: '42601' } })
    await expect(new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now)).rejects.toThrow('one or more clubs')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('does not purge when retention was disabled after the initial club scan', async () => {
    const prisma = makePrisma()
    prisma.$queryRaw.mockResolvedValue([{ clubId: 'club-1', enabled: false, messageRetentionDays: 30, attachmentRetentionDays: 7 }])
    await expect(new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now))
      .resolves.toEqual({ messagesDeleted: 0, attachmentsPurged: 0 })
    expect(prisma.message.count).not.toHaveBeenCalled()
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
    expect(prisma.$executeRaw.mock.calls[0]).toContain('chat-retention-settings:club-1')
  })

  it('uses the current retention windows after taking the settings lock', async () => {
    const prisma = makePrisma()
    prisma.$queryRaw.mockResolvedValue([{ clubId: 'club-1', enabled: true, messageRetentionDays: 180, attachmentRetentionDays: 90 }])
    prisma.message.findMany = jest.fn().mockResolvedValue([])
    prisma.directMessage.findMany = jest.fn().mockResolvedValue([])
    await new ChatRetentionWorker(prisma, makeR2() as never).purgeExpired(now)
    expect(prisma.message.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      OR: expect.arrayContaining([{ createdAt: { lte: new Date('2026-06-10T12:00:00.000Z') } }]),
    }) }))
  })

  it('preserves unproven legacy attachments instead of deleting or clearing them', async () => {
    const prisma = makePrisma()
    const r2 = makeR2()

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    await expect(worker.purgeExpired(now)).rejects.toThrow('requires provenance review')
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clubId: 'club-1',
          attachmentUrl: { not: null },
          reports: { none: { resolvedAt: null } },
          OR: expect.arrayContaining([
            { createdAt: { lte: new Date('2026-09-01T12:00:00.000Z') } },
            { createdAt: { lte: new Date('2026-08-09T12:00:00.000Z') }, deletedAt: null },
          ]),
        }),
        select: { id: true, attachmentUrl: true },
        take: 500,
      }),
    )
    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
  })

  it('skips clubs without explicit enabled retention settings', async () => {
    const prisma = makePrisma({
      club: { findMany: jest.fn().mockResolvedValue([{ id: 'club-3', chatRetentionSettings: null }]) },
    })
    const r2 = makeR2()

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    const result = await worker.purgeExpired(now)

    expect(result).toEqual({ messagesDeleted: 0, attachmentsPurged: 0 })
    expect(prisma.message.findMany).not.toHaveBeenCalled()
    expect(prisma.directMessage.updateMany).not.toHaveBeenCalled()
  })

  it('continues other clubs after a legacy attachment blocks one club', async () => {
    const prisma = makePrisma({ club: { findMany: jest.fn().mockResolvedValue([
      { id: 'club-1', chatRetentionSettings: { clubId: 'club-1', enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 } },
      { id: 'club-2', chatRetentionSettings: { clubId: 'club-2', enabled: true, messageRetentionDays: 30, attachmentRetentionDays: 7 } },
    ]) } })
    // Exercise the real guard for the first club; the second has no eligible rows.
    prisma.message.findMany = jest.fn().mockResolvedValueOnce([{ id: 'a', attachmentUrl: 'https://unknown.invalid/a.png' }])
      .mockResolvedValueOnce([{ id: 'a', attachmentUrl: 'https://unknown.invalid/a.png' }]).mockResolvedValue([])
    prisma.directMessage.findMany = jest.fn().mockResolvedValue([])
    const worker = new ChatRetentionWorker(prisma, makeR2() as never)
    await expect(worker.purgeExpired(now)).rejects.toThrow('requires provenance review')
    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clubId: 'club-2' }) }))
  })

  it('fails closed and keeps DB pointers retryable when owned object deletion cannot run', async () => {
    const prisma = makePrisma()
    const r2 = makeR2({ enabled: false })

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    await expect(worker.purgeExpired(now)).rejects.toThrow('requires provenance review')

    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
    expect(prisma.directMessage.updateMany).not.toHaveBeenCalled()
  })

  it('does not clear any legacy attachment batch without uploader provenance', async () => {
    const firstBatch = Array.from({ length: 500 }, (_, index) => ({
      id: `batch-a-${index}`,
      attachmentUrl: `https://cdn.example/chat/club-1/a-${index}.jpg`,
    }))
    const secondBatch = Array.from({ length: 501 }, (_, index) => ({
      id: `batch-b-${index}`,
      attachmentUrl: `https://cdn.example/chat/club-1/b-${index}.jpg`,
    }))
    const prisma = makePrisma()
    prisma.message.findMany = jest
      .fn()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch.slice(0, 500))
      .mockResolvedValueOnce(secondBatch.slice(0, 500))
      .mockResolvedValueOnce(secondBatch.slice(500))
      .mockResolvedValueOnce(secondBatch.slice(500))
      .mockResolvedValueOnce([])
      .mockResolvedValue([])
    prisma.message.updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 500 })
      .mockResolvedValueOnce({ count: 500 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
    prisma.messageTranslation.deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    prisma.pollVote.deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    prisma.pollOption.deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    prisma.poll.deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    prisma.directMessage.updateMany = jest.fn().mockResolvedValue({ count: 0 })
    prisma.directMessageTranslation.deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    const r2 = makeR2()

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    await expect(worker.purgeExpired(now)).rejects.toThrow('requires provenance review')
    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
  })

  it('cleans translations and poll children for messages deleted before the retention sweep', async () => {
    const prisma = makePrisma()
    prisma.message.findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'pre-deleted-poll' }])
      .mockResolvedValue([])
    prisma.message.updateMany = jest.fn().mockResolvedValue({ count: 0 })
    prisma.directMessage.findMany = jest.fn().mockResolvedValue([])
    const r2 = makeR2()

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    const result = await worker.purgeExpired(now)

    expect(result).toEqual({ messagesDeleted: 0, attachmentsPurged: 0 })
    expect(prisma.$executeRaw.mock.calls.some((call: unknown[]) => String(call[1]).includes('chat-message:pre-deleted-poll'))).toBe(true)
    const protectedDeletedMessage = {
      clubId: 'club-1',
      deletedAt: { not: null },
      createdAt: { lte: new Date('2026-08-09T12:00:00.000Z') },
      reports: { none: { resolvedAt: null } },
    }
    expect(prisma.messageTranslation.deleteMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ['pre-deleted-poll'] },
        message: protectedDeletedMessage,
      },
    })
    expect(prisma.pollVote.deleteMany).toHaveBeenCalledWith({
      where: {
        poll: {
          messageId: { in: ['pre-deleted-poll'] },
          message: protectedDeletedMessage,
        },
      },
    })
    expect(prisma.pollOption.deleteMany).toHaveBeenCalledWith({
      where: {
        poll: {
          messageId: { in: ['pre-deleted-poll'] },
          message: protectedDeletedMessage,
        },
      },
    })
    expect(prisma.poll.deleteMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ['pre-deleted-poll'] },
        message: protectedDeletedMessage,
      },
    })
  })

  it('leaves selected attachment rows retryable when object deletion fails', async () => {
    const prisma = makePrisma()
    const r2 = makeR2({ deleteObjects: jest.fn().mockRejectedValue(new Error('r2 timeout')) })

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    await expect(worker.purgeExpired(now)).rejects.toThrow('requires provenance review')
    expect(r2.deleteObjects).not.toHaveBeenCalled()

    expect(prisma.message.updateMany).not.toHaveBeenCalled()
    expect(prisma.directMessage.updateMany).not.toHaveBeenCalled()
  })

  it('preserves unproven DM attachment references, including reported ones (FakePrisma)', async () => {
    const { CHAT_FAKE_SCHEMA, FakePrisma } = await import('../test-utils/fake-prisma')
    const now = new Date('2026-09-24T12:00:00Z')
    const old = new Date('2026-06-01T12:00:00Z')
    const prisma = new FakePrisma(
      {
        ...CHAT_FAKE_SCHEMA,
        club: {},
        messageTranslation: {},
        directMessageTranslation: {},
        pollVote: {},
        pollOption: {},
        poll: {},
      },
      {
        club: [{ id: 'club-1' }],
        conversation: [
          { id: 'conv-1', clubId: 'club-1' },
          { id: 'conv-x', clubId: 'club-2' },
        ],
        directMessage: [
          { id: 'dm-old', conversationId: 'conv-1', senderId: 'u', content: '', messageType: 'IMAGE', attachmentUrl: 'https://cdn.example/dm/club-1/conv-1/image/a.jpg', attachmentMeta: {}, deletedAt: null, createdAt: old },
          { id: 'dm-reported', conversationId: 'conv-1', senderId: 'u', content: '', messageType: 'IMAGE', attachmentUrl: 'https://cdn.example/dm/club-1/conv-1/image/b.jpg', attachmentMeta: {}, deletedAt: null, createdAt: old },
          { id: 'dm-fresh', conversationId: 'conv-1', senderId: 'u', content: '', messageType: 'FILE', attachmentUrl: 'https://cdn.example/dm/club-1/conv-1/file/c.pdf', attachmentMeta: {}, deletedAt: null, createdAt: now },
          { id: 'dm-other-club', conversationId: 'conv-x', senderId: 'u', content: '', messageType: 'IMAGE', attachmentUrl: 'https://cdn.example/dm/club-2/conv-x/image/d.jpg', attachmentMeta: {}, deletedAt: null, createdAt: old },
        ],
        directMessageReport: [{ id: 'r1', directMessageId: 'dm-reported', resolvedAt: null }],
        message: [],
      },
    )
    ;(prisma as any).club.findMany = jest.fn().mockResolvedValue([
      {
        id: 'club-1',
        chatRetentionSettings: { clubId: 'club-1', enabled: true, messageRetentionDays: 365, attachmentRetentionDays: 30 },
      },
    ])
    prisma.queryRawResult = [{ clubId: 'club-1', enabled: true, messageRetentionDays: 365, attachmentRetentionDays: 30 }]
    const r2 = makeR2()
    const worker = new ChatRetentionWorker(prisma as never, r2 as never)
    await expect(worker.purgeExpired(now)).rejects.toThrow('requires provenance review')
    expect(r2.deleteObjects).not.toHaveBeenCalled()
    const byId = new Map(prisma.rows('directMessage').map((m) => [m.id, m]))
    expect(byId.get('dm-old')!.attachmentUrl).not.toBeNull()
    expect(byId.get('dm-reported')!.attachmentUrl).not.toBeNull()
    expect(byId.get('dm-fresh')!.attachmentUrl).not.toBeNull()
    expect(byId.get('dm-other-club')!.attachmentUrl).not.toBeNull()
  })
})
