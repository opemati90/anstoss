import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import * as sdk from 'expo-iap'
import type { Purchase } from 'expo-iap'
import { api } from '../api/client'
import { useStoreBilling } from './useStoreBilling'
import { fallbackClubPlan } from './useClubPlan'

let mockAuth = { activeClub: { club: { id: 'club-a' } }, user: { id: 'owner' }, token: 'session' }
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }))
jest.mock('../api/client', () => ({ api: jest.fn() }))
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: jest.fn(() => ({})),
}))
jest.mock('expo-iap', () => ({
  initConnection: jest.fn(), fetchProducts: jest.fn(), getAvailablePurchases: jest.fn(),
  finishTransaction: jest.fn(), restorePurchases: jest.fn(), requestPurchase: jest.fn(),
  purchaseUpdatedListener: jest.fn(), purchaseErrorListener: jest.fn(),
}))

const account = 'ae119da1-dcea-46fc-a465-cf9ef88b9d0b'
const sku = 'com.renuirug.anstoss.team.monthly'
const status = { enabled: true, accountToken: account, products: [sku], subscriptions: [] }
const purchase = { id: '123', productId: sku, store: 'apple', purchaseState: 'purchased',
  environmentIOS: 'Sandbox', appAccountToken: account } as Purchase
const paidPlan = { ...fallbackClubPlan('club-a', true), tier: 'PRO', source: 'PAID' }
const refresh = jest.fn()
const originalOS = Platform.OS
let receive: (purchase: Purchase) => void

beforeEach(() => {
  jest.resetAllMocks()
  ;(requireOptionalNativeModule as jest.Mock).mockReturnValue({})
  Platform.OS = 'ios'
  mockAuth = { activeClub: { club: { id: 'club-a' } }, user: { id: 'owner' }, token: 'session' }
  ;(api as jest.Mock).mockImplementation(async (path: string) => path.endsWith('/verify') ? paidPlan : status)
  ;(sdk.initConnection as jest.Mock).mockResolvedValue(true)
  ;(sdk.fetchProducts as jest.Mock).mockResolvedValue([])
  ;(sdk.getAvailablePurchases as jest.Mock).mockResolvedValue([])
  ;(sdk.finishTransaction as jest.Mock).mockResolvedValue(undefined)
  ;(sdk.restorePurchases as jest.Mock).mockResolvedValue(undefined)
  ;(sdk.purchaseUpdatedListener as jest.Mock).mockImplementation(listener => { receive = listener; return { remove: jest.fn() } })
  ;(sdk.purchaseErrorListener as jest.Mock).mockReturnValue({ remove: jest.fn() })
  refresh.mockResolvedValue(undefined)
})
afterEach(() => { Platform.OS = originalOS })

it.each(['empty', 'failed'])('restores existing purchases with an %s catalogue', async (catalogue) => {
  if (catalogue === 'failed') (sdk.fetchProducts as jest.Mock).mockRejectedValue(new Error('catalogue offline'))
  const { result } = renderHook(() => useStoreBilling(true, refresh))
  await waitFor(() => expect(result.current.restoreReady).toBe(true))
  expect(result.current.ready).toBe(false)
  expect(sdk.getAvailablePurchases).toHaveBeenCalled()
  ;(sdk.getAvailablePurchases as jest.Mock).mockResolvedValue([purchase])
  await act(async () => { await result.current.restore() })
  expect(result.current.message).toBe('restored')
  expect(sdk.finishTransaction).toHaveBeenCalledTimes(1)
  expect(api).toHaveBeenCalledWith('/clubs/club-a/plan/store/verify', expect.objectContaining({
    body: { store: 'APPLE', environment: 'SANDBOX', reference: '123' },
  }))
})

