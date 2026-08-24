import React from 'react'
import { render } from '@testing-library/react-native'
import { Icon } from './Icon'

const mockIonicons = jest.fn((_props: unknown) => null)

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: unknown) => mockIonicons(props),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    textPrimary: '#111111',
    textSecondary: '#666666',
    textTertiary: '#888888',
    textInverse: '#ffffff',
    primary: '#333333',
    success: '#228844',
    warning: '#aa6600',
    error: '#bb2222',
    info: '#2266aa',
  }),
}))

describe('Icon semantic mapping', () => {
  beforeEach(() => mockIonicons.mockClear())

  it.each([
    ['figure.walk', 'walk-outline'],
    ['person.crop.circle.badge.plus', 'person-add-outline'],
  ])('maps %s to a valid Android Ionicon', (semanticName, nativeName) => {
    render(<Icon name={semanticName} />)

    expect(mockIonicons).toHaveBeenCalledWith(
      expect.objectContaining({ name: nativeName }),
    )
  })
})
