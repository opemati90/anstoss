import type { Prisma } from '@prisma/client'
import { retireMessageUpload } from './private-upload-retirement'

describe('retireMessageUpload', () => {
  const binding = { clubId: 'club', messageId: 'message', targetType: 'CHANNEL' as const, targetId: 'channel' }
  const upload = { id: 'upload', clubId: 'club', ownerId: 'sender', messageId: 'message', targetType: 'CHANNEL', targetId: 'channel', state: 'ATTACHED', cancelRequestedAt: null }
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    privateMediaUpload: {
      findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(),
    },
  }
  const client = tx as unknown as Prisma.TransactionClient

  beforeEach(() => {
    jest.clearAllMocks()
    tx.privateMediaUpload.findUnique.mockResolvedValue(upload)
    tx.privateMediaUpload.findFirst.mockResolvedValue(upload)
    tx.privateMediaUpload.updateMany.mockResolvedValue({ count: 1 })
  })

  it('locks the message and upload and schedules the attached object for cleanup', async () => {
    await expect(retireMessageUpload(client, binding)).resolves.toBe(true)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2)
    expect(tx.privateMediaUpload.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'upload', clubId: 'club', ownerId: 'sender' },
      data: expect.objectContaining({ cancelRequestedAt: expect.any(Date) }),
    }))
  })

  it('does nothing for a legacy message without a v2 upload', async () => {
    tx.privateMediaUpload.findUnique.mockResolvedValue(null)
    await expect(retireMessageUpload(client, binding)).resolves.toBe(false)
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it.each(['REMOVING', 'REMOVED'])('accepts an idempotent retry while upload is %s', async (state) => {
    tx.privateMediaUpload.findUnique.mockResolvedValue({ ...upload, state, cancelRequestedAt: new Date() })
    await expect(retireMessageUpload(client, binding)).resolves.toBe(true)
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    { clubId: 'another' }, { targetType: 'DM' }, { targetId: 'another' }, { state: 'READY' },
  ])('rejects inconsistent bindings and never schedules the wrong upload: %o', async (change) => {
    tx.privateMediaUpload.findUnique.mockResolvedValue({ ...upload, ...change })
    await expect(retireMessageUpload(client, binding)).rejects.toThrow('binding is inconsistent')
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('aborts when the upload disappeared between lookup and lock', async () => {
    tx.privateMediaUpload.findFirst.mockResolvedValue(null)
    await expect(retireMessageUpload(client, binding)).rejects.toThrow('retirement failed')
  })
})
