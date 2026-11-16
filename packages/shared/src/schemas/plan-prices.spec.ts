import { PLAN_PACKAGES, PLAN_PRICES_CENTS } from './plan'
import { createEntitlementGrantSchema } from './platform'

describe('approved European launch prices', () => {
  it('uses the approved annual store prices without changing monthly prices', () => {
    expect(PLAN_PACKAGES.map(({ key, monthly, yearly }) => ({ key, monthly, yearly }))).toEqual([
      { key: 'TEAM', monthly: 1299, yearly: 12900 },
      { key: 'CLUB_3', monthly: 2999, yearly: 29900 },
      { key: 'UNLIMITED', monthly: 3999, yearly: 39900 },
    ])
    expect(PLAN_PRICES_CENTS).toEqual({ monthly: 1299, yearly: 12900 })
  })

  it.each(PLAN_PACKAGES)('$key saves at least two monthly payments when billed annually', ({ monthly, yearly }) => {
    expect(yearly).toBeLessThanOrEqual(monthly * 10)
  })

  it('does not offer the retired six-team package for new grants', () => {
    const grant = { tier: 'PRO', interval: 'MONTHLY', source: 'COMPLIMENTARY', reason: 'Pilot access', expiresAt: '2027-01-01T00:00:00.000Z' }
    expect(createEntitlementGrantSchema.safeParse({ ...grant, teamLimit: 6 }).success).toBe(false)
    for (const entry of PLAN_PACKAGES) {
      expect(createEntitlementGrantSchema.safeParse({ ...grant, teamLimit: entry.teams }).success).toBe(true)
    }
  })
})
