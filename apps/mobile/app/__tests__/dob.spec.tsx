import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockUpdate = jest.fn()
const mockReset = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.dob.title': 'When were you born?',
        'onboarding.dob.hint': 'We use this to set up your account safely.',
        'onboarding.dob.cta': 'Continue',
        'onboarding.dob.placeholder': 'DD.MM.YYYY',
        'onboarding.dob.under16Title': "You're younger than 16",
        'onboarding.dob.under16Body':
          'Ask a parent to add you. Show them this code on their phone:',
        'onboarding.dob.under16Cta': 'Done',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { firstName: 'Mara' },
    update: mockUpdate,
    reset: mockReset,
  }),
}))

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-04-25'))
})
afterAll(() => {
  jest.useRealTimers()
})

import Dob from '../(auth)/dob'

describe('Dob', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockUpdate.mockReset()
    mockReset.mockReset()
  })

  it('routes to /role on a 16+ DOB', async () => {
    render(<Dob />)
    fireEvent.changeText(screen.getByPlaceholderText(/DD\.MM\.YYYY/), '04.05.1995')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ dateOfBirth: '1995-05-04' }))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/role')
  })

  it('shows the under-16 hard stop on a 15-year-old DOB', async () => {
    render(<Dob />)
    fireEvent.changeText(screen.getByPlaceholderText(/DD\.MM\.YYYY/), '01.05.2010')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() => expect(screen.getByText(/younger than 16/i)).toBeOnTheScreen())
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
