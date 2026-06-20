import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import {
  canPlayerUseEventCheckIn,
  EventNextActionPanel,
  getEventNextAction,
  type EventNextActionInput,
} from '../EventNextActionPanel'

jest.mock('../../ui', () => {
  const { Text: RNText, View: RNView } = require('react-native')
  return {
    Icon: ({ name }: { name: string }) => <RNView testID={`icon-${name}`} />,
    Text: ({
      children,
      testID,
    }: {
      children: React.ReactNode
      testID?: string
    }) => <RNText testID={testID}>{children}</RNText>,
  }
})

jest.mock('../../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#0050ff',
    success: '#0f8a3a',
    warning: '#9a6400',
    error: '#c52828',
    surface: '#fff',
    borderDefault: '#e5e5e0',
    textPrimary: '#111',
    textInverse: '#fff',
    textTertiary: '#777',
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'event.nextAction.eyebrow': 'NEXT ACTION',
        'event.nextAction.playerRsvpTitle': 'Reply to this event',
        'event.nextAction.playerRsvpBody': 'Your coach sees this immediately.',
        'event.nextAction.playerCheckInTitle': 'Check in at the pitch',
        'event.nextAction.playerCheckInBody': 'Confirm you are here.',
        'event.nextAction.playerCheckedInTitle': 'You are checked in',
        'event.nextAction.playerCheckedInBody': 'Attendance is marked.',
        'event.nextAction.staffNudgeTitle': '{{count}} players have not replied',
        'event.nextAction.staffNudgeBody': 'Send a reminder before planning.',
        'event.nextAction.staffAttendanceTitle': 'Open attendance',
        'event.nextAction.staffAttendanceBody': 'Track arrivals and missing players.',
        'event.nextAction.remindCta': 'Send reminder',
        'event.nextAction.attendanceCta': 'Open attendance',
        'event.nextAction.working': 'Working...',
        'event.nextAction.workingA11y': '{{action}} in progress',
        'event.nextAction.rsvpYesA11y': 'RSVP yes',
        'event.nextAction.rsvpMaybeA11y': 'RSVP maybe',
        'event.nextAction.rsvpNoA11y': 'RSVP no',
        'event.nextAction.checkInA11y': 'Check in for this event',
        'event.nextAction.remindA11y': 'Send RSVP reminder',
        'event.nextAction.attendanceA11y': 'Open event attendance',
        'event.checkIn.button': 'Check in',
        'event.rsvpYes': 'Yes',
        'event.rsvpMaybe': 'Maybe',
        'event.rsvpNo': 'No',
      }
      const value = map[key] ?? key
      if (!opts) return value
      return Object.entries(opts).reduce(
        (text, [nextKey, next]) => text.replaceAll(`{{${nextKey}}}`, String(next)),
        value,
      )
    },
  }),
}))

const baseInput: EventNextActionInput = {
  canManage: false,
  checkedInAt: null,
  eventCancelled: false,
  isAttendanceOpen: false,
  isBeforeEventStart: true,
  isInCheckInWindow: false,
  isPlayer: false,
  isReminderInCooldown: false,
  myRsvp: null,
  nonResponderCount: null,
  showMatchdayControlPanel: false,
}

