import { ChatRetentionWorker } from './chat-retention.worker'

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
      findMany: jest.fn().mockResolvedValueOnce([{ id: 'dm-1' }]).mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    directMessageTranslation: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
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

  it('soft-deletes expired channel and DM messages while clearing only selected attachments after object deletion', async () => {
    const prisma = makePrisma()
    const r2 = makeR2()

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    const result = await worker.purgeExpired(now)

    expect(result).toEqual({ messagesDeleted: 3, attachmentsPurged: 2 })
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
    expect(r2.deleteObjects).toHaveBeenCalledWith(['chat/club-1/a.jpg'])
    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        clubId: 'club-1',
        id: { in: ['msg-1', 'msg-2'] },
        attachmentUrl: { not: null },
        reports: { none: { resolvedAt: null } },
      },
      data: { attachmentUrl: null, attachmentMeta: null },
    })
    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          clubId: 'club-1',
          deletedAt: null,
          reports: { none: { resolvedAt: null } },
        }),
        data: expect.objectContaining({
          content: '',
          attachmentUrl: null,
          attachmentMeta: null,
          deletedAt: now,
        }),
      }),
    )
    expect(prisma.pollVote.deleteMany).toHaveBeenCalledWith({
      where: {
        poll: {
          messageId: { in: ['old-msg-1', 'old-msg-2'] },
          message: { clubId: 'club-1', deletedAt: now },
        },
      },
    })
    expect(prisma.pollOption.deleteMany).toHaveBeenCalledWith({
      where: {
        poll: {
          messageId: { in: ['old-msg-1', 'old-msg-2'] },
          message: { clubId: 'club-1', deletedAt: now },
        },
      },
    })
    expect(prisma.poll.deleteMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ['old-msg-1', 'old-msg-2'] },
        message: { clubId: 'club-1', deletedAt: now },
      },
    })
    expect(prisma.messageTranslation.deleteMany).toHaveBeenCalledWith({
      where: {
        messageId: { in: ['old-msg-1', 'old-msg-2'] },
        message: { clubId: 'club-1', deletedAt: now },
      },
    })
    expect(prisma.directMessageTranslation.deleteMany).toHaveBeenCalledWith({
      where: {
        directMessageId: { in: ['dm-1'] },
        directMessage: {
          deletedAt: now,
          conversation: { clubId: 'club-1' },
        },
      },
    })
    expect(prisma.directMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          reports: { none: { resolvedAt: null } },
          conversation: { clubId: 'club-1' },
        }),
        data: { content: '', deletedAt: now },
      }),
    )
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

  it('fails closed and keeps DB pointers retryable when owned object deletion cannot run', async () => {
    const prisma = makePrisma()
    const r2 = makeR2({ enabled: false })

    const worker = new ChatRetentionWorker(prisma, r2 as never)
    await expect(worker.purgeExpired(now)).rejects.toThrow('R2 is not configured')

    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(prisma.message.updateMany).not.toHaveBeenCalled()
    expect(prisma.directMessage.updateMany).not.toHaveBeenCalled()
  })

  it('processes more than one attachment batch without clearing unselected rows', async () => {
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
    const result = await worker.purgeExpired(now)

    expect(result.attachmentsPurged).toBe(1001)
    expect(r2.deleteObjects).toHaveBeenCalledTimes(3)
    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ id: { in: firstBatch.map((m) => m.id) } }) }),
    )
    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: secondBatch.slice(0, 500).map((m) => m.id) } }),
      }),
    )
    expect(prisma.message.updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [secondBatch[500].id] } }),
      }),
    )
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
    expect(String(prisma.$executeRaw.mock.calls[0][1])).toContain('chat-message:pre-deleted-poll')
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
    await expect(worker.purgeExpired(now)).rejects.toThrow('r2 timeout')

    expect(prisma.message.updateMany).not.toHaveBeenCalled()
    expect(prisma.directMessage.updateMany).not.toHaveBeenCalled()
  })
})
