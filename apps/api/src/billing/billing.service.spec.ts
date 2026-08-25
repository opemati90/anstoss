import { BillingService } from './billing.service'

describe('BillingService paid entitlement synchronization', () => {
  const subscription = {
    id: 'sub_123',
    status: 'active',
    metadata: { clubId: 'club-1', tier: 'SCALE' },
    items: { data: [{ price: { id: 'price_unknown' } }] },
  } as never
  const period = {
    start: new Date('2026-08-01T00:00:00.000Z'),
    end: new Date('2027-08-01T00:00:00.000Z'),
  }

  function createService(definition: unknown, existing: unknown) {
    const prisma = {
      planDefinition: { findUnique: jest.fn().mockResolvedValue(definition) },
      entitlementGrant: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockResolvedValue({}),
      },
    }
    const service = new BillingService(prisma as never, {} as never, null, {} as never)
    return { service, prisma }
  }

  it('does not trust mutable Stripe metadata for an unknown subscription', async () => {
    const { service, prisma } = createService(null, null)

    await (service as any).syncPaidEntitlement(subscription, 'club-1', period)

    expect(prisma.entitlementGrant.upsert).not.toHaveBeenCalled()
  })

  it('preserves the explicit tier of a migrated legacy subscription', async () => {
    const { service, prisma } = createService(null, { tier: 'PRO' })

    await (service as any).syncPaidEntitlement(subscription, 'club-1', period)

    expect(prisma.entitlementGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tier: 'PRO', stripeSubscriptionId: 'sub_123' }),
        update: expect.objectContaining({ tier: 'PRO', status: 'ACTIVE' }),
      }),
    )
  })
})
