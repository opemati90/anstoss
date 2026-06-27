import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { Alert, Share } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AdminHome } from '../../src/components/home/AdminHome'

const mockPush = jest.fn()
const mockShare = jest.fn((_content: unknown, _options?: unknown) =>
  Promise.resolve({ action: 'sharedAction' }),
)
const mockAlert = jest.fn()
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
  if (path.includes('/events?')) {
    return Promise.resolve([
      {
        id: 'evt-1',
        title: 'Cup match',
        type: 'MATCH',
        date: new Date(Date.now() + 86400000).toISOString(),
        location: 'Main pitch',
        yesCount: 8,
        maybeCount: 1,
        noCount: 1,
        readiness: {
          status: 'AT_RISK',
          score: 64,
          metrics: {
            squadSize: 14,
            responseCount: 10,
            yesCount: 8,
            maybeCount: 1,
            noCount: 1,
            pendingCount: 4,
            responseRate: 0.71,
            confirmedRate: 0.57,
            checkInCount: 0,
            injuryRiskCount: 1,
            suspensionRiskCount: 0,
          },
          signals: [
            { key: 'low_confirmations', severity: 'critical', count: 8, target: 11 },
          ],
          nudge: {
            recommended: true,
            reason: 'low_confirmations',
            targetCount: 4,
            urgency: 'high',
          },
        },
      },
    ])
  }
  if (path.includes('/remind-rsvp')) {
    return Promise.resolve({ sent: 4, nextAvailableAt: new Date().toISOString() })
  }
  return Promise.resolve([])
})

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}))

jest.spyOn(Share, 'share').mockImplementation(
  ((content: unknown, options?: unknown) =>
    options === undefined
      ? mockShare(content)
      : mockShare(content, options)) as typeof Share.share,
)

jest.spyOn(Alert, 'alert').mockImplementation(
  (...args: unknown[]) => mockAlert(...args),
)

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
  ApiError: class MockApiError extends Error {
    status: number
    code?: string
    data?: unknown

    constructor(
      message: string,
      mockStatus: number,
      mockCode?: string,
      mockData?: unknown,
    ) {
      super(message)
      this.status = mockStatus
      this.code = mockCode
      this.data = mockData
    }
  },
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
    mockShare.mockClear()
    mockAlert.mockClear()
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

  it('fetches club-wide next event when no team context exists', async () => {
    render(wrap(<AdminHome clubId="club-1" />))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/events?scope=upcoming&limit=1',
      )
    })
  })

  it('shares the selected next-event readiness briefing', async () => {
    const { findByText } = render(wrap(<AdminHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Share'))

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Anstoss readiness: Cup match'),
        }),
      )
    })
  })

  it('sends a smart RSVP nudge for the selected next event', async () => {
    const { findByText } = render(wrap(<AdminHome clubId="club-1" teamId="team-1" />))

    fireEvent.press(await findByText('Nudge now'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/clubs/club-1/events/evt-1/remind-rsvp',
        { method: 'POST' },
      )
    })
    expect(mockAlert).toHaveBeenCalledWith('Nudge sent', expect.stringContaining('4'))
  })
})
