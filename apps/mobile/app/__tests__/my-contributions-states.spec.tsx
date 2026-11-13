import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-native-qrcode-svg', () => () => null)
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' } } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import MyContributionsScreen from '../my-contributions'

describe('my-contributions — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<MyContributionsScreen />)
    expect(getByTestId('my-contributions-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when no contributions', async () => {
    mockApi.mockResolvedValue({ hasContributions: false, items: [] })
    const { findByText } = render(<MyContributionsScreen />)
    expect(await findByText('states.contributions.empty.title')).toBeTruthy()
  })

  it('renders error state copy on failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<MyContributionsScreen />)
    expect(await findByText('states.contributions.error.title')).toBeTruthy()
  })

  it('leads with the open item, shows transfer details and reports a payment', async () => {
    mockApi.mockResolvedValue({
      hasContributions: true,
      bankTransfer: { accountHolder: 'FC e.V.', iban: 'DE89370400440532013000', reference: 'Beitrag' },
      items: [
        {
          planId: 'p1',
          planName: 'Monatsbeitrag',
          amount: 2500,
          currency: 'eur',
          cadence: 'MONTHLY',
          dueDate: '2026-12-15T00:00:00.000Z',
          status: 'PENDING',
          paidAmount: null,
          paidAt: null,
          paymentReported: false,
        },
      ],
    })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const screen = render(<MyContributionsScreen />)
    expect(await screen.findByTestId('my-dues-current')).toBeTruthy()
    expect(screen.getByText('FC e.V.')).toBeTruthy()
    expect(screen.getByText('DE89 3704 0044 0532 0130 00')).toBeTruthy()
    fireEvent.press(screen.getByTestId('my-dues-report'))
    const buttons = alertSpy.mock.calls[0][2] as Array<{ style?: string; onPress?: () => Promise<void> }>
    await buttons.find((b) => b.style === 'default')?.onPress?.()
    expect(mockApi).toHaveBeenCalledWith('/clubs/c1/contributions/my/p1/pay', { method: 'POST' })
  })
})
