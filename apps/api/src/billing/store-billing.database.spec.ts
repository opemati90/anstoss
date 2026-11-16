import { randomBytes, randomUUID } from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'
import { STORE_PRODUCTS } from '@anstoss/shared'
import { StoreBillingService } from './store-billing.service'
import { StoreBillingProvider } from './store-billing.provider'
import { StoreBillingWorker } from './store-billing.worker'
import { ClubEntitlementsService } from './club-entitlements.service'
import { normalizeGooglePurchase, type VerifiedStorePurchase } from './store-purchase'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { createTenantMiddleware } from '../prisma/tenant.middleware'

// Deliberately separate from DATABASE_URL: never run against a live database.
const url = process.env.BILLING_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/anstoss_billing_test' || parsed.search) {
    throw new Error('Billing database tests require the dedicated localhost anstoss_billing_test database')
  }
}

;(url ? describe : describe.skip)('store billing with real PostgreSQL transactions', () => {
  let db: PrismaClient
  let service: StoreBillingService
  let entitlements: ClubEntitlementsService
  let provider: StoreBillingProvider
  let purchase: VerifiedStorePurchase
  let verify: jest.SpyInstance
  let acknowledge: jest.SpyInstance
  let clubId: string
  let userId: string
  let secondUserId: string
  let secondClub: string
  const savedEnv = { ...process.env }
  const input = { store: 'GOOGLE' as const, environment: 'SANDBOX' as const, reference: 'synthetic-local-token' }

  beforeAll(async () => {
    if (!url) throw new Error('BILLING_TEST_DATABASE_URL is required')
    db = new PrismaClient({ datasources: { db: { url } } })
    db.$use(createTenantMiddleware(() => undefined) as Prisma.Middleware)
    await db.$connect()
    expect(await db.planDefinition.count({ where: { id: { in: STORE_PRODUCTS.map(p => p.definition) } } })).toBe(6)
  })
  beforeEach(async () => {
    clubId = `billing-test-${randomUUID()}`
    secondClub = `billing-test-${randomUUID()}`
    userId = `billing-test-${randomUUID()}`
    secondUserId = `billing-test-${randomUUID()}`
    await db.user.create({ data: { id: userId, name: 'Local billing test' } })
    await db.user.create({ data: { id: secondUserId, name: 'Other local billing manager' } })
    await db.club.createMany({ data: [clubId, secondClub].map(id => ({ id, name: 'Local billing test', slug: id })) })
    await db.membership.createMany({ data: [clubId, secondClub].map(id => ({ userId, clubId: id, role: 'OWNER' as const })) })
    process.env.ANSTOSS_IAP_ENCRYPTION_KEY = randomBytes(32).toString('hex')
    process.env.ANSTOSS_IAP_SANDBOX_CLUB_IDS = clubId
    provider = new StoreBillingProvider(db as PrismaService)
    // Only external store I/O is simulated. SQL, authorization, encryption,
    // tenant middleware, entitlement resolution and worker code are real.
    jest.spyOn(provider, 'configured').mockReturnValue(true)
    verify = jest.spyOn(provider, 'verify').mockImplementation(async () => purchase)
    acknowledge = jest.spyOn(provider, 'acknowledge').mockResolvedValue()
    entitlements = new ClubEntitlementsService(db as PrismaService, {} as AuditService)
    service = new StoreBillingService(db as PrismaService, entitlements, provider)
    const account = await service.prepare(clubId, userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')
    purchase = normalizeGooglePurchase({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', startTime: new Date(Date.now() - 60000).toISOString(),
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', testPurchase: {},
      externalAccountIdentifiers: { obfuscatedExternalAccountId: account.accountToken },
      lineItems: [{ productId: STORE_PRODUCTS[0].id, expiryTime: new Date(Date.now() + 86400000).toISOString(),
        autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: 'monthly' } }],
    }, input.reference)
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await db.club.deleteMany({ where: { id: { in: [clubId, secondClub] } } })
    await db.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } })
    process.env = { ...savedEnv }
  })
  afterAll(async () => { await db?.$disconnect() })

  it('prepares one stable payer binding under concurrent requests', async () => {
    const accounts = await Promise.all(Array.from({ length: 5 }, () => service.prepare(clubId, userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')))
    expect(new Set(accounts.map(a => a.accountToken)).size).toBe(1)
    expect(await db.storePurchaseAccount.count({ where: { clubId } })).toBe(1)
  })
  it('serializes two managers on a fresh club before any subscription exists', async () => {
    await db.membership.create({ data: { clubId: secondClub, userId: secondUserId, role: 'ADMIN' } })
    const results = await Promise.allSettled([userId, secondUserId].map(id => service.prepare(secondClub, id, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const owner = await db.storeCheckoutOwner.findUniqueOrThrow({ where: { clubId: secondClub }, include: { account: true } })
    expect(await db.storePurchaseAccount.count({ where: { clubId: secondClub } })).toBe(1)
    await expect(service.prepare(secondClub, owner.account.userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).resolves.toEqual({ accountToken: owner.accountId })
    await expect(service.prepare(secondClub, owner.account.userId, 'APPLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow('already owns checkout')
    const other = owner.account.userId === userId ? secondUserId : userId
    expect((await service.status(secondClub, other, 'GOOGLE')).checkout).toMatchObject({ store: 'GOOGLE', ownedByYou: false })
  })
  it('does not reserve on viewing plans, or expire unresolved ownership into another payer', async () => {
    await service.status(secondClub, userId, 'GOOGLE')
    expect(await db.storeCheckoutOwner.count({ where: { clubId: secondClub } })).toBe(0)
    await db.storeCheckoutOwner.update({ where: { clubId }, data: { createdAt: new Date(0) } })
    await db.membership.create({ data: { clubId, userId: secondUserId, role: 'ADMIN' } })
    await expect(service.prepare(clubId, secondUserId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow('already owns checkout')
    await expect(service.prepare(clubId, userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).resolves.toEqual({ accountToken: purchase.accountToken })
  })
  it('reserves one SKU when the same payer starts two different plans concurrently', async () => {
    const results = await Promise.allSettled([STORE_PRODUCTS[0].id, STORE_PRODUCTS[2].id]
      .map(productId => service.prepare(secondClub, userId, 'GOOGLE', productId)))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const owner = await db.storeCheckoutOwner.findUniqueOrThrow({ where: { clubId: secondClub } })
    await expect(service.prepare(secondClub, userId, 'GOOGLE', owner.productId!)).resolves.toEqual({ accountToken: owner.accountId })
  })
  it('does not clear an unresolved SKU on an expired restore', async () => {
    purchase = { ...purchase, status: 'EXPIRED', expiresAt: new Date(Date.now() - 1000) }
    await service.reconcile(input)
    expect((await db.storeCheckoutOwner.findUniqueOrThrow({ where: { clubId } })).productId).toBe(purchase.productId)
    await expect(service.prepare(clubId, userId, 'GOOGLE', STORE_PRODUCTS[2].id)).rejects.toThrow('already owns checkout')
  })
  it('keeps billing ownership through a club-role transfer and processes late store callbacks', async () => {
    await db.membership.updateMany({ where: { clubId, userId }, data: { role: 'PLAYER' } })
    await db.membership.create({ data: { clubId, userId: secondUserId, role: 'ADMIN' } })
    await expect(service.prepare(clubId, userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow()
    await expect(service.prepare(clubId, secondUserId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow('already owns checkout')
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('PRO')
    expect((await db.storeCheckoutOwner.findUniqueOrThrow({ where: { clubId } })).accountId).toBe(purchase.accountToken)
  })
  it('requires operator review for a deleted payer instead of silently handing off checkout', async () => {
    await db.membership.create({ data: { clubId, userId: secondUserId, role: 'ADMIN' } })
    await db.membership.deleteMany({ where: { userId } })
    await db.user.delete({ where: { id: userId } })
    await expect(service.prepare(clubId, secondUserId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow('already owns checkout')
    expect((await service.status(clubId, secondUserId, 'GOOGLE')).checkout?.ownedByYou).toBe(false)
  })
  it('fails closed for a legacy payer token whose checkout store is unknown', async () => {
    await db.storePurchaseAccount.create({ data: { clubId: secondClub, userId } })
    await expect(service.prepare(secondClub, userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow('already owns checkout')
    expect(await db.storeCheckoutOwner.count({ where: { clubId: secondClub } })).toBe(0)
  })
  it('commits one encrypted grant for concurrent replay and acknowledges only durable data', async () => {
    acknowledge.mockImplementation(async () => {
      expect(await db.storeSubscription.count({ where: { clubId } })).toBe(1)
      expect((await entitlements.resolve(clubId)).limits).toEqual({ teams: 1, players: 30 })
    })
    await Promise.all(Array.from({ length: 5 }, () => service.verifyForUser(clubId, userId, input)))
    expect(await db.entitlementGrant.count({ where: { clubId } })).toBe(1)
    expect(await db.auditLog.count({ where: { clubId, type: 'billing.store_reconciled' } })).toBe(1)
    const subscription = await db.storeSubscription.findFirstOrThrow({ where: { clubId } })
    expect(subscription.sealedReference).not.toContain(input.reference)
    expect(provider.unseal(subscription.sealedReference)).toBe(input.reference)
    await expect(service.prepare(clubId, userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow('already has a subscription')
  })
  it('rejects a different club and unauthorized payer before granting access', async () => {
    await expect(service.verifyForUser(clubId, 'unknown-user', input)).rejects.toThrow()
    expect(verify).not.toHaveBeenCalled()
    await expect(service.verifyForUser(secondClub, userId, input)).rejects.toThrow('different club or account')
    expect(await db.entitlementGrant.count({ where: { clubId: { in: [clubId, secondClub] } } })).toBe(0)
    expect(acknowledge).not.toHaveBeenCalled()
  })
  it('rejects sandbox grants unless the exact club is allowlisted', async () => {
    process.env.ANSTOSS_IAP_SANDBOX_CLUB_IDS = secondClub
    await expect(service.reconcile(input)).rejects.toThrow()
    expect(await db.storeSubscription.count({ where: { clubId } })).toBe(0)
  })
  it('renews, cancels, holds and revokes one grant without duplicating access', async () => {
    await service.reconcile(input)
    const original = await db.storeSubscription.findFirstOrThrow({ where: { clubId } })
    purchase = { ...purchase, expiresAt: new Date(Date.now() + 172800000), status: 'CANCELED', autoRenew: false }
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('PRO')
    purchase = { ...purchase, status: 'ON_HOLD' }
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('FREE')
    purchase = { ...purchase, status: 'GRACE' }
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('PRO')
    purchase = { ...purchase, status: 'REVOKED' }
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('FREE')
    const final = await db.storeSubscription.findFirstOrThrow({ where: { clubId } })
    expect(final.grantId).toBe(original.grantId)
    expect(await db.entitlementGrant.count({ where: { clubId } })).toBe(1)
  })
  it('ends feature access at expiry even if no webhook arrives', async () => {
    await service.reconcile(input)
    await db.entitlementGrant.updateMany({ where: { clubId }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await entitlements.resolve(clubId)).tier).toBe('FREE')
  })
  it('blocks duplicate checkout during a hold or pause even after entitlement expiry, then recovers', async () => {
    await service.reconcile(input)
    expect((await db.storeCheckoutOwner.findUniqueOrThrow({ where: { clubId } })).productId).toBeNull()
    purchase = { ...purchase, status: 'ON_HOLD', expiresAt: new Date(Date.now() - 1000) }
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('FREE')
    await expect(service.prepare(clubId, userId, 'GOOGLE', STORE_PRODUCTS[2].id)).rejects.toThrow('already has a subscription')
    purchase = { ...purchase, status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) }
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('PRO')
    expect(await db.entitlementGrant.count({ where: { clubId } })).toBe(1)
  })
  it('recovers an acknowledgement failure through the reconciliation worker', async () => {
    acknowledge.mockRejectedValueOnce(new Error('simulated store outage'))
    await expect(service.reconcile(input)).rejects.toThrow('simulated store outage')
    expect((await entitlements.resolve(clubId)).tier).toBe('PRO')
    await db.storeSubscription.updateMany({ where: { clubId }, data: { lastCheckedAt: new Date(0) } })
    await new StoreBillingWorker(db as PrismaService, service, provider).runCycle()
    expect(acknowledge).toHaveBeenCalledTimes(2)
    expect(await db.entitlementGrant.count({ where: { clubId } })).toBe(1)
  })
  it('recovers a missed Apple refund reversal through scheduled canonical verification', async () => {
    purchase = { ...purchase, store: 'APPLE', reference: '123456', originalId: '123456', status: 'REVOKED', acknowledgementNeeded: false }
    const appleInput = { store: 'APPLE' as const, environment: 'SANDBOX' as const, reference: '123456' }
    await service.reconcile(appleInput)
    expect((await entitlements.resolve(clubId)).tier).toBe('FREE')
    const original = await db.storeSubscription.findFirstOrThrow({ where: { clubId } })
    purchase = { ...purchase, status: 'ACTIVE' }
    await db.storeSubscription.updateMany({ where: { clubId }, data: { lastCheckedAt: new Date(0) } })
    await new StoreBillingWorker(db as PrismaService, service, provider).runCycle()
    expect((await entitlements.resolve(clubId)).tier).toBe('PRO')
    expect((await db.storeSubscription.findFirstOrThrow({ where: { clubId } })).grantId).toBe(original.grantId)
  })
  it('persists a deferred pair through marker removal and never revives the replaced token', async () => {
    const oldPurchase = { ...purchase }
    await service.reconcile(input)
    verify.mockRestore()
    const futureId = STORE_PRODUCTS[2].id
    const from = { productId: oldPurchase.productId, expiryTime: oldPurchase.expiresAt.toISOString(),
      autoRenewingPlan: {}, offerDetails: { basePlanId: 'monthly' }, deferredItemReplacement: { productId: futureId } }
    const to = { productId: futureId, autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: 'monthly' } }
    const raw = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      startTime: oldPurchase.startsAt.toISOString(), testPurchase: {}, linkedPurchaseToken: input.reference,
      externalAccountIdentifiers: { obfuscatedExternalAccountId: oldPurchase.accountToken }, lineItems: [from, to] }
    const request = jest.fn().mockResolvedValue({ data: raw })
    Object.assign(provider, { google: { request } })
    const replacement = { ...input, reference: 'deferred-new-token' }
    await service.reconcile(replacement)
    expect((await entitlements.resolve(clubId)).limits.teams).toBe(1)
    const row = await db.storeSubscription.findFirstOrThrow({ where: { clubId, originalId: { not: oldPurchase.originalId } } })
    expect(row).toMatchObject({ deferredFromProductId: from.productId, deferredToProductId: futureId })
    // Subsequent canonical response after activation omits replacement markers.
    request.mockResolvedValue({ data: { ...raw, acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', lineItems: [
      { ...to, expiryTime: new Date(Date.now() + 172800000).toISOString() },
      { ...from, expiryTime: new Date(Date.now() - 1000).toISOString(), deferredItemReplacement: undefined },
    ] } })
    await service.reconcile(replacement)
    await service.reconcile(replacement)
    expect((await entitlements.resolve(clubId)).limits.teams).toBe(3)
    expect((await db.storeSubscription.findUniqueOrThrow({ where: { id: row.id } })).grantId).toBe(row.grantId)
    expect(await db.entitlementGrant.count({ where: { clubId } })).toBe(2)
    expect(await db.storePurchaseReplacement.count({ where: { clubId } })).toBe(1)
    jest.spyOn(provider, 'verify').mockResolvedValue(oldPurchase)
    await service.reconcile(input)
    expect(await db.entitlementGrant.count({ where: { clubId, status: 'ACTIVE' } })).toBe(1)
    expect((await entitlements.resolve(clubId)).limits.teams).toBe(3)
  })
  it('rolls back a replacement that tries to take another club’s subscription', async () => {
    await service.reconcile(input)
    const other = await service.prepare(secondClub, userId, 'GOOGLE', 'com.renuirug.anstoss.team.monthly')
    process.env.ANSTOSS_IAP_SANDBOX_CLUB_IDS = `${clubId},${secondClub}`
    purchase = { ...purchase, accountToken: other.accountToken, originalId: 'replacement', replacesOriginalId: purchase.originalId }
    acknowledge.mockClear()
    await expect(service.reconcile(input)).rejects.toThrow('cannot change club or payer')
    expect(await db.entitlementGrant.count({ where: { clubId: secondClub } })).toBe(0)
    expect(await db.storeSubscription.count({ where: { clubId: secondClub } })).toBe(0)
    expect((await entitlements.resolve(clubId)).tier).toBe('PRO')
    expect(acknowledge).not.toHaveBeenCalled()
  })
  it.each([true, false])('never revives a replaced token (predecessor observed first: %s)', async (oldFirst) => {
    const old = { ...purchase }
    if (oldFirst) await service.reconcile(input)
    purchase = { ...old, originalId: 'replacement', replacesOriginalId: old.originalId,
      reference: 'replacement-token', productId: STORE_PRODUCTS[2].id }
    await service.reconcile({ ...input, reference: purchase.reference })
    expect((await entitlements.resolve(clubId)).limits.teams).toBe(3)
    purchase = { ...purchase, status: 'EXPIRED', expiresAt: new Date(Date.now() - 1000) }
    await service.reconcile({ ...input, reference: purchase.reference })
    purchase = { ...old, status: 'CANCELED', autoRenew: false }
    await service.reconcile(input)
    expect((await entitlements.resolve(clubId)).tier).toBe('FREE')
    expect(await db.entitlementGrant.count({ where: { clubId, status: 'ACTIVE' } })).toBe(0)
    const successor = await db.storeSubscription.findFirstOrThrow({ where: { clubId, originalId: 'replacement' } })
    expect(successor.replacesOriginalId).toBe(old.originalId)
  })
  it('remembers every replacement edge when a whole chain arrives in reverse order', async () => {
    const first = { ...purchase, status: 'CANCELED' as const }
    const middle = { ...first, originalId: 'middle', replacesOriginalId: first.originalId, reference: 'middle-token' }
    const last = { ...middle, originalId: 'last', replacesOriginalId: middle.originalId, reference: 'last-token',
      status: 'EXPIRED' as const, expiresAt: new Date(Date.now() - 1000) }
    for (const item of [last, middle, first, middle, first]) {
      purchase = item
      await service.reconcile({ ...input, reference: item.reference })
      expect((await entitlements.resolve(clubId)).tier).toBe('FREE')
    }
    expect(await db.storePurchaseReplacement.count({ where: { clubId } })).toBe(2)
    expect(await db.storeSubscription.count({ where: { clubId } })).toBe(1)
  })
})
