import { normalizeApplePurchase, normalizeGooglePurchase, purchaseGrantStatus, storeProduct, ANSTOSS_BUNDLE_ID, ANSTOSS_SUBSCRIPTION_GROUP } from './store-purchase'

const start = Date.UTC(2026, 10, 1)
const end = Date.UTC(2026, 11, 1)
const now = new Date(Date.UTC(2026, 10, 16))
const account = 'ae119da1-dcea-46fc-a465-cf9ef88b9d0b'
const apple = {
  bundleId: ANSTOSS_BUNDLE_ID, subscriptionGroupIdentifier: ANSTOSS_SUBSCRIPTION_GROUP,
  type: 'Auto-Renewable Subscription', inAppOwnershipType: 'PURCHASED', environment: 'Production',
  originalTransactionId: '100001', appAccountToken: account,
  productId: 'com.renuirug.anstoss.team.monthly', purchaseDate: start, expiresDate: end,
}
const renewal = { originalTransactionId: '100001', autoRenewStatus: 1 }
const google = {
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  startTime: new Date(start).toISOString(), externalAccountIdentifiers: { obfuscatedExternalAccountId: account },
  lineItems: [{ productId: apple.productId, expiryTime: new Date(end).toISOString(),
    autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: 'monthly' } }],
}

