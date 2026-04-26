import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockStartPhoneOtp = jest.fn()
const mockUpdate = jest.fn()

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'onboarding.phone.title': 'Your phone',
        'onboarding.phone.hint': 'We will text you a 6-digit code.',
        'onboarding.phone.placeholder': '+49 151 1234 5678',
        'onboarding.phone.cta': 'Send code',
        'onboarding.phone.invalid': 'Phone must start with +49 or +43.',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ startPhoneOtp: mockStartPhoneOtp, isLoaded: true }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update: mockUpdate, reset: jest.fn() }),
}))

import Phone from '../(auth)/phone'

describe('Phone', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockStartPhoneOtp.mockReset()
    mockUpdate.mockReset()
  })

  it('rejects a number that does not start with +49 or +43', async () => {
    render(<Phone />)
    fireEvent.changeText(screen.getByPlaceholderText(/\+49/), '+1 555 123 4567')
    fireEvent.press(screen.getByText(/send code/i))
    await waitFor(() => expect(mockStartPhoneOtp).not.toHaveBeenCalled())
    expect(screen.getByText(/\+49 or \+43/i)).toBeOnTheScreen()
  })

  it('on valid +49 number: calls startPhoneOtp, stores phone, routes to /code', async () => {
    mockStartPhoneOtp.mockResolvedValue(undefined)
    render(<Phone />)
    fireEvent.changeText(screen.getByPlaceholderText(/\+49/), '+4915112345678')
    fireEvent.press(screen.getByText(/send code/i))
    await waitFor(() => expect(mockStartPhoneOtp).toHaveBeenCalledWith('+4915112345678'))
    expect(mockUpdate).toHaveBeenCalledWith({ phone: '+4915112345678' })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/code')
  })
})
