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
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC', slug: 'fc' } } }),
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
        teamId: 'team-1',
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

  it('requires a team before approving an older teamless player request', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path === '/clubs/c1/join-requests') return Promise.resolve([{
        id: 'jr-legacy', role: 'PLAYER', teamId: null, message: null,
        status: 'PENDING', revision: 2, createdAt: '2026-08-26T12:00:00.000Z',
        user: { id: 'user-1', name: 'Mara' },
      }])
      if (path.startsWith('/clubs/lookup')) return Promise.resolve({
        teams: [{ id: 'team-1', displayName: 'Herren I' }],
      })
      return Promise.resolve({ status: 'APPROVED' })
    })
    const screen = render(<PendingRequestsScreen />)
    const approve = await screen.findByLabelText('pendingRequests.approve Mara')
    expect(approve.props.accessibilityState?.disabled).toBe(true)
    fireEvent.press(await screen.findByTestId('request-team-jr-legacy-team-1'))
    fireEvent.press(approve)
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/clubs/c1/join-requests/jr-legacy/approve',
      { method: 'POST', body: { revision: 2, teamId: 'team-1' } },
    ))
  })
})
