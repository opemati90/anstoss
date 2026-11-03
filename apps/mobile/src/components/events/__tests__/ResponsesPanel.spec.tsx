import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { ResponsesPanel, type ResponsesPanelProps } from '../ResponsesPanel'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count == null ? key : `${key}:${options.count}` }) }))
jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

const rsvps = [
  { userId: 'one', status: 'YES', user: { name: 'Alex' } },
  { userId: 'two', status: 'MAYBE', note: 'Late', user: { name: 'Sam' } },
  { userId: 'three', status: 'NO', user: { name: 'Robin' } },
] as unknown as ResponsesPanelProps['rsvps']
const members = [
  { userId: 'one', name: 'Alex' },
  { userId: 'two', name: 'Sam' },
  { userId: 'three', name: 'Robin' },
  { userId: 'four', name: 'Taylor' },
] as ResponsesPanelProps['members']

describe('ResponsesPanel', () => {
  it('groups responses and includes each status in accessible person labels', () => {
    const screen = render(<ResponsesPanel rsvps={rsvps} members={members} canManage={false} />)
    expect(screen.getByLabelText('Alex, eventFlow.responses.groupYes')).toBeTruthy()
    expect(screen.getByLabelText('Sam, eventFlow.responses.groupMaybe, Late')).toBeTruthy()
    expect(screen.getByLabelText('Robin, eventFlow.responses.groupNo')).toBeTruthy()
    expect(screen.getByLabelText('Taylor, eventFlow.responses.groupOpen')).toBeTruthy()
    expect(screen.getByLabelText('eventFlow.responses.groupOpen, 1')).toBeTruthy()
  })

  it('keeps manager actions restricted and functional', () => {
    const onPress = jest.fn()
    const onOpenAttendance = jest.fn()
    const remind = { onPress, pending: false, cooldownUntil: null, sentCount: null }
    const screen = render(<ResponsesPanel rsvps={rsvps} members={members} canManage={false} remind={remind} onOpenAttendance={onOpenAttendance} reminderEligibleUserIds={['four']} />)
    expect(screen.queryByTestId('event-remind-open')).toBeNull()
    expect(screen.queryByTestId('event-open-attendance')).toBeNull()
    screen.rerender(<ResponsesPanel rsvps={rsvps} members={members} canManage remind={remind} onOpenAttendance={onOpenAttendance} reminderEligibleUserIds={['four']} />)
    fireEvent.press(screen.getByTestId('event-remind-open'))
    fireEvent.press(screen.getByTestId('event-open-attendance'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onOpenAttendance).toHaveBeenCalledTimes(1)
  })

  it('does not include the manager in reminder targets', () => {
    const remind = { onPress: jest.fn(), pending: false, cooldownUntil: null, sentCount: null }
    const screen = render(<ResponsesPanel rsvps={rsvps} members={members} canManage remind={remind} viewerUserId="four" reminderEligibleUserIds={['four']} />)
    expect(screen.queryByTestId('event-remind-open')).toBeNull()
    screen.rerender(<ResponsesPanel rsvps={rsvps} members={members} canManage remind={remind} viewerUserId="one" reminderEligibleUserIds={['four']} />)
    expect(screen.getByText('eventFlow.responses.remindOpen:1')).toBeTruthy()
    // A trial participant or an older API without eligibility data is not
    // presented as an actionable reminder target.
    screen.rerender(<ResponsesPanel rsvps={rsvps} members={members} canManage remind={remind} reminderEligibleUserIds={[]} />)
    expect(screen.queryByTestId('event-remind-open')).toBeNull()
    screen.rerender(<ResponsesPanel rsvps={rsvps} members={members} canManage remind={remind} />)
    expect(screen.queryByTestId('event-remind-open')).toBeNull()
  })

  it('enables reminders as soon as the cooldown expires without another interaction', () => {
    jest.useFakeTimers()
    try {
      const remind = { onPress: jest.fn(), pending: false, cooldownUntil: new Date(Date.now() + 1000).toISOString(), sentCount: 1 }
      const screen = render(<ResponsesPanel rsvps={rsvps} members={members} canManage remind={remind} reminderEligibleUserIds={['four']} />)
      expect(screen.getByTestId('event-remind-open')).toBeDisabled()
      act(() => { jest.advanceTimersByTime(1001) })
      expect(screen.getByTestId('event-remind-open')).not.toBeDisabled()
      expect(screen.getByText('eventFlow.responses.remindOpen:1')).toBeTruthy()
      screen.unmount()
    } finally {
      jest.useRealTimers()
    }
  })
})
