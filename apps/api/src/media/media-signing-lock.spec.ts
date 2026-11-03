import { MediaController } from './media.controller'

describe('channel media signing', () => {
  const message = { clubId: 'club', teamId: 'team', channelId: 'channel', deletedAt: null, attachmentUrl: 'https://private-media.anstoss.invalid/chat/club/team/image/private-v1-file' }
  const tx = { $executeRaw: jest.fn().mockResolvedValue(0), message: { findUnique: jest.fn() } }
  const prisma = { message: { findUnique: jest.fn() }, $transaction: jest.fn(async (fn) => fn(tx)) }
  const channels = { authorizePrivateUpload: jest.fn() }
  const teams = { assertReadableAccess: jest.fn() }
  const r2 = { enabled: true, objectKeyFromUrl: jest.fn(), presignGet: jest.fn() }
  let controller: MediaController
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.message.findUnique.mockResolvedValue(message)
    tx.message.findUnique.mockResolvedValue(message)
    channels.authorizePrivateUpload.mockResolvedValue({})
    r2.objectKeyFromUrl.mockReturnValue('chat/club/team/image/private-v1-file')
    r2.presignGet.mockResolvedValue('signed')
    teams.assertReadableAccess.mockResolvedValue({})
    controller = new MediaController(teams as never, r2 as never, channels as never, prisma as never)
  })
  it('holds channel and message locks through signing', async () => {
    await expect(controller.getMessageMediaUrl({ id: 'reader' }, 'message')).resolves.toEqual({ url: 'signed' })
    expect(channels.authorizePrivateUpload).toHaveBeenCalledWith('reader', 'club', 'team', 'channel', 'read', tx)
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(r2.presignGet.mock.invocationCallOrder[0])
  })
  it('does not sign after channel revocation or message deletion', async () => {
    channels.authorizePrivateUpload.mockRejectedValueOnce(new Error('revoked'))
    await expect(controller.getMessageMediaUrl({ id: 'reader' }, 'message')).rejects.toThrow('revoked')
    tx.message.findUnique.mockResolvedValueOnce({ ...message, deletedAt: new Date() })
    await expect(controller.getMessageMediaUrl({ id: 'reader' }, 'message')).resolves.toEqual({ url: null })
    expect(r2.presignGet).not.toHaveBeenCalled()
  })
  it('does not issue a capability for legacy unchannelled media', async () => {
    prisma.message.findUnique.mockResolvedValueOnce({ ...message, channelId: null })
    await expect(controller.getMessageMediaUrl({ id: 'reader' }, 'message')).resolves.toEqual({ url: null })
    expect(teams.assertReadableAccess).toHaveBeenCalledWith('reader', 'team')
    expect(r2.presignGet).not.toHaveBeenCalled()
  })
})
