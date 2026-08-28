import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ModerationService } from './moderation.service'

describe('ModerationService direct-message reports', () => {
  function makeService() {
    const prisma = {
      directMessage: { findFirst: jest.fn() },
      directMessageReport: { create: jest.fn().mockResolvedValue({ id: 'report-1' }) },
    }
    return {
      prisma,
      service: new ModerationService(prisma as never, {} as never, {} as never),
    }
  }

  it('stores a report only when the reporter belongs to the conversation', async () => {
    const { prisma, service } = makeService()
    prisma.directMessage.findFirst.mockResolvedValue({
      id: 'dm-1',
      senderId: 'other-1',
      content: 'Preserved abusive content',
    })

    await expect(
      service.reportDirectMessage('user-1', 'dm-1', { reason: 'ABUSE' }),
    ).resolves.toEqual({ ok: true })
    expect(prisma.directMessage.findFirst).toHaveBeenCalledWith({
      where: { id: 'dm-1', conversation: { participants: { some: { userId: 'user-1' } } } },
      select: { id: true, senderId: true, content: true },
    })
    expect(prisma.directMessageReport.create).toHaveBeenCalledWith({
      data: {
        directMessageId: 'dm-1',
        reporterUserId: 'user-1',
        reason: 'ABUSE',
        evidenceContent: 'Preserved abusive content',
      },
    })
  })

  it('rejects an outsider and the sender reporting their own message', async () => {
    const { prisma, service } = makeService()
    prisma.directMessage.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.reportDirectMessage('outsider', 'dm-1', { reason: 'SPAM' }),
    ).rejects.toBeInstanceOf(NotFoundException)

    prisma.directMessage.findFirst.mockResolvedValueOnce({ id: 'dm-1', senderId: 'user-1' })
    await expect(
      service.reportDirectMessage('user-1', 'dm-1', { reason: 'SPAM' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.directMessageReport.create).not.toHaveBeenCalled()
  })
})

describe('ModerationService channel-message reports', () => {
  it('preserves the message and stores immutable evidence for moderator review', async () => {
    const prisma = {
      message: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          teamId: 'team-1',
          channelId: 'channel-1',
          senderId: 'sender-1',
          deletedAt: null,
          content: 'Important club announcement',
          attachmentUrl: 'https://assets.anstoss.io/public/chat/evidence.png',
          attachmentMeta: { type: 'image/png' },
        }),
        update: jest.fn(),
      },
      messageReport: { create: jest.fn().mockResolvedValue({ id: 'report-1' }) },
    }
    const teams = { assertReadableAccess: jest.fn() }
    const channels = { listForUser: jest.fn().mockResolvedValue([{ id: 'channel-1' }]) }
    const service = new ModerationService(prisma as never, teams as never, channels as never)

    await expect(
      service.reportMessage('reporter-1', 'message-1', { reason: 'ABUSE' }),
    ).resolves.toEqual({ ok: true, hidden: false })
    expect(prisma.messageReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: 'message-1',
        reporterUserId: 'reporter-1',
        evidenceContent: 'Important club announcement',
        evidenceAttachmentUrl: 'https://assets.anstoss.io/public/chat/evidence.png',
        evidenceAttachmentMeta: { type: 'image/png' },
      }),
    })
    expect(prisma.message.update).not.toHaveBeenCalled()
  })
})
