import { PLAN_FEATURES } from '@anstoss/shared'
import {
  ClubEntitlementsService,
  PlanManagementForbiddenException,
  PlanTrialUnavailableException,
} from './club-entitlements.service'
import { PlanController } from './plan.controller'

type Grant = {
  id: string
  tier: 'FREE' | 'PRO' | 'SCALE'
  source: 'PAID' | 'TRIAL' | 'COMPLIMENTARY' | 'MIGRATED'
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED'
  graceEndsAt: Date | null
  expiresAt: Date | null
  planDefinitionId: string | null
}

function makePrisma(opts: {
  grants?: Grant[]
  priorTrial?: boolean
  membership?: { role: string; operationalRoles: string[] } | null
  players?: number
  teams?: number
}) {
  const auditLog = { create: jest.fn().mockResolvedValue({}) }
  const entitlementGrant = {
    findMany: jest.fn().mockResolvedValue(opts.grants ?? []),
    findFirst: jest.fn().mockResolvedValue(opts.priorTrial ? { id: 'old-trial' } : null),
    create: jest.fn().mockImplementation(({ data }) => ({ id: 'grant-new', ...data })),
  }
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    entitlementGrant,
    auditLog,
    membership: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.membership === undefined ? { role: 'OWNER', operationalRoles: [] } : opts.membership,
        ),
    },
    team: { count: jest.fn().mockResolvedValue(opts.teams ?? 1) },
    teamAccess: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          Array.from({ length: opts.players ?? 22 }, (_, i) => ({ userId: `p-${i}` })),
        ),
    },
    rosterSlot: { count: jest.fn().mockResolvedValue(0) },
    planDefinition: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  }
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma))
  return prisma
}

const service = (prisma: ReturnType<typeof makePrisma>) =>
  new ClubEntitlementsService(prisma as never, { log: jest.fn() } as never)

describe('ClubEntitlementsService plans and pricing', () => {
  it('maps Kostenlos to FREE with every paid feature off and the board usage', async () => {
    const plan = await service(makePrisma({ membership: { role: 'COACH', operationalRoles: [] } })).plan(
      'club-1',
      'coach-1',
    )
    expect(plan).toMatchObject({
      tier: 'FREE',
      source: 'NONE',
      trialEndsAt: null,
      trialUsed: false,
      limits: { teams: 1, players: 30 },
      usage: { teams: 1, players: 22 },
      prices: {
        monthly: { amountCents: 1099, currency: 'EUR' },
        yearly: { amountCents: 10990, currency: 'EUR' },
      },
      canManage: false,
    })
    for (const feature of PLAN_FEATURES) expect(plan.features[feature]).toBe(false)
  })

  it('maps Verein to PRO (5 teams, 150 players) and reports a running trial', async () => {
    const expiresAt = new Date(Date.now() + 10 * 86400000)
    const plan = await service(
      makePrisma({
        priorTrial: true,
        grants: [
          {
            id: 'g1',
            tier: 'PRO',
            source: 'TRIAL',
            status: 'ACTIVE',
            graceEndsAt: null,
            expiresAt,
            planDefinitionId: null,
          },
        ],
      }),
    ).plan('club-1', 'owner-1')
    expect(plan).toMatchObject({
      tier: 'PRO',
      source: 'TRIAL',
      trialEndsAt: expiresAt.toISOString(),
      trialUsed: true,
      limits: { teams: 5, players: 150 },
      canManage: true,
    })
    for (const feature of PLAN_FEATURES) expect(plan.features[feature]).toBe(true)
  })

  it('gates features through hasFeature', async () => {
    await expect(service(makePrisma({})).hasFeature('club-1', 'clubColors')).resolves.toBe(false)
  })

  it('keeps Matchday Studio on Verein only', () => {
    const entitlements = service(makePrisma({}))
    expect(entitlements.featureFlags('FREE' as never).matchdayStudio).toBe(false)
    expect(entitlements.featureFlags('PRO' as never).matchdayStudio).toBe(true)
  })

  it.each([
    [{ role: 'OWNER', operationalRoles: [] }, true],
    [{ role: 'ADMIN', operationalRoles: [] }, true],
    [{ role: 'COACH', operationalRoles: ['TREASURER'] }, true],
    [{ role: 'PLAYER', operationalRoles: ['BOARD_MEMBER'] }, true],
    [{ role: 'COACH', operationalRoles: ['SECRETARY'] }, false],
    [{ role: 'PARENT', operationalRoles: [] }, false],
    [null, false],
  ])('canManagePlan(%j) = %s', async (membership, expected) => {
    await expect(
      service(makePrisma({ membership })).canManagePlan('club-1', 'u'),
    ).resolves.toBe(expected)
  })

  it('starts a 30-day card-less PRO trial for the Kassenwart and audits it', async () => {
    const prisma = makePrisma({ membership: { role: 'COACH', operationalRoles: ['TREASURER'] } })
    await service(prisma).startTrial('club-1', 'treasurer-1')
    const data = prisma.entitlementGrant.create.mock.calls[0][0].data
    expect(data).toMatchObject({ clubId: 'club-1', tier: 'PRO', source: 'TRIAL' })
    expect(data.planDefinitionId).toBeUndefined()
    const days = (data.expiresAt.getTime() - data.startsAt.getTime()) / 86400000
    expect(days).toBe(30)
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'billing.trial_started' }) }),
    )
  })

  it('refuses the trial for members who are not Vorstand or Kassenwart', async () => {
    const prisma = makePrisma({ membership: { role: 'COACH', operationalRoles: [] } })
    await expect(service(prisma).startTrial('club-1', 'coach-1')).rejects.toBeInstanceOf(
      PlanManagementForbiddenException,
    )
    expect(prisma.entitlementGrant.create).not.toHaveBeenCalled()
  })

  it('allows only one trial per club', async () => {
    const prisma = makePrisma({ priorTrial: true })
    await expect(service(prisma).startTrial('club-1', 'owner-1')).rejects.toBeInstanceOf(
      PlanTrialUnavailableException,
    )
  })

  it('refuses a trial when the club already holds Verein', async () => {
    const prisma = makePrisma({
      grants: [
        {
          id: 'paid',
          tier: 'PRO',
          source: 'PAID',
          status: 'ACTIVE',
          graceEndsAt: null,
          expiresAt: null,
          planDefinitionId: null,
        },
      ],
    })
    await expect(service(prisma).startTrial('club-1', 'owner-1')).rejects.toBeInstanceOf(
      PlanTrialUnavailableException,
    )
  })
})

describe('PlanController', () => {
  it('reads the plan and starts the trial for the current user', async () => {
    const entitlements = {
      plan: jest.fn().mockResolvedValue({ tier: 'FREE' }),
      startTrial: jest.fn().mockResolvedValue({ tier: 'PRO' }),
    }
    const controller = new PlanController(entitlements as never)
    await expect(controller.getPlan('club-1', { id: 'u1' })).resolves.toEqual({ tier: 'FREE' })
    await expect(controller.startTrial('club-1', { id: 'u1' }, {})).resolves.toEqual({ tier: 'PRO' })
    expect(entitlements.startTrial).toHaveBeenCalledWith('club-1', 'u1')
    expect(() => controller.startTrial('club-1', { id: 'u1' }, { priceId: 'x' })).toThrow()
  })
})
