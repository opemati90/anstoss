import { MarketplaceService } from './marketplace.service'

describe('marketplace media durable deletion', () => {
  const media = { id: 'media', url: 'https://assets.invalid/users/u/free-agent/photo/a.jpg',
    thumbnailUrl: 'https://assets.invalid/users/u/free-agent/photo/b.jpg', profile: { userId: 'u' } }
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    freeAgentMedia: { findUnique: jest.fn(), delete: jest.fn().mockResolvedValue({}) },
    freeAgentProfile: { findUnique: jest.fn(), delete: jest.fn().mockResolvedValue({}) },
    freeAgentExperience: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    trialInvite: { findMany: jest.fn().mockResolvedValue([]) },
    accountMediaDeletion: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  }
  const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) }
  const r2 = { enabled: true, objectKeyFromUrl: jest.fn((url: string) =>
    url.startsWith('https://assets.invalid/') ? url.slice('https://assets.invalid/'.length) : null) }
  let service: MarketplaceService

  beforeEach(() => {
    jest.clearAllMocks()
    tx.freeAgentMedia.findUnique.mockResolvedValue(media)
    tx.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile', media: [media] })
    tx.accountMediaDeletion.createMany.mockResolvedValue({ count: 2 })
    service = new MarketplaceService(prisma as never, {} as never, undefined, undefined, r2 as never)
  })

  it('queues owned media and thumbnail before removing the record', async () => {
    await service.deleteMedia('u', 'media')
    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual([
      'u', 'media-object:users/u/free-agent/photo/a.jpg', 'media-object:users/u/free-agent/photo/b.jpg',
    ])
    expect(tx.accountMediaDeletion.createMany).toHaveBeenCalledWith({ data: [
      { objectKey: 'users/u/free-agent/photo/a.jpg' }, { objectKey: 'users/u/free-agent/photo/b.jpg' },
    ], skipDuplicates: true })
    expect(tx.accountMediaDeletion.createMany.mock.invocationCallOrder[0]).toBeLessThan(tx.freeAgentMedia.delete.mock.invocationCallOrder[0])
  })

  it('does not delete the record when queueing fails', async () => {
    tx.accountMediaDeletion.createMany.mockRejectedValue(new Error('database unavailable'))
    await expect(service.deleteMedia('u', 'media')).rejects.toThrow('database unavailable')
    expect(tx.freeAgentMedia.delete).not.toHaveBeenCalled()
  })

  it('never queues foreign-user keys found in historical records', async () => {
    tx.freeAgentMedia.findUnique.mockResolvedValue({ ...media, url: 'https://assets.invalid/users/other/free-agent/photo/a.jpg', thumbnailUrl: null })
    await service.deleteMedia('u', 'media')
    expect(tx.accountMediaDeletion.createMany).not.toHaveBeenCalled()
  })

  it('does not discard an apparently owned URL that storage configuration cannot resolve', async () => {
    r2.objectKeyFromUrl.mockReturnValueOnce(null)
    await expect(service.deleteMedia('u', 'media')).rejects.toThrow('cannot be scheduled safely')
    expect(tx.freeAgentMedia.delete).not.toHaveBeenCalled()
  })

  it('queues profile media in the same transaction before deleting the profile', async () => {
    await service.deleteFreeAgentProfile('u')
    expect(tx.accountMediaDeletion.createMany.mock.invocationCallOrder[0]).toBeLessThan(tx.freeAgentProfile.delete.mock.invocationCallOrder[0])
  })
})
