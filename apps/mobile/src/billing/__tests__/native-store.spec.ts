import { nativeOffer, nativePurchaseRequest, purchaseVerification } from '../native-store'
import type { ProductOrSubscription, Purchase } from 'expo-iap'

const product = { id: 'com.renuirug.anstoss.team.monthly', platform: 'ios', type: 'subs', displayPrice: '12,99 €' } as ProductOrSubscription
const purchase = { id: '123', productId: product.id, store: 'apple', purchaseState: 'purchased', environmentIOS: 'Sandbox' } as Purchase

it('uses StoreKit account binding and never auto-finishes before verification', () => {
  expect(nativePurchaseRequest(product, 'account')).toEqual({ type: 'subs', request: { apple: {
    sku: product.id, appAccountToken: 'account', andDangerouslyFinishTransactionAutomatically: false,
  } } })
})
it('passes the transaction ID and correctly routes Apple sandbox verification', () => {
  expect(purchaseVerification(purchase)).toEqual({ store: 'APPLE', reference: '123', environment: 'SANDBOX' })
})
it('rejects pending, foreign and unidentifiable purchases', () => {
  expect(() => purchaseVerification({ ...purchase, purchaseState: 'pending' })).toThrow()
  expect(() => purchaseVerification({ ...purchase, productId: 'other.app' })).toThrow()
  expect(() => purchaseVerification({ ...purchase, environmentIOS: undefined } as Purchase)).toThrow()
})
it('does not sell a Google product without the exact auto-renewing base plan offer', () => {
  const google = { ...product, platform: 'android', subscriptionOffers: [] } as ProductOrSubscription
  expect(nativeOffer(google)).toBeNull()
  expect(() => nativePurchaseRequest(google, 'account')).toThrow()
})
it('uses the eligible Google base-plan price, not the generic product headline', () => {
  const google = { ...product, platform: 'android', displayPrice: 'wrong', subscriptionOffers: [{
    basePlanIdAndroid: 'monthly', offerTokenAndroid: 'offer-token',
    pricingPhasesAndroid: { pricingPhaseList: [{ billingPeriod: 'P1M', recurrenceMode: 1, formattedPrice: '£10.99' }] },
  }] } as unknown as ProductOrSubscription
  expect(nativeOffer(google)?.displayPrice).toBe('£10.99')
  expect(nativePurchaseRequest(google, 'account')).toEqual({ type: 'subs', request: { google: {
    skus: [product.id], obfuscatedAccountId: 'account', subscriptionOffers: [{ sku: product.id, offerToken: 'offer-token' }],
  } } })
})
