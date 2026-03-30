import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import SignInScreen from '../../app/(auth)/sign-in'

const mockRouterReplace = jest.fn()
const mockRefreshUser = jest.fn()
const mockPrepareFirstFactor = jest.fn()
const mockPrepareEmailVerification = jest.fn()
const mockCreate = jest.fn()
const mockAttemptFirstFactor = jest.fn()
const mockSetActive = jest.fn()
const mockSignUpCreate = jest.fn()
const mockAttemptEmailVerification = jest.fn()
const mockSetSignUpActive = jest.fn()
const mockStartEmailLinkFlow = jest.fn()
const mockApi = jest.fn()

const mockT = (key: string, options?: Record<string, unknown>) => {
  const email = typeof options?.email === 'string' ? options.email : ''
  const map: Record<string, string> = {
    'auth.login': 'Log in',
    'auth.signUp': 'Create account',
    'auth.tagline': 'Your club. Everything in one place.',
    'auth.loginModeTitle': 'Continue with email',
    'auth.signUpModeTitle': 'Set up access',
    'auth.loginModeBody': 'Please enter your registered email to continue.',
    'auth.signUpModeBody': 'Enter your email to continue.',
    'auth.emailLabel': 'Email address',
    'auth.emailPlaceholder': 'you@example.com',
    'auth.emailContinue': 'Send code',
    'auth.signUpContinue': 'Continue',
    'auth.verificationCodeLabel': 'Code',
    'auth.verificationCodePlaceholder': '6-digit code',
    'auth.continue': 'Continue',
    'auth.verify': 'Sign in',
    'auth.pathStepTitle': 'How do you use Anstoss?',
    'auth.pathJoinTitle': 'Join a team',
    'auth.pathJoinBody': 'Player and parent access for clubs and squads.',
    'auth.pathOperateTitle': 'Run a team or club',
    'auth.pathOperateBody': 'Coach and club admin access for operations.',
    'auth.pathFreeAgentTitle': 'Free agent profile',
    'auth.pathFreeAgentBody': 'Stay available for trials and club requests.',
    'auth.roleStepTitle': 'Choose your starting role',
    'auth.invalidEmailTitle': 'Invalid email address',
    'auth.invalidEmailBody': 'Please enter a valid email address.',
    'auth.checkEmailTitle': 'Check your inbox',
    'auth.authNotReady': 'Authentication is not ready yet. Please try again in a moment.',
    'auth.restartSignIn': 'Please start the sign-in flow again.',
    'auth.restartVerification': 'Please request a new sign-in code.',
    'auth.emailCodeNotEnabled': 'Email code sign-in is not enabled for this app yet.',
    'auth.checkEmailLinkBody': 'We sent a secure sign-in link to {{email}}.',
    'auth.emailLinkDeviceHint': 'Open the link on this device to continue.',
    'auth.resendEmail': 'Resend email',
    'auth.verifyIncomplete': 'Verification is not complete yet. Please try again.',
    'auth.sessionNotReady': 'Your session is still starting up. Please try once more in a moment.',
    'auth.sendCodeErrorTitle': 'Could not send email',
    'auth.sendCodeErrorBody': 'We could not send the sign-in email right now. Please try again.',
    'roles.PLAYER': 'Player',
    'roles.PARENT': 'Parent',
    'roles.COACH': 'Coach',
    'roles.CLUB_ADMIN': 'Club admin',
    'roles.FREE_AGENT': 'Free agent',
    'auth.roleBody.PLAYER': 'Request access to your team after sign-up.',
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
  getAppLanguage: jest.fn(() => 'en'),
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
  radius: { md: 8, lg: 12, full: 999 },
  space: { sm: 8, md: 16, lg: 24 },
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {
    code?: string
  },
}))

jest.mock('../../src/utils/clerkSession', () => ({
  waitForSessionToken: jest.fn(() => Promise.resolve('token_123')),
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'anstoss://sign-in'),
}))

