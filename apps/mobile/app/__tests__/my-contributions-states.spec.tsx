import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
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

import MyContributionsScreen from '../my-contributions'

describe('my-contributions — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<MyContributionsScreen />)
    expect(getByTestId('my-contributions-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when no contributions', async () => {
    mockApi.mockResolvedValue({ hasContributions: false, items: [] })
    const { findByText } = render(<MyContributionsScreen />)
    expect(await findByText('states.contributions.empty.title')).toBeTruthy()
  })

  it('renders error state copy on failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<MyContributionsScreen />)
    expect(await findByText('states.contributions.error.title')).toBeTruthy()
  })
})
