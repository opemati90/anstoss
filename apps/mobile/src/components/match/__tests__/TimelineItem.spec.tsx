import React from 'react'
import { render } from '@testing-library/react-native'
import { TimelineItem } from '../TimelineItem'
import { crestInitials } from '../MatchCrest'

describe('TimelineItem', () => {
  it('labels a goal for the other side as a goal against when our side is known', () => {
    const screen = render(
      <TimelineItem minute={63} kind="goal" player="RW Köpenick" side="away" ownSide="home" />,
    )
    expect(screen.getByLabelText(/63'.*Gegentor.*RW Köpenick/)).toBeTruthy()
  })

  it('keeps a plain goal label when our side is unknown', () => {
    const screen = render(<TimelineItem minute={23} kind="goal" player="Kofi Osei" side="home" />)
    expect(screen.getByLabelText(/23'.*Tor.*Kofi Osei/)).toBeTruthy()
    expect(screen.queryByText('Goal against')).toBeNull()
    expect(screen.getByText("23'")).toBeTruthy()
  })
})

describe('crestInitials', () => {
  it('builds initials from club names', () => {
    expect(crestInitials('SV Spreewiese 1921')).toBe('SS')
    expect(crestInitials('Rot-Weiß Köpenick III')).toBe('RWK')
    expect(crestInitials('Hertha')).toBe('HER')
  })
})
