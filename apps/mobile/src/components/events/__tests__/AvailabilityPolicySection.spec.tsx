import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { AvailabilityPolicySection } from '../AvailabilityPolicySection'
import { RsvpControl } from '../RsvpControl'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, args?: { count?: number }) => args?.count === undefined ? key : `${key}:${args.count}` }) }))
jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('../../../i18n', () => ({ getAppLanguage: () => 'en', getAppLocale: () => 'en-GB' }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../SelectionSheet', () => ({ SelectionSheet: ({ visible, options, onSelect, onClose }: any) => {
  const { View, Button } = require('react-native')
  return visible ? <View>{options.map((option: any) => <Button key={option.value} title={option.label} onPress={() => { onSelect(option.value); onClose() }} />)}</View> : null
} }))

describe('availability policy controls', () => {
  const policy = { date: new Date(Date.now() + 72 * 3600_000).toISOString(), rsvpDeadline: null, rsvpLocked: false }
  it('does not expose manager controls to players', () => {
    const screen = render(<AvailabilityPolicySection policy={policy} canManage={false} closed={false} onChange={jest.fn()} />)
    expect(screen.queryByTestId('event-availability-lock')).toBeNull()
  })
  it('closes shared home/list RSVP controls at the deadline without a refresh', () => {
    jest.useFakeTimers()
    try {
      const save = jest.fn()
      const screen = render(<RsvpControl value={null} onChange={save} askReason={false} testID="reply"
        policy={{ ...policy, rsvpDeadline: new Date(Date.now() + 100).toISOString() }} />)
      expect(screen.getByTestId('reply-YES')).not.toBeDisabled()
      act(() => { jest.advanceTimersByTime(101) })
      expect(screen.getByTestId('reply-YES')).toBeDisabled()
      expect(screen.getByTestId('reply-MAYBE')).toBeDisabled()
      expect(screen.getByTestId('reply-NO')).toBeDisabled()
      fireEvent.press(screen.getByTestId('reply-YES'))
      expect(save).not.toHaveBeenCalled()
      expect(screen.getByText('eventFlow.availability.closed')).toBeTruthy()
      screen.unmount()
    } finally { jest.useRealTimers() }
  })
  it('saves a manual lock without double submission while waiting', async () => {
    let resolve!: () => void
    const save = jest.fn(() => new Promise<void>((done) => { resolve = done }))
    const screen = render(<AvailabilityPolicySection policy={policy} canManage closed={false} onChange={save} />)
    fireEvent(screen.getByTestId('event-availability-lock'), 'valueChange', true)
    fireEvent(screen.getByTestId('event-availability-lock'), 'valueChange', true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ locked: true })
    resolve()
    await waitFor(() => expect(screen.getByTestId('event-availability-lock').props.disabled).toBe(false))
  })
  it('saves a selected deadline as an ISO instant', async () => {
    const save = jest.fn().mockResolvedValue(undefined)
    const screen = render(<AvailabilityPolicySection policy={policy} canManage closed={false} onChange={save} />)
    fireEvent.press(screen.getByTestId('event-availability-policy'))
    fireEvent.press(screen.getByText('eventFlow.availability.hoursBefore:24'))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ deadline: new Date(Date.parse(policy.date) - 24 * 3600_000).toISOString() }))
  })
  it('shows an honest unconfirmed-save error and does not change the controlled lock', async () => {
    const save = jest.fn().mockRejectedValue(new Error('timeout'))
    const screen = render(<AvailabilityPolicySection policy={policy} canManage closed={false} onChange={save} />)
    fireEvent(screen.getByTestId('event-availability-lock'), 'valueChange', true)
    expect(await screen.findByText('eventFlow.availability.saveFailed')).toBeTruthy()
    expect(screen.getByTestId('event-availability-lock').props.value).toBe(false)
  })
})
