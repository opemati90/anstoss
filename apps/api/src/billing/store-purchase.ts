import { BadRequestException } from '@nestjs/common'
import { STORE_PRODUCTS, type StoreBillingRequest } from '@anstoss/shared'
import { createHash } from 'node:crypto'
import type { JWSTransactionDecodedPayload, JWSRenewalInfoDecodedPayload } from '@apple/app-store-server-library'
import { z } from 'zod'

export const ANSTOSS_BUNDLE_ID = 'com.renuirug.anstoss'
export const ANSTOSS_APPLE_ID = 6761143230
export const ANSTOSS_SUBSCRIPTION_GROUP = '22583128'

export class InvalidStorePurchaseException extends BadRequestException {
  constructor() { super('The store could not verify an eligible Anstoss subscription') }
}

export interface VerifiedStorePurchase {
  store: StoreBillingRequest['store']
  environment: StoreBillingRequest['environment']
  originalId: string
  reference: string
  accountToken: string
  productId: string
  startsAt: Date
  expiresAt: Date
  status: 'ACTIVE' | 'GRACE' | 'CANCELED' | 'EXPIRED' | 'REVOKED' | 'ON_HOLD' | 'PENDING'
  autoRenew: boolean
  acknowledgementNeeded: boolean
  replacesOriginalId?: string
  resubscription?: boolean
  deferredReplacement?: { fromProductId: string; toProductId: string }
}

export function storeProduct(productId: string) {
  const product = STORE_PRODUCTS.find((item) => item.id === productId)
  if (!product) throw new InvalidStorePurchaseException()
  return product
}

function validDate(value: number | string | undefined) {
  const date = new Date(value ?? NaN)
  if (!Number.isFinite(date.getTime())) throw new InvalidStorePurchaseException()
  return date
}

export function normalizeApplePurchase(
  transaction: JWSTransactionDecodedPayload,
  renewal: JWSRenewalInfoDecodedPayload,
  status: number,
  environment: StoreBillingRequest['environment'],
): VerifiedStorePurchase {
  if (transaction.bundleId !== ANSTOSS_BUNDLE_ID ||
      transaction.subscriptionGroupIdentifier !== ANSTOSS_SUBSCRIPTION_GROUP ||
      transaction.type !== 'Auto-Renewable Subscription' ||
      transaction.inAppOwnershipType !== 'PURCHASED' ||
      !transaction.originalTransactionId || !transaction.appAccountToken ||
      renewal.originalTransactionId !== transaction.originalTransactionId ||
      transaction.environment !== (environment === 'PRODUCTION' ? 'Production' : 'Sandbox')) {
    throw new InvalidStorePurchaseException()
  }
  const product = storeProduct(transaction.productId ?? '')
  const revoked = status === 5 || transaction.revocationDate != null || transaction.isUpgraded === true
  const state = revoked ? 'REVOKED' : status === 4 ? 'GRACE' : status === 3 ? 'ON_HOLD'
    : status === 2 ? 'EXPIRED' : status === 1 ? (renewal.autoRenewStatus === 1 ? 'ACTIVE' : 'CANCELED') : null
  if (!state) throw new InvalidStorePurchaseException()
  const expiresAt = validDate(state === 'GRACE' ? renewal.gracePeriodExpiresDate : transaction.expiresDate)
  const startsAt = validDate(transaction.purchaseDate)
  if (expiresAt <= startsAt) throw new InvalidStorePurchaseException()
  return {
    store: 'APPLE', environment,
    originalId: transaction.originalTransactionId,
    reference: transaction.originalTransactionId,
    accountToken: transaction.appAccountToken.toLowerCase(), productId: product.id,
    startsAt, expiresAt, status: state, autoRenew: renewal.autoRenewStatus === 1,
    acknowledgementNeeded: false,
  }
}

const googleAccountIdentifiers = z.object({ obfuscatedExternalAccountId: z.string().min(1).optional() })
export const googleSubscriptionSchema = z.object({
  subscriptionState: z.string(),
  startTime: z.string().optional(),
  acknowledgementState: z.string(),
  testPurchase: z.object({}).optional(),
  linkedPurchaseToken: z.string().optional(),
  externalAccountIdentifiers: googleAccountIdentifiers.optional(),
  outOfAppPurchaseContext: z.object({
    expiredExternalAccountIdentifiers: googleAccountIdentifiers.optional(),
    expiredPurchaseToken: z.string().min(1).optional(),
  }).optional(),
  lineItems: z.array(z.object({
    productId: z.string(), expiryTime: z.string().optional(),
    autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean().optional() }),
    offerDetails: z.object({ basePlanId: z.string() }).optional(),
    deferredItemReplacement: z.object({ productId: z.string() }).optional(),
    itemReplacement: z.object({ productId: z.string(), basePlanId: z.string(), replacementMode: z.string() }).optional(),
    prepaidPlan: z.never().optional(), deferredItemRemoval: z.never().optional(),
  })).min(1).max(2),
})