describe('native subscription lifecycle', () => {
  test.each(['team', 'club3', 'unlimited'])('only approved %s monthly/yearly products map to definitions', (name) => {
    for (const interval of ['monthly', 'yearly']) expect(storeProduct(`${ANSTOSS_BUNDLE_ID}.${name}.${interval}`).definition).toContain('plan_three_')
  })
  it('rejects retired, foreign-app and fabricated SKUs', () => {
    for (const id of [`${ANSTOSS_BUNDLE_ID}.club6.monthly`, 'com.renuirug.renuir.team.monthly', 'free']) {
      expect(() => storeProduct(id)).toThrow()
    }
  })
  it('grants verified active purchases and cuts access at the exact expiry boundary', () => {
    const purchase = normalizeApplePurchase(apple, renewal, 1, 'PRODUCTION')
    expect(purchaseGrantStatus(purchase, now)).toBe('ACTIVE')
    expect(purchaseGrantStatus(purchase, new Date(end))).toBe('EXPIRED')
    expect(purchaseGrantStatus(purchase, new Date(start - 1))).toBe('SUSPENDED')
  })
  it('cancellation preserves the already-paid period, never a lifetime entitlement', () => {
    const purchase = normalizeApplePurchase(apple, { ...renewal, autoRenewStatus: 0 }, 1, 'PRODUCTION')
    expect(purchase.status).toBe('CANCELED')
    expect(purchase.autoRenew).toBe(false)
    expect(purchaseGrantStatus(purchase, now)).toBe('ACTIVE')
    expect(purchaseGrantStatus(purchase, new Date(end))).toBe('EXPIRED')
  })
  it('revokes refunded/upgraded Apple transactions even with a future expiry', () => {
    for (const transaction of [{ ...apple, revocationDate: start + 1 }, { ...apple, isUpgraded: true }]) {
      expect(purchaseGrantStatus(normalizeApplePurchase(transaction, renewal, 1, 'PRODUCTION'), now)).toBe('REVOKED')
    }
    expect(purchaseGrantStatus(normalizeApplePurchase(apple, renewal, 5, 'PRODUCTION'), now)).toBe('REVOKED')
  })
  it('only grants Apple grace to the verified grace deadline; billing retry has no access', () => {
    const graceEnd = end + 1000
    const purchase = normalizeApplePurchase(apple, { ...renewal, gracePeriodExpiresDate: graceEnd }, 4, 'PRODUCTION')
    expect(purchaseGrantStatus(purchase, new Date(end))).toBe('ACTIVE')
    expect(purchaseGrantStatus(purchase, new Date(graceEnd))).toBe('EXPIRED')
    expect(purchaseGrantStatus(normalizeApplePurchase(apple, renewal, 3, 'PRODUCTION'), now)).toBe('SUSPENDED')
    expect(() => normalizeApplePurchase(apple, renewal, 4, 'PRODUCTION')).toThrow()
  })
  it.each([
    { bundleId: 'another.app' }, { subscriptionGroupIdentifier: 'other' }, { appAccountToken: undefined },
    { environment: 'Sandbox' }, { type: 'Consumable' }, { inAppOwnershipType: 'FAMILY_SHARED' },
    { expiresDate: NaN }, { expiresDate: start },
  ])('rejects invalid Apple identity/dates: %j', (override) => {
    expect(() => normalizeApplePurchase({ ...apple, ...override }, renewal, 1, 'PRODUCTION')).toThrow()
  })
  it('rejects mismatched renewal chains', () => {
    expect(() => normalizeApplePurchase(apple, { ...renewal, originalTransactionId: 'other' }, 1, 'PRODUCTION')).toThrow()
  })
  it.each([
    ['ACTIVE', 'ACTIVE'], ['IN_GRACE_PERIOD', 'ACTIVE'], ['CANCELED', 'ACTIVE'],
    ['ON_HOLD', 'SUSPENDED'], ['PAUSED', 'SUSPENDED'], ['PENDING', 'SUSPENDED'], ['EXPIRED', 'SUSPENDED'],
  ])('Google %s maps to fail-closed entitlement %s', (state, entitlement) => {
    const purchase = normalizeGooglePurchase({ ...google, subscriptionState: `SUBSCRIPTION_STATE_${state}` }, 'secret-token')
    expect(purchaseGrantStatus(purchase, now)).toBe(entitlement)
    expect(purchase.originalId).not.toContain('secret-token')
  })
  it('recognizes test purchases and old token replacement without trusting the client', () => {
    const purchase = normalizeGooglePurchase({ ...google, testPurchase: {}, linkedPurchaseToken: 'old-token' }, 'token')
    expect(purchase.environment).toBe('SANDBOX')
    expect(purchase.replacesOriginalId).toHaveLength(64)
    expect(purchase.acknowledgementNeeded).toBe(true)
  })
  it('rejects Google purchases without account binding, wrong base plans or unknown state', () => {
    expect(() => normalizeGooglePurchase({ ...google, externalAccountIdentifiers: undefined }, 'token')).toThrow()
    expect(() => normalizeGooglePurchase({ ...google, subscriptionState: 'UNSPECIFIED' }, 'token')).toThrow()
    expect(() => normalizeGooglePurchase({ ...google, lineItems: [{ ...google.lineItems[0], offerDetails: { basePlanId: 'other' } }] }, 'token')).toThrow()
  })

  it('binds out-of-app resubscriptions without treating an expired identity token as a replacement', () => {
    const purchase = normalizeGooglePurchase({ ...google, externalAccountIdentifiers: undefined,
      outOfAppPurchaseContext: { expiredPurchaseToken: 'old-token',
        expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: account } } }, 'new-token')
    expect(purchase.accountToken).toBe(account)
    expect(purchase.resubscription).toBe(true)
    expect(purchase.replacesOriginalId).toBeUndefined()
  })
  it('accepts a stored exact-token identity after acknowledgement but rejects conflicting identities', () => {
    const unbound = { ...google, externalAccountIdentifiers: undefined }
    expect(normalizeGooglePurchase(unbound, 'token', { accountTokens: [account] }).accountToken).toBe(account)
    expect(() => normalizeGooglePurchase(unbound, 'token')).toThrow()
    expect(() => normalizeGooglePurchase(google, 'token', { accountTokens: ['another-account'] })).toThrow()
    expect(() => normalizeGooglePurchase({ ...google, outOfAppPurchaseContext: {
      expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: 'another-account' },
    } }, 'token')).toThrow()
  })

  const futureProduct = `${ANSTOSS_BUNDLE_ID}.club3.monthly`
  const fromItem = { ...google.lineItems[0], autoRenewingPlan: {}, deferredItemReplacement: { productId: futureProduct } }
  const toItem = { productId: futureProduct, autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: 'monthly' } }
  const pair = { fromProductId: fromItem.productId, toProductId: futureProduct }
  it.each([false, true])('grants only the current plan during a deferred replacement (reversed: %s)', (reverse) => {
    const lineItems = reverse ? [toItem, fromItem] : [fromItem, toItem]
    const purchase = normalizeGooglePurchase({ ...google, lineItems, linkedPurchaseToken: 'old' }, 'new', { now })
    expect(purchase.productId).toBe(fromItem.productId)
    expect(purchase.autoRenew).toBe(false)
    expect(purchase.deferredReplacement).toEqual(pair)
    expect(purchase.acknowledgementNeeded).toBe(true)
    expect(purchaseGrantStatus(purchase, new Date(end))).toBe('EXPIRED')
    expect(normalizeGooglePurchase({ ...google, lineItems }, 'new', { now: new Date(end + 1) }).productId).toBe(fromItem.productId)
  })
  it('switches to the renewed plan only after its predecessor expires and Google supplies its expiry', () => {
    const lineItems = [{ ...fromItem, deferredItemReplacement: undefined }, { ...toItem,
      expiryTime: new Date(end + 86400000).toISOString(), itemReplacement: {
        productId: fromItem.productId, basePlanId: 'monthly', replacementMode: 'DEFERRED',
      } }]
    expect(normalizeGooglePurchase({ ...google, lineItems }, 'new', { now: new Date(end) }).productId).toBe(futureProduct)
    expect(() => normalizeGooglePurchase({ ...google, lineItems }, 'new', { now })).toThrow()
    const withoutMarker = [lineItems[0], { ...lineItems[1], itemReplacement: undefined }]
    expect(() => normalizeGooglePurchase({ ...google, lineItems: withoutMarker }, 'new', { now: new Date(end) })).toThrow()
    expect(normalizeGooglePurchase({ ...google, lineItems: withoutMarker }, 'new', {
      now: new Date(end), deferredReplacement: pair,
    }).productId).toBe(futureProduct)
  })
  it('handles a round-trip replacement without mistaking historical metadata for the current edge', () => {
    const old = { ...fromItem, itemReplacement: { productId: futureProduct, basePlanId: 'monthly', replacementMode: 'DEFERRED' } }
    const next = { ...toItem, itemReplacement: { productId: fromItem.productId, basePlanId: 'monthly', replacementMode: 'DEFERRED' } }
    expect(normalizeGooglePurchase({ ...google, lineItems: [next, old] }, 'round-trip', { now }).productId).toBe(fromItem.productId)
    expect(normalizeGooglePurchase({ ...google, lineItems: [{ ...next, expiryTime: new Date(end + 86400000).toISOString() },
      { ...old, deferredItemReplacement: undefined }] }, 'round-trip', { now: new Date(end) }).productId).toBe(futureProduct)
  })
  it.each([
    [fromItem, { ...toItem, productId: 'foreign.app' }],
    [fromItem, { ...toItem, offerDetails: { basePlanId: 'wrong' } }],
    [{ ...fromItem, deferredItemReplacement: undefined }, toItem],
    [fromItem, toItem, toItem],
    [fromItem, { ...toItem, itemReplacement: { productId: fromItem.productId, basePlanId: 'monthly', replacementMode: 'KEEP_EXISTING' } }],
    [fromItem, { ...toItem, expiryTime: new Date(end + 1000).toISOString() }],
    [fromItem, { ...toItem, expiryTime: 'invalid' }],
    [{ ...fromItem, prepaidPlan: {} }, toItem],
  ])('rejects unsupported or contradictory multi-item purchases %#', (...lineItems) => {
    expect(() => normalizeGooglePurchase({ ...google, lineItems }, 'new', { now })).toThrow()
  })
})
