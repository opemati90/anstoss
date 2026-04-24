import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  useLocalSearchParams: () => ({}),
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
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' }, role: 'OWNER' } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import TransferListScreen from '../transfer-list'

jest.useFakeTimers()

describe('transfer-list — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<TransferListScreen />)
    jest.runOnlyPendingTimers()
    expect(getByTestId('transfers-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when list is empty', async () => {
    mockApi.mockResolvedValue({ items: [], page: 1, total: 0 })
    const { findByText } = render(<TransferListScreen />)
    jest.runOnlyPendingTimers()
    expect(await findByText('states.transfers.empty.title')).toBeTruthy()
  })

  it('renders error state on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<TransferListScreen />)
    jest.runOnlyPendingTimers()
    expect(await findByText('states.transfers.error.title')).toBeTruthy()
  })
})
