import React from 'react'
import { render } from '@testing-library/react-native'
import { RsvpControl } from '../RsvpControl'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../../utils/haptics', () => ({ Haptics: { select: jest.fn() } }))

it.each(['default', 'compact'] as const)('allows 200% text without shrinking in %s controls', (size) => {
  const screen = render(<RsvpControl value="YES" onChange={jest.fn()} size={size} askReason={false} />)
  for (const key of ['eventFlow.rsvp.yes', 'eventFlow.rsvp.maybe', 'eventFlow.rsvp.no']) {
    const labels = screen.getAllByText(key, { includeHiddenElements: true })
    expect(labels).toHaveLength(2) // hidden measurement and visible label
    for (const label of labels) {
      expect(label.props.maxFontSizeMultiplier).toBe(2)
      expect(label.props.adjustsFontSizeToFit).not.toBe(true)
    }
  }
})
