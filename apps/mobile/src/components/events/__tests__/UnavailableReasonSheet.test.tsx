/**
 * The Absage sheet (reason chips, optional note, "without reason") and the
 * reason label it feeds into the AttendanceSheet.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('../../../components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => {
    const { View: V } = require('react-native')
    return <V testID={`icon-${name}`} />
  },
}))

jest.mock('../../../components/ui', () => {
  const { Text: RNText, View: RNView, Pressable } = require('react-native')
  return {
    Icon: ({ name }: { name: string }) => <RNView testID={`icon-${name}`} />,
    Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
      <RNText testID={testID}>{children}</RNText>
    ),
    Button: ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) => (
      <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
        <RNText>{label}</RNText>
      </Pressable>
    ),
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'eventFlow.absence.title': 'Why can’t you make it?',
        'eventFlow.absence.subtitle': 'Only the coaches see the reason.',
        'eventFlow.absence.confirm': 'Can’t make it',
        'eventFlow.absence.withoutReason': 'Skip the reason',
        'eventFlow.absence.notePlaceholder': 'Note (optional)',
        'eventFlow.absence.noteLabel': 'Note for the coaches',
        'eventFlow.reason.injured': 'Injured',
        'eventFlow.reason.sick': 'Ill',
        'eventFlow.reason.work': 'Work/School',
        'eventFlow.reason.vacation': 'On holiday',
        'eventFlow.reason.personal': 'Personal',
        'eventFlow.reason.suspended': 'Suspended',
        'event.checkIn.attendanceTitle': 'Attendance',
        'eventAttendance.noResponses': 'No responses yet.',
        'common.loadError': 'Could not load data',
      }
      if (key === 'eventFlow.absence.titleFor') return `Why can’t ${opts?.name} make it?`
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

jest.mock('../../ui/BottomSheet', () => {
  const { View: V } = require('react-native')
  return {
    BottomSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? <V testID="bottom-sheet">{children}</V> : null,
  }
})

jest.mock('../../../api/client', () => ({ api: jest.fn() }))

import { UnavailableReasonSheet } from '../UnavailableReasonSheet'
import { AttendanceSheet } from '../AttendanceSheet'

describe('UnavailableReasonSheet', () => {
  const onSubmit = jest.fn()
  const onClose = jest.fn()

  beforeEach(() => jest.clearAllMocks())

  it("renders board 24's six chips; Gesperrt is the coach's call, not a player chip", () => {
    render(<UnavailableReasonSheet visible onSubmit={onSubmit} onClose={onClose} />)
    for (const key of ['work', 'sick', 'injured', 'vacation', 'personal', 'other']) {
      expect(screen.getByTestId(`absence-reason-${key}`)).toBeTruthy()
    }
    expect(screen.queryByTestId('absence-reason-suspended')).toBeNull()
  })

  it('Abbrechen closes without sending an Absage', () => {
    render(<UnavailableReasonSheet visible onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.press(screen.getByTestId('absence-reason-work'))
    fireEvent.press(screen.getByTestId('absence-cancel'))
    expect(onClose).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('names the event and that only the coach sees the reason', () => {
    render(
      <UnavailableReasonSheet visible contextLabel="So · Heimspiel" onSubmit={onSubmit} onClose={onClose} />,
    )
    expect(screen.getByText('So · Heimspiel · eventFlow.absence.coachOnly')).toBeTruthy()
  })

  it('renders nothing when hidden', () => {
    render(<UnavailableReasonSheet visible={false} onSubmit={onSubmit} onClose={onClose} />)
    expect(screen.queryByTestId('bottom-sheet')).toBeNull()
  })

  it('names the child when a parent answers', () => {
    render(<UnavailableReasonSheet visible subjectName="Mia" onSubmit={onSubmit} onClose={onClose} />)
    expect(screen.getByText('Why can’t Mia make it?')).toBeTruthy()
  })

  it('submits the chosen reason and the trimmed note', () => {
    render(<UnavailableReasonSheet visible onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.press(screen.getByTestId('absence-reason-work'))
    fireEvent.changeText(screen.getByTestId('absence-note'), '  Spätschicht bis 15 Uhr  ')
    fireEvent.press(screen.getByTestId('absence-confirm'))
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'work', note: 'Spätschicht bis 15 Uhr' })
  })

  it('tapping a chosen chip again clears it', () => {
    render(<UnavailableReasonSheet visible onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.press(screen.getByTestId('absence-reason-sick'))
    fireEvent.press(screen.getByTestId('absence-reason-sick'))
    fireEvent.press(screen.getByTestId('absence-confirm'))
    expect(onSubmit).toHaveBeenCalledWith({})
  })

  it('sends without a reason when no chip is chosen (a reason is never required)', () => {
    render(<UnavailableReasonSheet visible onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.press(screen.getByTestId('absence-confirm'))
    expect(onSubmit).toHaveBeenCalledWith({})
  })
})

describe('AttendanceSheet reason label', () => {
  const mockApi = require('../../../api/client').api as jest.Mock
  const pastDate = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  afterEach(() => jest.clearAllMocks())

  function renderSheet() {
    return render(
      <AttendanceSheet
        visible
        onClose={() => {}}
        clubId="club-1"
        eventId="event-1"
        eventDate={pastDate}
      />,
    )
  }

  it('shows no reason when none was given', async () => {
    mockApi.mockResolvedValue({
      rsvps: [],
      checkIns: [],
      noShows: [{ userId: 'u1', user: { name: 'Alice' }, status: 'NO', reason: null }],
    })
    renderSheet()
    await waitFor(() => expect(screen.getByText('Alice')).toBeOnTheScreen())
    expect(screen.queryByText('Injured')).toBeNull()
  })

  it('maps the legacy injury code to the new label', async () => {
    mockApi.mockResolvedValue({
      rsvps: [],
      checkIns: [],
      noShows: [{ userId: 'u1', user: { name: 'Carol' }, status: 'NO', reason: 'injury' }],
    })
    renderSheet()
    await waitFor(() => {
      expect(screen.getByText('Carol')).toBeOnTheScreen()
      expect(screen.getByText('Injured')).toBeOnTheScreen()
    })
  })

  it('labels suspended replies', async () => {
    mockApi.mockResolvedValue({
      rsvps: [],
      checkIns: [],
      noShows: [{ userId: 'u1', user: { name: 'Dirk' }, status: 'NO', reason: 'suspended' }],
    })
    renderSheet()
    await waitFor(() => expect(screen.getByText('Suspended')).toBeOnTheScreen())
  })
})
