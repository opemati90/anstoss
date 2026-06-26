import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

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

const mockUseAuth = jest.fn()
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

import { PaywallSheet } from './PaywallSheet'

describe('PaywallSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue({
      activeClub: { club: { id: 'club-1' }, role: 'OWNER' },
    })
  })

  it('does not render anything when closed', () => {
    const { queryByText } = render(<PaywallSheet visible={false} onClose={jest.fn()} />)
    // BottomSheet hides children when not visible — the editorial
    // headline should not be in the tree.
    expect(queryByText(/Launch tools/)).toBeNull()
  })

  it('renders editorial title + features when no trigger', () => {
    const { getByText } = render(<PaywallSheet visible onClose={jest.fn()} />)
    expect(getByText(/Launch tools are included for every club/)).toBeTruthy()
    expect(getByText(/Lineup Builder Pro/)).toBeTruthy()
    expect(getByText(/Club contribution tracking/)).toBeTruthy()
  })

  it('shows feature-specific title when triggerFeature is set', () => {
    const { getByText } = render(
      <PaywallSheet visible onClose={jest.fn()} triggerFeature="lineup_builder_pro" />,
    )
    // Trigger label falls through to the generic key in the t() mock
    // since we don't seed paywall.triggers.* — confirms the wiring
    // without exercising real i18n.
    expect(getByText(/included during launch/)).toBeTruthy()
  })

  it('shows the store-safe no-subscription trust line', () => {
    const { getByText } = render(<PaywallSheet visible onClose={jest.fn()} />)
    expect(getByText(/No digital subscription purchase/)).toBeTruthy()
  })

  it('calls onClose when Continue is pressed', () => {
    const onClose = jest.fn()
    const { getByText } = render(<PaywallSheet visible onClose={onClose} />)
    fireEvent.press(getByText('Continue'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Maybe later is pressed', () => {
    const onClose = jest.fn()
    const { getByText } = render(<PaywallSheet visible onClose={onClose} />)
    fireEvent.press(getByText('Maybe later'))
    expect(onClose).toHaveBeenCalled()
  })
})
