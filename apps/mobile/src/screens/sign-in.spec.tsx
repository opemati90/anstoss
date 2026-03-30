import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native'
import {
  isClerkAPIResponseError,
  useSignIn,
  useSignUp,
} from '@clerk/clerk-expo'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import i18n from '../i18n'
import { waitForSessionToken } from '../utils/clerkSession'
import SignInScreen from '../../app/(auth)/sign-in'

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('@clerk/clerk-expo', () => ({
  isClerkAPIResponseError: jest.fn(),
  useSignIn: jest.fn(),
  useSignUp: jest.fn(),
}))

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}))

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../api/client', () => ({
  api: jest.fn(),
}))

jest.mock('../utils/clerkSession', () => ({
  waitForSessionToken: jest.fn(),
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'anstoss://sign-in'),
}))

jest.mock('../illustrations', () => ({
  illustrations: {
    onboardingHero: 1,
  },
}))

type SignInAttempt = {
  supportedFirstFactors?: Array<{ strategy: string; emailAddressId?: string }>
  prepareFirstFactor?: jest.Mock
}

type SignUpAttempt = {
  prepareEmailAddressVerification?: jest.Mock
  createEmailLinkFlow?: jest.Mock
  status?: string | null
  createdSessionId?: string | null
  missingFields?: string[] | null
  unverifiedFields?: string[] | null
}

const mockedUseSignIn = useSignIn as jest.Mock
const mockedUseSignUp = useSignUp as jest.Mock
const mockedUseRouter = useRouter as jest.Mock
const mockedUseLocalSearchParams = useLocalSearchParams as jest.Mock
const mockedUseAuth = useAuth as jest.Mock
const mockedApi = api as jest.Mock
const mockedWaitForSessionToken = waitForSessionToken as jest.Mock
const mockedIsClerkAPIResponseError = isClerkAPIResponseError as unknown as jest.Mock

const mockRouterReplace = jest.fn()
const mockRefreshUser = jest.fn()
const mockSetSignInActive = jest.fn()
const mockSetSignUpActive = jest.fn()
const mockSignInCreate = jest.fn()
const mockSignInPrepareFirstFactor = jest.fn()
const mockSignInAttemptFirstFactor = jest.fn()
const mockSignUpCreate = jest.fn()
const mockSignUpAttemptEmailAddressVerification = jest.fn()
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(jest.fn())
const mountedRoots: any[] = []

function collectNodeText(node: any): string {
  return node.children
    .map((child: any) => {
      if (typeof child === 'string') {
        return child
      }

      return collectNodeText(child)
    })
    .join('')
}

function hasText(root: any, value: string) {
  return root.root
    .findAllByType(Text)
    .some((node: any) => collectNodeText(node) === value)
}

function findButtonByText(root: any, value: string, position: 'first' | 'last' = 'first') {
  const buttons = root.root.findAllByType(TouchableOpacity).filter((node: any) =>
    node.findAllByType(Text).some((textNode: any) => collectNodeText(textNode) === value),
  )

  const button = position === 'last' ? buttons[buttons.length - 1] : buttons[0]

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

async function fillLoginAndAdvance(root: any, email: string) {
  await act(async () => {
    getInputs(root)[0].props.onChangeText(email)
  })

  await act(async () => {
    findButtonByText(root, 'Code anfordern').props.onPress()
  })
}

async function switchToSignup(root: any) {
  await act(async () => {
    findButtonByText(root, 'Konto anlegen').props.onPress()
  })
}

async function selectPath(root: any, label: string) {
  await act(async () => {
    findButtonByText(root, label).props.onPress()
  })
}

async function selectRole(root: any, label: string) {
  await act(async () => {
    findButtonByText(root, label).props.onPress()
  })
}

async function fillSignupDetails(root: any, email: string) {
  await act(async () => {
    getInputs(root)[0].props.onChangeText(email)
  })

  await act(async () => {
    findButtonByText(root, 'Code anfordern').props.onPress()
  })
}

async function advanceStep(root: any, label = 'Weiter') {
  await act(async () => {
    findButtonByText(root, label, 'last').props.onPress()
  })
}

async function fillCodeAndVerify(root: any, code: string, buttonLabel: string) {
  await act(async () => {
    getInputs(root)[0].props.onChangeText(code)
  })

  await act(async () => {
    findButtonByText(root, buttonLabel, 'last').props.onPress()
  })
}

function createSignInStartAttempt(
  overrides: Partial<SignInAttempt> = {},
): SignInAttempt {
  return {
    supportedFirstFactors: [
      {
        strategy: 'email_code',
        emailAddressId: 'email_123',
      },
    ],
    prepareFirstFactor: jest.fn(() => Promise.resolve()),
    ...overrides,
  }
}

function createSignUpStartAttempt(
  overrides: Partial<SignUpAttempt> = {},
): SignUpAttempt {
  return {
    status: 'missing_requirements',
    missingFields: [],
    unverifiedFields: ['email_address'],
    prepareEmailAddressVerification: jest.fn(() => Promise.resolve()),
    ...overrides,
  }
}

beforeEach(async () => {
  jest.clearAllMocks()

  mockedUseRouter.mockReturnValue({
    replace: mockRouterReplace,
  })
  mockedUseLocalSearchParams.mockReturnValue({})
  mockedUseAuth.mockReturnValue({
    isSignedIn: false,
    refreshUser: mockRefreshUser,
  })
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
      attemptEmailAddressVerification: mockSignUpAttemptEmailAddressVerification,
    },
    setActive: mockSetSignUpActive,
  })
  mockedApi.mockResolvedValue(undefined)
  mockedWaitForSessionToken.mockResolvedValue('token_123')
  mockedIsClerkAPIResponseError.mockImplementation(
    (error: unknown) =>
      !!error &&
      typeof error === 'object' &&
      Array.isArray((error as { errors?: unknown[] }).errors),
  )

  mockSignInCreate.mockResolvedValue(createSignInStartAttempt())
  mockSignInAttemptFirstFactor.mockResolvedValue({
    status: 'complete',
    createdSessionId: 'sess_sign_in',
  })
  mockSignUpCreate.mockResolvedValue(createSignUpStartAttempt())
  mockSignUpAttemptEmailAddressVerification.mockResolvedValue({
    status: 'complete',
    createdSessionId: 'sess_sign_up',
  })

  await act(async () => {
    await i18n.changeLanguage('de')
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
  mockConsoleWarn.mockRestore()
})