export function normalizeGooglePurchase(raw: unknown, token: string, evidence: {
  accountTokens?: string[]
  deferredReplacement?: VerifiedStorePurchase['deferredReplacement']
  now?: Date
} = {}): VerifiedStorePurchase {
  const parsed = googleSubscriptionSchema.safeParse(raw)
  if (!parsed.success) throw new InvalidStorePurchaseException()
  const data = parsed.data
  const identities = [data.externalAccountIdentifiers?.obfuscatedExternalAccountId,
    data.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers?.obfuscatedExternalAccountId,
    ...(evidence.accountTokens ?? [])].filter((id): id is string => Boolean(id)).map(id => id.toLowerCase())
  if (new Set(identities).size !== 1) throw new InvalidStorePurchaseException()
  for (const line of data.lineItems) {
    if (line.offerDetails?.basePlanId !== storeProduct(line.productId).interval) throw new InvalidStorePurchaseException()
    if (line.expiryTime !== undefined) validDate(line.expiryTime)
    if (line.deferredItemReplacement) storeProduct(line.deferredItemReplacement.productId)
  }
  let item = data.lineItems[0]
  let deferredReplacement: VerifiedStorePurchase['deferredReplacement']
  if (data.lineItems.length === 2) {
    // Two items are supported only as one deferred replacement, never add-ons.
    const now = evidence.now ?? new Date()
    const orientations = data.lineItems.flatMap(from => data.lineItems.filter(to => to !== from).map(to => ({ from, to })))
      .filter(({ from, to }) => from.productId !== to.productId)
    // itemReplacement is historical (retained for 60 days). A round trip A->B->A
    // can contain both directions; the current deferred pointer takes precedence.
    const pending = orientations.filter(({ from, to }) => from.deferredItemReplacement?.productId === to.productId)
    const pairs = pending.length ? pending : orientations.filter(({ from, to }) =>
      from.expiryTime !== undefined && to.expiryTime !== undefined && validDate(from.expiryTime) <= now &&
      validDate(to.expiryTime) > validDate(from.expiryTime) && (
        (to.itemReplacement?.productId === from.productId && to.itemReplacement.replacementMode === 'DEFERRED') ||
        (evidence.deferredReplacement?.fromProductId === from.productId && evidence.deferredReplacement.toProductId === to.productId)))
    if (pairs.length !== 1) throw new InvalidStorePurchaseException()
    const { from, to } = pairs[0]
    if (to.deferredItemReplacement ||
        (from.deferredItemReplacement && from.deferredItemReplacement.productId !== to.productId) ||
        (to.itemReplacement && (to.itemReplacement.productId !== from.productId ||
          to.itemReplacement.basePlanId !== from.offerDetails?.basePlanId || to.itemReplacement.replacementMode !== 'DEFERRED'))) {
      throw new InvalidStorePurchaseException()
    }
    const oldExpiry = validDate(from.expiryTime)
    if (to.expiryTime === undefined) {
      if (!from.deferredItemReplacement) throw new InvalidStorePurchaseException()
      item = from // Even after its expiry: no new entitlement until Google confirms it.
    } else {
      if (oldExpiry > now || validDate(to.expiryTime) <= oldExpiry) throw new InvalidStorePurchaseException()
      item = to
    }
    deferredReplacement = { fromProductId: from.productId, toProductId: to.productId }
  }
  const product = storeProduct(item.productId)
  const states: Record<string, VerifiedStorePurchase['status']> = {
    SUBSCRIPTION_STATE_ACTIVE: 'ACTIVE', SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'GRACE',
    SUBSCRIPTION_STATE_CANCELED: 'CANCELED', SUBSCRIPTION_STATE_EXPIRED: 'EXPIRED',
    SUBSCRIPTION_STATE_ON_HOLD: 'ON_HOLD', SUBSCRIPTION_STATE_PAUSED: 'ON_HOLD',
    SUBSCRIPTION_STATE_PENDING: 'PENDING', SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'EXPIRED',
  }
  const status = states[data.subscriptionState]
  if (!status) throw new InvalidStorePurchaseException()
  const startsAt = validDate(data.startTime)
  const expiresAt = validDate(item.expiryTime)
  if (expiresAt <= startsAt) throw new InvalidStorePurchaseException()
  return {
    store: 'GOOGLE', environment: data.testPurchase ? 'SANDBOX' : 'PRODUCTION',
    originalId: purchaseTokenHash(token), reference: token,
    accountToken: identities[0],
    productId: product.id, startsAt, expiresAt, status,
    autoRenew: item.autoRenewingPlan?.autoRenewEnabled === true,
    acknowledgementNeeded: data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' &&
      ['ACTIVE', 'GRACE', 'CANCELED'].includes(status),
    replacesOriginalId: data.linkedPurchaseToken ? purchaseTokenHash(data.linkedPurchaseToken) : undefined,
    resubscription: data.outOfAppPurchaseContext !== undefined,
    deferredReplacement,
  }
}

export function purchaseTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** Expiry is enforced on every feature check, independently of webhook delivery. */
export function purchaseGrantStatus(purchase: VerifiedStorePurchase, now = new Date()) {
  if (purchase.status === 'REVOKED') return 'REVOKED' as const
  if (purchase.expiresAt <= now) return 'EXPIRED' as const
  if (purchase.startsAt > now) return 'SUSPENDED' as const
  return ['ACTIVE', 'GRACE', 'CANCELED'].includes(purchase.status) ? 'ACTIVE' as const : 'SUSPENDED' as const
}
