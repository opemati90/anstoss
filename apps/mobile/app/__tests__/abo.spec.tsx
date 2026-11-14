import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import AboScreen from '../abo'
import { fallbackClubPlan, useClubPlan } from '../../src/hooks/useClubPlan'

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
  mockPlan.mockReturnValue({
    plan: fallbackClubPlan('club', true),
    loading: false,
    error: false,
    refresh,
    startTrial,
  })
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