describe('SignInScreen', () => {
  it('renders German by default and updates copy immediately when switching to English', async () => {
    const root = await renderScreen()

    expect(root.root.findByType(LanguageSwitch)).toBeTruthy()
    expect(hasText(root, 'Code anfordern')).toBe(true)
    expect(
      hasText(root, 'Bitte gib deine registrierte E-Mail ein, um fortzufahren.'),
    ).toBe(true)

    await act(async () => {
      await root.root.findByType(LanguageSwitch).props.onChange('en')
    })

    expect(hasText(root, 'Send code')).toBe(true)
    expect(hasText(root, 'Please enter your registered email to continue.')).toBe(true)
  })

  it('finishes an existing-user sign-in after a complete email-code verification', async () => {
    const root = await renderScreen()

    await fillLoginAndAdvance(root, 'player@example.com')

    mockAlert.mockClear()

    await fillCodeAndVerify(root, '981145', 'Anmelden')

    expect(mockSetSignInActive).toHaveBeenCalledWith({
      session: 'sess_sign_in',
    })
    expect(mockedWaitForSessionToken).toHaveBeenCalled()
    expect(mockedApi).not.toHaveBeenCalled()
    expect(mockRefreshUser).toHaveBeenCalledWith('token_123')
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('finishes a new-user sign-up after role selection and email-code verification', async () => {
    const root = await renderScreen()

    await switchToSignup(root)
    await fillSignupDetails(root, 'new-player@example.com')

    mockAlert.mockClear()

    await fillCodeAndVerify(root, '981145', 'Weiter')
    await selectPath(root, 'Einem Team beitreten')
    await advanceStep(root)
    await selectRole(root, 'Spieler')
    await advanceStep(root)

    expect(mockSignUpCreate).toHaveBeenCalledWith({
      emailAddress: 'new-player@example.com',
    })
    expect(mockSetSignUpActive).toHaveBeenCalledWith({
      session: 'sess_sign_up',
    })
    expect(mockedApi).toHaveBeenCalledWith(
      '/me/registration-role',
      expect.objectContaining({
        method: 'PATCH',
        body: { registrationRole: 'PLAYER' },
      }),
    )
    expect(mockRefreshUser).toHaveBeenCalledWith('token_123')
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('shows a localized unsupported sign-in alert when Clerk returns a non-complete verification status', async () => {
    mockSignInAttemptFirstFactor.mockResolvedValue({
      status: 'needs_second_factor',
      createdSessionId: null,
    })

    const root = await renderScreen()

    await fillLoginAndAdvance(root, 'player@example.com')

    mockAlert.mockClear()

    await fillCodeAndVerify(root, '981145', 'Anmelden')

    expect(mockSetSignInActive).not.toHaveBeenCalled()
    expect(mockedWaitForSessionToken).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenLastCalledWith(
      'Zusätzliche Bestätigung erforderlich',
      expect.stringContaining('Needs Second Factor'),
    )
  })

  it('surfaces unsupported signup requirements only after code verification', async () => {
    const mockPrepareEmailAddressVerification = jest.fn(() => Promise.resolve())
    mockSignUpCreate.mockResolvedValue(
      createSignUpStartAttempt({
        prepareEmailAddressVerification: mockPrepareEmailAddressVerification,
        missingFields: ['first_name'],
        unverifiedFields: ['email_address'],
      }),
    )
    mockSignUpAttemptEmailAddressVerification.mockResolvedValue({
      status: 'missing_requirements',
      missingFields: ['first_name'],
      unverifiedFields: ['email_address'],
      createdSessionId: null,
    })

    const root = await renderScreen()

    await switchToSignup(root)
    await fillSignupDetails(root, 'new-player@example.com')

    expect(hasText(root, 'Code')).toBe(true)
    expect(mockPrepareEmailAddressVerification).toHaveBeenCalledWith({
      strategy: 'email_code',
    })

    mockAlert.mockClear()

    await fillCodeAndVerify(root, '981145', 'Weiter')

    expect(mockSignUpAttemptEmailAddressVerification).toHaveBeenCalledWith({
      code: '981145',
    })
    expect(mockAlert).toHaveBeenLastCalledWith(
      'Zusätzliche Angaben erforderlich',
      expect.stringContaining('Vorname'),
    )
  })
})
