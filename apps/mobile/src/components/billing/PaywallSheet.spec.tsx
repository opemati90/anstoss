import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

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
    expect(queryByText('storeBilling.title')).toBeNull()
  })

  it('uses the localized subscription title and verified-access explanation', () => {
    const { getByText } = render(<PaywallSheet visible onClose={jest.fn()} />)
    expect(getByText('storeBilling.title')).toBeTruthy()
    expect(getByText('storeBilling.details')).toBeTruthy()
  })

  it('routes feature gates to the same current plan catalogue', () => {
    const { getByText } = render(
      <PaywallSheet visible onClose={jest.fn()} triggerFeature="lineup_builder_pro" />,
    )
    expect(getByText('storeBilling.viewPlans')).toBeTruthy()
  })

  it('does not promise free premium access or unsupported priority support', () => {
    const { queryByText } = render(<PaywallSheet visible onClose={jest.fn()} />)
    expect(queryByText(/included.*launch|24 hours|Priority support/i)).toBeNull()
  })

  it('dismisses the sheet and opens plans without starting an upgrade', () => {
    const onClose = jest.fn()
    const onUpgradeStarted = jest.fn()
    const { getByText } = render(<PaywallSheet visible onClose={onClose} onUpgradeStarted={onUpgradeStarted} />)
    fireEvent.press(getByText('storeBilling.viewPlans'))
    expect(onClose).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/abo')
    expect(onUpgradeStarted).not.toHaveBeenCalled()
  })

  it('calls onClose when Maybe later is pressed', () => {
    const onClose = jest.fn()
    const { getByText } = render(<PaywallSheet visible onClose={onClose} />)
    fireEvent.press(getByText('Maybe later'))
    expect(onClose).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
