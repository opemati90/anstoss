import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { clubPlanSchema, storeBillingStatusSchema, type StoreBillingStatus } from '@anstoss/shared'
import type { ProductOrSubscription, Purchase } from 'expo-iap'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { nativeOffer, nativePurchaseRequest, purchaseVerification } from '../billing/native-store'

type Iap = typeof import('expo-iap')
type BillingMessage = 'unavailable' | 'pending' | 'verified' | 'verifyError' | 'restored' | 'nothingToRestore' | 'checkoutOwned' | null
type BillingSnapshot = { scope: string; status: StoreBillingStatus; products: ProductOrSubscription[] }

/** No local premium flag: every finish/restore follows durable server verification. */
export function useStoreBilling(canManage: boolean, onVerified: () => Promise<unknown>) {
  const { activeClub, user, token } = useAuth()
  const clubId = activeClub?.club.id
  const scope = JSON.stringify([clubId, user?.id, token, canManage])
  const currentScope = useRef(scope)
  currentScope.current = scope
  const onVerifiedRef = useRef(onVerified)
  onVerifiedRef.current = onVerified
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null)
  const [connectedScope, setConnectedScope] = useState<string | null>(null)
  const [busyScope, setBusyScope] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ scope: string; message: BillingMessage } | null>(null)
  const iap = useRef<Iap | null>(null)
  const processPurchase = useRef<((purchase: Purchase) => Promise<boolean>) | null>(null)
  const locked = useRef(false)
  const accountToken = useRef<string | null>(null)
  const store = Platform.OS === 'ios' ? 'APPLE' : 'GOOGLE'
  const path = `/clubs/${encodeURIComponent(clubId ?? '')}/plan/store`
  const requestHeaders = { Authorization: `Bearer ${token ?? ''}` }

  useEffect(() => {
    setConnectedScope(null)
    let alive = true
    const isCurrent = () => alive && currentScope.current === scope
    let removeUpdated: (() => void) | undefined
    let removeError: (() => void) | undefined
    let appStateListener: ReturnType<typeof AppState.addEventListener> | undefined
    const processing = new Map<string, Promise<boolean>>()
    const message = (value: BillingMessage) => { if (isCurrent()) setFeedback({ scope, message: value }) }

    const load = async () => {
      const status = storeBillingStatusSchema.parse(await api(`${path}?store=${store}`, { headers: requestHeaders }))
      if (!isCurrent()) return
      accountToken.current = status.accountToken
      setSnapshot({ scope, status, products: [] })
      if (!status.enabled || !requireOptionalNativeModule('ExpoIap')) { message('unavailable'); return }
      // Load only after the native-module guard, keeping older binaries safe.
      const sdk: Iap = require('expo-iap')
      if (!isCurrent()) return
      iap.current = sdk
      const handle = async (purchase: Purchase) => {
        if (!isCurrent() || !status.products.includes(purchase.productId)) return false
        const payer = 'appAccountToken' in purchase ? purchase.appAccountToken
          : 'obfuscatedAccountIdAndroid' in purchase ? purchase.obfuscatedAccountIdAndroid : null
        if (payer && accountToken.current && payer.toLowerCase() !== accountToken.current.toLowerCase()) return false
        if (purchase.purchaseState === 'pending') { message('pending'); setBusyScope(null); return false }
        if (purchase.purchaseState !== 'purchased') return false
        const reference = purchase.purchaseToken ?? purchase.id
        const prior = processing.get(reference)
        if (prior) return prior
        const work = (async () => {
          try {
            const result = clubPlanSchema.parse(await api(`${path}/verify`, { method: 'POST', body: purchaseVerification(purchase), headers: requestHeaders }))
            if (!isCurrent()) return false
            if (result.clubId !== clubId) throw new Error('Unexpected purchase club')
            // Google is acknowledged by the backend after the DB commit. A
            // second native acknowledgement can fail for an already-acked token.
            if (purchase.store === 'apple') await sdk.finishTransaction({ purchase, isConsumable: false })
            await onVerifiedRef.current()
            const next = storeBillingStatusSchema.parse(await api(`${path}?store=${store}`, { headers: requestHeaders }))
            if (isCurrent()) {
              setSnapshot((previous) => ({ scope, status: next, products: previous?.scope === scope ? previous.products : [] }))
              message('verified')
            }
            return result.source === 'PAID'
          } catch { message('verifyError'); throw new Error('Store verification incomplete') }
          finally { if (isCurrent()) { setBusyScope(null); locked.current = false } }
        })()
        processing.set(reference, work)
        try { return await work } finally { processing.delete(reference) }
      }
      processPurchase.current = handle
      const updated = sdk.purchaseUpdatedListener((purchase) => { void handle(purchase).catch(() => undefined) })
      const errors = sdk.purchaseErrorListener((error) => {
        if (!isCurrent()) return
        const pending = error.code === 'deferred-payment' || error.code === 'pending'
        message(error.code === 'user-cancelled' ? null : pending ? 'pending' : 'verifyError')
        setBusyScope(null)
        locked.current = pending
      })
      removeUpdated = () => updated.remove()
      removeError = () => errors.remove()
      await sdk.initConnection()
      if (!isCurrent()) return
      setConnectedScope(scope)
      // Restoring owned purchases must not depend on the sales catalogue.
      // Run both independently so a slow or unavailable catalogue cannot block recovery.
      void sdk.fetchProducts({ skus: status.products, type: 'subs' }).then((products) => {
        if (isCurrent()) setSnapshot(previous => ({ scope,
          status: previous?.scope === scope ? previous.status : status, products: products ?? [],
        }))
      }).catch(() => message('unavailable'))
      void sdk.getAvailablePurchases().then(async (purchases) => {
        for (const purchase of purchases) await handle(purchase).catch(() => undefined)
      }).catch(() => message('verifyError'))
      appStateListener = AppState.addEventListener('change', (state) => {
        if (state === 'active' && isCurrent()) {
          void onVerifiedRef.current()
          void sdk.getAvailablePurchases().then(async (purchases) => {
            for (const purchase of purchases) await handle(purchase)
          }).catch(() => message('verifyError'))
        }
      })
    }
    if (clubId && user?.id && token && canManage && ['ios', 'android'].includes(Platform.OS)) {
      void load().catch(() => message('unavailable'))
    }
    return () => {
      alive = false
      removeUpdated?.()
      removeError?.()
      appStateListener?.remove()
      iap.current = null
      processPurchase.current = null
      locked.current = false
      accountToken.current = null
    }
  }, [scope, clubId, user?.id, token, canManage, path, store])

  const visible = snapshot?.scope === scope ? snapshot : null
  const checkout = visible?.status.checkout
  const checkoutBlocked = Boolean(checkout && (!checkout.ownedByYou || checkout.store !== store))
  const subscribe = useCallback(async (productId: string) => {
    if (currentScope.current !== scope || locked.current || !iap.current || !canManage || !visible?.status.enabled || checkoutBlocked) return
    if (checkout?.productId && checkout.productId !== productId) {
      setFeedback({ scope, message: 'checkoutOwned' })
      return
    }
    const product = visible.products.find((entry) => entry.id === productId)
    if (!product || !nativeOffer(product)) return
    locked.current = true
    setBusyScope(scope)
    setFeedback({ scope, message: null })
    try {
      const prepared = await api<{ accountToken: string }>(`${path}/prepare`, { method: 'POST', body: { store, productId }, headers: requestHeaders })
      if (currentScope.current !== scope || !iap.current) return
      accountToken.current = prepared.accountToken
      await iap.current.requestPurchase(nativePurchaseRequest(product, prepared.accountToken))
    } catch (error) {
      if (currentScope.current === scope) {
        const owned = error && typeof error === 'object' && 'code' in error && error.code === 'STORE_CHECKOUT_OWNED'
        setFeedback({ scope, message: owned ? 'checkoutOwned' : 'verifyError' })
        locked.current = false
        setBusyScope(null)
      }
    }
  }, [canManage, visible, scope, path, store, checkoutBlocked, checkout?.productId])

  const restore = useCallback(async () => {
    if (currentScope.current !== scope || connectedScope !== scope || !canManage ||
        !visible?.status.enabled || locked.current || !iap.current || !processPurchase.current) return
    locked.current = true
    setBusyScope(scope)
    setFeedback({ scope, message: null })
    try {
      await iap.current.restorePurchases()
      const purchases = await iap.current.getAvailablePurchases()
      let restored = false
      for (const purchase of purchases) {
        if (currentScope.current !== scope || !processPurchase.current) return
        restored = (await processPurchase.current(purchase)) || restored
      }
      if (currentScope.current === scope) setFeedback({ scope, message: restored ? 'restored' : 'nothingToRestore' })
    } catch { if (currentScope.current === scope) setFeedback({ scope, message: 'verifyError' }) }
    finally { if (currentScope.current === scope) { locked.current = false; setBusyScope(null) } }
  }, [scope, connectedScope, canManage, visible?.status.enabled])

  const manage = useCallback(async (subscriptionStore: 'APPLE' | 'GOOGLE') => {
    try {
      await Linking.openURL(subscriptionStore === 'APPLE'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions?package=com.renuirug.anstoss')
    } catch { setFeedback({ scope, message: 'unavailable' }) }
  }, [scope])

  return {
    ready: Boolean(visible?.status.enabled && visible.products.length),
    restoreReady: Boolean(canManage && visible?.status.enabled && connectedScope === scope),
    busy: busyScope === scope || (feedback?.scope === scope && feedback.message === 'pending'),
    message: checkoutBlocked ? 'checkoutOwned' : (feedback?.scope === scope ? feedback.message : null) ?? (checkout?.productId ? 'checkoutOwned' : null),
    checkoutBlocked,
    checkoutProductId: checkout?.productId ?? null,
    products: visible?.products ?? [], subscriptions: visible?.status.subscriptions ?? [],
    subscribe, restore, manage,
  }
}
