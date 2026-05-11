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
  useLocalSearchParams: () => ({}),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'onboarding.phone.title': 'Your phone',
        'onboarding.phone.hint': 'We will text you a 6-digit code.',
        'onboarding.phone.placeholder': '+49 151 1234 5678',
        'onboarding.phone.identifierPlaceholder': 'Phone number or email',
        'onboarding.phone.cta': 'Send code',
        'onboarding.phone.invalid': 'Phone must start with +49 or +43.',
      }
      return map[key] ?? opts?.defaultValue ?? key
    },
  }),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({
    startOtp: mockStartPhoneOtp,
    verifyOtp: jest.fn(),
    startPhoneOtp: mockStartPhoneOtp,
    verifyPhoneOtp: jest.fn(),
    isLoaded: true,
  }),
  // Re-export the pure helpers so phone.tsx's classifyIdentifier /
  // normalizeIdentifier calls resolve under the mock.
  classifyIdentifier: (raw: string) => {
    const t = raw.trim()
    if (!t) return null
    if (t.includes('@')) return 'email'
    if (/^\+\d/.test(t)) return 'phone'
    return null
  },
  normalizeIdentifier: (raw: string, kind: 'phone' | 'email' | null) => {
    if (kind === 'email') return raw.trim().toLowerCase()
    if (kind === 'phone') return raw.replace(/[^\d+]/g, '')
    return raw.trim()
  },
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update: mockUpdate, reset: jest.fn(), markStep: jest.fn(), hydrating: false }),
}))

import Phone from '../(auth)/phone'

describe('Phone', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockStartPhoneOtp.mockReset()
    mockUpdate.mockReset()
  })

  it('rejects a number not in international E.164 format (button disabled)', async () => {
    // New design uses a disabled CTA when the phone is invalid (no
    // inline error text needed) — pressing it should still not fire
    // startPhoneOtp.
    render(<Phone />)
    fireEvent.changeText(screen.getByPlaceholderText(/Phone number or email/i), '01511234567')
    fireEvent.press(screen.getByText(/send code/i))
    await waitFor(() => expect(mockStartPhoneOtp).not.toHaveBeenCalled())
  })

  it('on valid +49 number: calls startPhoneOtp + stores phone (stays on screen, transitions to OTP stage)', async () => {
    // Phone + OTP collapsed into one screen, so after Send the screen
    // doesn't router.push — it animates the OTP cells in instead. The
    // contract we still care about: startPhoneOtp + update fire.
    mockStartPhoneOtp.mockResolvedValue(undefined)
    render(<Phone />)
    fireEvent.changeText(screen.getByPlaceholderText(/Phone number or email/i), '+4915112345678')
    fireEvent.press(screen.getByText(/send code/i))
    // The screen now calls startOtp (auto-detect) with the resolved kind
    // as the third argument. Phone path resolves to 'phone'.
    await waitFor(() =>
      expect(mockStartPhoneOtp).toHaveBeenCalledWith(
        '+4915112345678',
        'signup',
        'phone',
      ),
    )
    expect(mockUpdate).toHaveBeenCalledWith({
      phone: '+4915112345678',
      email: undefined,
    })
  })
})
