import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' } } }),
}))
jest.mock('../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import { DmListView } from '../DmListView'

describe('DmListView — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<DmListView />)
    expect(getByTestId('dm-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when no conversations', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<DmListView />)
    expect(await findByText('states.dm.empty.title')).toBeTruthy()
  })

  it('renders error state on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<DmListView />)
    expect(await findByText('states.dm.error.title')).toBeTruthy()
  })
})
