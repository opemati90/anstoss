import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => ({}),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => ({ 'common.back': 'Back' })[k] ?? k,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: jest.fn() }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import ClubSetupScreen from '../club-setup'

describe('club-setup — step-aware back', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockApi.mockReset()
  })

  it('pressing back on step 2 returns to step 1 and does not navigate away', async () => {
    const { getByText, getByLabelText, getByPlaceholderText } = render(<ClubSetupScreen />)

    // Step 1: fill club name then press the Next button.
    fireEvent.changeText(
      getByPlaceholderText('club.setupWizard.clubNamePlaceholder'),
      'FC Anstoss',
    )
    await act(async () => {
      fireEvent.press(getByText('club.setupWizard.nextButton'))
    })

    // Now on step 2 — the team name placeholder is visible.
    expect(getByPlaceholderText('club.setupWizard.teamNamePlaceholder')).toBeTruthy()

    // Press the modal header back button.
    await act(async () => {
      fireEvent.press(getByLabelText('Back'))
    })

    // Expectation: back returned to step 1 (club name placeholder visible again),
    // and router.replace was NOT called.
    expect(getByPlaceholderText('club.setupWizard.clubNamePlaceholder')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
