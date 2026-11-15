import { FakePrisma } from '../test-utils/fake-prisma'
import { ClubEntitlementsService } from './club-entitlements.service'

describe('Paid access boundaries use the actual database filter', () => {
  const now = new Date('2026-11-15T12:00:00Z')
  beforeEach(() => jest.useFakeTimers().setSystemTime(now))
  afterEach(() => jest.useRealTimers())

  it.each([
    ['ACTIVE', -1, null, 'FREE'],
    ['ACTIVE', 0, null, 'FREE'],
    ['ACTIVE', 1, null, 'PRO'],
    ['SUSPENDED', -1, 1, 'PRO'],
    ['SUSPENDED', 1, -1, 'FREE'],
    ['SUSPENDED', -1, 0, 'FREE'],
    ['REVOKED', 1, 1, 'FREE'],
    ['EXPIRED', 1, 1, 'FREE'],
  ])('%s period %s grace %s resolves %s', async (status, period, grace, tier) => {
    const prisma = new FakePrisma(
      { entitlementGrant: {} },
      {
        entitlementGrant: [
          {
            id: 'grant',
            clubId: 'club',
            tier: 'PRO',
            status,
            startsAt: new Date(now.getTime() - 86400000),
            expiresAt: new Date(now.getTime() + Number(period) * 1000),
            graceEndsAt: grace === null ? null : new Date(now.getTime() + Number(grace) * 1000),
            planDefinitionId: null,
            createdAt: now,
          },
        ],
      },
    )
    const service = new ClubEntitlementsService(prisma as never, {} as never)
    expect((await service.resolve('club')).tier).toBe(tier)
    expect((await service.resolve('other-club')).tier).toBe('FREE')
  })
})
