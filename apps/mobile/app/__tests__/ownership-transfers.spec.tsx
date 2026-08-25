import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import OwnershipTransfersScreen from '../ownership-transfers'

const mockApi = jest.fn()
const mockReauthenticate = jest.fn()

jest.mock('../../src/api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const ReactModule = require('react') as typeof React
    ReactModule.useEffect(() => callback(), [])
  },
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1', email: 'owner@example.com' },
    activeClub: { role: 'OWNER', club: { id: 'club-1' } },
    refreshUser: jest.fn(),
    reauthenticate: mockReauthenticate,
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    surfaceSunken: '#fafafa', primary: '#c00', background: '#fff', surface: '#fff',
    border: '#ddd', borderDefault: '#ddd', textPrimary: '#111', textSecondary: '#555',
  }),
  useIsDark: () => false,
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, params?: { name?: string }) => params?.name ? `${key}:${params.name}` : key }),
}))

describe('ownership transfer step-up', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockReauthenticate.mockReset().mockResolvedValue(undefined)
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      const confirm = buttons?.find((button) => button.style === 'destructive')
      if (confirm?.onPress) void confirm.onPress()
    })
    mockApi
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'member-row', userId: 'member-1', role: 'ADMIN', user: { id: 'member-1', name: 'Alex', email: 'alex@example.com', avatarUrl: null } },
      ])
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ id: 'transfer-1' })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
  })

  it('requires a fresh email code before starting a transfer', async () => {
    const screen = render(<OwnershipTransfersScreen />)
    await waitFor(() => expect(screen.getByText('Alex')).toBeTruthy())
    fireEvent.press(screen.getByText('Alex'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/auth/otp/request', {
        method: 'POST',
        body: { email: 'owner@example.com' },
      }),
    )
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
    fireEvent.press(screen.getByText('common.confirm'))
    await waitFor(() => expect(mockReauthenticate).toHaveBeenCalledWith('123456'))
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/ownership-transfers', {
      method: 'POST',
      body: { toUserId: 'member-1' },
    })
  })
})
