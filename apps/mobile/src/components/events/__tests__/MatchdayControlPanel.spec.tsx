import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import {
  MatchdayControlPanel,
  getMatchdayStage,
} from '../MatchdayControlPanel'

jest.mock('../../ui', () => {
  const { Text: RNText, View: RNView } = require('react-native')
  return {
    Icon: ({ name }: { name: string }) => <RNView testID={`icon-${name}`} />,
    Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
      <RNText testID={testID}>{children}</RNText>
    ),
  }
})

jest.mock('../../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#0050ff',
    surface: '#fff',
    borderDefault: '#e5e5e0',
    textInverse: '#fff',
    textTertiary: '#9C9C96',
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'event.matchday.eyebrow': 'MATCHDAY',
        'event.matchday.liveTitle': 'Match underway',
        'event.matchday.reviewTitle': 'Post-match attendance',
        'event.matchday.liveBody':
          '{{checkedIn}}/{{confirmed}} confirmed players are marked present.',
        'event.matchday.reviewBody':
          '{{missing}} confirmed players need attendance review.',
        'event.matchday.confirmed': 'Confirmed',
        'event.matchday.checkedIn': 'Checked in',
        'event.matchday.missing': 'To review',
        'event.matchday.openAttendance': 'Open attendance',
        'event.matchday.reviewAttendance': 'Review attendance',
      }
      const value = map[key] ?? (opts?.defaultValue as string) ?? key
      if (!opts) return value
      return Object.entries(opts).reduce(
        (text, [nextKey, next]) => text.replaceAll(`{{${nextKey}}}`, String(next)),
        value,
      )
    },
  }),
}))

describe('getMatchdayStage', () => {
  it('tracks the matchday window around kickoff', () => {
    const kickoff = Date.parse('2026-06-19T15:00:00Z')

    expect(getMatchdayStage(new Date(kickoff), kickoff - 3 * 60 * 60 * 1000)).toBe(
      'upcoming',
    )
    expect(getMatchdayStage(new Date(kickoff), kickoff - 30 * 60 * 1000)).toBe(
      'arrival',
    )
    expect(getMatchdayStage(new Date(kickoff), kickoff + 30 * 60 * 1000)).toBe(
      'live',
    )
    expect(getMatchdayStage(new Date(kickoff), kickoff + 4 * 60 * 60 * 1000)).toBe(
      'review',
    )
  })
})

describe('MatchdayControlPanel', () => {
  it('shows live check-in state and opens attendance', () => {
    const onOpenAttendance = jest.fn()
    render(
      <MatchdayControlPanel
        stage="live"
        confirmedCount={12}
        checkedInCount={8}
        onOpenAttendance={onOpenAttendance}
      />,
    )

    expect(screen.getByText('Match underway')).toBeTruthy()
    expect(screen.getByText('8/12 confirmed players are marked present.')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Open attendance'))

    expect(onOpenAttendance).toHaveBeenCalledTimes(1)
  })

  it('uses review copy and clamps impossible check-in counts', () => {
    render(
      <MatchdayControlPanel
        stage="review"
        confirmedCount={10}
        checkedInCount={14}
        onOpenAttendance={jest.fn()}
      />,
    )

    expect(screen.getByText('Post-match attendance')).toBeTruthy()
    expect(screen.getByText('0 confirmed players need attendance review.')).toBeTruthy()
    expect(screen.getByText('Review attendance')).toBeTruthy()
    expect(screen.getByLabelText('Review attendance')).toBeTruthy()
  })
})
