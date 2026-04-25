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
  useAuth: () => ({
    activeClub: { club: { id: 'c1', name: 'FC' } },
    activeTeamId: 't1',
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import TeamMatchesScreen from '../team-matches'

describe('team-matches — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<TeamMatchesScreen />)
    expect(getByTestId('team-matches-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when both lists empty', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<TeamMatchesScreen />)
    expect(await findByText('states.team_matches.empty.title')).toBeTruthy()
  })

  it('renders error state copy on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<TeamMatchesScreen />)
    expect(await findByText('states.team_matches.error.title')).toBeTruthy()
  })
})
