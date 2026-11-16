import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { STORE_PRODUCTS, type StoreBillingRequest, type StoreBillingStatus } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { ClubEntitlementsService, PlanManagementForbiddenException } from './club-entitlements.service'
import { StoreBillingProvider, StoreBillingUnavailableException } from './store-billing.provider'
import { InvalidStorePurchaseException, purchaseGrantStatus, storeProduct, type VerifiedStorePurchase } from './store-purchase'

@Injectable()
export class StoreBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClubEntitlementsService,
    private readonly provider: StoreBillingProvider,
  ) {}

  private async assertManager(clubId: string, userId: string) {
    if (!(await this.entitlements.canManagePlan(clubId, userId))) throw new PlanManagementForbiddenException()
  }

  async status(clubId: string, userId: string, store: StoreBillingRequest['store']): Promise<StoreBillingStatus> {
    await this.assertManager(clubId, userId)
    const [account, subscriptions] = await Promise.all([
      this.prisma.storePurchaseAccount.findUnique({ where: { clubId_userId: { clubId, userId } } }),
      this.prisma.storeSubscription.findMany({ where: { clubId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ])
    return {
      enabled: this.provider.configured(store), accountToken: account?.id ?? null,
      products: this.provider.configured(store) ? STORE_PRODUCTS.map((product) => product.id) : [],
      subscriptions: subscriptions.map((subscription) => ({
        store: subscription.store as StoreBillingRequest['store'],
        environment: subscription.environment as StoreBillingRequest['environment'],
        productId: subscription.productId,
        status: subscription.expiresAt <= new Date() ? 'EXPIRED' : subscription.status,
        expiresAt: subscription.expiresAt.toISOString(), autoRenew: subscription.autoRenew,
      })),
    }
  }

  async prepare(clubId: string, userId: string, store: StoreBillingRequest['store']) {
    await this.assertManager(clubId, userId)
    if (!this.provider.configured(store)) throw new StoreBillingUnavailableException()
    const account = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entitlement-grant:${clubId}`}))`
      const paid = await tx.entitlementGrant.findFirst({ where: {
        clubId, source: 'PAID', status: { in: ['ACTIVE', 'SUSPENDED'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }, { graceEndsAt: { gt: new Date() } }],
      } })
      if (paid) throw new ConflictException('This club already has a subscription. Manage it in the original store to avoid duplicate billing.')
      return tx.storePurchaseAccount.upsert({
        where: { clubId_userId: { clubId, userId } }, update: {}, create: { clubId, userId },
      })
    })
    return { accountToken: account.id }
  }

  async verifyForUser(clubId: string, userId: string, input: StoreBillingRequest) {
    await this.assertManager(clubId, userId)
    await this.reconcile(input, { clubId, userId })
    return this.entitlements.plan(clubId, userId)
  }

  /** Webhooks and retries always fetch current store state; event order is irrelevant. */
  async reconcile(input: StoreBillingRequest, requester?: { clubId: string; userId: string }) {
    const observedAt = new Date()
    const purchase = await this.provider.verify(input)
    const account = await this.prisma.storePurchaseAccount.findUnique({ where: { id: purchase.accountToken } })
    if (!account || (requester && (account.clubId !== requester.clubId || account.userId !== requester.userId))) {
      throw new ForbiddenException('This purchase belongs to a different club or account')
    }
    this.assertEnvironment(purchase, account.clubId)
    const product = storeProduct(purchase.productId)
    const sealedReference = this.provider.seal(purchase.reference)
    await this.prisma.$transaction(async (tx) => {
      // Same lock as manual grants/trials. Serializes grants for the club and
      // makes replayed receipts and duplicate notifications idempotent.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entitlement-grant:${account.clubId}`}))`
      const key = { store: purchase.store, environment: purchase.environment, originalId: purchase.originalId }
      const existing = await tx.storeSubscription.findUnique({ where: { store_environment_originalId: key } })
      if (existing && (existing.clubId !== account.clubId || existing.accountId !== account.id)) {
        throw new ForbiddenException('A subscription cannot be transferred between clubs')
      }
      // Record every verified edge before deciding whether this token itself was
      // replaced. C -> B -> A delivery must preserve B's link to A even when B
      // cannot grant access. Tombstones do not require a predecessor subscription.
      if (purchase.replacesOriginalId) {
        if (purchase.replacesOriginalId === purchase.originalId) throw new InvalidStorePurchaseException()
        const predecessorKey = { ...key, originalId: purchase.replacesOriginalId }
        const replaced = await tx.storeSubscription.findUnique({ where: { store_environment_originalId: predecessorKey } })
        const tombstone = await tx.storePurchaseReplacement.findUnique({ where: { store_environment_originalId: predecessorKey } })
        if ([replaced, tombstone].some(row => row && (row.clubId !== account.clubId || row.accountId !== account.id))) {
          throw new ForbiddenException('A replacement purchase cannot change club or payer')
        }
        if (tombstone && tombstone.successorId !== purchase.originalId) throw new InvalidStorePurchaseException()
        await tx.storePurchaseReplacement.upsert({
          where: { store_environment_originalId: predecessorKey }, update: {},
          create: { ...predecessorKey, successorId: purchase.originalId, clubId: account.clubId, accountId: account.id },
        })
        if (replaced) {
          await tx.entitlementGrant.update({ where: { id: replaced.grantId, clubId: account.clubId }, data: { status: 'REVOKED', graceEndsAt: null } })
          await tx.storeSubscription.update({ where: { id: replaced.id }, data: { status: 'REVOKED', autoRenew: false, observedAt } })
        }
      }
      const successor = await tx.storePurchaseReplacement.findUnique({ where: { store_environment_originalId: key } })
      if (successor) {
        if (successor.clubId !== account.clubId || successor.accountId !== account.id) {
          throw new ForbiddenException('A replacement purchase cannot change club or payer')
        }
        return
      }
      if (existing && existing.observedAt > observedAt) return
      const definition = await tx.planDefinition.findUnique({ where: { id: product.definition } })
      if (!definition) throw new StoreBillingUnavailableException()
      const grantData = {
        tier: definition.tier, source: 'PAID' as const, status: purchaseGrantStatus(purchase),
        startsAt: purchase.startsAt, expiresAt: purchase.expiresAt, graceEndsAt: null,
        planDefinitionId: definition.id,
      }
      const grant = existing
        ? await tx.entitlementGrant.update({ where: { id: existing.grantId, clubId: account.clubId }, data: grantData })
        : await tx.entitlementGrant.create({ data: {
          ...grantData, clubId: account.clubId, createdById: account.userId,
          reason: `Verified ${purchase.store} subscription`,
        } })
      const data = {
        sealedReference, productId: purchase.productId, status: purchase.status,
        replacesOriginalId: purchase.replacesOriginalId ?? existing?.replacesOriginalId ?? null,
        expiresAt: purchase.expiresAt, autoRenew: purchase.autoRenew,
        observedAt, lastCheckedAt: new Date(),
      }
      await tx.storeSubscription.upsert({
        where: { store_environment_originalId: key }, update: data,
        create: { ...key, ...data, clubId: account.clubId, accountId: account.id, grantId: grant.id },
      })
      if (!existing || existing.status !== data.status || existing.productId !== data.productId || existing.expiresAt.getTime() !== data.expiresAt.getTime() || existing.autoRenew !== data.autoRenew) {
        await tx.auditLog.create({ data: {
          clubId: account.clubId, type: 'billing.store_reconciled', actorType: 'system',
          summary: 'Verified subscription access updated',
          metadata: { store: purchase.store, environment: purchase.environment, productId: purchase.productId,
            status: purchase.status, grantId: grant.id, expiresAt: purchase.expiresAt.toISOString() },
        } })
      }
    })
    // Never acknowledge before the verified grant is durable. Failure is retried
    // by the client, RTDN redelivery and the scheduled reconciliation worker.
    await this.provider.acknowledge(purchase)
  }

  private assertEnvironment(purchase: VerifiedStorePurchase, clubId: string) {
    if (purchase.environment !== 'SANDBOX') return
    const allowed = (process.env.ANSTOSS_IAP_SANDBOX_CLUB_IDS ?? '').split(',').map((id) => id.trim())
    if (!allowed.includes(clubId)) throw new InvalidStorePurchaseException()
  }
}
