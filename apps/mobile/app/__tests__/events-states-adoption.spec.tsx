import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => {
      cb()
    }, [cb])
  },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'c1', name: 'FC Test' }, role: 'COACH', permissions: {} },
    activeTeamId: 't1',
    activeTeamAccess: { role: 'HEAD_COACH' },
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import EventsScreen from '../(tabs)/events'

describe('Events screen — states adoption', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('renders LoadingBoundary skeleton on first mount', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<EventsScreen />)
    expect(getByTestId('events-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy keys when events list resolves to []', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<EventsScreen />)
    expect(await findByText('states.events.empty.title')).toBeTruthy()
    expect(await findByText('states.events.empty.body')).toBeTruthy()
  })

  it('renders error copy keys + retry when fetch throws', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<EventsScreen />)
    expect(await findByText('states.events.error.title')).toBeTruthy()
    expect(await findByText('states.common.retry')).toBeTruthy()
  })
})
