import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import SignInScreen from '../../app/(auth)/sign-in'

const mockRouterReplace = jest.fn()
const mockRefreshUser = jest.fn()
const mockPrepareFirstFactor = jest.fn()
const mockCreate = jest.fn()
const mockAttemptFirstFactor = jest.fn()
const mockSetActive = jest.fn()
const mockSignUpCreate = jest.fn()
const mockAttemptEmailVerification = jest.fn()
const mockSetSignUpActive = jest.fn()

const mockT = (key: string, options?: Record<string, unknown>) => {
  const email = typeof options?.email === 'string' ? options.email : ''
  const map: Record<string, string> = {
    'common.language': 'Language',
    'auth.tagline': 'Your club. Everything in one place.',
    'auth.emailLabel': 'Email address',
    'auth.emailPlaceholder': 'you@example.com',
    'auth.emailContinue': 'Send code',
    'auth.dateOfBirth': 'Date of birth',
    'auth.dateOfBirthHint':
      'If you are under 16, we will ask for a parent or guardian to approve access in the next step.',
    'auth.dateOfBirthPlaceholder': '15.06.2000',
    'auth.continue': 'Continue',
    'auth.verificationCodeLabel': 'Sign-in code',
    'auth.verificationCodePlaceholder': '000000',
    'auth.invalidEmailTitle': 'Invalid email address',
    'auth.invalidEmailBody': 'Please enter a valid email address.',
    'auth.dateOfBirthRequiredTitle': 'Date of birth required',
    'auth.dateOfBirthRequiredBody': 'Please enter your date of birth in DD.MM.YYYY format.',
    'auth.dateOfBirthInvalidTitle': 'Invalid date of birth',
    'auth.dateOfBirthInvalidBody': 'Please enter your date of birth in DD.MM.YYYY format.',
    'auth.checkEmailTitle': 'Check your inbox',
    'auth.authNotReady': 'Authentication is not ready yet. Please try again in a moment.',
    'auth.restartSignIn': 'Please start the sign-in flow again.',
    'auth.restartVerification': 'Please request a new sign-in code.',
    'auth.emailCodeNotEnabled': 'Email code sign-in is not enabled for this app yet.',
    'auth.verifyIncomplete': 'Verification is not complete yet. Please try again.',
    'auth.sessionNotReady': 'Your session is still starting up. Please try once more in a moment.',
    'auth.sendCodeErrorTitle': 'Could not send code',
    'auth.sendCodeErrorBody': 'We could not send the sign-in code right now. Please try again.',
  }

  if (key === 'auth.checkEmailBody') {
    return `We sent a six-digit sign-in code to ${email}.`
  }

  return map[key] ?? key
}

jest.mock('@clerk/clerk-expo', () => ({
  isClerkAPIResponseError: (error: unknown) =>
    !!error &&
    typeof error === 'object' &&
    Array.isArray((error as { errors?: unknown[] }).errors),
  useSignIn: () => ({
    signIn: {
      create: mockCreate,
      attemptFirstFactor: mockAttemptFirstFactor,
    },
    setActive: mockSetActive,
    isLoaded: true,
  }),
  useSignUp: () => ({
    signUp: {
      create: mockSignUpCreate,
      attemptEmailAddressVerification: mockAttemptEmailVerification,
    },
    setActive: mockSetSignUpActive,
    isLoaded: true,
  }),
}))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: {
      resolvedLanguage: 'en',
    },
  }),
}))

jest.mock('../../src/components/LanguageSwitch', () => ({
  LanguageSwitch: () => null,
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    isSignedIn: false,
    refreshUser: mockRefreshUser,
  }),
}))

jest.mock('../../src/i18n', () => ({
  setAppLanguage: jest.fn(() => Promise.resolve()),
}))

jest.mock('../../src/illustrations', () => ({
  illustrations: {
    onboardingHero: 1,
  },
}))

jest.mock('../../src/theme/tokens', () => ({
  neutralColors: {
    background: '#FAFAF8',
    surface: '#FFFFFF',
    textPrimary: '#1A1A18',
    textSecondary: '#6B6B69',
    textTertiary: '#9E9E9C',
    textInverse: '#FFFFFF',
    border: '#E5E5E3',
  },
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
}))

jest.mock('../../src/utils/clerkSession', () => ({
  waitForSessionToken: jest.fn(),
}))

describe('SignInScreen auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrepareFirstFactor.mockResolvedValue({})
    mockCreate.mockResolvedValue({
      supportedFirstFactors: [
        { strategy: 'email_code', emailAddressId: 'ea_123' },
      ],
      prepareFirstFactor: mockPrepareFirstFactor,
    })
  })

  it('renders the email step initially', () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    expect(getByText('Anstoss')).toBeTruthy()
    expect(getByText('Language')).toBeTruthy()
    expect(getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(getByText('Send code')).toBeTruthy()
  })

  it('shows the date-of-birth step after entering an email', () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Send code'))

    expect(getByText('Date of birth')).toBeTruthy()
    expect(getByPlaceholderText('15.06.2000')).toBeTruthy()
  })

  it('rejects invalid date-of-birth input', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Send code'))
    fireEvent.changeText(getByPlaceholderText('15.06.2000'), '99.99.9999')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Invalid date of birth',
        'Please enter your date of birth in DD.MM.YYYY format.',
      )
    })
  })

  it('requests an email code after a valid date of birth', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Send code'))
    fireEvent.changeText(getByPlaceholderText('15.06.2000'), '15.06.2000')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        identifier: 'test@example.com',
      })
      expect(mockPrepareFirstFactor).toHaveBeenCalledWith({
        strategy: 'email_code',
        emailAddressId: 'ea_123',
      })
      expect(alertSpy).toHaveBeenCalledWith(
        'Check your inbox',
        'We sent a six-digit sign-in code to test@example.com.',
      )
    })
  })

  it('shows code entry after the email code is requested successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Send code'))
    fireEvent.changeText(getByPlaceholderText('15.06.2000'), '15.06.2000')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByText('Sign-in code')).toBeTruthy()
      expect(getByPlaceholderText('000000')).toBeTruthy()
    })
  })
})
