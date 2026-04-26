import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockVerifyPhoneOtp = jest.fn()
const mockStartPhoneOtp = jest.fn()

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
    t: (key: string, opts?: { phone?: string; seconds?: number }) => {
      const map: Record<string, string> = {
        'onboarding.code.title': 'Enter the code',
        'onboarding.code.hint': `Sent to ${opts?.phone ?? ''}.`,
        'onboarding.code.cta': 'Verify',
        'onboarding.code.resend': 'Resend code',
        'onboarding.code.resendIn': `Resend in ${opts?.seconds ?? 0}s`,
        'onboarding.code.wrong': "That code didn\u2019t work. Try again.",
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({
    verifyPhoneOtp: mockVerifyPhoneOtp,
    startPhoneOtp: mockStartPhoneOtp,
    isLoaded: true,
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { phone: '+4915112345678' }, update: jest.fn(), reset: jest.fn() }),
}))

import Code from '../(auth)/code'

describe('Code', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockVerifyPhoneOtp.mockReset()
    mockStartPhoneOtp.mockReset()
  })

  it('verifies and routes to /name on success', async () => {
    mockVerifyPhoneOtp.mockResolvedValue(undefined)
    render(<Code />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
    fireEvent.press(screen.getByText(/verify/i))
    await waitFor(() => expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('123456'))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/name')
  })

  it('shows error on bad code', async () => {
    mockVerifyPhoneOtp.mockRejectedValue(new Error('bad'))
    render(<Code />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '999999')
    fireEvent.press(screen.getByText(/verify/i))
    await waitFor(() => expect(screen.getByText(/didn.t work/i)).toBeOnTheScreen())
  })
})
