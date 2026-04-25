import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import JoinCodeScreen from '../join-code'

describe('join-code — FormScreen adoption', () => {
  it('renders the FormScreen backdrop', () => {
    const { getByTestId } = render(<JoinCodeScreen />)
    expect(getByTestId('form-screen-backdrop')).toBeTruthy()
  })
})
