import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
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
const mockSignUpUpdate = jest.fn()
const mockApi = jest.fn()
let mockIsSignedIn = false
const mockSignInResource = {
  create: mockCreate,
  prepareFirstFactor: mockPrepareFirstFactor,
  attemptFirstFactor: mockAttemptFirstFactor,
  supportedFirstFactors: [] as Array<{ strategy: string; emailAddressId?: string }>,
  createEmailLinkFlow: undefined as
    | undefined
    | (() => { startEmailLinkFlow: typeof mockStartEmailLinkFlow }),
}
const mockSignUpResource = {
  create: mockSignUpCreate,
  update: mockSignUpUpdate,
  prepareEmailAddressVerification: mockPrepareEmailVerification,
  attemptEmailAddressVerification: mockAttemptEmailVerification,
  createEmailLinkFlow: undefined as
    | undefined
    | (() => { startEmailLinkFlow: typeof mockStartEmailLinkFlow }),
}

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
    'auth.intentStepTitle': 'WHAT BRINGS YOU HERE?',
    'auth.intentPlayer': "I'm a Player",
    'auth.intentPlayerBody': 'Join a team and manage my schedule',
    'auth.intentParent': "I'm a Parent",
    'auth.intentParentBody': "Follow my child's team activities",
    'auth.intentCoach': "I'm a Coach",
    'auth.intentCoachBody': "Manage my team's roster and events",
    'auth.intentClubAdmin': 'I run a club',
    'auth.intentClubAdminBody': 'Set up and manage my football club',
    'auth.intentFreeAgent': "I'm a Free Agent",
    'auth.intentFreeAgentBody': 'Looking for a team to join',
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
    'auth.resendCode': 'Resend code',
    'auth.useDifferentEmail': 'Use a different email',
    'auth.useCodeInstead': 'Use code instead',
    'auth.verifyIncomplete': 'Verification is not complete yet. Please try again.',
    'auth.sessionNotReady': 'Your session is still starting up. Please try once more in a moment.',
    'auth.sendCodeErrorTitle': 'Could not send email',
    'auth.sendCodeErrorBody': 'We could not send the sign-in email right now. Please try again.',
    'auth.loginTitle': 'Welcome back',
    'auth.noAccount': "Don't have an account?",
    'auth.passwordLabel': 'Password',
    'auth.passwordPlaceholder': 'Enter password',
    'auth.finish': 'Finish',
    'auth.stepProfileTitle': 'Set up your profile',
    'auth.stepProfileHint': 'Choose a name and password for your account.',
    'auth.nameLabel': 'Your name',
    'auth.namePlaceholder': 'Enter your name',
    'auth.dateOfBirth': 'Date of birth',
    'auth.dobPlaceholder': 'DD.MM.YYYY',
    'auth.dateOfBirthHint': 'Needed for the under-16 access rule.',
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })

  return { promise, resolve }
}

