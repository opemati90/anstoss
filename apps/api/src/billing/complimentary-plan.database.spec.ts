import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { clubPlanSchema, PLAN_PACKAGES } from '@anstoss/shared'
import { ClubEntitlementsService } from './club-entitlements.service'
import { PlatformEntitlementsController } from './platform-entitlements.controller'
import { PlanController } from './plan.controller'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { createTenantMiddleware } from '../prisma/tenant.middleware'

const url = process.env.BILLING_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/anstoss_billing_test' || parsed.search) {
    throw new Error('Complimentary plan tests require the dedicated localhost anstoss_billing_test database')
  }
}

;(url ? describe : describe.skip)('admin complimentary grants -> mobile plan contract (real PostgreSQL)', () => {
  let db: PrismaClient
  let service: ClubEntitlementsService
  let admin: PlatformEntitlementsController
  let mobile: PlanController
  let clubId: string
  let otherClub: string
  let userId: string
  const savedEnabled = process.env.ANSTOSS_IAP_ENABLED
  const actor = { id: null, email: null, name: 'Local platform admin', authMethod: 'admin-key' as const }

  beforeAll(async () => {
    if (!url) throw new Error('BILLING_TEST_DATABASE_URL required')
    db = new PrismaClient({ datasources: { db: { url } } })
    db.$use(createTenantMiddleware(() => undefined) as Prisma.Middleware)
    await db.$connect()
    service = new ClubEntitlementsService(db as PrismaService, {} as AuditService)
    // Controllers/services/SQL are real. No store provider or purchase operation
    // is involved. Authentication guards have their own HTTP boundary tests.
    admin = new PlatformEntitlementsController(service, {} as never)
    mobile = new PlanController(service)
  })
  beforeEach(async () => {
    clubId = `comp-test-${randomUUID()}`
    otherClub = `comp-test-${randomUUID()}`
    userId = `comp-test-${randomUUID()}`
    process.env.ANSTOSS_IAP_ENABLED = 'false'
    await db.user.create({ data: { id: userId, name: 'Local plan reader' } })
    await db.club.createMany({ data: [clubId, otherClub].map(id => ({ id, name: 'Local plan test', slug: id })) })
    await db.membership.create({ data: { clubId, userId, role: 'OWNER' } })
  })
  afterEach(async () => {
    await db.club.deleteMany({ where: { id: { in: [clubId, otherClub] } } })
    await db.user.deleteMany({ where: { id: userId } })
    if (savedEnabled === undefined) delete process.env.ANSTOSS_IAP_ENABLED
    else process.env.ANSTOSS_IAP_ENABLED = savedEnabled
  })
  afterAll(async () => { await db?.$disconnect() })

  const readPlan = async () => clubPlanSchema.parse(await mobile.getPlan(clubId, { id: userId }))
  const grant = (teamLimit: number) => admin.grant(actor, clubId, {
    tier: 'PRO', teamLimit, interval: 'TWELVE_MONTHS', source: 'COMPLIMENTARY',
    reason: 'First club pilot; local automated test', expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })

  it.each(PLAN_PACKAGES)('unlocks $key immediately on the mobile endpoint and revokes without store billing', async entry => {
    expect((await readPlan()).tier).toBe('FREE')
    const created = await grant(entry.teams)
    expect(await readPlan()).toMatchObject({ clubId, tier: 'PRO', source: 'COMPLIMENTARY',
      limits: { teams: entry.teams, players: entry.players }, features: { liveTicker: true }, canManage: true })
    expect(await service.hasFeature(clubId, 'liveTicker')).toBe(true)
    expect((await service.plan(otherClub, userId)).tier).toBe('FREE')
    await admin.revoke(actor, created.id)
    expect(await readPlan()).toMatchObject({ tier: 'FREE', source: 'NONE', limits: { teams: 1, players: 30 },
      features: { liveTicker: false } })
    expect(await service.hasFeature(clubId, 'liveTicker')).toBe(false)
    expect(await db.auditLog.count({ where: { clubId, type: { in: ['billing.entitlement_granted', 'billing.entitlement_revoked'] } } })).toBe(2)
    expect(await db.storeSubscription.count({ where: { clubId } })).toBe(0)
    expect(await db.storeCheckoutOwner.count({ where: { clubId } })).toBe(0)
  })

  it('removes expired complimentary access on the next read without a webhook or cleanup worker', async () => {
    const created = await grant(3)
    expect((await readPlan()).tier).toBe('PRO')
    await db.entitlementGrant.update({ where: { id: created.id }, data: { expiresAt: new Date(Date.now() - 1) } })
    expect(await readPlan()).toMatchObject({ tier: 'FREE', limits: { teams: 1, players: 30 }, features: { liveTicker: false } })
    expect((await db.entitlementGrant.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('ACTIVE')
    expect(await service.hasFeature(clubId, 'liveTicker')).toBe(false)
  })
})