describe('SignInScreen auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrepareFirstFactor.mockResolvedValue({})
    mockPrepareEmailVerification.mockResolvedValue({})
    mockStartEmailLinkFlow.mockImplementation(() => new Promise(() => {}))
    mockCreate.mockResolvedValue({
      supportedFirstFactors: [{ strategy: 'email_code', emailAddressId: 'ea_123' }],
      prepareFirstFactor: mockPrepareFirstFactor,
    })
    mockAttemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_sign_in',
    })
    mockSignUpCreate.mockResolvedValue({
      prepareEmailAddressVerification: mockPrepareEmailVerification,
      createEmailLinkFlow: undefined,
    })
    mockAttemptEmailVerification.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_sign_up',
    })
    mockApi.mockResolvedValue(undefined)
  })

  it('renders the simplified login step initially', () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    expect(getByText('Anstoss')).toBeTruthy()
    expect(getByText('Your club. Everything in one place.')).toBeTruthy()
    expect(getByText('Create account')).toBeTruthy()
    expect(getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(getByText('Send code')).toBeTruthy()
  })

  it('keeps login on email plus code without showing date-of-birth fields', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignInScreen />)

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Send code'))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        identifier: 'test@example.com',
      })
    })

    expect(queryByText('Date of birth')).toBeNull()
    await waitFor(() => {
      expect(getByText('Code')).toBeTruthy()
    })
  })

  it('keeps signup progressive and only asks for path after code verification', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignInScreen />)

    fireEvent.press(getByText('Create account'))
    expect(getByText('Continue')).toBeTruthy()
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockSignUpCreate).toHaveBeenCalledWith({
        emailAddress: 'test@example.com',
      })
      expect(mockPrepareEmailVerification).toHaveBeenCalledWith({
        strategy: 'email_code',
      })
    })

    expect(queryByText('Player')).toBeNull()
    expect(queryByText('Join a team')).toBeNull()

    fireEvent.changeText(getByPlaceholderText('6-digit code'), '981145')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByText('How do you use Anstoss?')).toBeTruthy()
      expect(getByText('Join a team')).toBeTruthy()
    })
  })

  it('prefers an email link for new accounts when Clerk exposes that flow', async () => {
    mockSignUpCreate.mockResolvedValue({
      prepareEmailAddressVerification: mockPrepareEmailVerification,
      createEmailLinkFlow: () => ({
        startEmailLinkFlow: mockStartEmailLinkFlow,
      }),
    })

    const { getByPlaceholderText, getByText, queryByPlaceholderText } = render(
      <SignInScreen />,
    )

    fireEvent.press(getByText('Create account'))
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockStartEmailLinkFlow).toHaveBeenCalledWith({
        redirectUrl: 'anstoss://sign-in',
      })
    })

    expect(getByText('Open the link on this device to continue.')).toBeTruthy()
    expect(queryByPlaceholderText('6-digit code')).toBeNull()
  })

  it('completes player signup after email, code, path, and role selection', async () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.press(getByText('Create account'))
    expect(getByText('Continue')).toBeTruthy()
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockSignUpCreate).toHaveBeenCalledWith({
        emailAddress: 'test@example.com',
      })
    })

    await waitFor(() => {
      expect(getByPlaceholderText('6-digit code')).toBeTruthy()
    })

    fireEvent.changeText(getByPlaceholderText('6-digit code'), '981145')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByText('Join a team')).toBeTruthy()
    })

    fireEvent.press(getByText('Join a team'))
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByText('Choose your starting role')).toBeTruthy()
    })

    fireEvent.press(getByText('Player'))
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/me/registration-role',
        expect.objectContaining({
          method: 'PATCH',
          body: { registrationRole: 'PLAYER' },
        }),
      )
      expect(mockRefreshUser).toHaveBeenCalledWith('token_123')
      expect(mockRouterReplace).toHaveBeenCalledWith('/')
    })
  })
})
