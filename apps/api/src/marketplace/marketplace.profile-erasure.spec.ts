import { RegistrationRole } from '@anstoss/shared'
import { MarketplaceService } from './marketplace.service'

describe('marketplace writes racing account erasure', () => {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    membership: { findFirst: jest.fn().mockResolvedValue(null) },
    freeAgentProfile: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    freeAgentMedia: { count: jest.fn(), create: jest.fn() },
    freeAgentExperience: { deleteMany: jest.fn(), createMany: jest.fn() },
  }
  const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) }
  let service: MarketplaceService

  beforeEach(() => {
    jest.clearAllMocks()
    tx.user.findFirst.mockResolvedValue(null) // deletion won the lifecycle lock
    service = new MarketplaceService(prisma as never, {} as never)
  })

  it.each(['create', 'update', 'media', 'role'] as const)(
    'never persists %s when erasure wins the account lock', async (action) => {
      const promise = action === 'create' ? service.createFreeAgentProfile('user', {} as never)
        : action === 'update' ? service.updateFreeAgentProfile('user', {} as never)
          : action === 'media' ? service.addMedia('user', { type: 'PHOTO', url: 'synthetic' } as never)
            : service.updateRegistrationRole('user', RegistrationRole.FREE_AGENT)
      await expect(promise).rejects.toThrow()
      expect(tx.$executeRaw.mock.calls[0][1]).toBe('user')
      expect(tx.user.findFirst.mock.invocationCallOrder[0]).toBeGreaterThan(tx.$executeRaw.mock.invocationCallOrder[0])
      expect(tx.user.update).not.toHaveBeenCalled()
      expect(tx.freeAgentProfile.create).not.toHaveBeenCalled()
      expect(tx.freeAgentProfile.update).not.toHaveBeenCalled()
      expect(tx.freeAgentProfile.updateMany).not.toHaveBeenCalled()
      expect(tx.freeAgentMedia.create).not.toHaveBeenCalled()
    },
  )

  it('rechecks the registration role under the lock before profile writes', async () => {
    tx.user.findFirst.mockResolvedValue({ dateOfBirth: new Date('1990-01-01') })
    tx.user.findUnique.mockResolvedValue({ registrationRole: RegistrationRole.PLAYER, dateOfBirth: new Date('1990-01-01'), deletedAt: null })
    await expect(service.createFreeAgentProfile('user', {} as never)).rejects.toThrow('Only users registered as FREE_AGENT')
    expect(tx.freeAgentProfile.create).not.toHaveBeenCalled()
  })
})
