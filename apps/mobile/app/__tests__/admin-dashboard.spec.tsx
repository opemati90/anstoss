import React from 'react'
import { render, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'c1', name: 'FC Test' }, role: 'OWNER' },
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#000',
    clubPrimaryLight: '#eee',
  }),
}))
jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

import AdminDashboardScreen from '../admin-dashboard'
import { api } from '../../src/api/client'

const mockApi = api as jest.Mock

describe('AdminDashboardScreen', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('renders stat cards after loading', async () => {
    mockApi.mockResolvedValue({
      totalMembers: 42,
      totalTeams: 3,
      upcomingEvents: 5,
      avgRsvpRate: 78,
    })

    const { getByText } = render(<AdminDashboardScreen />)

    await waitFor(() => {
      expect(getByText('42')).toBeTruthy()
      expect(getByText('3')).toBeTruthy()
      expect(getByText('5')).toBeTruthy()
      expect(getByText('78%')).toBeTruthy()
    })
  })

  it('renders quick action items', async () => {
    mockApi.mockResolvedValue({
      totalMembers: 10,
      totalTeams: 1,
      upcomingEvents: 0,
      avgRsvpRate: 0,
    })

    const { getByText } = render(<AdminDashboardScreen />)

    await waitFor(() => {
      expect(getByText('adminMembers.title')).toBeTruthy()
      expect(getByText('adminBilling.title')).toBeTruthy()
      expect(getByText('clubStats.title')).toBeTruthy()
    })
  })
})
