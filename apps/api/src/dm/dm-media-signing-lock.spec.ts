import { DmService } from './dm.service'

describe('DM media signing', () => {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(0), directMessage: { findFirst: jest.fn() } }
  const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) }
  const r2 = { enabled: true, objectKeyFromUrl: jest.fn(), presignGet: jest.fn() }
  let service: DmService
  beforeEach(() => {
    jest.clearAllMocks()
    service = new DmService(prisma as never, {} as never, r2 as never)
    jest.spyOn(service, 'authorizePrivateMediaRead').mockResolvedValue({ userId: 'reader', clubId: 'club', targetType: 'DM', targetId: 'conversation' })
    tx.directMessage.findFirst.mockResolvedValue({ attachmentUrl: 'https://private-media.anstoss.invalid/dm/club/conversation/image/private-v1-file', deletedAt: null })
    r2.objectKeyFromUrl.mockReturnValue('dm/club/conversation/image/private-v1-file')
    r2.presignGet.mockResolvedValue('signed')
  })
  it('holds authorization and message locks through signing', async () => {
    await expect(service.getMediaUrl('reader', 'club', 'conversation', 'message')).resolves.toEqual({ url: 'signed' })
    expect(service.authorizePrivateMediaRead).toHaveBeenCalledWith('reader', 'club', 'conversation', tx)
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(r2.presignGet.mock.invocationCallOrder[0])
    expect(tx.directMessage.findFirst.mock.invocationCallOrder[0]).toBeLessThan(r2.presignGet.mock.invocationCallOrder[0])
  })
  it('never signs after authorization is revoked or a message is deleted', async () => {
    jest.spyOn(service, 'authorizePrivateMediaRead').mockRejectedValueOnce(new Error('revoked'))
    await expect(service.getMediaUrl('reader', 'club', 'conversation', 'message')).rejects.toThrow('revoked')
    expect(r2.presignGet).not.toHaveBeenCalled()
    tx.directMessage.findFirst.mockResolvedValueOnce({ attachmentUrl: 'old', deletedAt: new Date() })
    await expect(service.getMediaUrl('reader', 'club', 'conversation', 'message')).resolves.toEqual({ url: null })
    expect(r2.presignGet).not.toHaveBeenCalled()
  })
})
