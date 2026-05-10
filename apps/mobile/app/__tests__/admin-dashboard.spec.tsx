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

  it('renders the inline stat summary after loading', async () => {
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

    // Post-declutter, the 4 stat tiles were replaced with a single inline
    // summary line under the club name. The i18n key includes interpolated
    // counts; in the test harness `t()` returns the key, so we assert the
    // declared key exists rather than the rendered summary copy.
    await waitFor(() => {
      expect(getByText('adminDashboard.statSummary')).toBeTruthy()
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

    await waitFor(() => {
      expect(getByText('adminDashboard.peopleAccess')).toBeTruthy()
      expect(getByText('adminDashboard.teamsEvents')).toBeTruthy()
      expect(getByText('adminDashboard.finance')).toBeTruthy()
      expect(getByText('adminDashboard.growth')).toBeTruthy()
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
