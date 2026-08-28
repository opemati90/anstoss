import { BillingService, isSubscriptionEventStale } from './billing.service'

describe('BillingService paid entitlement synchronization', () => {
  it('fails closed for same-second updates unless Stripe state was refreshed', () => {
    const existing = {
      status: 'active',
      lastStripeEventCreated: 200,
      lastStripeEventId: 'evt_200_b',
    }

    expect(
      isSubscriptionEventStale(existing, { created: 200, id: 'evt_200_a' }, false),
    ).toBe(true)
    expect(isSubscriptionEventStale(existing, { created: 200, id: 'evt_200_c' }, false)).toBe(true)
    expect(
      isSubscriptionEventStale(existing, { created: 200, id: 'evt_200_c' }, false, true),
    ).toBe(false)
    expect(
      isSubscriptionEventStale(existing, { created: 200, id: 'evt_100_a' }, true),
    ).toBe(false)
  })
  const subscription: any = {
    id: 'sub_123',
    status: 'active',
    metadata: { clubId: 'club-1', tier: 'SCALE' },
    items: { data: [{ price: { id: 'price_unknown' } }] },
  }
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

  it('starts one seven-day grace window for a past-due subscription', async () => {
    const graceEndsAt = new Date(Date.now() + 5 * 86400000)
    const { service, prisma } = createService(
      { id: 'definition-1', tier: 'PRO' },
      { tier: 'PRO', graceEndsAt },
    )

    await (service as any).syncPaidEntitlement(
      { ...subscription, status: 'past_due', items: { data: [{ price: { id: 'price-pro' } }] } },
      'club-1',
      period,
    )

    expect(prisma.entitlementGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'SUSPENDED', graceEndsAt }),
      }),
    )
  })

  it('does not restart an expired grace window while the subscription remains past due', async () => {
    const graceEndsAt = new Date(Date.now() - 60_000)
    const { service, prisma } = createService(
      { id: 'definition-1', tier: 'PRO' },
      { tier: 'PRO', graceEndsAt },
    )

    await (service as any).syncPaidEntitlement(
      { ...subscription, status: 'past_due', items: { data: [{ price: { id: 'price-pro' } }] } },
      'club-1',
      period,
    )

    expect(prisma.entitlementGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ graceEndsAt }) }),
    )
  })

  it('keeps a deletion authoritative over an older delayed update', async () => {
    let storedSubscription: any = null
    const processed = new Set<string>()
    const tx: any = {
      $executeRaw: jest.fn(),
      paymentEvent: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(processed.has(where.stripeEventId) ? { id: where.stripeEventId } : null),
        ),
        create: jest.fn(({ data }) => {
          processed.add(data.stripeEventId)
          return Promise.resolve(data)
        }),
      },
      subscription: {
        findUnique: jest.fn(() => Promise.resolve(storedSubscription)),
        upsert: jest.fn(({ create, update }) => {
          storedSubscription = storedSubscription ? { ...storedSubscription, ...update } : create
          return Promise.resolve(storedSubscription)
        }),
      },
      entitlementGrant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(),
      },
      planDefinition: { findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma: any = {
      subscription: tx.subscription,
      $transaction: jest.fn((fn) => fn(tx)),
    }
    const service = new BillingService(prisma, {} as never, null, {} as never)
    const stripeSubscription = {
      ...subscription,
      start_date: 1_700_000_000,
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_592_000,
            price: { id: 'price-pro' },
          },
        ],
      },
    }

    await (service as any).processSubscriptionWebhook(
      { id: 'evt-delete', type: 'customer.subscription.deleted', created: 200 },
      stripeSubscription,
      'club-1',
      true,
    )
    await (service as any).processSubscriptionWebhook(
      { id: 'evt-stale', type: 'customer.subscription.updated', created: 100 },
      { ...stripeSubscription, status: 'active' },
      'club-1',
      false,
    )

    expect(storedSubscription.status).toBe('canceled')
    expect(tx.entitlementGrant.upsert).not.toHaveBeenCalled()
    expect(tx.paymentEvent.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ stripeEventId: 'evt-stale', status: 'ignored_stale' }),
    })
  })

  it('pins tenant identity and refreshes canonical Stripe state for equal-second updates', async () => {
    let storedSubscription: any = {
      clubId: 'club-1',
      stripeSubscriptionId: 'sub_123',
      status: 'active',
      lastStripeEventCreated: 200,
      lastStripeEventId: 'evt-first',
    }
    const canonical: any = {
      ...subscription,
      status: 'past_due',
      metadata: { clubId: 'club-2' },
      start_date: 1_700_000_000,
      cancel_at_period_end: false,
      items: {
        data: [{
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: { id: 'price-pro' },
        }],
      },
    }
    const tx: any = {
      $executeRaw: jest.fn(),
      paymentEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      subscription: {
        findUnique: jest.fn(() => Promise.resolve(storedSubscription)),
        upsert: jest.fn(({ update }) => {
          storedSubscription = { ...storedSubscription, ...update }
          return Promise.resolve(storedSubscription)
        }),
      },
      entitlementGrant: {
        findUnique: jest.fn().mockResolvedValue({ tier: 'PRO', graceEndsAt: null }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      planDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: 'plan-1', tier: 'PRO' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma: any = {
      subscription: tx.subscription,
      $transaction: jest.fn((fn) => fn(tx)),
    }
    const stripe = {
      subscriptions: { retrieve: jest.fn().mockResolvedValue(canonical) },
    }
    const service = new BillingService(prisma, {} as never, stripe as never, {} as never)

    await (service as any).processSubscriptionWebhook(
      { id: 'evt-second', type: 'customer.subscription.updated', created: 200 },
      { ...canonical, status: 'active' },
      'club-2',
      false,
    )

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123')
    expect(storedSubscription.status).toBe('past_due')
    expect(tx.entitlementGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ clubId: 'club-1' }) }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clubId: 'club-1' }) }),
    )
    expect(tx.paymentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clubId: 'club-1' }) }),
    )
  })
})
