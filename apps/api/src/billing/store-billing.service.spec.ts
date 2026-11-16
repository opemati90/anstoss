import { StoreBillingService } from './store-billing.service'
import { StoreBillingProvider } from './store-billing.provider'
import { ClubEntitlementsService } from './club-entitlements.service'
import { PrismaService } from '../prisma/prisma.service'
import type { VerifiedStorePurchase } from './store-purchase'

describe('store purchase authorization and persistence', () => {
  const account = { id: 'ae119da1-dcea-46fc-a465-cf9ef88b9d0b', clubId: 'club-a', userId: 'owner-a' }
  const input = { store: 'APPLE' as const, environment: 'PRODUCTION' as const, reference: '123' }
  const purchase: VerifiedStorePurchase = {
    ...input, originalId: '123', accountToken: account.id, productId: 'com.renuirug.anstoss.team.monthly',
    status: 'ACTIVE', startsAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 86400000),
    autoRenew: true, acknowledgementNeeded: false,
  }
  const db = {
    storePurchaseAccount: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    storeCheckoutOwner: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    storeSubscription: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    storePurchaseReplacement: { findUnique: jest.fn(), upsert: jest.fn() },
    planDefinition: { findUnique: jest.fn() },
    entitlementGrant: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() }, $executeRaw: jest.fn(), $transaction: jest.fn(),
  }
  const provider = { verify: jest.fn(), seal: jest.fn(), acknowledge: jest.fn(), configured: jest.fn() }
  const entitlements = { canManagePlan: jest.fn(), plan: jest.fn() }
  const service = new StoreBillingService(db as unknown as PrismaService, entitlements as unknown as ClubEntitlementsService, provider as unknown as StoreBillingProvider)

  beforeEach(() => {
    jest.resetAllMocks()
    db.$transaction.mockImplementation(async (fn) => fn(db))
    db.storePurchaseAccount.findUnique.mockResolvedValue(account)
    db.planDefinition.findUnique.mockResolvedValue({ id: 'definition', tier: 'PRO' })
    db.entitlementGrant.create.mockResolvedValue({ id: 'grant' })
    db.entitlementGrant.update.mockResolvedValue({ id: 'grant' })
    provider.verify.mockResolvedValue(purchase)
    provider.seal.mockReturnValue('encrypted')
    provider.configured.mockReturnValue(true)
    entitlements.canManagePlan.mockResolvedValue(true)
    delete process.env.ANSTOSS_IAP_SANDBOX_CLUB_IDS
  })

  it('requires plan-management authority before contacting the store', async () => {
    entitlements.canManagePlan.mockResolvedValue(false)
    await expect(service.verifyForUser('club-a', 'player', input)).rejects.toThrow()
    expect(provider.verify).not.toHaveBeenCalled()
  })
  it.each([['club-b', 'owner-a'], ['club-a', 'owner-b']])('rejects wrong club/payer %s %s', async (clubId, userId) => {
    await expect(service.verifyForUser(clubId, userId, input)).rejects.toThrow('different club or account')
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(provider.acknowledge).not.toHaveBeenCalled()
  })
  it('does not accept unbound purchases on webhooks', async () => {
    db.storePurchaseAccount.findUnique.mockResolvedValue(null)
    await expect(service.reconcile(input)).rejects.toThrow()
    expect(db.entitlementGrant.create).not.toHaveBeenCalled()
  })
  it('does not grant sandbox purchases to real clubs', async () => {
    provider.verify.mockResolvedValue({ ...purchase, environment: 'SANDBOX' })
    await expect(service.reconcile(input)).rejects.toThrow()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('allows sandbox only for explicitly allowlisted test clubs', async () => {
    process.env.ANSTOSS_IAP_SANDBOX_CLUB_IDS = 'club-a'
    provider.verify.mockResolvedValue({ ...purchase, environment: 'SANDBOX' })
    await service.reconcile(input)
    expect(db.entitlementGrant.create).toHaveBeenCalledTimes(1)
  })
  it('creates a durable bounded grant before acknowledging', async () => {
    await service.verifyForUser('club-a', 'owner-a', input)
    expect(db.entitlementGrant.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      clubId: 'club-a', source: 'PAID', expiresAt: purchase.expiresAt, status: 'ACTIVE',
    }) })
    expect(db.storeSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ sealedReference: 'encrypted' }) }))
    expect(provider.acknowledge.mock.invocationCallOrder[0]).toBeGreaterThan(db.storeSubscription.upsert.mock.invocationCallOrder[0])
  })
  it('never acknowledges a failed transaction', async () => {
    db.$transaction.mockRejectedValue(new Error('database unavailable'))
    await expect(service.reconcile(input)).rejects.toThrow()
    expect(provider.acknowledge).not.toHaveBeenCalled()
  })
  it('replays/renewals update the same grant rather than granting again', async () => {
    db.storeSubscription.findUnique.mockResolvedValue({ clubId: account.clubId, accountId: account.id, grantId: 'grant', observedAt: new Date(0), expiresAt: new Date(0) })
    await service.reconcile(input)
    expect(db.entitlementGrant.create).not.toHaveBeenCalled()
    expect(db.entitlementGrant.update).toHaveBeenCalledTimes(1)
  })
  it('prevents delayed older verifications from overwriting newer state', async () => {
    db.storeSubscription.findUnique.mockResolvedValue({ clubId: account.clubId, accountId: account.id, observedAt: new Date(Date.now() + 10000) })
    await service.reconcile(input)
    expect(db.entitlementGrant.update).not.toHaveBeenCalled()
    expect(db.entitlementGrant.create).not.toHaveBeenCalled()
  })
  it('blocks new checkout when another subscription already covers the club', async () => {
    db.entitlementGrant.findFirst.mockResolvedValue({ id: 'existing' })
    await expect(service.prepare('club-a', 'owner-a', 'APPLE', 'com.renuirug.anstoss.team.monthly')).rejects.toThrow('already has a subscription')
    expect(db.storePurchaseAccount.upsert).not.toHaveBeenCalled()
  })
  it('requires the immutable plan definition rather than inventing entitlement limits', async () => {
    db.planDefinition.findUnique.mockResolvedValue(null)
    await expect(service.reconcile(input)).rejects.toThrow()
    expect(db.entitlementGrant.create).not.toHaveBeenCalled()
  })
})