it('deduplicates simultaneous events and finishes only after server verification', async () => {
  let resolveVerification!: (value: unknown) => void
  const verification = new Promise(resolve => { resolveVerification = resolve })
  ;(api as jest.Mock).mockImplementation((path: string) => path.endsWith('/verify') ? verification : Promise.resolve(status))
  const { result } = renderHook(() => useStoreBilling(true, refresh))
  await waitFor(() => expect(result.current.restoreReady).toBe(true))
  act(() => { receive(purchase); receive(purchase) })
  expect((api as jest.Mock).mock.calls.filter(([path]) => path.endsWith('/verify'))).toHaveLength(1)
  expect(sdk.finishTransaction).not.toHaveBeenCalled()
  await act(async () => { resolveVerification(paidPlan); await verification })
  await waitFor(() => expect(result.current.message).toBe('verified'))
  expect(sdk.finishTransaction).toHaveBeenCalledTimes(1)
})

it('leaves an unverified purchase unfinished and retryable', async () => {
  ;(api as jest.Mock).mockImplementation(async (path: string) => {
    if (path.endsWith('/verify')) throw new Error('verification failed')
    return status
  })
  const { result } = renderHook(() => useStoreBilling(true, refresh))
  await waitFor(() => expect(result.current.restoreReady).toBe(true))
  act(() => receive(purchase))
  await waitFor(() => expect(result.current.message).toBe('verifyError'))
  expect(sdk.finishTransaction).not.toHaveBeenCalled()
  expect(refresh).not.toHaveBeenCalled()
  ;(api as jest.Mock).mockImplementation(async (path: string) => path.endsWith('/verify') ? paidPlan : status)
  act(() => receive(purchase))
  await waitFor(() => expect(result.current.message).toBe('verified'))
})

it('does not finish or apply a pending verification after switching clubs', async () => {
  let resolveVerification!: (value: unknown) => void
  const verification = new Promise(resolve => { resolveVerification = resolve })
  ;(api as jest.Mock).mockImplementation((path: string) => path.endsWith('/verify') ? verification : Promise.resolve(status))
  const { result, rerender } = renderHook(() => useStoreBilling(true, refresh))
  await waitFor(() => expect(result.current.restoreReady).toBe(true))
  act(() => receive(purchase))
  mockAuth = { ...mockAuth, activeClub: { club: { id: 'club-b' } } }
  rerender({})
  await act(async () => { resolveVerification(paidPlan); await verification })
  expect(sdk.finishTransaction).not.toHaveBeenCalled()
  expect(refresh).not.toHaveBeenCalled()
})

it('does not acknowledge a Google purchase twice after server verification', async () => {
  Platform.OS = 'android'
  const { result } = renderHook(() => useStoreBilling(true, refresh))
  await waitFor(() => expect(result.current.restoreReady).toBe(true))
  act(() => receive({ id: 'google-order', productId: sku, store: 'google', purchaseState: 'purchased',
    purchaseToken: 'local-test-token', obfuscatedAccountIdAndroid: account } as Purchase))
  await waitFor(() => expect(result.current.message).toBe('verified'))
  expect(sdk.finishTransaction).not.toHaveBeenCalled()
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('keeps refreshed subscription status when a slow catalogue arrives afterwards', async () => {
  let resolveProducts!: (value: unknown[]) => void
  const products = new Promise<unknown[]>(resolve => { resolveProducts = resolve })
  ;(sdk.fetchProducts as jest.Mock).mockReturnValue(products)
  const subscription = { store: 'APPLE', environment: 'SANDBOX', productId: sku,
    status: 'ACTIVE', expiresAt: '2027-01-01T00:00:00.000Z', autoRenew: true }
  let statusReads = 0
  ;(api as jest.Mock).mockImplementation(async (path: string) => path.endsWith('/verify') ? paidPlan
    : statusReads++ === 0 ? status : { ...status, subscriptions: [subscription] })
  const { result } = renderHook(() => useStoreBilling(true, refresh))
  await waitFor(() => expect(result.current.restoreReady).toBe(true))
  act(() => receive(purchase))
  await waitFor(() => expect(result.current.subscriptions).toHaveLength(1))
  await act(async () => { resolveProducts([{ id: sku, platform: 'ios', type: 'subs', displayPrice: '€12.99' }]); await products })
  expect(result.current.ready).toBe(true)
  expect(result.current.subscriptions).toEqual([subscription])
})
