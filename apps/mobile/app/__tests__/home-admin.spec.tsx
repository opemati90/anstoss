import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { Alert, Share, StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AdminHome } from '../../src/components/home/AdminHome'

const mockPush = jest.fn()
const mockShare = jest.fn((_content: unknown, _options?: unknown) =>
  Promise.resolve({ action: 'sharedAction' }),
)
const mockAlert = jest.fn()
function defaultApi(path: string): Promise<unknown> {
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
          signals: [{ key: 'low_confirmations', severity: 'critical', count: 8, target: 11 }],
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
  if (path === '/clubs/club-1/contributions') {
    return Promise.resolve({
      summary: {
        assignedMembers: 14,
        paidMembers: 9,
        overdueMembers: 3,
        totalExpectedCents: 14000,
        totalPaidCents: 9000,
        totalOutstandingCents: 5000,
      },
      plans: [],
      assignments: [],
    })
  }
  if (path === '/clubs/club-1/contributions/reminders/send') {
    return Promise.resolve({ requested: 3, sent: 3, skipped: 0 })
  }
  return Promise.resolve([])
}
const mockApi = jest.fn<Promise<unknown>, [path: string, options?: unknown]>(defaultApi)

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}))

jest
  .spyOn(Share, 'share')
  .mockImplementation(((content: unknown, options?: unknown) =>
    options === undefined ? mockShare(content) : mockShare(content, options)) as typeof Share.share)

jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => mockAlert(...args))

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

    constructor(message: string, mockStatus: number, mockCode?: string, mockData?: unknown) {
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
    mockApi.mockImplementation(defaultApi)
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

  it('keeps manager actions readable on narrow screens and large text', async () => {
    const { findByLabelText, findByText } = render(wrap(<AdminHome clubId="club-1" />))
    const action = await findByLabelText('Create event')
    const label = await findByText('Create event')

    expect(StyleSheet.flatten(action.props.style)).toEqual(
      expect.objectContaining({ width: '48%', minHeight: 92 }),
    )
    expect(label.props.numberOfLines).toBeUndefined()
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
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events?scope=upcoming&limit=1')
    })
  })

  it('does not complete selected-team setup from club-wide stats or staff-only roster rows', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?')) return Promise.resolve([])
      if (path.includes('/team-links?')) return Promise.resolve([])
      if (path.includes('/invite-campaigns')) return Promise.resolve([])
      if (path.includes('/members?teamId=')) {
        return Promise.resolve([{ id: 'coach-access', role: 'HEAD_COACH' }])
      }
      return defaultApi(path)
    })
    const { findByText } = render(
      wrap(<AdminHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('Finish club setup')).toBeTruthy()
    expect(await findByText('1/5')).toBeTruthy()
  })

  it('hides the activation checklist only after real team-scoped setup signals exist', async () => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/team-links?')) return Promise.resolve([{ id: 'link-1', teamId: 'team-1' }])
      if (path.includes('/invite-campaigns')) {
        return Promise.resolve([{ id: 'campaign-1', teamId: 'team-1', status: 'ACTIVE' }])
      }
      if (path.includes('/members?teamId=')) {
        return Promise.resolve([
          { id: 'coach-access', role: 'HEAD_COACH' },
          { id: 'player-access', role: 'PLAYER' },
        ])
      }
      return defaultApi(path)
    })
    const { queryByText, findAllByText } = render(
      wrap(<AdminHome clubId="club-1" teamId="team-1" />),
    )

    expect((await findAllByText('Cup match')).length).toBeGreaterThan(0)
    await waitFor(() => expect(queryByText('Finish club setup')).toBeNull())
  })

  it('does not turn activation API failures into false incomplete steps', async () => {
    mockApi.mockImplementation((path: string) => {
      if (
        path.includes('/events?') ||
        path.includes('/team-links?') ||
        path.includes('/invite-campaigns') ||
        path.includes('/members?teamId=')
      ) {
        return Promise.reject(new Error('offline'))
      }
      return defaultApi(path)
    })
    const { queryByText, findByText } = render(
      wrap(<AdminHome clubId="club-1" teamId="team-1" />),
    )

    expect(await findByText('42')).toBeTruthy()
    await waitFor(() => expect(queryByText('Finish club setup')).toBeNull())
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
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/events/evt-1/remind-rsvp', {
        method: 'POST',
      })
    })
    expect(mockAlert).toHaveBeenCalledWith('Nudge sent', expect.stringContaining('4'))
  })

  it('sends overdue contribution reminders through the API bulk endpoint', async () => {
    const { findByText } = render(wrap(<AdminHome clubId="club-1" />))

    // This suite intentionally runs without an i18next instance, so the
    // interpolation placeholder remains visible in the fallback copy.
    fireEvent.press(await findByText(/Remind .* overdue/i))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/contributions/reminders/send', {
        method: 'POST',
        body: { onlyOverdue: true },
      })
    })
  })
})
