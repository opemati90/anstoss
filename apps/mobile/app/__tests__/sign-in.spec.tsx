import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockBack = jest.fn()
const mockCanGoBack = jest.fn()
const mockStartOtp = jest.fn()
const mockVerifyOtp = jest.fn()
const mockCompleteSignUpIfReady = jest.fn()
const mockSetBasicProfile = jest.fn()
const mockUpdate = jest.fn()
const mockSearchParams: { inviteCode?: string | string[] } = {}

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    background: '#ffffff',
    borderDefault: '#dddddd',
    error: '#c62828',
    primary: '#2255cc',
    surface: '#ffffff',
    surfaceSunken: '#f6f7f9',
    textPrimary: '#111111',
    textSecondary: '#555555',
    textTertiary: '#777777',
  }),
}))

jest.mock('../../src/components/ui', () => {
  const React = require('react')
  const { Text } = require('react-native')

  return {
    Icon: (props: { name?: string }) =>
      React.createElement(Text, { testID: `icon-${props.name ?? 'icon'}` }),
    Text: (props: { children?: React.ReactNode }) =>
      React.createElement(Text, props, props.children),
  }
})

jest.mock('../../src/utils/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'auth.signin.title': 'Welcome',
        'auth.signin.titleOtp': 'Enter the code',
        'auth.signin.titleName': "What's your name?",
        'auth.signin.identifierPlaceholder': 'Email address',
        'auth.signin.hintIdentifier': 'Enter your email.',
        'auth.signin.hintOtp': 'Sent to {{identifier}}. Tap to edit.',
        'auth.signin.hintName': 'Just a first name.',
        'auth.signin.sendCode': 'Send code',
        'auth.signin.continue': 'Continue',
        'auth.signin.codeLabel': '6-digit code',
        'auth.signin.consentPrefix': 'By continuing you agree to our ',
        'common.edit': 'Edit',
        'onboarding.phone.sendFailed': "We couldn't send a code. Check the email and try again.",
        'onboarding.code.resend': 'Resend code',
        'onboarding.code.resendIn': 'Resend in {{seconds}}s',
        'onboarding.code.wrong': "That code didn't work. Check it and try again.",
        'onboarding.name.placeholder': 'First name',
        'onboarding.welcome.policyAnd': ' and ',
        'onboarding.welcome.policyPrivacy': 'Privacy Policy',
        'onboarding.welcome.policyTerms': 'Terms',
      }
      const template = map[key] ?? opts?.defaultValue ?? key
      return template.replace(/\{\{(\w+)\}\}/g, (_, token) => String(opts?.[token] ?? ''))
    },
  }),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => {
  const actual = jest.requireActual('../../src/auth/useOnboardingAuth')
  return {
    ...actual,
    useOnboardingAuth: () => ({
      startOtp: mockStartOtp,
      verifyOtp: mockVerifyOtp,
      completeSignUpIfReady: mockCompleteSignUpIfReady,
      setBasicProfile: mockSetBasicProfile,
      isLoaded: true,
    }),
  }
})

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ update: mockUpdate }),
}))

jest.mock('../../src/components/wizard/PolicyOverlay', () => ({
  PolicyOverlay: () => null,
}))

jest.mock('../../src/components/wizard/OtpCellInput', () => {
  const React = require('react')
  const { TextInput } = require('react-native')

  return {
    OtpCellInput: (props: {
      value: string
      onChange: (next: string) => void
      onComplete?: (code: string) => void
    }) =>
      React.createElement(TextInput, {
        testID: 'otp-input',
        value: props.value,
        onChangeText: (raw: string) => {
          const next = raw.replace(/\D/g, '').slice(0, 6)
          props.onChange(next)
          if (next.length === 6) props.onComplete?.(next)
        },
      }),
  }
})

import SignIn from '../(auth)/sign-in'

