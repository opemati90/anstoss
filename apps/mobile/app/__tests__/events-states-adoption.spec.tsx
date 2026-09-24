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
  API_URL: 'http://localhost',
}))
jest.mock('../../src/hooks/useEventsSocket', () => ({ useEventsSocket: () => undefined }))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'c1', name: 'SV Albatros' }, role: 'COACH', permissions: {} },
    activeTeamId: 't1',
    activeTeamAccess: { role: 'HEAD_COACH' },
    activeRoleMode: 'COACH',
    token: null,
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

describe('Events screen — full state cycle', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('shows the header and no empty state while the first load is pending', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByText, queryByText } = render(<EventsScreen />)
    expect(getByText('eventFlow.list.title')).toBeTruthy()
    expect(queryByText('eventFlow.list.emptyTitle')).toBeNull()
  })

  it('resolves an empty list to the composed empty state', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<EventsScreen />)
    expect(await findByText('eventFlow.list.emptyTitle')).toBeTruthy()
    expect(await findByText('eventFlow.list.emptyCoachBody')).toBeTruthy()
  })

  it('resolves a failed load to an inline error with retry, never a stuck skeleton', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<EventsScreen />)
    expect(await findByText('eventFlow.list.errorTitle')).toBeTruthy()
    expect(await findByText('eventFlow.retry')).toBeTruthy()
  })
})