jest.mock('@clerk/clerk-expo', () => ({
  isClerkAPIResponseError: (error: unknown) =>
    !!error &&
    typeof error === 'object' &&
    Array.isArray((error as { errors?: unknown[] }).errors),
  useSignIn: () => ({
    signIn: mockSignInResource,
    setActive: mockSetActive,
    isLoaded: true,
  }),
  useSignUp: () => ({
    signUp: mockSignUpResource,
    setActive: mockSetSignUpActive,
    isLoaded: true,
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
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
    isSignedIn: mockIsSignedIn,
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
    borderStrong: '#D1D1CC',
    surfaceElevated: '#FFFFFF',
  },
  semanticColors: { success: '#2D7A3A', warning: '#B8860B', error: '#C4372C', info: '#2563A0' },
  radius: { md: 8, lg: 12, full: 999, sm: 4 },
  space: { '2xs': 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 },
  fontSize: { '2xs': 10, xs: 12, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 32 },
  fontWeight: { regular: '400', medium: '500', bold: '700' },
  fonts: { body: 'Body', label: 'Label', heading: 'Heading', data: 'Data' },
  lineHeight: { '2xs': 14, xs: 17, sm: 20, md: 24, lg: 24, xl: 26, '2xl': 30, '3xl': 38 },
  chatColors: { bubbleOther: '#F0F0EB' },
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

describe('SignInScreen auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsSignedIn = false
    mockPrepareFirstFactor.mockResolvedValue({})
    mockPrepareEmailVerification.mockResolvedValue({})
    mockStartEmailLinkFlow.mockImplementation(() => new Promise(() => {}))
    mockSignInResource.supportedFirstFactors = [
      { strategy: 'email_code', emailAddressId: 'ea_123' },
    ]
    mockSignInResource.createEmailLinkFlow = undefined
    mockCreate.mockResolvedValue({})
    mockAttemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_sign_in',
    })
    mockSignUpResource.createEmailLinkFlow = undefined
    mockSignUpCreate.mockResolvedValue({})
    mockSignUpUpdate.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_sign_up',
    })
    mockAttemptEmailVerification.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_sign_up',
    })
    mockApi.mockResolvedValue(undefined)
  })

  it('renders the simplified login step initially', () => {
    const { getByPlaceholderText, getByText, getAllByText } = render(<SignInScreen />)

    expect(getByText('Anstoss')).toBeTruthy()
    expect(getByText('Your club. Everything in one place.')).toBeTruthy()
    expect(getByText('Create account')).toBeTruthy()
    expect(getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(getAllByText('Log in').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps login on email plus code without showing date-of-birth fields', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignInScreen />)

    fireEvent.press(getByText('Use code instead'))
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
    const { getByPlaceholderText, getByText, getAllByText, queryByText, getByTestId } = render(<SignInScreen />)

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

    expect(queryByText("I'm a Player")).toBeNull()
    expect(queryByText("I'm a Coach")).toBeNull()

    fireEvent.changeText(getByPlaceholderText('6-digit code'), '981145')
    fireEvent.press(getByText('Sign in'))

    await waitFor(() => {
      expect(getByTestId('auth-name-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-name-input'), 'Test User')
    fireEvent.changeText(getByTestId('auth-password-input'), 'password123')

    await act(async () => {
      fireEvent.press(getByText('Continue'))
      await new Promise((r) => setTimeout(r, 0))
    })

    await waitFor(() => {
      expect(getByTestId('auth-dob-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-dob-input'), '01.01.2000')

    await act(async () => {
      fireEvent.press(getByText('Continue'))
      await new Promise((r) => setTimeout(r, 0))
    })

    await waitFor(() => {
      expect(getAllByText('WHAT BRINGS YOU HERE?').length).toBeGreaterThan(0)
      expect(getByText("I'm a Player")).toBeTruthy()
    })
  })

  it('prefers an in-app email code even when Clerk also exposes an email link', async () => {
    mockSignUpResource.createEmailLinkFlow = () => ({
      startEmailLinkFlow: mockStartEmailLinkFlow,
    })
    mockSignUpCreate.mockResolvedValue({})

    const { getByPlaceholderText, getByText, queryByPlaceholderText, queryByText } = render(
      <SignInScreen />,
    )

    fireEvent.press(getByText('Create account'))
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockPrepareEmailVerification).toHaveBeenCalledWith({
        strategy: 'email_code',
      })
    })

    expect(mockStartEmailLinkFlow).not.toHaveBeenCalled()
    expect(getByPlaceholderText('6-digit code')).toBeTruthy()
    expect(queryByText('Open the link on this device to continue.')).toBeNull()
  })

  it('recovers an existing Clerk session when signup is attempted while already signed in', async () => {
    mockSignUpCreate.mockRejectedValue({
      errors: [
        {
          code: 'session_exists',
          message: 'Session already exists',
          longMessage: "You're already signed in.",
        },
      ],
    })

    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.press(getByText('Create account'))
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalledWith('token_123')
    })

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/')
    })
  })

  it('completes player signup after email, code, and intent selection', async () => {
    const { getByPlaceholderText, getByText, getByTestId } = render(<SignInScreen />)

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
    fireEvent.press(getByText('Sign in'))

    await waitFor(() => {
      expect(getByTestId('auth-name-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-name-input'), 'Test Player')
    fireEvent.changeText(getByTestId('auth-password-input'), 'password123')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByTestId('auth-dob-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-dob-input'), '01.01.2000')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByText("I'm a Player")).toBeTruthy()
    })

    fireEvent.press(getByText("I'm a Player"))
    fireEvent.press(getByText('Finish'))

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

  it('holds the signed-in redirect until signup role finalization completes', async () => {
    const refreshDeferred = createDeferred<void>()
    mockRefreshUser.mockImplementation(() => refreshDeferred.promise)

    const { getByPlaceholderText, getByText, getByTestId, rerender } = render(<SignInScreen />)

    fireEvent.press(getByText('Create account'))
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'club-admin@example.com')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByPlaceholderText('6-digit code')).toBeTruthy()
    })

    fireEvent.changeText(getByPlaceholderText('6-digit code'), '981145')
    fireEvent.press(getByText('Sign in'))

    await waitFor(() => {
      expect(getByTestId('auth-name-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-name-input'), 'Club Admin')
    fireEvent.changeText(getByTestId('auth-password-input'), 'password123')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByTestId('auth-dob-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-dob-input'), '01.01.1990')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByText('I run a club')).toBeTruthy()
    })

    act(() => {
      mockIsSignedIn = true
      rerender(<SignInScreen />)
    })

    expect(mockRouterReplace).not.toHaveBeenCalledWith('/')

    fireEvent.press(getByText('I run a club'))
    fireEvent.press(getByText('Finish'))

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/me/registration-role',
        expect.objectContaining({
          method: 'PATCH',
          body: { registrationRole: 'CLUB_ADMIN' },
        }),
      )
    })

    expect(mockRefreshUser).toHaveBeenCalledWith('token_123')
    expect(mockRouterReplace).not.toHaveBeenCalledWith('/')

    await act(async () => {
      refreshDeferred.resolve()
      await refreshDeferred.promise
    })

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/')
    })
  })

  it('retries role finalization once after a transient server error', async () => {
    mockApi
      .mockResolvedValueOnce(undefined) // profile step: api('/me', { name }) succeeds
      .mockResolvedValueOnce(undefined) // dob step: api('/me', { dateOfBirth }) succeeds
      .mockRejectedValueOnce(
        Object.assign(new Error('Something went wrong. Please try again.'), {
          status: 500,
        }),
      ) // first role finalization: fails
      .mockResolvedValueOnce(undefined) // retry role finalization: succeeds

    const { getByPlaceholderText, getByText, getByTestId } = render(<SignInScreen />)

    fireEvent.press(getByText('Create account'))
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'coach@example.com')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByPlaceholderText('6-digit code')).toBeTruthy()
    })

    fireEvent.changeText(getByPlaceholderText('6-digit code'), '981145')
    fireEvent.press(getByText('Sign in'))

    await waitFor(() => {
      expect(getByTestId('auth-name-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-name-input'), 'Coach User')
    fireEvent.changeText(getByTestId('auth-password-input'), 'password123')

    await act(async () => {
      fireEvent.press(getByText('Continue'))
      await new Promise((r) => setTimeout(r, 0))
    })

    await waitFor(() => {
      expect(getByTestId('auth-dob-input')).toBeTruthy()
    })

    fireEvent.changeText(getByTestId('auth-dob-input'), '01.01.1985')

    await act(async () => {
      fireEvent.press(getByText('Continue'))
      await new Promise((r) => setTimeout(r, 0))
    })

    await waitFor(() => {
      expect(getByText('I run a club')).toBeTruthy()
    })

    // Enable fake timers only for the retry timing
    jest.useFakeTimers()

    fireEvent.press(getByText('I run a club'))
    fireEvent.press(getByText('Finish'))

    await act(async () => {
      jest.advanceTimersByTime(400)
    })

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(4)
      expect(mockRefreshUser).toHaveBeenCalledWith('token_123')
      expect(mockRouterReplace).toHaveBeenCalledWith('/')
    })

    jest.useRealTimers()
  })
})
