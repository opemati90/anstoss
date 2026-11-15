import { BillingService } from './billing.service'

describe('software subscription billing status', () => {
  function service(tier: 'FREE' | 'PRO', subscription: object | null, connect: object | null = null) {
    const prisma = {
      stripeAccount: { findUnique: jest.fn().mockResolvedValue(connect) },
      subscription: { findFirst: jest.fn().mockResolvedValue(subscription) },
    }
    return new BillingService(prisma as never, {} as never, null, {
      resolve: jest.fn().mockResolvedValue({ tier }),
    } as never)
  }

  it('recognizes a paid software subscription without requiring Stripe Connect', async () => {
    const end = new Date('2026-12-15T12:00:00Z')
    await expect(service('PRO', {
      stripeSubscriptionId: 'sub_test', status: 'active', currentPeriodEnd: end,
    }).getStatus('club')).resolves.toMatchObject({
      provider: 'STRIPE', connectStatus: 'not_started', plan: 'PREMIUM',
      currentPeriodEnd: end.toISOString(),
    })
  })

  it('does not grant paid access from a stale active subscription status', async () => {
    await expect(service('FREE', {
      stripeSubscriptionId: 'sub_expired', status: 'active', currentPeriodEnd: new Date('2020-01-01'),
    }).getStatus('club')).resolves.toMatchObject({ provider: 'STRIPE', plan: 'FOUNDATION' })
  })

  it('does not confuse a Connect account with a paid software plan', async () => {
    await expect(service('FREE', null, { onboardingComplete: true }).getStatus('club'))
      .resolves.toMatchObject({ provider: 'STRIPE', connectStatus: 'active', plan: 'FOUNDATION' })
  })

  it('reports no provider for a free club with no Stripe relationship', async () => {
    await expect(service('FREE', null).getStatus('club'))
      .resolves.toMatchObject({ provider: 'NONE', plan: 'FOUNDATION', currentPeriodEnd: null })
  })
})
