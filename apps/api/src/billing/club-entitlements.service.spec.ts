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

  it('keeps a suspended paid grant effective during its payment grace window', async () => {
    const prisma = {
      entitlementGrant: {
        findMany: jest.fn().mockResolvedValue([
          {
            tier: 'PRO',
            status: 'SUSPENDED',
            graceEndsAt: new Date(Date.now() + 86400000),
            planDefinitionId: null,
          },
        ]),
      },
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(service.resolve('club-1')).resolves.toMatchObject({ tier: 'PRO' })
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

  it('publishes a new immutable version without rewriting prior prices', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      planDefinition: {
        findFirst: jest.fn().mockResolvedValue({ version: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'plan-v3', version: 3 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
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

    expect(tx.planDefinition.updateMany).not.toHaveBeenCalled()
    expect(tx.planDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 3, stripePriceId: 'price_pro_annual' }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'billing.plan_published', actorId: 'admin-1' }),
      }),
    )
  })

  it('creates a grant and its audit record in one serialized transaction', async () => {
    const grant = {
      id: 'grant-1',
      clubId: 'club-1',
      tier: 'PRO',
      source: 'COMPLIMENTARY',
      reason: 'Pilot club',
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      planDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      },
      entitlementGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(grant),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue({ id: 'club-1' }) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(
      service.grant('club-1', 'admin-1', {
        tier: 'PRO',
        interval: 'TWELVE_MONTHS',
        source: 'COMPLIMENTARY',
        reason: 'Pilot club',
        expiresAt: '2027-01-01T00:00:00.000Z',
      }),
    ).resolves.toEqual(grant)

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.entitlementGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clubId: 'club-1', planDefinitionId: 'plan-1' }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'billing.entitlement_granted',
        actorId: 'admin-1',
        metadata: { grantId: 'grant-1', planDefinitionId: 'plan-1' },
      }),
    })
  })

  it('rejects a duplicate overlapping grant before writing or auditing', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      planDefinition: { findFirst: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
      entitlementGrant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-grant' }),
        create: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    }
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue({ id: 'club-1' }) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(
      service.grant('club-1', 'admin-1', {
        tier: 'PRO',
        interval: 'TWELVE_MONTHS',
        source: 'COMPLIMENTARY',
        reason: 'Duplicate pilot grant',
        expiresAt: '2027-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('overlapping entitlement grant')
    expect(tx.entitlementGrant.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('returns scheduled and historical grants in the platform snapshot', async () => {
    const allGrants = [
      { id: 'future', status: 'ACTIVE', startsAt: new Date('2027-01-01') },
      { id: 'expired', status: 'REVOKED', startsAt: new Date('2025-01-01') },
    ]
    const prisma = {
      entitlementGrant: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(allGrants),
      },
      team: { count: jest.fn().mockResolvedValue(1) },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
      rosterSlot: { count: jest.fn().mockResolvedValue(0) },
      clubPlanCompliance: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(service.snapshot('club-1')).resolves.toMatchObject({ grants: allGrants })
    expect(prisma.entitlementGrant.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { clubId: 'club-1' },
        include: { planDefinition: true },
      }),
    )
  })

  it('refuses to manually revoke a paid subscription grant', async () => {
    const tx = {
      entitlementGrant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'paid-1',
          clubId: 'club-1',
          source: 'PAID',
        }),
        updateMany: jest.fn(),
      },
      $executeRaw: jest.fn(),
      auditLog: { create: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(service.revoke('paid-1', 'admin-1')).rejects.toThrow(
      'subscription lifecycle',
    )
    expect(tx.entitlementGrant.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('opens one non-destructive 30-day remediation window after a downgrade', async () => {
    const compliance = {
      id: 'compliance-1',
      clubId: 'club-1',
      status: 'OVER_QUOTA',
      tier: 'FREE',
      excessTeams: 2,
      excessPlayers: 10,
      remediationEndsAt: new Date(Date.now() + 30 * 86400000),
    }
    const prisma = {
      clubPlanCompliance: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(compliance),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(
      service.refreshCompliance(
        'club-1',
        { tier: 'FREE', limits: { teams: 1, players: 30 } } as never,
        { teams: 3, players: 40 } as never,
      ),
    ).resolves.toEqual(compliance)

    expect(prisma.clubPlanCompliance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'OVER_QUOTA',
          excessTeams: 2,
          excessPlayers: 10,
          remediationEndsAt: expect.any(Date),
        }),
      }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'billing.over_quota_detected' }),
      }),
    )
  })

  it('resolves the downgrade incident after the club returns within quota', async () => {
    const prisma = {
      clubPlanCompliance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'compliance-1',
          clubId: 'club-1',
          status: 'OVER_QUOTA',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'compliance-1',
          status: 'RESOLVED',
          excessTeams: 0,
          excessPlayers: 0,
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const service = new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

    await expect(
      service.refreshCompliance(
        'club-1',
        { tier: 'FREE', limits: { teams: 1, players: 30 } } as never,
        { teams: 1, players: 30 } as never,
      ),
    ).resolves.toMatchObject({ status: 'RESOLVED' })
    expect(prisma.clubPlanCompliance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED', resolvedAt: expect.any(Date) }),
      }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'billing.over_quota_resolved' }),
      }),
    )
  })
})
