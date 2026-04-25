import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  router: { push: jest.fn(), back: jest.fn() },
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
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' }, role: 'ADMIN' } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import AdminMembersScreen from '../admin-members'

describe('admin-members — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders skeleton through LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<AdminMembersScreen />)
    expect(getByTestId('admin-members-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy keys when list is empty', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<AdminMembersScreen />)
    expect(await findByText('states.admin_members.empty.title')).toBeTruthy()
  })

  it('renders error copy keys on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<AdminMembersScreen />)
    expect(await findByText('states.admin_members.error.title')).toBeTruthy()
  })
})
