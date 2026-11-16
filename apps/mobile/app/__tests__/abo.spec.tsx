import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import AboScreen from '../abo'
import { fallbackClubPlan, useClubPlan } from '../../src/hooks/useClubPlan'
import { PLAN_PACKAGES } from '@anstoss/shared'
import { useStoreBilling } from '../../src/hooks/useStoreBilling'

jest.mock('../../src/hooks/useStoreBilling', () => ({ useStoreBilling: jest.fn() }))

jest.mock('../../src/api/client', () => ({ api: jest.fn() }))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))
jest.mock('../../src/hooks/useClubPlan', () => ({
  ...jest.requireActual('../../src/hooks/useClubPlan'),
  useClubPlan: jest.fn(),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'club' } } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => require('../../src/theme/club-theme').FALLBACK_THEME,
  useIsDark: () => false,
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true } }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/useSafeAreaInsetsSafe', () => ({
  useSafeAreaInsetsSafe: () => ({ top: 24, bottom: 12 }),
}))
const mockPlan = useClubPlan as jest.Mock
const refresh = jest.fn()
const startTrial = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  ;(useStoreBilling as jest.Mock).mockReturnValue({
    ready: false, busy: false, message: null, products: [], subscriptions: [],
    subscribe: jest.fn(), restore: jest.fn(), manage: jest.fn(),
  })
  mockPlan.mockReturnValue({
    plan: fallbackClubPlan('club', true),
    loading: false,
    error: false,
    refresh,
    startTrial,
  })
})

it('does not expose a purchase action without a native store price', () => {
  const view = render(<AboScreen />)
  expect(view.queryByTestId('abo-subscribe-TEAM')).toBeNull()
  expect(view.getByTestId('abo-restore').props.accessibilityState.disabled).toBe(true)
})

it('allows restore when connected even if the sales catalogue is empty', () => {
  const restore = jest.fn()
  ;(useStoreBilling as jest.Mock).mockReturnValue({
    ready: false, restoreReady: true, busy: false, message: null,
    products: [], subscriptions: [], restore, subscribe: jest.fn(), manage: jest.fn(),
  })
  const view = render(<AboScreen />)
  expect(view.getByTestId('abo-restore').props.accessibilityState.disabled).toBe(false)
  fireEvent.press(view.getByTestId('abo-restore'))
  expect(restore).toHaveBeenCalledTimes(1)
})

it('keeps billing listeners enabled during plan refresh but not after permission loss', () => {
  const plan = fallbackClubPlan('club', true)
  mockPlan.mockReturnValue({ plan, loading: false, error: false, refresh, startTrial })
  const view = render(<AboScreen />)
  expect(useStoreBilling).toHaveBeenLastCalledWith(true, refresh)
  mockPlan.mockReturnValue({ plan, loading: true, error: false, refresh, startTrial })
  view.rerender(<AboScreen />)
  expect(useStoreBilling).toHaveBeenLastCalledWith(true, refresh)
  mockPlan.mockReturnValue({ plan: { ...plan, canManage: false }, loading: false, error: false, refresh, startTrial })
  view.rerender(<AboScreen />)
  expect(useStoreBilling).toHaveBeenLastCalledWith(false, refresh)
  mockPlan.mockReturnValue({ plan: null, loading: false, error: true, refresh, startTrial })
  view.rerender(<AboScreen />)
  expect(useStoreBilling).toHaveBeenLastCalledWith(false, refresh)
})

it('uses the store price and exact approved SKU for purchase', () => {
  const subscribe = jest.fn()
  ;(useStoreBilling as jest.Mock).mockReturnValue({
    ready: true, busy: false, message: null, subscriptions: [], subscribe,
    products: [{ id: 'com.renuirug.anstoss.team.monthly', platform: 'ios', type: 'subs', displayPrice: 'CHF 12.00' }],
  })
  const view = render(<AboScreen />)
  expect(view.getByText('CHF 12.00', { exact: false })).toBeTruthy()
  fireEvent.press(view.getByTestId('abo-subscribe-TEAM'))
  expect(subscribe).toHaveBeenCalledWith('com.renuirug.anstoss.team.monthly')
})

it('does not sell unavailable chat translation or preview access', () => {
  const view = render(<AboScreen />)
  expect(view.queryByText('clubPlan.features.chatTranslation')).toBeNull()
  expect(view.queryByText('clubPlan.features.actingSessions')).toBeNull()
  expect(view.getByText('clubPlan.features.clubColors')).toBeTruthy()
})

it('shows exactly three paid packages and switches to the approved annual totals', () => {
  const view = render(<AboScreen />)
  const format = (cents: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
  expect(PLAN_PACKAGES).toHaveLength(3)
  expect(view.queryByTestId('abo-package-CLUB_6')).toBeNull()
  for (const entry of PLAN_PACKAGES) {
    expect(view.getByTestId(`abo-package-${entry.key}`)).toBeTruthy()
    expect(view.getByText(format(entry.monthly), { exact: false })).toBeTruthy()
  }
  fireEvent.press(view.getByTestId('abo-interval-yearly'))
  for (const entry of PLAN_PACKAGES) {
    expect(view.getByText(format(entry.yearly), { exact: false })).toBeTruthy()
    expect(entry.yearly).toBeLessThan(entry.monthly * 12)
  }
  expect(view.getByText('teamPackages.trial')).toBeTruthy()
  expect(view.queryByText('clubPlan.features.limits')).toBeNull()
})

it('does not show fabricated free-plan usage or trial permission while loading', () => {
  mockPlan.mockReturnValue({ plan: null, loading: true, error: false, refresh, startTrial })
  const view = render(<AboScreen />)
  expect(view.getByLabelText('common.loading')).toBeTruthy()
  expect(view.queryByTestId('abo-current')).toBeNull()
  expect(view.queryByTestId('abo-start-trial')).toBeNull()
})

it('offers retry instead of describing a failed plan load as a read-only account', () => {
  mockPlan.mockReturnValue({ plan: null, loading: false, error: true, refresh, startTrial })
  const view = render(<AboScreen />)
  expect(view.getByText('common.loadError')).toBeTruthy()
  fireEvent.press(view.getByText('common.retry'))
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(view.queryByText('clubPlan.readOnly')).toBeNull()
})

it('shows a failed trial write without a success message', async () => {
  startTrial.mockRejectedValueOnce(new Error('Offline'))
  const view = render(<AboScreen />)
  fireEvent.press(view.getByTestId('abo-start-trial'))
  await waitFor(() => expect(view.getByText('clubPlan.startError')).toBeTruthy())
  expect(view.queryByText('clubPlan.started')).toBeNull()
})

it('keeps a server-confirmed read-only plan free of trial controls', () => {
  mockPlan.mockReturnValue({
    plan: fallbackClubPlan('club', false),
    loading: false,
    error: false,
    refresh,
    startTrial,
  })
  const view = render(<AboScreen />)
  expect(view.getByTestId('abo-current')).toBeTruthy()
  expect(view.getByText('clubPlan.readOnly')).toBeTruthy()
  expect(view.queryByTestId('abo-start-trial')).toBeNull()
})
