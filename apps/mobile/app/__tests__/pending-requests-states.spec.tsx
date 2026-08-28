import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  router: { back: jest.fn() },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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

import PendingRequestsScreen from '../pending-requests'

describe('pending-requests — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('shows loading boundary while request in flight', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<PendingRequestsScreen />)
    expect(getByTestId('pending-requests-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy keys when list is empty', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<PendingRequestsScreen />)
    expect(await findByText('states.pending_requests.empty.title')).toBeTruthy()
    expect(await findByText('states.pending_requests.empty.body')).toBeTruthy()
  })

  it('renders error copy keys with retry when fetch fails', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<PendingRequestsScreen />)
    expect(await findByText('states.pending_requests.error.title')).toBeTruthy()
    expect(await findByText('states.common.retry')).toBeTruthy()
  })

  it('posts the exact request revision the admin reviewed', async () => {
    mockApi.mockResolvedValueOnce([
      {
        id: 'jr-1',
        role: 'PLAYER',
        message: null,
        status: 'PENDING',
        revision: 4,
        createdAt: '2026-08-26T12:00:00.000Z',
        user: { id: 'user-1', name: 'Mara', email: 'mara@example.com' },
      },
    ]).mockResolvedValueOnce({ status: 'APPROVED' })

    const screen = render(<PendingRequestsScreen />)
    fireEvent.press(await screen.findByText('pendingRequests.approve'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/join-requests/jr-1/approve', {
        method: 'POST',
        body: { revision: 4 },
      })
    })
  })
})
