import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AdminHome } from '../../src/components/home/AdminHome'

const mockPush = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/stats')) {
      return Promise.resolve({
        memberCount: 42,
        teamCount: 5,
        upcomingEventCount: 9,
        overallRsvpRate: 91,
        pendingJoinRequests: 3,
        duesOutstanding: 1250,
      })
    }
    if (path.includes('/activity')) {
      return Promise.resolve([
        {
          id: 'a1',
          kind: 'MEMBER_JOINED',
          title: 'Anna joined U12',
          occurredAt: '2026-04-22T10:00:00Z',
        },
        {
          id: 'a2',
          kind: 'EVENT_CREATED',
          title: 'Match vs FC Nord',
          occurredAt: '2026-04-21T08:00:00Z',
        },
      ])
    }
    return Promise.resolve([])
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 375, height: 812 },
    }}
  >
    {ui}
  </SafeAreaProvider>
)

describe('AdminHome', () => {
  beforeEach(() => mockPush.mockClear())

  it('renders the dashboard snapshot with member/pending/dues numbers', async () => {
    const { getByText } = render(wrap(<AdminHome clubId="club-1" />))
    await waitFor(() => {
      expect(getByText('42')).toBeTruthy()
      expect(getByText('3')).toBeTruthy()
    })
    expect(getByText(/Members/i)).toBeTruthy()
    expect(getByText(/Pending/i)).toBeTruthy()
    expect(getByText(/Dues outstanding/i)).toBeTruthy()
  })

  it('renders recent activity feed items', async () => {
    const { findByText } = render(wrap(<AdminHome clubId="club-1" />))
    expect(await findByText('Anna joined U12')).toBeTruthy()
    expect(await findByText('Match vs FC Nord')).toBeTruthy()
  })

  it('renders quick actions for invite and create event', async () => {
    const { getByText } = render(wrap(<AdminHome clubId="club-1" />))
    fireEvent.press(getByText(/Create event/i))
    expect(mockPush).toHaveBeenCalledWith('/create-event')
    fireEvent.press(getByText(/Invite/i))
    expect(mockPush).toHaveBeenCalled()
  })
})
