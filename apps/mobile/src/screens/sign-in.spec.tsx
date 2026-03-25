import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native'
import { useSignIn, useSignUp } from '@clerk/clerk-expo'
import SignInScreen from '../../app/(auth)/sign-in'

jest.mock('@clerk/clerk-expo', () => ({
  useSignIn: jest.fn(),
  useSignUp: jest.fn(),
}))

const mockedUseSignIn = useSignIn as jest.Mock
const mockedUseSignUp = useSignUp as jest.Mock

const mockSetSignInActive = jest.fn()
const mockSetSignUpActive = jest.fn()
const mockSignInCreate = jest.fn()
const mockSignInPrepareFirstFactor = jest.fn()
const mockSignInAttemptFirstFactor = jest.fn()
const mockSignUpCreate = jest.fn()
const mockSignUpPrepareEmailVerification = jest.fn()
const mockSignUpAttemptEmailVerification = jest.fn()
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
const mountedRoots: any[] = []

function collectNodeText(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : collectNodeText(child)))
    .join('')
}

function hasText(root: any, value: string) {
  return root.root
    .findAllByType(Text)
    .some((node: any) => collectNodeText(node) === value)
}

function findButtonByText(root: any, value: string) {
  const button = root.root
    .findAllByType(TouchableOpacity)
    .find((node: any) =>
      node
        .findAllByType(Text)
        .some((textNode: any) => collectNodeText(textNode) === value),
    )

  if (!button) {
    throw new Error(`Button with label "${value}" was not found`)
  }

  return button
}

function getInputs(root: any) {
  return root.root.findAllByType(TextInput)
}

async function renderScreen() {
  let tree: any

  await act(async () => {
    tree = renderer.create(<SignInScreen />)
  })

  mountedRoots.push(tree)
  return tree!
}

async function fillEmailAndAdvance(root: any, email: string) {
  await act(async () => {
    getInputs(root)[0].props.onChangeText(email)
  })

  await act(async () => {
    findButtonByText(root, 'Continue with Email').props.onPress()
  })
}

async function fillDobAndContinue(root: any, dobStr: string) {
  await act(async () => {
    getInputs(root)[0].props.onChangeText(dobStr)
  })

  await act(async () => {
    await findButtonByText(root, 'Continue').props.onPress()
  })
}

async function fillCodeAndVerify(root: any, codeStr: string) {
  await act(async () => {
    getInputs(root)[0].props.onChangeText(codeStr)
  })

  await act(async () => {
    await findButtonByText(root, 'Verify').props.onPress()
  })
}

beforeEach(() => {
  jest.clearAllMocks()

  mockedUseSignIn.mockReturnValue({
    isLoaded: true,
    signIn: {
      create: mockSignInCreate,
      prepareFirstFactor: mockSignInPrepareFirstFactor,
      attemptFirstFactor: mockSignInAttemptFirstFactor,
    },
    setActive: mockSetSignInActive,
  })
  mockedUseSignUp.mockReturnValue({
    isLoaded: true,
    signUp: {
      create: mockSignUpCreate,
      prepareEmailAddressVerification: mockSignUpPrepareEmailVerification,
      attemptEmailAddressVerification: mockSignUpAttemptEmailVerification,
    },
    setActive: mockSetSignUpActive,
  })

  mockSignInCreate.mockResolvedValue({
    supportedFirstFactors: [
      { strategy: 'email_code', emailAddressId: 'email_123' },
    ],
    prepareFirstFactor: jest.fn(() => Promise.resolve()),
  })
  mockSignInPrepareFirstFactor.mockResolvedValue(undefined)
  mockSignInAttemptFirstFactor.mockResolvedValue({
    status: 'complete',
    createdSessionId: 'sess_sign_in',
  })
  mockSignUpCreate.mockResolvedValue({
    status: 'missing_requirements',
    missingFields: [],
    unverifiedFields: ['email_address'],
  })
  mockSignUpPrepareEmailVerification.mockResolvedValue(undefined)
  mockSignUpAttemptEmailVerification.mockResolvedValue({
    status: 'complete',
    createdSessionId: 'sess_sign_up',
  })
})

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop()

    await act(async () => {
      root.unmount()
    })
  }
})

afterAll(() => {
  mockAlert.mockRestore()
})

describe('SignInScreen', () => {
  it('renders the email step with branding', async () => {
    const root = await renderScreen()

    expect(hasText(root, 'Anstoss')).toBe(true)
    expect(hasText(root, 'Continue with Email')).toBe(true)
  })

  it('advances to age-gate step after entering email', async () => {
    const root = await renderScreen()

    await fillEmailAndAdvance(root, 'player@example.com')

    expect(hasText(root, 'Date of Birth')).toBe(true)
    expect(hasText(root, 'Continue')).toBe(true)
  })

  it('completes existing-user sign-in via email code', async () => {
    const root = await renderScreen()

    await fillEmailAndAdvance(root, 'player@example.com')
    await fillDobAndContinue(root, '2000-06-15')

    mockAlert.mockClear()

    await fillCodeAndVerify(root, '981145')

    expect(mockSetSignInActive).toHaveBeenCalledWith({
      session: 'sess_sign_in',
    })
  })

  it('falls back to sign-up when user not found', async () => {
    mockSignInCreate.mockRejectedValue({
      errors: [{ code: 'form_identifier_not_found' }],
    })
    // handleVerifyCode tries signIn.attemptFirstFactor first; make it fail
    // so it falls through to signUp.attemptEmailAddressVerification
    mockSignInAttemptFirstFactor.mockRejectedValue(new Error('no sign-in'))

    const root = await renderScreen()

    await fillEmailAndAdvance(root, 'new-player@example.com')
    await fillDobAndContinue(root, '2000-06-15')

    expect(mockSignUpCreate).toHaveBeenCalledWith({
      emailAddress: 'new-player@example.com',
    })

    mockAlert.mockClear()

    await fillCodeAndVerify(root, '981145')

    expect(mockSetSignUpActive).toHaveBeenCalledWith({
      session: 'sess_sign_up',
    })
  })

  it('blocks underage users at age gate', async () => {
    const root = await renderScreen()

    await fillEmailAndAdvance(root, 'child@example.com')

    mockAlert.mockClear()

    await act(async () => {
      getInputs(root)[0].props.onChangeText('2015-06-15')
    })

    await act(async () => {
      await findButtonByText(root, 'Continue').props.onPress()
    })

    expect(mockAlert).toHaveBeenCalledWith(
      'Age Restriction',
      expect.stringContaining('16'),
    )
    expect(mockSignInCreate).not.toHaveBeenCalled()
  })
})
