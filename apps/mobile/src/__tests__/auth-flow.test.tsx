import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import SignInScreen from '../../app/(auth)/sign-in'

// Mock Clerk hooks
const mockCreate = jest.fn()
const mockPrepareFirstFactor = jest.fn()
const mockAttemptFirstFactor = jest.fn()
const mockSetActive = jest.fn()
const mockSignUpCreate = jest.fn()
const mockPrepareEmailVerification = jest.fn()
const mockAttemptEmailVerification = jest.fn()
const mockSetSignUpActive = jest.fn()

jest.mock('@clerk/clerk-expo', () => ({
  useSignIn: () => ({
    signIn: {
      create: mockCreate,
      prepareFirstFactor: mockPrepareFirstFactor,
      attemptFirstFactor: mockAttemptFirstFactor,
    },
    setActive: mockSetActive,
    isLoaded: true,
  }),
  useSignUp: () => ({
    signUp: {
      create: mockSignUpCreate,
      prepareEmailAddressVerification: mockPrepareEmailVerification,
      attemptEmailAddressVerification: mockAttemptEmailVerification,
    },
    setActive: mockSetSignUpActive,
    isLoaded: true,
  }),
}))

jest.mock('../../src/theme/tokens', () => ({
  neutralColors: {
    background: '#FAFAF8',
    surface: '#FFFFFF',
    textPrimary: '#1A1A18',
    textSecondary: '#6B6B69',
    textTertiary: '#9E9E9C',
    border: '#E5E5E3',
  },
}))

describe('SignInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the email step initially', () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)
    expect(getByText('Anstoss')).toBeTruthy()
    expect(getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(getByText('Continue with Email')).toBeTruthy()
  })

  it('shows age gate after entering email', () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue with Email'))

    expect(getByText('Date of Birth')).toBeTruthy()
    expect(getByPlaceholderText('2000-06-15')).toBeTruthy()
  })

  it('rejects underage users', () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert')
    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    // Enter email
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue with Email'))

    // Enter underage DOB (born today, age 0)
    const today = new Date()
    const dobStr = `${today.getFullYear()}-01-01`
    fireEvent.changeText(getByPlaceholderText('2000-06-15'), dobStr)
    fireEvent.press(getByText('Continue'))

    expect(alertSpy).toHaveBeenCalledWith(
      'Age Restriction',
      expect.stringContaining('at least 16'),
    )
  })

  it('sends verification code after age check passes', async () => {
    mockCreate.mockResolvedValue({
      supportedFirstFactors: [
        { strategy: 'email_code', emailAddressId: 'ea_123' },
      ],
    })
    mockPrepareFirstFactor.mockResolvedValue({})

    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    // Enter email
    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue with Email'))

    // Enter valid DOB (age > 16)
    fireEvent.changeText(getByPlaceholderText('2000-06-15'), '2000-06-15')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        identifier: 'test@example.com',
      })
    })
  })

  it('shows code entry after successful sign-in create', async () => {
    mockCreate.mockResolvedValue({
      supportedFirstFactors: [
        { strategy: 'email_code', emailAddressId: 'ea_123' },
      ],
    })
    mockPrepareFirstFactor.mockResolvedValue({})

    const { getByPlaceholderText, getByText } = render(<SignInScreen />)

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'test@example.com')
    fireEvent.press(getByText('Continue with Email'))

    fireEvent.changeText(getByPlaceholderText('2000-06-15'), '2000-06-15')
    fireEvent.press(getByText('Continue'))

    await waitFor(() => {
      expect(getByText('Enter verification code')).toBeTruthy()
      expect(getByPlaceholderText('000000')).toBeTruthy()
    })
  })
})
