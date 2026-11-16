import { STORE_PRODUCTS, type StoreBillingRequest } from '@anstoss/shared'
import type { ProductOrSubscription, Purchase, RequestPurchaseProps } from 'expo-iap'

export class NativePurchaseUnavailableError extends Error {
  constructor() { super('Native purchase is unavailable'); this.name = 'NativePurchaseUnavailableError' }
}

export function purchaseVerification(purchase: Purchase): StoreBillingRequest {
  if (!STORE_PRODUCTS.some((item) => item.id === purchase.productId) || purchase.purchaseState !== 'purchased') {
    throw new NativePurchaseUnavailableError()
  }
  if (purchase.store === 'apple') {
    const environment = 'environmentIOS' in purchase ? purchase.environmentIOS : null
    if (environment !== 'Sandbox' && environment !== 'Production') throw new NativePurchaseUnavailableError()
    return { store: 'APPLE', reference: purchase.id, environment: environment === 'Sandbox' ? 'SANDBOX' : 'PRODUCTION' }
  }
  if (purchase.store !== 'google' || !purchase.purchaseToken) throw new NativePurchaseUnavailableError()
  // The server determines Google's environment from the authenticated API.
  return { store: 'GOOGLE', reference: purchase.purchaseToken, environment: 'PRODUCTION' }
}

export function nativeOffer(product: ProductOrSubscription) {
  const definition = STORE_PRODUCTS.find((item) => item.id === product.id)
  if (!definition || product.type !== 'subs') return null
  if (product.platform === 'ios') return { displayPrice: product.displayPrice, token: undefined }
  const period = definition.interval === 'monthly' ? 'P1M' : 'P1Y'
  const offer = product.subscriptionOffers?.find((item) => {
    const phases = item.pricingPhasesAndroid?.pricingPhaseList
    // Launch uses plain auto-renewing base plans, not undisclosed trials or offers.
    return item.basePlanIdAndroid === definition.interval && item.offerTokenAndroid &&
      phases?.length === 1 && phases[0].recurrenceMode === 1 && phases[0].billingPeriod === period
  })
  return offer ? { displayPrice: offer.pricingPhasesAndroid!.pricingPhaseList[0].formattedPrice, token: offer.offerTokenAndroid! } : null
}

export function nativePurchaseRequest(product: ProductOrSubscription, accountToken: string): RequestPurchaseProps {
  const offer = nativeOffer(product)
  if (!offer) throw new NativePurchaseUnavailableError()
  return {
    type: 'subs',
    request: product.platform === 'ios'
      ? { apple: { sku: product.id, appAccountToken: accountToken, andDangerouslyFinishTransactionAutomatically: false } }
      : { google: { skus: [product.id], obfuscatedAccountId: accountToken, subscriptionOffers: [{ sku: product.id, offerToken: offer.token! }] } },
  }
}
