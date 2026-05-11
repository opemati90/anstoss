import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.defaultValue === 'string') {
        return String(opts.defaultValue).replace(/\{\{(\w+)\}\}/g, (_full, key) =>
          opts && key in opts ? String(opts[key]) : `{{${key}}}`,
        )
      }
      return _key
    },
  }),
}))

const mockApi = jest.fn()
jest.mock('../../api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error {
    status?: number
  },
}))

const mockUseAuth = jest.fn()
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

import { PaywallSheet } from './PaywallSheet'

describe('PaywallSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockReset()
    mockUseAuth.mockReturnValue({
      activeClub: { club: { id: 'club-1' }, role: 'OWNER' },
    })
    process.env.EXPO_PUBLIC_STRIPE_PLUS_PRICE_ID = 'price_monthly'
    process.env.EXPO_PUBLIC_STRIPE_PLUS_YEARLY_PRICE_ID = 'price_yearly'
  })

  it('does not render anything when closed', () => {
    const { queryByText } = render(
      <PaywallSheet visible={false} onClose={jest.fn()} />,
    )
    // BottomSheet hides children when not visible — the editorial
    // headline should not be in the tree.
    expect(queryByText(/Built for clubs/)).toBeNull()
  })

  it('renders editorial title + features when no trigger', () => {
    const { getByText } = render(
      <PaywallSheet visible onClose={jest.fn()} />,
    )
    expect(getByText(/Built for clubs that take Saturdays seriously/)).toBeTruthy()
    expect(getByText(/Lineup Builder Pro/)).toBeTruthy()
    expect(getByText(/Stripe contribution intake/)).toBeTruthy()
  })

  it('shows feature-specific title when triggerFeature is set', () => {
    const { getByText } = render(
      <PaywallSheet
        visible
        onClose={jest.fn()}
        triggerFeature="lineup_builder_pro"
      />,
    )
    // Trigger label falls through to the generic key in the t() mock
    // since we don't seed paywall.triggers.* — confirms the wiring
    // without exercising real i18n.
    expect(getByText(/Plus unlocks/)).toBeTruthy()
  })

  it('toggles between monthly and yearly pricing', () => {
    const { getByText, queryByText } = render(
      <PaywallSheet visible onClose={jest.fn()} />,
    )
    // Yearly is the default — €199/yr vs €19.99/mo → 17% savings badge
    expect(getByText(/−17%/)).toBeTruthy()
    expect(getByText('199')).toBeTruthy()
    expect(queryByText('19.99')).toBeNull()

    fireEvent.press(getByText('Monthly'))

    expect(getByText('19.99')).toBeTruthy()
    expect(queryByText('199')).toBeNull()
  })

  it('blocks non-owner from upgrading and surfaces an alert', async () => {
    mockUseAuth.mockReturnValue({
      activeClub: { club: { id: 'club-1' }, role: 'COACH' },
    })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const { getByText } = render(
      <PaywallSheet visible onClose={jest.fn()} />,
    )
    await act(async () => {
      fireEvent.press(getByText(/Upgrade/))
    })
    await waitFor(() => expect(alertSpy).toHaveBeenCalled())
    expect(alertSpy.mock.calls[0][0]).toMatch(/Owner only/i)
    expect(mockApi).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('shows the trust line with cancel-anytime copy', () => {
    const { getByText } = render(
      <PaywallSheet visible onClose={jest.fn()} />,
    )
    expect(getByText(/Secure checkout via Stripe/)).toBeTruthy()
  })

  it('shows yearly per-month hint when yearly is selected', () => {
    const { getByText } = render(
      <PaywallSheet visible onClose={jest.fn()} />,
    )
    // 199 / 12 ≈ 17 (Math.round)
    expect(getByText(/About €17\/mo, billed yearly/)).toBeTruthy()
  })

  it('calls onClose when Maybe later is pressed', () => {
    const onClose = jest.fn()
    const { getByText } = render(
      <PaywallSheet visible onClose={onClose} />,
    )
    fireEvent.press(getByText('Maybe later'))
    expect(onClose).toHaveBeenCalled()
  })
})
