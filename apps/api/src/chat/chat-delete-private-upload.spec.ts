import { ChatService } from './chat.service'

describe('channel message deletion and private uploads', () => {
  const message = { id: 'message', clubId: 'club', teamId: 'team', channelId: 'channel', senderId: 'sender',
    attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/upload' }
  const upload = { id: 'upload', clubId: 'club', ownerId: 'sender', messageId: 'message', targetType: 'CHANNEL', targetId: 'channel', state: 'ATTACHED', cancelRequestedAt: null }
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    privateMediaUpload: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
    teamAccess: { findFirst: jest.fn().mockResolvedValue(null) },
    message: { findUnique: jest.fn().mockResolvedValue(message), update: jest.fn().mockResolvedValue({}) },
    accountMediaDeletion: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  }
  const prisma = {
    message: { findUnique: jest.fn().mockResolvedValue(message) },
    teamAccess: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn) => fn(tx)),
  }
  const gateway = { broadcastChatEvent: jest.fn() }
  const channels = { getChannelAccess: jest.fn().mockResolvedValue({ canRead: true, isManager: false, channel: { clubId: 'club', teamId: 'team' } }) }
  let service: ChatService

  beforeEach(() => {
    jest.clearAllMocks()
    tx.privateMediaUpload.findUnique.mockResolvedValue(upload)
    tx.privateMediaUpload.findFirst.mockResolvedValue(upload)
    tx.privateMediaUpload.updateMany.mockResolvedValue({ count: 1 })
    tx.user.findUnique.mockResolvedValue({ deletedAt: null })
    tx.teamAccess.findFirst.mockResolvedValue(null)
    tx.message.findUnique.mockResolvedValue(message)
    channels.getChannelAccess.mockResolvedValue({ canRead: true, isManager: false, channel: { clubId: 'club', teamId: 'team' } })
    service = new ChatService(prisma as never, {} as never, gateway as never, {} as never, channels as never, {} as never)
    jest.spyOn(service, 'serializeMessage').mockResolvedValue({ id: 'message' } as never)
  })

  it('cancels the bound upload before clearing the message in the same transaction', async () => {
    await service.deleteMessage('sender', 'message')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.privateMediaUpload.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.message.update.mock.invocationCallOrder[0])
    expect(gateway.broadcastChatEvent).toHaveBeenCalledTimes(1)
  })

  it('does not clear or broadcast a message with an inconsistent upload binding', async () => {
    tx.privateMediaUpload.findUnique.mockResolvedValue({ ...upload, clubId: 'different-club' })
    await expect(service.deleteMessage('sender', 'message')).rejects.toThrow('binding is inconsistent')
    expect(tx.message.update).not.toHaveBeenCalled()
    expect(gateway.broadcastChatEvent).not.toHaveBeenCalled()
  })

  it('rechecks channel access after lifecycle locks and refuses a revoked sender', async () => {
    channels.getChannelAccess
      .mockResolvedValueOnce({ canRead: true, channel: { clubId: 'club' } })
      .mockResolvedValueOnce({ canRead: false, channel: { clubId: 'club' } })

    await expect(service.deleteMessage('sender', 'message')).rejects.toThrow('Forbidden for this channel')
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
    expect(tx.message.update).not.toHaveBeenCalled()
  })

  it('does not grant delete authority when current channel policy rejects the coach', async () => {
    tx.message.findUnique.mockResolvedValue({ ...message, senderId: 'another-user' })
    channels.getChannelAccess.mockResolvedValue({
      canRead: true,
      isManager: false,
      channel: { clubId: 'club', teamId: 'team' },
    })

    await expect(service.deleteMessage('coach', 'message')).rejects.toThrow(
      'Only the sender or a coach can delete',
    )
    expect(tx.message.update).not.toHaveBeenCalled()
  })

  it('does not let a coach of the storage-anchor team moderate a club-wide channel', async () => {
    tx.message.findUnique.mockResolvedValue({ ...message, senderId: 'another-user' })
    tx.teamAccess.findFirst.mockResolvedValue({ role: 'HEAD_COACH', phase: 'FULL' })
    channels.getChannelAccess.mockResolvedValue({
      canRead: true,
      isManager: false,
      channel: { clubId: 'club', teamId: null },
    })

    await expect(service.deleteMessage('coach', 'message')).rejects.toThrow(
      'Only the sender or a coach can delete',
    )
    expect(tx.teamAccess.findFirst).not.toHaveBeenCalled()
    expect(tx.message.update).not.toHaveBeenCalled()
  })

  it('does not delete an unproven same-team upload belonging to another member', async () => {
    const key = 'chat/club/team/image/private-v1-test.png'
    tx.message.findUnique.mockResolvedValue({ ...message, attachmentUrl: `https://private-media.anstoss.invalid/${key}` })
    tx.privateMediaUpload.findUnique.mockResolvedValue(null)
    const r2 = { objectKeyFromUrl: jest.fn().mockReturnValue(key) }
    service = new ChatService(prisma as never, {} as never, gateway as never, {} as never, channels as never, {} as never, r2 as never)
    jest.spyOn(service, 'serializeMessage').mockResolvedValue({ id: 'message' } as never)
    await expect(service.deleteMessage('sender', 'message')).rejects.toThrow('needs review')
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
    expect(tx.message.update).not.toHaveBeenCalled()
  })
})
