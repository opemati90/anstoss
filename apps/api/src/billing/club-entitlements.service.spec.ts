import { ConflictException } from '@nestjs/common'
import { ClubEntitlementsService, CORE_CLUB_FEATURES } from './club-entitlements.service'

describe('ClubEntitlementsService', () => {
  it('uses free limits and keeps core club operations available', async () => {
    const prisma = {
      entitlementGrant: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(service.resolve('club-1')).resolves.toMatchObject({
      tier: 'FREE',
      limits: { teams: 1, players: 30 },
      features: expect.arrayContaining([...CORE_CLUB_FEATURES]),
    })
  })

  it('enforces the free player-seat limit', async () => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      entitlementGrant: { findMany: jest.fn().mockResolvedValue([]) },
      teamAccess: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest
          .fn()
          .mockResolvedValue(
            Array.from({ length: 29 }, (_, index) => ({ userId: `player-${index}` })),
          ),
      },
      team: { count: jest.fn().mockResolvedValue(1) },
      rosterSlot: { count: jest.fn().mockResolvedValue(1) },
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(service.assertCanActivatePlayer('club-1', 'new-player')).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('archives the prior term version before publishing a replacement', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      planDefinition: {
        findFirst: jest.fn().mockResolvedValue({ version: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'plan-v3', version: 3 }),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const audit = { log: jest.fn() }
    const service = new ClubEntitlementsService(prisma as never, audit as never)

    await service.publishPlan('admin-1', {
      tier: 'PRO',
      interval: 'TWELVE_MONTHS',
      priceCents: 14_900,
      currency: 'eur',
      teamLimit: 5,
      playerLimit: 150,
      features: ['bank_reconciliation'],
      stripePriceId: 'price_pro_annual',
    })

    expect(tx.planDefinition.updateMany).toHaveBeenCalledWith({
      where: {
        tier: 'PRO',
        interval: 'TWELVE_MONTHS',
        publishedAt: { not: null },
      },
      data: { publishedAt: null },
    })
    expect(tx.planDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 3, stripePriceId: 'price_pro_annual' }),
    })
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'billing.plan_published', actorId: 'admin-1' }),
    )
  })
})
