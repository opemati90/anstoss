import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockRouterPush = jest.fn()
const authState = {
  activeClub: { club: { id: 'c1', name: 'FC Test', slug: 'fc-test' }, role: 'OWNER' },
}

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args), back: jest.fn() } }))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      clubPrimary: '#000',
      clubPrimaryLight: '#eee',
      primary: '#000',
      primary50: '#eee',
    }),
    useIsDark: () => false,
  }
})
jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

import AdminDashboardScreen from '../admin-dashboard'
import { api } from '../../src/api/client'

const mockApi = api as jest.Mock

describe('AdminDashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authState.activeClub = { club: { id: 'c1', name: 'FC Test', slug: 'fc-test' }, role: 'OWNER' }
    mockApi.mockReset()
  })

  it('renders the hero stat summary and stat pills after loading', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/trial-invites')) {
        return Promise.resolve([])
      }

      return Promise.resolve({
        memberCount: 42,
        teamCount: 3,
        upcomingEventCount: 5,
        overallRsvpRate: 78,
        teams: [],
      })
    })

    const { getByText } = render(<AdminDashboardScreen />)

    // Polished dashboard: hero shows `{members} members · {teams} teams`
    // (key: adminDashboard.heroStatSummary); two stat pills render the
    // remaining numbers verbatim (`5` upcoming, `78%` RSVP).
    await waitFor(() => {
      expect(getByText('adminDashboard.heroStatSummary')).toBeTruthy()
      expect(getByText('5')).toBeTruthy()
      expect(getByText('78%')).toBeTruthy()
    })
  })

  it('renders grouped administration sections', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/trial-invites')) {
        return Promise.resolve([])
      }

      return Promise.resolve({
        memberCount: 10,
        teamCount: 1,
        upcomingEventCount: 0,
        overallRsvpRate: 0,
        teams: [],
      })
    })

    const { getByText } = render(<AdminDashboardScreen />)

    // Section labels are uppercased at render time (sectionLabelWrap +
    // `.toUpperCase()` on the child). Assert the uppercased form.
    await waitFor(() => {
      expect(getByText('ADMINDASHBOARD.PEOPLEACCESS')).toBeTruthy()
      expect(getByText('ADMINDASHBOARD.TEAMSEVENTS')).toBeTruthy()
      expect(getByText('ADMINDASHBOARD.FINANCE')).toBeTruthy()
      expect(getByText('adminMembers.title')).toBeTruthy()
      expect(getByText('adminBilling.title')).toBeTruthy()
      expect(getByText('clubStats.title')).toBeTruthy()
    })
  })

  it('keeps staff and billing flows reachable from administration', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/trial-invites')) {
        return Promise.resolve([])
      }

      return Promise.resolve({
        memberCount: 10,
        teamCount: 1,
        upcomingEventCount: 0,
        overallRsvpRate: 0,
        teams: [],
      })
    })

    const screen = render(<AdminDashboardScreen />)

    await waitFor(() => {
      expect(screen.getByLabelText('more.manageStaff')).toBeTruthy()
      expect(screen.getByLabelText('adminBilling.title')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('more.manageStaff'))
    fireEvent.press(screen.getByLabelText('adminBilling.title'))

    expect(mockRouterPush).toHaveBeenCalledWith('/club-staff')
    expect(mockRouterPush).toHaveBeenCalledWith('/admin-billing')
  })

  it('keeps non-admin roles out of administration', () => {
    authState.activeClub = { club: { id: 'c1', name: 'FC Test', slug: 'fc-test' }, role: 'PLAYER' }

    const { getByText } = render(<AdminDashboardScreen />)

    expect(getByText('common.accessDenied')).toBeTruthy()
    expect(getByText('common.accessDeniedDescription')).toBeTruthy()
  })
})
