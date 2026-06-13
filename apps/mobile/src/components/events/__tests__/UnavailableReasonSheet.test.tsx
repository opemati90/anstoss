/**
 * Tests for UnavailableReasonSheet and the reason badge in AttendanceSheet.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

// ── common mocks ──────────────────────────────────────────────────────────────

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('../../../components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => {
    const { View: V } = require('react-native')
    return <V testID={`icon-${name}`} />
  },
}))

jest.mock('../../../components/ui', () => {
  const { Text: RNText, View: RNView } = require('react-native')
  return {
    Icon: ({ name }: { name: string }) => <RNView testID={`icon-${name}`} />,
    Text: ({
      children,
      testID,
      numberOfLines,
    }: {
      children: React.ReactNode
      testID?: string
      numberOfLines?: number
    }) => <RNText testID={testID} numberOfLines={numberOfLines}>{children}</RNText>,
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'event.rsvpReasons.whyUnavailable': 'Why are you unavailable?',
        'event.rsvpReasons.injury': 'Injury / illness',
        'event.rsvpReasons.work': 'Work / school',
        'event.rsvpReasons.personal': 'Personal',
        'event.rsvpReasons.other': 'Other',
        'event.rsvpReasons.skip': 'Skip',
        'event.checkIn.attendanceTitle': 'Attendance',
        'event.checkIn.attendance': '0 checked in',
        'event.checkIn.noShows': '0 no-shows',
        'eventAttendance.noResponses': 'No responses yet.',
        'common.loadError': 'Could not load data',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#0050ff',
    primary50: '#dde7ff',
    surface: '#fff',
    borderDefault: '#e5e5e0',
    surfaceOverlay: 'rgba(0,0,0,0.4)',
    background: '#fafaf8',
    success: '#2D7A3A',
    error: '#C4372C',
    textInverse: '#fff',
    textTertiary: '#9C9C96',
    textPrimary: '#1A1A18',
  }),
  useIsDark: () => false,
}))

jest.mock('../../ui/BottomSheet', () => {
  const { View: V } = require('react-native')
  return {
    BottomSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? <V testID="bottom-sheet">{children}</V> : null,
  }
})

jest.mock('../../../api/client', () => ({
  api: jest.fn(),
}))

jest.useFakeTimers()

// ── UnavailableReasonSheet tests ──────────────────────────────────────────────

import { UnavailableReasonSheet } from '../UnavailableReasonSheet'

describe('UnavailableReasonSheet', () => {
  const onSelect = jest.fn()
  const onSkip = jest.fn()
  const onClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
  })

  it('renders when visible', () => {
    render(
      <UnavailableReasonSheet
        visible={true}
        onSelect={onSelect}
        onSkip={onSkip}
        onClose={onClose}
      />,
    )
    expect(screen.getByTestId('bottom-sheet')).toBeOnTheScreen()
    expect(screen.getByText('Why are you unavailable?')).toBeOnTheScreen()
  })

  it('does not render when not visible', () => {
    render(
      <UnavailableReasonSheet
        visible={false}
        onSelect={onSelect}
        onSkip={onSkip}
        onClose={onClose}
      />,
    )
    expect(screen.queryByTestId('bottom-sheet')).toBeNull()
  })

  it('shows all four reason options', () => {
    render(
      <UnavailableReasonSheet
        visible={true}
        onSelect={onSelect}
        onSkip={onSkip}
        onClose={onClose}
      />,
    )
    expect(screen.getByText('Injury / illness')).toBeOnTheScreen()
    expect(screen.getByText('Work / school')).toBeOnTheScreen()
    expect(screen.getByText('Personal')).toBeOnTheScreen()
    expect(screen.getByText('Other')).toBeOnTheScreen()
  })

  it('calls onSelect with the reason string when a reason is tapped', () => {
    render(
      <UnavailableReasonSheet
        visible={true}
        onSelect={onSelect}
        onSkip={onSkip}
        onClose={onClose}
      />,
    )
    fireEvent.press(screen.getByText('Injury / illness'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('Injury / illness')
  })

  it('calls onSelect with Work / school when that option is tapped', () => {
    render(
      <UnavailableReasonSheet
        visible={true}
        onSelect={onSelect}
        onSkip={onSkip}
        onClose={onClose}
      />,
    )
    fireEvent.press(screen.getByText('Work / school'))
    expect(onSelect).toHaveBeenCalledWith('Work / school')
  })

  it('calls onSkip when Skip is tapped', () => {
    render(
      <UnavailableReasonSheet
        visible={true}
        onSelect={onSelect}
        onSkip={onSkip}
        onClose={onClose}
      />,
    )
    fireEvent.press(screen.getByText('Skip'))
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

// ── AttendanceSheet reason badge tests ───────────────────────────────────────

import { AttendanceSheet } from '../AttendanceSheet'

describe('AttendanceSheet reason badge', () => {
  const mockApi = require('../../../api/client').api as jest.Mock

  afterEach(() => {
    jest.clearAllMocks()
    jest.runOnlyPendingTimers()
  })

  const pastDate = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  it('does not show a reason badge when reason is null', async () => {
    mockApi.mockResolvedValue({
      rsvps: [],
      checkIns: [],
      noShows: [{ userId: 'u1', user: { name: 'Alice' }, status: 'NO', reason: null }],
    })

    render(
      <AttendanceSheet
        visible={true}
        onClose={() => {}}
        clubId="club-1"
        eventId="event-1"
        eventDate={pastDate}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeOnTheScreen()
    })

    // No reason text should appear alongside Alice
    expect(screen.queryByText('Injury / illness')).toBeNull()
    expect(screen.queryByText('Personal')).toBeNull()
  })

  it('shows a reason badge for a NO-status entry with a reason', async () => {
    mockApi.mockResolvedValue({
      rsvps: [],
      checkIns: [],
      noShows: [
        {
          userId: 'u1',
          user: { name: 'Bob' },
          status: 'NO',
          reason: 'Personal',
        },
      ],
    })

    render(
      <AttendanceSheet
        visible={true}
        onClose={() => {}}
        clubId="club-1"
        eventId="event-1"
        eventDate={pastDate}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeOnTheScreen()
      // 'Personal' is 8 chars — under the 15-char limit, rendered in full
      expect(screen.getByText('Personal')).toBeOnTheScreen()
    })
  })

  it('truncates a long reason to 15 chars with ellipsis in the badge', async () => {
    mockApi.mockResolvedValue({
      rsvps: [],
      checkIns: [],
      noShows: [
        {
          userId: 'u1',
          user: { name: 'Carol' },
          status: 'NO',
          reason: 'Very long reason text here',
        },
      ],
    })

    render(
      <AttendanceSheet
        visible={true}
        onClose={() => {}}
        clubId="club-1"
        eventId="event-1"
        eventDate={pastDate}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Carol')).toBeOnTheScreen()
      // "Very long reason text here".slice(0, 15) === "Very long reaso"
      expect(screen.getByText('Very long reaso…')).toBeOnTheScreen()
    })
  })
})
