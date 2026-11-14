import { MarketplaceService } from './marketplace.service'

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    freeAgentMedia: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'media-1', type: 'VIDEO', url: 'https://assets.test/users/u-1/free-agent/video/a.mp4', thumbnailUrl: null, sortOrder: 0, createdAt: new Date() }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'media-1',
        profile: { userId: 'u-1' },
        url: 'https://assets.test/users/u-1/free-agent/video/a.mp4',
        thumbnailUrl: 'https://assets.test/users/another/free-agent/photo/b.jpg',
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
    freeAgentProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'p-1',
          media: [
            { url: 'https://assets.test/users/u-1/free-agent/video/a.mp4', thumbnailUrl: null },
          ],
        }),
      delete: jest.fn().mockResolvedValue({}),
    },
    freeAgentExperience: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    trialInvite: { findMany: jest.fn().mockResolvedValue([]) },
    mediaDeletionJob: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  }
  const prisma = { $transaction: jest.fn((fn) => fn(tx)) }
  const r2 = {
    objectKeyFromUrl: (url: string) =>
      url.startsWith('https://assets.test/') ? url.slice(20) : null,
  }
  const service = new MarketplaceService(
    prisma as never,
    {} as never,
    undefined,
    undefined,
    r2 as never,
  )
  return { tx, service }
}

describe('free-agent erasure preserves storage cleanup intent', () => {
  it('reserves cleanup before an upload can be issued and cancels only attachable leases', async () => {
    const { tx, service } = setup()
    jest.spyOn(service, 'assertMayAddMedia').mockResolvedValue(undefined)
    const key = 'users/u-1/free-agent/video/a.mp4'
    await service.reserveMediaUpload('u-1', key)
    expect(tx.mediaDeletionJob.create).toHaveBeenCalledWith({ data: {
      objectKey: key, reclaimable: true, nextAttemptAt: expect.any(Date),
    } })
    await service.addMedia('u-1', { type: 'VIDEO', url: `https://assets.test/${key}` })
    expect(tx.mediaDeletionJob.deleteMany).toHaveBeenCalledWith({ where: { objectKey: { in: [key] }, reclaimable: true } })
  })

  it('refuses an upload already being erased and leaves its cleanup intact', async () => {
    const { tx, service } = setup()
    jest.spyOn(service, 'assertMayAddMedia').mockResolvedValue(undefined)
    tx.mediaDeletionJob.count.mockResolvedValue(1)
    await expect(service.addMedia('u-1', { type: 'VIDEO', url: 'https://assets.test/users/u-1/free-agent/video/a.mp4' })).rejects.toThrow('being deleted')
    expect(tx.freeAgentMedia.create).not.toHaveBeenCalled()
    expect(tx.mediaDeletionJob.deleteMany).not.toHaveBeenCalled()
  })

  it('queues only owned files before removing a media reference', async () => {
    const { tx, service } = setup()
    await service.deleteMedia('u-1', 'media-1')
    expect(tx.mediaDeletionJob.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: 'users/u-1/free-agent/video/a.mp4', nextAttemptAt: expect.any(Date) }],
      skipDuplicates: true,
    })
    expect(tx.mediaDeletionJob.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.freeAgentMedia.delete.mock.invocationCallOrder[0],
    )
  })

  it('does not erase another account’s media', async () => {
    const { tx, service } = setup()
    await expect(service.deleteMedia('u-2', 'media-1')).rejects.toThrow('Media not found')
    expect(tx.mediaDeletionJob.createMany).not.toHaveBeenCalled()
    expect(tx.freeAgentMedia.delete).not.toHaveBeenCalled()
  })

  it('queues profile media before the profile cascade removes their references', async () => {
    const { tx, service } = setup()
    await service.deleteFreeAgentProfile('u-1')
    expect(tx.mediaDeletionJob.createMany).toHaveBeenCalled()
    expect(tx.mediaDeletionJob.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.freeAgentProfile.delete.mock.invocationCallOrder[0],
    )
  })

  it('does not remove the reference if durable scheduling fails', async () => {
    const { tx, service } = setup()
    tx.mediaDeletionJob.createMany.mockRejectedValue(new Error('database unavailable'))
    await expect(service.deleteMedia('u-1', 'media-1')).rejects.toThrow('database unavailable')
    expect(tx.freeAgentMedia.delete).not.toHaveBeenCalled()
  })
})