describe('SignIn', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockPush.mockReset()
    mockBack.mockReset()
    mockCanGoBack.mockReset()
    mockStartOtp.mockReset()
    mockVerifyOtp.mockReset()
    mockCompleteSignUpIfReady.mockReset()
    mockSetBasicProfile.mockReset()
    mockUpdate.mockReset()
    delete mockSearchParams.inviteCode

    mockStartOtp.mockResolvedValue(undefined)
    mockCanGoBack.mockReturnValue(false)
    mockVerifyOtp.mockResolvedValue(undefined)
    mockCompleteSignUpIfReady.mockResolvedValue({ activated: true, missingFields: [] })
    mockSetBasicProfile.mockResolvedValue(undefined)
  })

  it('falls through to signup OTP inline when the identifier has no account', async () => {
    mockStartOtp
      .mockRejectedValueOnce({ errors: [{ code: 'form_identifier_not_found' }] })
      .mockResolvedValueOnce(undefined)

    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))

    await waitFor(() =>
      expect(mockStartOtp).toHaveBeenNthCalledWith(1, 'mara@example.com', 'signin', 'email'),
    )
    expect(mockStartOtp).toHaveBeenNthCalledWith(2, 'mara@example.com', 'signup', 'email')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(await screen.findByText('Edit')).toBeTruthy()
  })

  it('shows a visible code-entry label after sending an OTP', async () => {
    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))

    expect(await screen.findByText('6-digit code')).toBeTruthy()
    expect(await screen.findByTestId('otp-input')).toBeTruthy()
  })

  it('uses the email keyboard in email-only mode', () => {
    render(<SignIn />)

    const input = screen.getByPlaceholderText('Email address')
    expect(input.props.keyboardType).toBe('email-address')
  })

  it('uses welcome as the fallback when backing out of the identifier stage', () => {
    render(<SignIn />)

    fireEvent.press(screen.getByLabelText('Back'))

    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome')
  })

  it('uses the router back stack from the identifier stage when available', () => {
    mockCanGoBack.mockReturnValue(true)
    render(<SignIn />)

    fireEvent.press(screen.getByLabelText('Back'))

    expect(mockBack).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('steps from OTP back to the editable identifier without leaving sign-in', async () => {
    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.press(screen.getByLabelText('Back'))

    expect(screen.getByPlaceholderText('Email address')).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('blocks phone entry in email-only mode and does not call OTP start', async () => {
    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), '0151 / 12345678')
    fireEvent.press(screen.getByText('Send code'))

    expect(await screen.findByText('Use your email to sign in.')).toBeTruthy()
    expect(mockStartOtp).not.toHaveBeenCalled()
  })

  it('shows recoverable copy when sending the code fails', async () => {
    mockStartOtp.mockRejectedValueOnce(new Error('network'))

    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))

    expect(
      await screen.findByText("We couldn't send a code. Check the email and try again."),
    ).toBeTruthy()
  })

  it('shows recoverable copy when OTP verification fails', async () => {
    mockVerifyOtp.mockRejectedValueOnce(new Error('bad code'))

    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')

    expect(await screen.findByText("That code didn't work. Check it and try again.")).toBeTruthy()
  })

  it('routes existing users home after OTP verification activates sign-in', async () => {
    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('123456'))
    expect(mockCompleteSignUpIfReady).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('routes existing invite users back to invite redemption after OTP', async () => {
    mockSearchParams.inviteCode = 'INVITE123'

    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('123456'))
    expect(mockReplace).toHaveBeenCalledWith('/join/INVITE123')
  })

  it('collects first name inline when auth still needs it after OTP', async () => {
    mockStartOtp
      .mockRejectedValueOnce({ errors: [{ code: 'form_identifier_not_found' }] })
      .mockResolvedValueOnce(undefined)
    mockCompleteSignUpIfReady
      .mockResolvedValueOnce({ activated: false, missingFields: ['first_name'] })
      .mockResolvedValueOnce({ activated: true, missingFields: [] })

    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
    await screen.findByPlaceholderText('First name')

    fireEvent.changeText(screen.getByPlaceholderText('First name'), 'Mara')
    fireEvent.press(screen.getByText('Continue'))

    expect(mockVerifyOtp).toHaveBeenCalledWith('123456')
    await waitFor(() => expect(mockSetBasicProfile).toHaveBeenCalledWith({ firstName: 'Mara' }))
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: 'Mara' })
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/about')
  })

  it('forwards invite code to about after signup fallback completes', async () => {
    mockSearchParams.inviteCode = 'INVITE123'
    mockStartOtp
      .mockRejectedValueOnce({ errors: [{ code: 'form_identifier_not_found' }] })
      .mockResolvedValueOnce(undefined)

    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Email address'), 'mara@example.com')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('123456'))
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(auth)/about',
      params: { inviteCode: 'INVITE123' },
    })
  })
})
