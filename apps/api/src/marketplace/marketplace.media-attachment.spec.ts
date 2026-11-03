import { MarketplaceService } from './marketplace.service'

describe('free-agent media attachment versus cleanup', () => {
  const key = 'users/u/free-agent/photo/a.jpg'
  const url = `https://assets.invalid/${key}`
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    user: {
      findFirst: jest.fn().mockResolvedValue({ dateOfBirth: new Date('1990-01-01') }),
      findUnique: jest.fn().mockResolvedValue({ registrationRole: 'FREE_AGENT', dateOfBirth: new Date('1990-01-01'), deletedAt: null }),
    },
    freeAgentProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile' }) },
    freeAgentMedia: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'media', type: 'PHOTO', url, thumbnailUrl: null, sortOrder: 0, createdAt: new Date() }) },
    accountMediaDeletion: { findUnique: jest.fn().mockResolvedValue(null) },
  }
  const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) }
  const r2 = { enabled: true, objectKeyFromUrl: jest.fn(() => key), assertStoredObject: jest.fn().mockResolvedValue(undefined) }
  let service: MarketplaceService
  beforeEach(() => {
    jest.clearAllMocks()
    tx.accountMediaDeletion.findUnique.mockResolvedValue(null)
    r2.assertStoredObject.mockResolvedValue(undefined)
    service = new MarketplaceService(prisma as never, {} as never, undefined, undefined, r2 as never)
  })

  it('locks the account and object and rechecks storage before inserting', async () => {
    await service.addMedia('u', { type: 'PHOTO', url })
    expect(tx.$executeRaw.mock.calls.map((call) => call[1])).toEqual(['u', `media-object:${key}`])
    expect(r2.assertStoredObject.mock.invocationCallOrder[0]).toBeGreaterThan(tx.$executeRaw.mock.invocationCallOrder[1])
    expect(tx.freeAgentMedia.create.mock.invocationCallOrder[0]).toBeGreaterThan(r2.assertStoredObject.mock.invocationCallOrder[0])
  })

  it('does not insert if cleanup has already been queued', async () => {
    tx.accountMediaDeletion.findUnique.mockResolvedValue({ objectKey: key })
    await expect(service.addMedia('u', { type: 'PHOTO', url })).rejects.toThrow('being removed')
    expect(tx.freeAgentMedia.create).not.toHaveBeenCalled()
  })

  it('does not insert if the object disappeared after the controller preflight', async () => {
    r2.assertStoredObject.mockRejectedValue(new Error('missing object'))
    await expect(service.addMedia('u', { type: 'PHOTO', url })).rejects.toThrow('invalid or incomplete')
    expect(tx.freeAgentMedia.create).not.toHaveBeenCalled()
  })
})