const handlers = {
  onRsvp: jest.fn(),
  onCheckIn: jest.fn(),
  onRemind: jest.fn(),
  onOpenAttendance: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getEventNextAction', () => {
  it('prioritizes the player RSVP before staff nudges for dual-role users', () => {
    const action = getEventNextAction({
      ...baseInput,
      canManage: true,
      isPlayer: true,
      nonResponderCount: 5,
    })

    expect(action?.kind).toBe('player-rsvp')
  })

  it('surfaces check-in for confirmed players in the check-in window', () => {
    const action = getEventNextAction({
      ...baseInput,
      isAttendanceOpen: true,
      isInCheckInWindow: true,
      isPlayer: true,
      myRsvp: 'YES',
    })

    expect(action?.kind).toBe('player-check-in')
  })

  it('does not surface check-in for maybe or unanswered players', () => {
    expect(canPlayerUseEventCheckIn(null, null)).toBe(false)
    expect(canPlayerUseEventCheckIn('MAYBE', null)).toBe(false)
    expect(canPlayerUseEventCheckIn('YES', null)).toBe(true)

    const action = getEventNextAction({
      ...baseInput,
      isAttendanceOpen: true,
      isBeforeEventStart: false,
      isInCheckInWindow: true,
      isPlayer: true,
      myRsvp: 'MAYBE',
    })

    expect(action).toBeNull()
  })

  it('keeps unanswered dual-role users focused on RSVP during the arrival window', () => {
    const action = getEventNextAction({
      ...baseInput,
      canManage: true,
      isAttendanceOpen: true,
      isInCheckInWindow: true,
      isPlayer: true,
      nonResponderCount: 4,
      myRsvp: null,
    })

    expect(action?.kind).toBe('player-rsvp')
  })

  it('shows attendance review for staff after non-matchday events', () => {
    const action = getEventNextAction({
      ...baseInput,
      canManage: true,
      isAttendanceOpen: true,
      isBeforeEventStart: false,
    })

    expect(action?.kind).toBe('staff-attendance')
  })

  it('defers to the matchday control panel when it is visible', () => {
    const action = getEventNextAction({
      ...baseInput,
      canManage: true,
      isAttendanceOpen: true,
      showMatchdayControlPanel: true,
    })

    expect(action).toBeNull()
  })

  it('does not suggest work for cancelled events or cooldown reminders', () => {
    expect(
      getEventNextAction({
        ...baseInput,
        canManage: true,
        eventCancelled: true,
        nonResponderCount: 4,
      }),
    ).toBeNull()

    expect(
      getEventNextAction({
        ...baseInput,
        canManage: true,
        isBeforeEventStart: true,
        isReminderInCooldown: true,
        nonResponderCount: 4,
      }),
    ).toBeNull()
  })
})

describe('EventNextActionPanel', () => {
  it('renders quick RSVP buttons and submits the selected response', () => {
    const action = getEventNextAction({
      ...baseInput,
      isPlayer: true,
    })

    render(
      <EventNextActionPanel
        action={action}
        currentRsvp={null}
        rsvpPending={false}
        checkInPending={false}
        remindPending={false}
        {...handlers}
      />,
    )

    fireEvent.press(screen.getByLabelText('RSVP maybe'))

    expect(handlers.onRsvp).toHaveBeenCalledWith('MAYBE')
  })

  it('runs the staff nudge action and disables while pending', () => {
    const action = getEventNextAction({
      ...baseInput,
      canManage: true,
      nonResponderCount: 3,
    })

    const { rerender } = render(
      <EventNextActionPanel
        action={action}
        currentRsvp={null}
        rsvpPending={false}
        checkInPending={false}
        remindPending={false}
        {...handlers}
      />,
    )

    fireEvent.press(screen.getByLabelText('Send RSVP reminder'))
    expect(handlers.onRemind).toHaveBeenCalledTimes(1)

    rerender(
      <EventNextActionPanel
        action={action}
        currentRsvp={null}
        rsvpPending={false}
        checkInPending={false}
        remindPending
        {...handlers}
      />,
    )

    expect(screen.getByLabelText('Send RSVP reminder in progress').props.accessibilityState.disabled).toBe(true)
  })

  it('renders checked-in confirmation without a primary button', () => {
    const action = getEventNextAction({
      ...baseInput,
      checkedInAt: '2026-06-20T12:00:00.000Z',
      isAttendanceOpen: true,
      isInCheckInWindow: true,
      isPlayer: true,
      myRsvp: 'YES',
    })

    render(
      <EventNextActionPanel
        action={action}
        currentRsvp="YES"
        rsvpPending={false}
        checkInPending={false}
        remindPending={false}
        {...handlers}
      />,
    )

    expect(screen.getByText('You are checked in')).toBeTruthy()
    expect(screen.queryByLabelText('Check in')).toBeNull()
  })
})
