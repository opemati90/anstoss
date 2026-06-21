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
    Text: (props: { children?: React.ReactNode }) => React.createElement(Text, props, props.children),
  }
})

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'auth.signin.title': 'Welcome',
        'auth.signin.titleOtp': 'Enter the code',
        'auth.signin.titleName': "What's your name?",
        'auth.signin.identifierPlaceholder': 'Phone number or email',
        'auth.signin.hintIdentifier': 'Enter your phone or email.',
        'auth.signin.hintOtp': 'Sent to {{phone}}. Tap to edit.',
        'auth.signin.hintName': 'Just a first name.',
        'auth.signin.sendCode': 'Send code',
        'auth.signin.continue': 'Continue',
        'auth.signin.consentPrefix': 'By continuing you agree to our ',
        'common.edit': 'Edit',
        'onboarding.code.resend': 'Resend code',
        'onboarding.code.resendIn': 'Resend in {{seconds}}',
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

    fireEvent.changeText(screen.getByPlaceholderText('Phone number or email'), '+49 151 12345678')
    fireEvent.press(screen.getByText('Send code'))

    await waitFor(() =>
      expect(mockStartOtp).toHaveBeenNthCalledWith(1, '+4915112345678', 'signin', 'phone'),
    )
    expect(mockStartOtp).toHaveBeenNthCalledWith(2, '+4915112345678', 'signup', 'phone')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(await screen.findByText('Edit')).toBeTruthy()
  })

  it('keeps the identifier keyboard stable while the user types', () => {
    render(<SignIn />)

    const input = screen.getByPlaceholderText('Phone number or email')
    expect(input.props.keyboardType).toBe('default')

    fireEvent.changeText(input, '+49 151')

    expect(screen.getByPlaceholderText('Phone number or email').props.keyboardType).toBe(
      'default',
    )
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

    fireEvent.changeText(screen.getByPlaceholderText('Phone number or email'), '+4915112345678')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.press(screen.getByLabelText('Back'))

    expect(screen.getByPlaceholderText('Phone number or email')).toBeTruthy()
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('accepts local German mobile numbers and sends Clerk the +49 form', async () => {
    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Phone number or email'), '0151 / 12345678')
    fireEvent.press(screen.getByText('Send code'))

    await waitFor(() =>
      expect(mockStartOtp).toHaveBeenCalledWith('+4915112345678', 'signin', 'phone'),
    )
    expect(await screen.findByText('Edit')).toBeTruthy()
  })

  it('routes existing users home after OTP verification activates sign-in', async () => {
    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Phone number or email'), '+4915112345678')
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

    fireEvent.changeText(screen.getByPlaceholderText('Phone number or email'), '+4915112345678')
    fireEvent.press(screen.getByText('Send code'))
    await screen.findByTestId('otp-input')

    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('123456'))
    expect(mockReplace).toHaveBeenCalledWith('/join/INVITE123')
  })

  it('collects first name inline when Clerk still needs it after OTP', async () => {
    mockStartOtp
      .mockRejectedValueOnce({ errors: [{ code: 'form_identifier_not_found' }] })
      .mockResolvedValueOnce(undefined)
    mockCompleteSignUpIfReady
      .mockResolvedValueOnce({ activated: false, missingFields: ['first_name'] })
      .mockResolvedValueOnce({ activated: true, missingFields: [] })

    render(<SignIn />)

    fireEvent.changeText(screen.getByPlaceholderText('Phone number or email'), '+4915112345678')
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

    fireEvent.changeText(screen.getByPlaceholderText('Phone number or email'), '+4915112345678')
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
