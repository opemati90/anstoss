import React from 'react'
import { render } from '@testing-library/react-native'

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
})
