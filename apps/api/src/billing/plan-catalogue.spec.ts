import { PLAN_FEATURES, PLAN_PRICES_CENTS, publishPlanDefinitionSchema } from '@anstoss/shared'
import { BillingService } from './billing.service'
import { ClubEntitlementsService } from './club-entitlements.service'
import { AdminService } from '../admin/admin.service'

const monthly = {
  tier: 'PRO' as const,
  interval: 'MONTHLY' as const,
  priceCents: 1099,
  currency: 'eur',
  teamLimit: 5,
  playerLimit: 150,
  features: [...PLAN_FEATURES],
  stripePriceId: 'price_monthly',
}

describe('current monthly/yearly plan catalogue', () => {
  it('accepts monthly and yearly publications but not new six-month publications', () => {
    expect(publishPlanDefinitionSchema.safeParse(monthly).success).toBe(true)
    expect(
      publishPlanDefinitionSchema.safeParse({ ...monthly, interval: 'TWELVE_MONTHS' }).success,
    ).toBe(true)
    expect(
      publishPlanDefinitionSchema.safeParse({ ...monthly, interval: 'SIX_MONTHS' }).success,
    ).toBe(false)
  })

  it('serves the app prices, annual savings, free limits and trial to the admin', () => {
    const service = new ClubEntitlementsService({} as never, {} as never)
    expect(service.planCatalogue()).toMatchObject({
      prices: PLAN_PRICES_CENTS,
      yearlySavingsCents: 2198,
      trialDays: 30,
      limits: { FREE: { teams: 1, players: 30 }, PRO: { teams: 5, players: 150 } },
    })
    expect(PLAN_PRICES_CENTS.yearly).toBeLessThan(PLAN_PRICES_CENTS.monthly * 12)
  })

  it.each([{ priceCents: 14900 }, { currency: 'usd' }, { teamLimit: 100 }, { playerLimit: 999 }, { features: [] }])(
    'rejects a standard plan that would drift from the advertised catalogue: %j',
    async (override) => {
      const transaction = jest.fn()
      const service = new ClubEntitlementsService(
        { $transaction: transaction } as never,
        {} as never,
      )
      await expect(service.publishPlan('admin', { ...monthly, ...override })).rejects.toThrow()
      expect(transaction).not.toHaveBeenCalled()
    },
  )

  it('normalizes paid monthly, yearly and historical six-month revenue correctly', async () => {
    const service = new AdminService({
      entitlementGrant: {
        findMany: jest.fn().mockResolvedValue([
          {
            clubId: 'monthly',
            planDefinition: { interval: 'MONTHLY', priceCents: 1099, currency: 'eur' },
          },
          {
            clubId: 'yearly',
            planDefinition: { interval: 'TWELVE_MONTHS', priceCents: 10990, currency: 'eur' },
          },
          {
            clubId: 'legacy',
            planDefinition: { interval: 'SIX_MONTHS', priceCents: 6000, currency: 'eur' },
          },
        ]),
      },
    } as never)
    await expect(service.revenueSummary()).resolves.toMatchObject({
      activeCount: 3,
      mrrCents: 3015,
      arrCents: 36180,
    })
  })
})

describe('Stripe price validation before admin publication', () => {
  const activePrice = {
    active: true,
    type: 'recurring',
    currency: 'eur',
    unit_amount: 1099,
    recurring: { interval: 'month', interval_count: 1 },
  }
  const serviceFor = (price: unknown) =>
    new BillingService(
      {} as never,
      {} as never,
      { prices: { retrieve: jest.fn().mockResolvedValue(price) } } as never,
      {} as never,
    )

  it('accepts an active matching monthly price', async () => {
    await expect(serviceFor(activePrice).validatePlanPrice(monthly)).resolves.toBeUndefined()
  })
  it('accepts an active matching yearly price', async () => {
    await expect(
      serviceFor({
        ...activePrice,
        unit_amount: 10990,
        recurring: { interval: 'year', interval_count: 1 },
      }).validatePlanPrice({ ...monthly, interval: 'TWELVE_MONTHS', priceCents: 10990 }),
    ).resolves.toBeUndefined()
  })
  it.each([
    { active: false },
    { type: 'one_time', recurring: null },
    { unit_amount: 999 },
    { currency: 'usd' },
    { recurring: { interval: 'month', interval_count: 6 } },
    { recurring: { interval: 'year', interval_count: 1 } },
  ])('rejects a mismatched Stripe price: %j', async (override) => {
    await expect(
      serviceFor({ ...activePrice, ...override }).validatePlanPrice(monthly),
    ).rejects.toThrow('Stripe price must')
  })
  it('allows access-only definitions without Stripe and refuses an unverified checkout link', async () => {
    const service = new BillingService({} as never, {} as never, null, {} as never)
    await expect(
      service.validatePlanPrice({ ...monthly, stripePriceId: null }),
    ).resolves.toBeUndefined()
    await expect(service.validatePlanPrice(monthly)).rejects.toThrow('Stripe is not configured')
  })
})
