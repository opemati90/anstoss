import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AdminHome } from '../../src/components/home/AdminHome'

const mockPush = jest.fn()
const mockApi = jest.fn((path: string) => {
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
})

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
  api: (...args: unknown[]) => mockApi(...(args as [string])),
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
  beforeEach(() => {
    mockPush.mockClear()
    mockApi.mockClear()
  })

  it('renders the KPI card with member + RSVP + upcoming + teams', async () => {
    const { getByText, findByText } = render(wrap(<AdminHome clubId="club-1" />))
    // Members KPI carries the headline number
    expect(await findByText('42')).toBeTruthy()
    // KPI labels (default-value translations from t())
    await waitFor(() => {
      expect(getByText(/Members/i)).toBeTruthy()
      expect(getByText(/Teams/i)).toBeTruthy()
      expect(getByText(/Upcoming/i)).toBeTruthy()
    })
  })

  it('surfaces pending join requests + dues as status pills', async () => {
    const { findByLabelText } = render(wrap(<AdminHome clubId="club-1" />))
    // Pending pill — the i18n mock returns the raw key, but the count prop
    // still flows through the StatusPill's accessibility label via the
    // {{count}} placeholder. Match on the placeholder substring.
    expect(await findByLabelText(/join request/i)).toBeTruthy()
    expect(await findByLabelText(/dues open/i)).toBeTruthy()
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

  it('fetches next event from the selected team when team context exists', async () => {
    render(wrap(<AdminHome clubId="club-1" teamId="team-1" />))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/events?teamId=team-1&scope=upcoming&limit=1',
      )
    })
  })
})
