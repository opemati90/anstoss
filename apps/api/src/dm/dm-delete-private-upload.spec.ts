import { DmService } from './dm.service'

describe('DM deletion and private uploads', () => {
  const upload = { id: 'upload', clubId: 'club', ownerId: 'sender', messageId: 'message', targetType: 'DM', targetId: 'conversation', state: 'ATTACHED', cancelRequestedAt: null }
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    privateMediaUpload: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    directMessage: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    accountMediaDeletion: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  }
  const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) }
  let service: DmService

  beforeEach(() => {
    jest.clearAllMocks()
    tx.privateMediaUpload.findUnique.mockResolvedValue(upload)
    tx.privateMediaUpload.findFirst.mockResolvedValue(upload)
    tx.privateMediaUpload.updateMany.mockResolvedValue({ count: 1 })
    tx.directMessage.findUnique.mockResolvedValue({ senderId: 'sender', conversationId: 'conversation',
      attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/upload', reports: [] })
    service = new DmService(prisma as never, {} as never)
    jest.spyOn(service as any, 'assertDmMessageAccess').mockResolvedValue({ senderId: 'sender' })
    jest.spyOn(service, 'assertConversationAccess').mockResolvedValue({ clubId: 'club', peerUserId: 'peer' })
    jest.spyOn(service as any, 'loadItem').mockResolvedValue({ id: 'message' })
  })

  it('retires the attachment before clearing the message in one transaction', async () => {
    await service.deleteMessage('sender', 'club', 'conversation', 'message')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.privateMediaUpload.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.directMessage.update.mock.invocationCallOrder[0])
  })

  it('fails closed if the private attachment has no ledger binding', async () => {
    tx.privateMediaUpload.findUnique.mockResolvedValue(null)
    await expect(service.deleteMessage('sender', 'club', 'conversation', 'message')).rejects.toThrow('binding is unavailable')
    expect(tx.directMessage.update).not.toHaveBeenCalled()
  })

  it('does not delete when access is revoked before the transactional recheck', async () => {
    jest.spyOn(service, 'assertConversationAccess').mockRejectedValue(new Error('access revoked'))
    await expect(service.deleteMessage('sender', 'club', 'conversation', 'message')).rejects.toThrow('access revoked')
    expect(tx.directMessage.update).not.toHaveBeenCalled()
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('does not retire a legacy DM upload without proving who uploaded it', async () => {
    const key = 'dm/club/conversation/image/private-v1-test.png'
    tx.directMessage.findUnique.mockResolvedValue({ senderId: 'sender', conversationId: 'conversation', attachmentUrl: `https://private-media.anstoss.invalid/${key}`, reports: [{ id: 'unpurged' }] })
    const r2 = { objectKeyFromUrl: jest.fn().mockReturnValue(key), deleteObjects: jest.fn() }
    service = new DmService(prisma as never, {} as never, r2 as never)
    jest.spyOn(service as any, 'assertDmMessageAccess').mockResolvedValue({ senderId: 'sender' })
    jest.spyOn(service, 'assertConversationAccess').mockResolvedValue({ clubId: 'club', peerUserId: 'peer' })
    jest.spyOn(service as any, 'loadItem').mockResolvedValue({ id: 'message' })
    await expect(service.deleteMessage('sender', 'club', 'conversation', 'message')).rejects.toThrow('needs review')
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
    expect(tx.directMessage.update).not.toHaveBeenCalled()
    expect(r2.deleteObjects).not.toHaveBeenCalled()
  })
})
