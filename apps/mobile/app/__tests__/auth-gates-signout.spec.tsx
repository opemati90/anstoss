import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import AccessBlockedScreen from '../access-blocked'
import PendingApprovalScreen from '../pending-approval'

const mockRouterReplace = jest.fn()
const mockSignOut = jest.fn(() => Promise.resolve())
const mockRefreshUser = jest.fn(() => Promise.resolve())

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockRouterReplace(...args),
  },
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: { children?: React.ReactNode; style?: any }) => {
    const React = require('react')
    const { View } = require('react-native')

    return React.createElement(View, { style }, children)
  },
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'more.signOut': 'Sign out',
        'pendingApproval.signOut': 'Sign out',
        'auth.blockedEyebrow': 'Blocked',
        'auth.blockedTitle': 'Access blocked',
        'auth.blockedBody': 'You cannot access this account.',
        'auth.pendingApprovalEyebrow': 'Pending',
        'auth.pendingApprovalTitle': 'Approval pending',
        'auth.pendingApprovalBody': 'Ask your guardian.',
        'auth.guardianFallback': 'your guardian',
        'auth.checkStatus': 'Check status',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    ageGate: {
      guardianEmail: 'guardian@example.com',
    },
    signOut: mockSignOut,
    refreshUser: mockRefreshUser,
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    background: '#FAFAF8',
    surface: '#FFFFFF',
    textPrimary: '#1A1A18',
    textSecondary: '#6B6B69',
    textTertiary: '#9E9E9C',
    textInverse: '#FFFFFF',
    border: '#E5E5E3',
    borderStrong: '#D1D1CC',
    clubPrimary: '#1E3A5F',
    clubPrimaryLight: '#DDE7F1',
    success: '#2D7A3A',
    warning: '#B8860B',
    error: '#C4372C',
    info: '#2563A0',
  }),
  useIsDark: () => false,
}))

jest.mock('../../src/utils/haptics', () => ({
  Haptics: {
    tap: jest.fn(),
    tapMedium: jest.fn(),
    select: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    fail: jest.fn(),
  },
}))

describe('auth gate sign-out', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
  })

  it('routes from access blocked to the signed-out screen after logout', async () => {
    mockSignOut.mockReturnValueOnce(new Promise(() => {}))
    const screen = render(<AccessBlockedScreen />)

    fireEvent.press(screen.getByText('Sign out'))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1)
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/sign-in')
    })
  })

  it('routes from pending approval to the signed-out screen after logout', async () => {
    mockSignOut.mockReturnValueOnce(new Promise(() => {}))
    const screen = render(<PendingApprovalScreen />)

    fireEvent.press(screen.getByText('Sign out'))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1)
      expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/sign-in')
    })
  })
})
