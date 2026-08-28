import { ModerationService } from './moderation.service'

describe('Admin ModerationService', () => {
  const actor = {
    id: 'admin-1',
    email: 'admin@anstoss.io',
    name: 'Admin',
    authMethod: 'session' as const,
  }

  function createService() {
    const prisma = {
      directMessageReport: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
      },
      directMessage: { update: jest.fn() },
      message: { update: jest.fn() },
      auditLog: { create: jest.fn() },
      messageReport: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
      },
      userBlock: { findMany: jest.fn() },
      $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    )
    return {
      prisma,
      service: new ModerationService(prisma as never),
    }
  }

  it('merges channel and direct-message reports into one newest-first queue', async () => {
    const { prisma, service } = createService()
    prisma.messageReport.findMany.mockResolvedValueOnce([
      {
        id: 'channel-report',
        createdAt: new Date('2026-08-28T10:00:00Z'),
        message: { id: 'm-1', clubId: 'club-1' },
      },
    ])
    prisma.directMessageReport.findMany.mockResolvedValueOnce([
      {
        id: 'direct-report',
        createdAt: new Date('2026-08-28T11:00:00Z'),
        directMessage: {
          id: 'dm-1',
          content: 'reported content',
          createdAt: new Date('2026-08-28T10:59:00Z'),
          sender: { id: 'sender-1', name: 'Sender', email: null },
          conversation: { clubId: 'club-1' },
        },
      },
    ])

    await expect(service.listReports({ resolved: false })).resolves.toEqual([
      expect.objectContaining({
        id: 'direct-report',
        kind: 'direct',
        message: expect.objectContaining({ id: 'dm-1', clubId: 'club-1' }),
      }),
      expect.objectContaining({ id: 'channel-report', kind: 'channel' }),
    ])
  })

  it('resolves and audits a direct-message report when no channel report matches', async () => {
    const { prisma, service } = createService()
    prisma.directMessageReport.findUnique.mockResolvedValueOnce({
      id: 'direct-report',
      evidenceContent: 'reported content',
      directMessage: {
        id: 'dm-1',
        conversation: { clubId: 'club-1' },
      },
    })
    prisma.directMessageReport.updateMany.mockResolvedValueOnce({ count: 1 })
    prisma.directMessageReport.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'direct-report',
      resolution: 'warned sender',
    })

    await expect(service.resolveReport('direct-report', actor, 'warned sender')).resolves.toEqual(
      expect.objectContaining({ resolution: 'warned sender' }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: 'club-1',
        metadata: expect.objectContaining({ messageKind: 'direct', messageId: 'dm-1' }),
      }),
    })
  })

  it('removes a reported channel message only after an explicit audited admin action', async () => {
    const { prisma, service } = createService()
    prisma.messageReport.findUnique.mockResolvedValueOnce({
      id: 'channel-report',
      evidenceContent: 'Original evidence',
      evidenceAttachmentUrl: null,
      evidenceAttachmentMeta: null,
      message: { id: 'message-1', clubId: 'club-1' },
    })
    prisma.messageReport.updateMany.mockResolvedValueOnce({ count: 1 })
    prisma.messageReport.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'channel-report',
      resolution: 'violated club safety policy',
    })

    await service.resolveReport('channel-report', actor, 'violated club safety policy', 'remove')

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: expect.objectContaining({ deletedAt: expect.any(Date), content: '' }),
    })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: expect.objectContaining({ action: 'remove' }) }),
    })
  })

  it('allows only one moderator to resolve a report', async () => {
    const { prisma, service } = createService()
    prisma.messageReport.findUnique.mockResolvedValueOnce({
      id: 'channel-report',
      evidenceContent: 'Evidence',
      evidenceAttachmentUrl: null,
      evidenceAttachmentMeta: null,
      message: { id: 'message-1', clubId: 'club-1' },
    })
    prisma.messageReport.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(service.resolveReport('channel-report', actor, 'late action', 'remove')).rejects.toThrow(
      'Report has already been resolved',
    )
    expect(prisma.message.update).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).not.toHaveBeenCalled()
  })
})
