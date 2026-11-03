import type { Prisma } from '@prisma/client'
import { retireLegacyChatMedia } from './legacy-chat-media-retirement'
import { R2Provider } from './r2.provider'
import { newOwnedPrivateV1Key } from '../media/private-v1-owner'

describe('legacy chat media retirement', () => {
  const key = 'chat/club/team/image/private-v1-test.png'
  const url = `https://private-media.anstoss.invalid/${key}`
  const tx = { $executeRaw: jest.fn(), accountMediaDeletion: { createMany: jest.fn() } }
  const r2 = { objectKeyFromUrl: jest.fn() }
  const retire = (value: string | null, provider = r2 as unknown as R2Provider) => retireLegacyChatMedia(
    tx as unknown as Prisma.TransactionClient, provider, value, { kind: 'chat', clubId: 'club', targetId: 'team' },
  )
  beforeEach(() => {
    jest.clearAllMocks()
    r2.objectKeyFromUrl.mockReturnValue(key)
    tx.accountMediaDeletion.createMany.mockResolvedValue({ count: 1 })
  })

  it('does not retire a same-team object without authenticated uploader provenance', async () => {
    await expect(retire(url)).rejects.toThrow('needs review')
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
  })

  it('locks and queues a newly issued sender-bound object for durable retirement', async () => {
    const owned = newOwnedPrivateV1Key({ targetType: 'chat', clubId: 'club', targetId: 'team', ownerId: 'sender', kind: 'image' }, 'photo.jpg')
    r2.objectKeyFromUrl.mockReturnValue(owned)
    await retireLegacyChatMedia(tx as unknown as Prisma.TransactionClient, r2 as unknown as R2Provider, url,
      { kind: 'chat', clubId: 'club', targetId: 'team', senderId: 'sender', messageType: 'IMAGE' })
    expect(tx.$executeRaw).toHaveBeenCalled()
    expect(tx.accountMediaDeletion.createMany).toHaveBeenCalledWith({ data: [{ objectKey: owned }], skipDuplicates: true })
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.accountMediaDeletion.createMany.mock.invocationCallOrder[0])
  })

  it('never retires a newly issued object under another sender or type', async () => {
    const owned = newOwnedPrivateV1Key({ targetType: 'chat', clubId: 'club', targetId: 'team', ownerId: 'sender', kind: 'image' }, 'photo.jpg')
    r2.objectKeyFromUrl.mockReturnValue(owned)
    for (const [senderId, messageType] of [['other', 'IMAGE'], ['sender', 'FILE']]) {
      await expect(retireLegacyChatMedia(tx as unknown as Prisma.TransactionClient, r2 as unknown as R2Provider, url,
        { kind: 'chat', clubId: 'club', targetId: 'team', senderId, messageType })).rejects.toThrow('needs review')
    }
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
  })

  it('fails closed for unavailable or cross-scope private objects', async () => {
    await expect(retireLegacyChatMedia(tx as unknown as Prisma.TransactionClient, undefined, url, { kind: 'chat', clubId: 'club', targetId: 'team' })).rejects.toThrow()
    r2.objectKeyFromUrl.mockReturnValue('chat/another/team/image/private-v1-test.png')
    await expect(retire(url)).rejects.toThrow()
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
  })

  it('preserves unknown historical public references when storage configuration changes', async () => {
    r2.objectKeyFromUrl.mockReturnValue(null)
    await expect(retire('https://old-media.example/chat/club/team/image/photo.png')).rejects.toThrow('cleanup is unavailable')
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
  })

  it('does not put v2 lifecycle objects into the legacy queue', async () => {
    await retire('https://private-media.anstoss.invalid/private-chat/v2/example')
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
  })
})
