import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Keyboard, Text } from 'react-native'

jest.mock('../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import { FormScreen } from './FormScreen'

describe('FormScreen', () => {
  it('renders children', () => {
    const { getByText } = render(
      <FormScreen>
        <Text>hello</Text>
      </FormScreen>,
    )
    expect(getByText('hello')).toBeTruthy()
  })

  it('dismisses the keyboard when the backdrop is pressed', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {})
    const { getByTestId } = render(
      <FormScreen>
        <Text>content</Text>
      </FormScreen>,
    )
    fireEvent.press(getByTestId('form-screen-backdrop'))
    expect(dismiss).toHaveBeenCalled()
    dismiss.mockRestore()
  })
})
