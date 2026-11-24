import AsyncStorage from '@react-native-async-storage/async-storage'
import { Linking, ScrollView, StyleSheet } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockBack = jest.fn()
let mockParams: Record<string, string> = {}
const mockApi = jest.fn()
const mockRefreshUser = jest.fn().mockResolvedValue(undefined)
const mockSignOut = jest.fn().mockResolvedValue(undefined)
const mockVerifyOtp = jest.fn()
const mockStartOtp = jest.fn()
const mockOAuthAvailability = jest.fn()
const mockOAuthSignIn = jest.fn()
const mockOAuthLink = jest.fn()
const mockOAuthResend = jest.fn()
const mockResetDraft = jest.fn()
let mockAuth: Record<string, unknown> = {}
jest.mock('../../src/launchFeatures', () => ({
  ...jest.requireActual('../../src/launchFeatures'),
  FAMILY_FEATURE_ENABLED: false,
}))

jest.mock('expo-router', () => {
  // Like expo-router: one stable router object.
  const router = {
    replace: (...a: unknown[]) => mockReplace(...a),
    push: (...a: unknown[]) => mockPush(...a),
    back: (...a: unknown[]) => mockBack(...a),
    canGoBack: () => false,
  }
  return {
  useRouter: () => router,
  router,
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && Object.keys(opts).length ? `${key} ${JSON.stringify(opts)}` : key,
    i18n: { language: 'de' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

jest.mock('../../src/i18n', () => ({
  __esModule: true,
  default: { language: 'de', resolvedLanguage: 'de', t: (k: string) => k },
  APP_LANGUAGES: ['de', 'en', 'fr', 'it', 'pt', 'tr'],
  getAppLanguage: () => 'de',
  setAppLanguage: jest.fn(),
}))

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: unknown }) => children,
}))
jest.mock('../../src/components/wizard/PolicyOverlay', () => ({ PolicyOverlay: () => null }))

jest.mock('../../src/api/client', () => {
  class ApiError extends Error {
    status: number
    code?: string
    data?: unknown
    constructor(message: string, status: number, code?: string, data?: unknown) {
      super(message)
      this.status = status
      this.code = code
      this.data = data
    }
  }
  return { api: (...args: unknown[]) => mockApi(...args), ApiError }
})

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ startOtp: mockStartOtp, verifyOtp: mockVerifyOtp }),
}))
jest.mock('../../src/auth/oauth', () => ({
  ...jest.requireActual('../../src/auth/oauth'),
  getOAuthAvailability: (...args: unknown[]) => mockOAuthAvailability(...args),
  signInWithOAuth: (...args: unknown[]) => mockOAuthSignIn(...args),
  completeOAuthLink: (...args: unknown[]) => mockOAuthLink(...args),
  resendOAuthLink: (...args: unknown[]) => mockOAuthResend(...args),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: { officialTeamUrl: 'invalid-old-draft-link' },
    update: jest.fn(),
    markStep: jest.fn(),
    reset: mockResetDraft,
  }),
}))

import SignIn from '../(auth)/sign-in'
import NameScreen from '../(auth)/name'
import ClubSearchScreen, { classifySearchInput } from '../(auth)/club-search'
import ClubSetupScreen from '../(auth)/club-setup'
import RequestPendingScreen from '../(auth)/request-pending'
import ParentHandoff from '../(auth)/parent-handoff'
import Welcome from '../(auth)/welcome'
import JoinInviteScreen from '../join/[...code]'
import { HomeOnboardingNotices } from '../../src/onboarding/HomeOnboardingNotices'
import { ApiError } from '../../src/api/client'
import { socialLoginCopy } from '../../src/i18n/socialLogin'
import { OAuthCancelledError } from '../../src/auth/oauth'
import { getPendingInvite, setPendingInvite } from '../../src/auth/pendingInvite'
import { getOnboardingIntent, setOnboardingIntent } from '../../src/onboarding/intent'
import { OnboardingScreen } from '../../src/onboarding/ui'
import { space } from '../../src/theme/tokens'
import { ONBOARDING_FLOW_STORAGE_KEY } from '../../src/onboarding/storageKeys'

describe('shared onboarding keyboard layout', () => {
  it('keeps focus-aware scrolling and counts the sticky footer overlap only once', () => {
    const screen = render(
      <OnboardingScreen title="Profile" testID="qa-form" primary={{ label: 'Continue', onPress: jest.fn() }} />,
    )
    const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(scroll.props.mode).toBe('layout')
    const footer = screen.getByTestId('qa-form-footer')
    const liftOffset = footer.props.offset.opened
    expect(scroll.props.extraKeyboardSpace).toBe(-liftOffset)
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(false)
    expect(scroll.props.contentInsetAdjustmentBehavior).toBe('never')
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).flexGrow).toBe(1)

    expect(screen.getByTestId('qa-form').props.behavior).toBeUndefined()
    fireEvent(footer, 'layout', { nativeEvent: { layout: { height: 110 } } })
    expect(scroll.props.bottomOffset).toBe(110 - liftOffset + space.sm)

    // Code -> Change email reuses this wrapper but removes its footer.
    // The previous measurement must not keep moving the email field upward.
    screen.rerender(<OnboardingScreen title="Email" testID="qa-form" />)
    expect(scroll.props.bottomOffset).toBe(space.sm)
    expect(scroll.props.extraKeyboardSpace).toBe(0)
    expect(screen.queryByTestId('qa-form-footer')).toBeNull()
  })

  it('retains scrolling without a footer for long and enlarged content', () => {
    const screen = render(<OnboardingScreen title="Long form" />)
    const scroll = screen.UNSAFE_getByType(ScrollView)
    expect(scroll.props.mode).toBe('layout')
    expect(scroll.props.bottomOffset).toBe(space.sm)
    expect(scroll.props.scrollEnabled).not.toBe(false)
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled')
  })
})

const INVITE = {
  code: 'E2EINV01',
  status: 'PENDING',
  kind: 'MEMBER_INVITE',
  role: 'PLAYER',
  phase: 'FULL',
  club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C', slug: 'sv-albatros' },
  team: { id: 'team-1', displayName: 'Herren II' },
}

function yearsAgo(years: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setMonth(d.getMonth() - 1)
  return { day: String(d.getDate()).padStart(2, '0'), month: String(d.getMonth() + 1).padStart(2, '0'), year: String(d.getFullYear()) }
}

function baseAuth(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-1',
      email: 'tim@example.de',
      name: 'Tim Weber',
      registrationRole: 'PLAYER',
      dateOfBirth: '1998-05-15',
      adultConfirmedAt: null,
    },
    memberships: [],
    ageGate: null,
    isSignedIn: true,
    isLoading: false,
    pendingJoinRequest: null,
    pendingClubClaim: null,
    refreshUser: mockRefreshUser,
    signOut: mockSignOut,
    ...overrides,
  }
}

function typeDob(screen: ReturnType<typeof render>, dob: { day: string; month: string; year: string }) {
  fireEvent.changeText(screen.getByTestId('dob-day'), dob.day)
  fireEvent.changeText(screen.getByTestId('dob-month'), dob.month)
  fireEvent.changeText(screen.getByTestId('dob-year'), dob.year)
}

beforeEach(async () => {
  jest.requireMock('../../src/launchFeatures').FAMILY_FEATURE_ENABLED = false
  jest.clearAllMocks()
  await AsyncStorage.clear()
  mockParams = {}
  mockAuth = baseAuth()
  mockApi.mockResolvedValue({})
  mockOAuthAvailability.mockReset().mockResolvedValue({ google: false, apple: false })
  mockOAuthSignIn.mockReset()
  mockOAuthLink.mockReset()
  mockOAuthResend.mockReset()
})

describe('sign-in (code screen)', () => {
  it('opens on the code cells when welcome already sent the code, and auto-submits on the 6th digit', async () => {
    mockParams = { email: 'tim@example.de', sent: '1' }
    mockVerifyOtp.mockResolvedValue(undefined)
    const screen = render(<SignIn />)
    expect(screen.getByText('onboardingFlow.code.title')).toBeTruthy()
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('otp-input'), '424242')
    })
    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('424242', 'tim@example.de'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('clears a wrong code and shows a specific error', async () => {
    mockParams = { email: 'tim@example.de', sent: '1' }
    mockVerifyOtp.mockRejectedValue(new ApiError('bad', 401))
    const screen = render(<SignIn />)
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('otp-input'), '111111')
    })
    await waitFor(() => expect(screen.getByText('onboardingFlow.code.wrong')).toBeTruthy())
    expect(screen.getByTestId('otp-input').props.value).toBe('')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('M1: a locked code says so and unlocks "send again" at once', async () => {
    mockParams = { email: 'tim@example.de', sent: '1' }
    mockVerifyOtp.mockRejectedValue(new ApiError('Too many', 429, 'OTP_CODE_LOCKED'))
    const screen = render(<SignIn />)
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('otp-input'), '111111')
    })
    await waitFor(() => expect(screen.getByText('onboardingFlow.code.codeLocked')).toBeTruthy())
    expect(screen.getByText('onboardingFlow.code.resend')).toBeTruthy()
  })

  it('M1: the hourly cap names the real wait time', async () => {
    mockParams = { email: 'tim@example.de', sent: '1' }
    mockVerifyOtp.mockRejectedValue(
      new ApiError('Too many', 429, 'OTP_HOURLY_CAP', {
        error: { code: 'OTP_HOURLY_CAP', retryAfterSeconds: 1740 },
      }),
    )
    const screen = render(<SignIn />)
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('otp-input'), '111111')
    })
    await waitFor(() =>
      expect(screen.getByText('onboardingFlow.code.hourlyCap {"count":29}')).toBeTruthy(),
    )
  })

  it('labels the code field for screen readers in the app language', () => {
    mockParams = { email: 'tim@example.de', sent: '1' }
    const screen = render(<SignIn />)
    expect(screen.getAllByLabelText('onboardingFlow.code.otpA11y').length).toBeGreaterThan(0)
    expect(screen.queryAllByLabelText('Enter the code')).toHaveLength(0)
  })
})

describe('social sign-in recovery', () => {
  const ticket = 't'.repeat(43)
  it('silently returns to usable sign-in after Google cancellation and permits retry', async () => {
    mockOAuthAvailability.mockResolvedValue({ google: true, apple: false })
    mockOAuthSignIn.mockRejectedValue(new OAuthCancelledError())
    const screen = render(<SignIn />)
    await waitFor(() => screen.getByTestId('sign-in-google'))
    await act(async () => fireEvent.press(screen.getByTestId('sign-in-google')))
    expect(screen.getByTestId('sign-in-email-input')).toBeTruthy()
    expect(screen.getByTestId('sign-in-google').props.accessibilityState.disabled).toBe(false)
    expect(screen.queryByTestId('sign-in-oauth-soon')).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockRefreshUser).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(screen.getByTestId('sign-in-google')))
    expect(mockOAuthSignIn).toHaveBeenCalledTimes(2)
  })
  async function linkingScreen() {
    mockOAuthAvailability.mockResolvedValue({ google: true, apple: false })
    mockOAuthSignIn.mockResolvedValue({ kind: 'link_required', ticket, email: 'tim@example.de' })
    const screen = render(<SignIn />)
    await waitFor(() => screen.getByTestId('sign-in-google'))
    await act(async () => fireEvent.press(screen.getByTestId('sign-in-google')))
    expect(screen.getByTestId('sign-in-code')).toBeTruthy()
    return screen
  }
  afterEach(() => jest.useRealTimers())

  it.each(['OAUTH_LINK_EXPIRED', 'OAUTH_INVALID', 'OAUTH_UNAVAILABLE'])('offers a fresh method without falling back to email verification for %s', async (code) => {
    mockOAuthLink.mockRejectedValue(new ApiError('restart', code === 'OAUTH_LINK_EXPIRED' ? 410 : 401, code))
    const screen = await linkingScreen()
    await act(async () => fireEvent.changeText(screen.getByTestId('otp-input'), '123456'))
    expect(screen.getByText(socialLoginCopy('de').restartBody)).toBeTruthy()
    expect(screen.queryByTestId('otp-input')).toBeNull()
    expect(screen.queryByTestId('sign-in-resend')).toBeNull()
    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(mockStartOtp).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(screen.getByTestId('sign-in-restart')))
    expect(screen.getByTestId('sign-in-email-input').props.value).toBe('tim@example.de')
    expect(screen.getByTestId('sign-in-google')).toBeTruthy()
    expect(mockStartOtp).not.toHaveBeenCalled()
  })

  it.each([new ApiError('wrong code', 401, 'HTTP_401'), new ApiError('offline', 0, 'network_error'), new ApiError('rate limit', 429, 'OTP_HOURLY_CAP')])('keeps linking available for retryable errors: %p', async (error) => {
    mockOAuthLink.mockRejectedValueOnce(error).mockResolvedValueOnce({ kind: 'session', token: 'fixture' })
    const screen = await linkingScreen()
    await act(async () => fireEvent.changeText(screen.getByTestId('otp-input'), '111111'))
    expect(screen.queryByTestId('sign-in-recovery')).toBeNull()
    expect(screen.getByTestId('otp-input').props.value).toBe('')
    await act(async () => fireEvent.changeText(screen.getByTestId('otp-input'), '222222'))
    expect(mockOAuthLink).toHaveBeenLastCalledWith(ticket, '222222')
    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('offers restart when a resend discovers that the linking ticket expired', async () => {
    // Advance only the UI clock; React's act/cleanup scheduler must stay live.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate'] })
    const screen = await linkingScreen()
    for (let i = 0; i < 31; i++) await act(async () => jest.advanceTimersByTime(1000))
    mockOAuthResend.mockRejectedValue(new ApiError('expired', 410, 'OAUTH_LINK_EXPIRED'))
    await act(async () => fireEvent.press(screen.getByTestId('sign-in-resend')))
    expect(mockOAuthResend).toHaveBeenCalledWith(ticket)
    expect(screen.getByTestId('sign-in-recovery')).toBeTruthy()
    expect(mockStartOtp).not.toHaveBeenCalled()
  })

  it('serializes resend and verification, including same-frame taps', async () => {
    const screen = await linkingScreen()
    // A locked code enables resend immediately; keep this concurrency case
    // on real timers, independent of the cooldown timer test above.
    mockOAuthLink.mockRejectedValueOnce(new ApiError('locked', 429, 'OTP_CODE_LOCKED'))
    await act(async () => fireEvent.changeText(screen.getByTestId('otp-input'), '111111'))
    mockOAuthLink.mockClear()
    let finish!: () => void
    mockOAuthResend.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    act(() => {
      fireEvent.press(screen.getByTestId('sign-in-resend'))
      fireEvent.press(screen.getByTestId('sign-in-resend'))
      fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
      expect(mockOAuthResend).toHaveBeenCalledTimes(1)
      expect(mockOAuthLink).not.toHaveBeenCalled()
    })
    await act(async () => { finish() })
    expect(screen.getByTestId('otp-input').props.value).toBe('')
  })

  it.each(['free-agent', 'club-setup'] as const)('preserves a saved invite and %s intent through restart and successful login', async (intent) => {
    await setPendingInvite(INVITE.code)
    await setOnboardingIntent(intent)
    mockOAuthLink.mockRejectedValueOnce(new ApiError('expired', 410, 'OAUTH_LINK_EXPIRED'))
    const screen = await linkingScreen()
    await act(async () => fireEvent.changeText(screen.getByTestId('otp-input'), '123456'))
    expect(screen.getByTestId('sign-in-recovery')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByTestId('sign-in-restart')))
    expect(await getPendingInvite()).toBe(INVITE.code)
    expect(await getOnboardingIntent()).toBe(intent)
    mockOAuthSignIn.mockResolvedValueOnce({ kind: 'session', token: 'fixture' })
    await act(async () => fireEvent.press(screen.getByTestId('sign-in-google')))
    expect(mockReplace).toHaveBeenCalledWith('/')
    expect(await getPendingInvite()).toBe(INVITE.code)
    expect(await getOnboardingIntent()).toBe(intent)
    expect(mockStartOtp).not.toHaveBeenCalled()
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it.each(['verify', 'resend'])('blocks back and change-email while %s is pending, then permits explicit recovery', async (operation) => {
    const screen = await linkingScreen()
    if (operation === 'resend') {
      mockOAuthLink.mockRejectedValueOnce(new ApiError('locked', 429, 'OTP_CODE_LOCKED'))
      await act(async () => fireEvent.changeText(screen.getByTestId('otp-input'), '111111'))
    }
    let rejectRequest!: (error: ApiError) => void
    const pending = new Promise((_, reject) => { rejectRequest = reject })
    if (operation === 'verify') mockOAuthLink.mockReturnValueOnce(pending)
    else mockOAuthResend.mockReturnValueOnce(pending)
    act(() => {
      if (operation === 'verify') fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
      else fireEvent.press(screen.getByTestId('sign-in-resend'))
      fireEvent.press(screen.getByTestId('sign-in-change-email'))
      fireEvent.press(screen.getByLabelText('common.back'))
    })
    expect(screen.getByTestId('sign-in-code')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
    await act(async () => rejectRequest(new ApiError('expired', 410, 'OAUTH_LINK_EXPIRED')))
    expect(screen.getByTestId('sign-in-recovery')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('common.back'))
    expect(screen.getByTestId('sign-in-email-input').props.value).toBe('tim@example.de')
    expect(mockStartOtp).not.toHaveBeenCalled()
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })
})

describe('welcome', () => {
  it('explicit Join clears an abandoned setup intent and draft before authentication', async () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    await setOnboardingIntent('club-setup')
    await AsyncStorage.setItem(ONBOARDING_FLOW_STORAGE_KEY, JSON.stringify({ ownerUserId: 'user-1', lastStep: '/(auth)/club-setup' }))
    const screen = render(<Welcome />)
    await act(async () => fireEvent.press(screen.getByTestId('welcome-join')))
    await expect(getOnboardingIntent()).resolves.toBeNull()
    await expect(AsyncStorage.getItem(ONBOARDING_FLOW_STORAGE_KEY)).resolves.toBeNull()
    expect(mockResetDraft).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/sign-in', params: {} })
  })

  it('explicit Create replaces a previous free-agent intent', async () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    await setOnboardingIntent('free-agent')
    const screen = render(<Welcome />)
    await act(async () => fireEvent.press(screen.getByTestId('welcome-create')))
    await expect(getOnboardingIntent()).resolves.toBe('club-setup')
    expect(mockResetDraft).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/sign-in', params: { intent: 'club-setup' } })
  })

  it('returning Sign in preserves the deliberately saved journey', async () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    await setOnboardingIntent('club-setup')
    const draft = JSON.stringify({ ownerUserId: 'user-1', lastStep: '/(auth)/club-setup' })
    await AsyncStorage.setItem(ONBOARDING_FLOW_STORAGE_KEY, draft)
    const screen = render(<Welcome />)
    await act(async () => fireEvent.press(screen.getByTestId('welcome-sign-in')))
    await expect(getOnboardingIntent()).resolves.toBe('club-setup')
    await expect(AsyncStorage.getItem(ONBOARDING_FLOW_STORAGE_KEY)).resolves.toBe(draft)
    expect(mockResetDraft).not.toHaveBeenCalled()
  })

  it('M7: explains a session that expired mid-onboarding', () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    mockParams = { reason: 'expired' }
    const screen = render(<Welcome />)
    expect(screen.getByText('onboardingFlow.welcome.sessionExpired')).toBeTruthy()
  })
})

describe('"Wie heißt du?" (name + date of birth)', () => {
  const fresh = { id: 'u', email: 'tim.weber@x.de', name: 'tim.weber', dateOfBirth: null }

  it('keeps the full DOB form visible when the provider already supplies a name', () => {
    mockAuth = baseAuth({ user: { ...fresh, name: 'Tim Weber' } })
    const screen = render(<NameScreen />)
    expect(screen.getByTestId('name-input').props.autoFocus).toBe(false)
    expect(screen.getByTestId('name-input').props.value).toBe('Tim Weber')
    expect(screen.getByTestId('dob-day')).toBeTruthy()
    expect(screen.getByTestId('name-continue').props.accessibilityState.disabled).toBe(true)
  })

  it('still focuses the name for an email-only account without a display name', () => {
    mockAuth = baseAuth({ user: fresh })
    const screen = render(<NameScreen />)
    expect(screen.getByTestId('name-input').props.autoFocus).toBe(true)
  })

  it('saves the name and the DOB together and hands over to the entry router', async () => {
    mockAuth = baseAuth({ user: fresh })
    const screen = render(<NameScreen />)
    fireEvent.changeText(screen.getByTestId('name-input'), 'Tim Weber')
    typeDob(screen, { day: '04', month: '03', year: '2001' })
    await act(async () => {
      fireEvent.press(screen.getByTestId('name-continue'))
    })
    expect(mockApi).toHaveBeenCalledWith('/me', {
      method: 'PATCH',
      body: { name: 'Tim Weber', dateOfBirth: '2001-03-04' },
    })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('never sends a 16+ declaration (B1)', async () => {
    mockAuth = baseAuth({ user: fresh })
    const screen = render(<NameScreen />)
    fireEvent.changeText(screen.getByTestId('name-input'), 'Anna Weber')
    typeDob(screen, { day: '12', month: '11', year: '1984' })
    await act(async () => {
      fireEvent.press(screen.getByTestId('name-continue'))
    })
    const body = mockApi.mock.calls[0][1].body
    expect(body).not.toHaveProperty('confirmAdult')
  })

  it('13-15: goes to the parent handoff without storing anything (B1/M3)', async () => {
    jest.requireMock('../../src/launchFeatures').FAMILY_FEATURE_ENABLED = true
    mockAuth = baseAuth({ user: fresh })
    const screen = render(<NameScreen />)
    fireEvent.changeText(screen.getByTestId('name-input'), 'Lena Weber')
    typeDob(screen, yearsAgo(14))
    await act(async () => {
      fireEvent.press(screen.getByTestId('name-continue'))
    })
    expect(mockApi).not.toHaveBeenCalled()
    expect(screen.getByText('onboardingFlow.under16.title')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('handoff-guardian-email'), 'tim.weber@x.de')
    // B2: the child's own address is refused before it is sent.
    expect(screen.getByText('onboardingFlow.under16.guardianIsChild')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('handoff-guardian-email'), 'anna.weber@example.de')
    mockApi.mockResolvedValueOnce({ sent: true, code: null })
    await act(async () => {
      fireEvent.press(screen.getByTestId('handoff-send'))
    })
    expect(mockApi).toHaveBeenCalledWith('/me/parent-handoff', {
      method: 'POST',
      body: expect.objectContaining({ childFirstName: 'Lena', guardianEmail: 'anna.weber@example.de' }),
    })
    await waitFor(() => expect(screen.getByTestId('handoff-sent')).toBeTruthy())
    fireEvent.press(screen.getByTestId('handoff-done'))
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome')
  })

  it('under 13: the server removes the account and the screen says why (M3)', async () => {
    mockAuth = baseAuth({ user: fresh })
    mockApi.mockRejectedValueOnce(new ApiError('Under 13', 403, 'UNDER_13'))
    const screen = render(<NameScreen />)
    fireEvent.changeText(screen.getByTestId('name-input'), 'Mia Weber')
    typeDob(screen, yearsAgo(11))
    await act(async () => {
      fireEvent.press(screen.getByTestId('name-continue'))
    })
    await waitFor(() => expect(screen.getByText('onboardingFlow.age.launchTitle')).toBeTruthy())
    expect(screen.getByText('onboardingFlow.age.accountRemoved')).toBeTruthy()
    fireEvent.press(screen.getByTestId('age-limit-done'))
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('16+ launch does not send a 14-year-old into unavailable family setup', async () => {
    mockAuth = baseAuth({ user: fresh })
    const screen = render(<NameScreen />)
    fireEvent.changeText(screen.getByTestId('name-input'), 'Lena Weber')
    typeDob(screen, yearsAgo(14))
    await act(async () => fireEvent.press(screen.getByTestId('name-continue')))
    expect(screen.getByTestId('age-limit')).toBeTruthy()
    expect(screen.queryByTestId('handoff-guardian-email')).toBeNull()
    expect(mockApi).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(screen.getByTestId('age-limit-done')))
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('M7: an expired session goes back to sign-in with a message', async () => {
    mockAuth = baseAuth({ user: fresh })
    mockApi.mockRejectedValueOnce(new ApiError('expired', 401))
    const screen = render(<NameScreen />)
    fireEvent.changeText(screen.getByTestId('name-input'), 'Tim Weber')
    typeDob(screen, { day: '04', month: '03', year: '2001' })
    await act(async () => {
      fireEvent.press(screen.getByTestId('name-continue'))
    })
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(auth)/welcome',
        params: { reason: 'expired' },
      }),
    )
    expect(mockSignOut).toHaveBeenCalledWith({ keepPendingInvite: true })
  })
})

describe('Verein finden', () => {
  const ALBATROS = {
    id: 'club-1',
    activeClubId: 'club-1',
    directoryEntryId: null,
    source: 'ANSTOSS',
    isActive: true,
    name: 'SV Albatros',
    slug: 'sv-albatros',
    badgeUrl: null,
    primaryColor: '#1B4F9C',
    city: 'Berlin',
    state: 'Berlin',
    association: 'Berliner FV',
    memberCount: 126,
  }

  function searchApi(extra?: (path: string, opts?: { method?: string }) => unknown) {
    mockApi.mockImplementation(async (path: string, opts?: { method?: string }) => {
      const custom = extra?.(path, opts)
      if (custom !== undefined) return custom
      if (path.startsWith('/clubs/search')) return { results: [ALBATROS], nextCursor: null }
      if (path === '/me/join-requests/active') return { request: null, lastDecision: null }
      return {}
    })
  }

  it('recognises team codes and invite codes in the search box', () => {
    expect(classifySearchInput('svab 2345 hx')).toEqual({ teamCode: 'SVAB2345HX', inviteCode: null })
    expect(classifySearchInput('E2EINV01')).toEqual({ teamCode: null, inviteCode: 'E2EINV01' })
    expect(classifySearchInput('SV Albatros')).toEqual({ teamCode: null, inviteCode: null })
  })

  it.each(['ABCDEFGH', 'abcdefgh', 'ABCD EFGH', 'abcd-efgh'])(
    'recognises a generated campaign code without digits: %s', (input) => {
      expect(classifySearchInput(input)).toEqual({ teamCode: null, inviteCode: input.replace(/[\s-]/g, '') })
    },
  )

  it('preserves the case of a legacy code that overlaps the current format', () => {
    expect(classifySearchInput('AbcdEF23')).toEqual({ teamCode: null, inviteCode: 'AbcdEF23' })
  })

  it('recognises a personal token without digits', () => {
    expect(classifySearchInput('abcdefabcdefabcdefabcdefabcdefab')).toEqual({
      teamCode: null, inviteCode: 'abcdefabcdefabcdefabcdefabcdefab',
    })
  })

  it('submits a player join request from a manually entered all-letter campaign code', async () => {
    searchApi((path) => {
      if (path === '/public/invites/abcdefgh') return { ...INVITE, code: 'ABCDEFGH' }
      if (path === '/invites/abcdefgh/redeem') return { status: 'PENDING', clubId: 'club-1', teamId: 'team-1' }
    })
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-code'), 'abcd-efgh')
    expect(await screen.findByTestId('club-invite-match')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByTestId('club-invite-join')))
    expect(mockApi).toHaveBeenCalledWith('/invites/abcdefgh/redeem', { method: 'POST', body: {} })
    expect(mockRefreshUser).toHaveBeenCalledWith(undefined, {
      preferredClubId: 'club-1', throwOnError: true,
    })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it.each(['PLAYER', 'FREE_AGENT'])('does not offer club creation to a %s account', (registrationRole) => {
    searchApi()
    mockAuth = baseAuth({ user: { id: 'player', registrationRole } })
    const screen = render(<ClubSearchScreen />)
    expect(screen.queryByTestId('club-create-link')).toBeNull()
    expect(screen.getByTestId('club-free-agent-link')).toBeTruthy()
  })

  it('does not offer club creation to an existing player with a legacy registration role', () => {
    searchApi()
    mockAuth = baseAuth({ user: { id: 'legacy', registrationRole: null }, memberships: [{ id: 'm', role: 'PLAYER' }] })
    const screen = render(<ClubSearchScreen />)
    expect(screen.queryByTestId('club-create-link')).toBeNull()
    expect(screen.queryByTestId('club-free-agent-link')).toBeNull()
  })

  it.each([null, 'CLUB_ADMIN', 'COACH'])('keeps the join journey separate from creation regardless of stored role (%s)', (registrationRole) => {
    searchApi()
    mockAuth = baseAuth({ user: { id: 'founder', registrationRole } })
    const screen = render(<ClubSearchScreen />)
    expect(screen.queryByTestId('club-create-link')).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it.each(['OWNER', 'ADMIN'])('does not mix founding into joining for a returning %s who also plays', (role) => {
    searchApi()
    mockAuth = baseAuth({ memberships: [{ id: 'admin-membership', role }, { id: 'player-membership', role: 'PLAYER' }] })
    const screen = render(<ClubSearchScreen />)
    expect(screen.queryByTestId('club-create-link')).toBeNull()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('keeps unregistered directory clubs informational for players while registered clubs remain selectable', async () => {
    searchApi((path) => path.startsWith('/clubs/search') ? {
      results: [ALBATROS, { ...ALBATROS, id: 'directory-1', name: 'SV Directory', slug: 'sv-directory', isActive: false, activeClubId: null, directoryEntryId: 'directory-1' }],
      nextCursor: null,
    } : undefined)
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'SV')
    await screen.findByText('SV Directory')
    expect(screen.getByText('onboardingFlow.club.notOnAnstossPlayer')).toBeTruthy()
    expect(screen.queryByTestId('find-club-row-sv-directory')).toBeNull()
    expect(screen.queryByText('onboardingFlow.club.notOnAnstossSetup')).toBeNull()
    fireEvent.press(screen.getByTestId('find-club-row-sv-albatros'))
    expect(screen.getByTestId('club-join-question')).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('guides a player to the coach rather than club creation when search finds nothing', async () => {
    searchApi((path) => path.startsWith('/clubs/search') ? { results: [], nextCursor: null } : undefined)
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Missing')
    await screen.findByText('onboardingFlow.club.noResultsPlayerHint')
    expect(screen.queryByText('onboardingFlow.club.noResultsHint')).toBeNull()
    expect(screen.queryByTestId('club-create-link')).toBeNull()
  })

  it('H4: a club opens "Was machst du bei …?" and sends from there, no DOB asked', async () => {
    // Retain coverage for the deferred feature without enabling it in the MVP.
    jest.requireMock('../../src/launchFeatures').FAMILY_FEATURE_ENABLED = true
    searchApi()
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    await waitFor(() => screen.getByTestId('find-club-row-sv-albatros'))
    fireEvent.press(screen.getByTestId('find-club-row-sv-albatros'))
    expect(screen.getByTestId('club-join-question')).toBeTruthy()
    // No role is guessed from the default registration role.
    fireEvent.press(screen.getByTestId('club-role-parent'))
    expect(screen.queryByTestId('dob-day')).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByTestId('club-send-request'))
    })
    // B1: the role is the only profile write; never a 16+ declaration.
    expect(mockApi).toHaveBeenCalledWith('/me', {
      method: 'PATCH',
      body: { registrationRole: 'PARENT' },
    })
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/join-requests', {
      method: 'POST',
      body: { role: 'PARENT' },
    })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it.each([[false, false], [true, false], [false, true], [true, true]])('a shared team code submits PLAYER (refresh fails: %s, existing member: %s)', async (refreshFails, existingMember) => {
    if (existingMember) mockAuth.memberships = [{ clubId: 'other-club', role: 'PLAYER' }]
    if (refreshFails) mockRefreshUser.mockRejectedValueOnce(new ApiError('Unavailable', 503))
    searchApi((path) =>
      path.startsWith('/teams/by-code/')
        ? {
            team: { id: 'team-1', name: 'Herren I', displayName: 'Herren I', clubId: 'club-1' },
            club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
          }
        : undefined,
    )
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-code'), 'SVAB2345HX')
    await waitFor(() => screen.getByTestId('club-team-match'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('club-team-match'))
    })
    expect(mockApi).toHaveBeenCalledWith('/onboarding/join-team', {
      method: 'POST',
      body: { joinCode: 'SVAB2345HX', role: 'PLAYER' },
    })
    expect(screen.queryByTestId('club-role-coach')).toBeNull()
    expect(screen.queryByTestId('club-join-question')).toBeNull()
    expect(mockReplace).toHaveBeenCalledWith(existingMember ? '/' : '/(auth)/request-pending')
    expect(screen.queryByText('onboardingFlow.club.requestFailed')).toBeNull()
  })

  it.each([404, 503])('does not call an HTTP %s search failure an internet outage', async status => {
    searchApi(path => {
      if (path.startsWith('/clubs/search')) throw new ApiError('Unavailable', status)
    })
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Qa')
    await screen.findByText('onboardingFlow.club.error')
    expect(screen.getByText('onboardingFlow.common.saveFailed')).toBeTruthy()
    expect(screen.queryByText('onboardingFlow.common.networkError')).toBeNull()
  })

  it('requires a searched player to choose a team and sends that team for approval', async () => {
    searchApi((path) => path.startsWith('/clubs/lookup')
      ? { teams: [{ id: 'team-1', displayName: 'Herren II' }, { id: 'team-2', displayName: 'Herren I' }] }
      : undefined)
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    fireEvent.press(await screen.findByTestId('find-club-row-sv-albatros'))
    fireEvent.press(screen.getByTestId('club-role-player'))
    await screen.findByTestId('club-team-team-1')
    expect(screen.queryByTestId('club-coach-head')).toBeNull()
    fireEvent.press(screen.getByTestId('club-send-request'))
    expect(mockApi).not.toHaveBeenCalledWith('/clubs/club-1/join-requests', expect.anything())
    fireEvent.press(screen.getByTestId('club-team-team-1'))
    await act(async () => { fireEvent.press(screen.getByTestId('club-send-request')) })
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/join-requests', {
      method: 'POST', body: { role: 'PLAYER', teamId: 'team-1' },
    })
  })

  it('requires an explicit role and sends an admin-only request without a hidden player role or team', async () => {
    searchApi()
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    fireEvent.press(await screen.findByTestId('find-club-row-sv-albatros'))
    expect(screen.getByTestId('club-role-player').props.accessibilityState.selected).toBe(false)
    fireEvent.press(screen.getByTestId('club-send-request'))
    expect(mockApi).not.toHaveBeenCalledWith('/clubs/club-1/staff-access-requests', expect.anything())
    fireEvent.press(screen.getByTestId('club-role-player'))
    fireEvent.press(screen.getByTestId('club-role-admin'))
    expect(screen.getByTestId('club-role-player').props.accessibilityState.selected).toBe(false)
    await act(async () => fireEvent.press(screen.getByTestId('club-send-request')))
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/staff-access-requests', {
      method: 'POST', body: { desiredRole: 'ADMIN', requestedTeamIds: [], teamRoles: [] },
    })
    expect(mockApi).not.toHaveBeenCalledWith('/clubs/club-1/join-requests', expect.anything())
    expect(mockApi).not.toHaveBeenCalledWith('/club-claims/first', expect.anything())
  })

  it('retries a failed team lookup rather than leaving players stuck', async () => {
    let attempts = 0
    searchApi((path) => {
      if (!path.startsWith('/clubs/lookup')) return undefined
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('offline'))
        : { teams: [{ id: 'team-1', displayName: 'Herren II' }] }
    })
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    fireEvent.press(await screen.findByTestId('find-club-row-sv-albatros'))
    fireEvent.press(screen.getByTestId('club-role-player'))
    fireEvent.press(await screen.findByText('onboardingFlow.common.retry'))
    await screen.findByTestId('club-team-team-1')
    expect(attempts).toBe(2)
  })

  it.each(['COACH', 'CLUB_ADMIN'])('an existing %s can request PLAYER at another club without rewriting their account role', async (registrationRole) => {
    mockAuth = baseAuth({
      user: { id: 'returning', registrationRole },
      memberships: [{ id: 'existing-club', role: registrationRole === 'COACH' ? 'COACH' : 'ADMIN' }],
    })
    searchApi((path) => path.startsWith('/clubs/lookup') ? { teams: [{ id: 'team-1', displayName: 'Herren I' }] } : undefined)
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    fireEvent.press(await screen.findByTestId('find-club-row-sv-albatros'))
    fireEvent.press(screen.getByTestId('club-role-player'))
    fireEvent.press(await screen.findByTestId('club-team-team-1'))
    await act(async () => fireEvent.press(screen.getByTestId('club-send-request')))
    expect(mockApi).not.toHaveBeenCalledWith('/me', expect.objectContaining({ method: 'PATCH' }))
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/join-requests', {
      method: 'POST', body: { role: 'PLAYER', teamId: 'team-1' },
    })
  })

  it('keeps submission disabled when a searched club has no teams', async () => {
    searchApi((path) => path.startsWith('/clubs/lookup') ? { teams: [] } : undefined)
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    fireEvent.press(await screen.findByTestId('find-club-row-sv-albatros'))
    fireEvent.press(screen.getByTestId('club-role-player'))
    await screen.findByText('onboardingFlow.club.noTeams')
    fireEvent.press(screen.getByTestId('club-send-request'))
    expect(mockApi).not.toHaveBeenCalledWith('/clubs/club-1/join-requests', expect.anything())
  })

  it('M2: explains a declined request once, with the club reason', async () => {
    searchApi((path) =>
      path === '/me/join-requests/active'
        ? {
            request: null,
            lastDecision: {
              id: 'jr-9',
              status: 'REJECTED',
              reason: 'Der Kader ist voll.',
              club: { name: 'SV Albatros' },
            },
          }
        : undefined,
    )
    const screen = render(<ClubSearchScreen />)
    await waitFor(() => screen.getByTestId('club-rejection-notice'))
    expect(screen.getByText('Der Kader ist voll.')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByTestId('club-rejection-dismiss'))
    })
    expect(screen.queryByTestId('club-rejection-notice')).toBeNull()
    await expect(AsyncStorage.getItem('anstoss:join-rejection-seen:jr-9')).resolves.toBe('1')
  })

  it('H5: offers the setup-code entry without a club', () => {
    jest.requireMock('../../src/launchFeatures').FAMILY_FEATURE_ENABLED = true
    searchApi()
    const screen = render(<ClubSearchScreen />)
    fireEvent.press(screen.getByTestId('club-setup-code-link'))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/parent-handoff')
  })

  it('MVP: offers player, coach and admin roles, with no family setup entry', async () => {
    searchApi()
    const screen = render(<ClubSearchScreen />)
    expect(screen.queryByTestId('club-setup-code-link')).toBeNull()
    expect(screen.getByTestId('club-free-agent-link')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    fireEvent.press(await screen.findByTestId('find-club-row-sv-albatros'))
    expect(screen.queryByTestId('club-role-parent')).toBeNull()
    for (const role of ['player', 'coach', 'admin']) {
      expect(screen.getByTestId(`club-role-${role}`)).toBeTruthy()
    }
  })

  it('B3: shows the server refusal of an under-16 free-agent listing inline', async () => {
    searchApi((path, opts) =>
      path === '/me' && opts?.method === 'PATCH'
        ? Promise.reject(new ApiError('u16', 403, 'FREE_AGENT_UNDER_16'))
        : undefined,
    )
    const screen = render(<ClubSearchScreen />)
    fireEvent.press(screen.getByTestId('club-free-agent-link'))
    fireEvent.press(screen.getByTestId('club-free-agent-position-GK'))
    fireEvent.changeText(screen.getByTestId('club-free-agent-plz'), '14482')
    await act(async () => {
      fireEvent.press(screen.getByTestId('club-free-agent-publish'))
    })
    await waitFor(() =>
      expect(screen.getByText('onboardingFlow.club.freeAgentUnder16')).toBeTruthy(),
    )
  })

  it('clears a free-agent intent for members', async () => {
    await AsyncStorage.setItem('anstoss:onboarding-intent', 'free-agent')
    searchApi()
    mockAuth = baseAuth({ memberships: [{ id: 'm' }] })
    render(<ClubSearchScreen />)
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('anstoss:onboarding-intent')).toBeNull(),
    )
  })
})

describe('club setup', () => {
  it('retries a failed membership refresh without registering the club twice', async () => {
    mockParams = { clubName: 'Codex FC' }
    mockApi.mockResolvedValue({ id: 'claim-1' })
    mockRefreshUser.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(undefined)
    const screen = render(<ClubSetupScreen />)
    fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'II')
    await act(async () => fireEvent.press(screen.getByTestId('club-setup-submit')))
    expect(mockReplace).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(screen.getByTestId('club-setup-submit')))
    expect(mockApi.mock.calls.filter(([path]) => path === '/club-claims/first')).toHaveLength(1)
    expect(mockRefreshUser).toHaveBeenCalledTimes(2)
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('submits with no link or players and says players can be added later', async () => {
    mockParams = { clubName: 'Codex FC' }
    mockApi.mockResolvedValue({ id: 'claim-1' })
    const screen = render(<ClubSetupScreen />)
    expect(screen.getByText('onboardingFlow.clubSetup.playersLater')).toBeTruthy()
    expect(screen.queryByTestId('club-setup-number-input')).toBeNull()
    expect(screen.getByText('onboardingFlow.clubSetup.clubLabel *')).toBeTruthy()
    expect(screen.getByText('onboardingFlow.clubSetup.teamNameLabel *')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'II')
    await act(async () => fireEvent.press(screen.getByTestId('club-setup-submit')))
    expect(mockApi).toHaveBeenCalledWith('/club-claims/first', expect.objectContaining({
      body: expect.objectContaining({ clubName: 'Codex FC', teamName: 'II' }),
    }))
    const body = mockApi.mock.calls.find(([path]) => path === '/club-claims/first')![1].body
    expect(body).not.toHaveProperty('externalTeamUrl')
    expect(body).not.toHaveProperty('players')
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('ignores an invalid official-link draft when creating a club', async () => {
    mockParams = { clubName: 'Codex FC' }
    const screen = render(<ClubSetupScreen />)
    fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'II')
    expect(screen.queryByTestId('club-setup-link-input')).toBeNull()
    await act(async () => fireEvent.press(screen.getByTestId('club-setup-submit')))
    expect(mockApi).toHaveBeenCalledWith('/club-claims/first', expect.objectContaining({
      body: expect.objectContaining({ clubName: 'Codex FC', teamName: 'II' }),
    }))
    expect(mockApi.mock.calls.find(([path]) => path === '/club-claims/first')?.[1].body).not.toHaveProperty('externalTeamUrl')
  })

  it.each(['CLUB_ALREADY_REGISTERED', 'CLUB_REGISTRATION_PENDING'])('offers search and a review email for %s, never deletion or ownership', async (code) => {
    mockParams = { clubName: 'Codex FC' }
    mockApi.mockImplementation(async path => {
      if (path === '/club-claims/first') throw new ApiError('duplicate', 409, code)
      return { results: [] }
    })
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    const screen = render(<ClubSetupScreen />)
    fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'II')
    await act(async () => fireEvent.press(screen.getByTestId('club-setup-submit')))
    expect(screen.getByText(`onboardingFlow.clubSetup.${code === 'CLUB_REGISTRATION_PENDING' ? 'alreadyPending' : 'alreadyActive'}`)).toBeTruthy()
    fireEvent.press(screen.getByTestId('club-setup-find-existing'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/club-search', params: { q: 'Codex FC' } })
    await act(async () => fireEvent.press(screen.getByTestId('club-setup-report-registration')))
    expect(open).toHaveBeenCalledWith(expect.stringContaining('mailto:support@anstoss.io?subject='))
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockRefreshUser).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('H3: sends only the claim; the server sets CLUB_ADMIN with it', async () => {
    mockParams = { directoryEntryId: 'dir-7', clubName: 'TSV Linden 1899' }
    mockApi.mockImplementation(async (path: string) =>
      path === '/club-claims/first' ? { id: 'claim-1' } : { results: [] },
    )
    const screen = render(<ClubSetupScreen />)
    fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'Herren I')
    expect(screen.queryByTestId('club-setup-link-input')).toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByTestId('club-setup-submit'))
    })
    expect(mockApi).not.toHaveBeenCalledWith('/me', expect.anything())
    const claimCall = mockApi.mock.calls.find(([path]) => path === '/club-claims/first')
    expect(claimCall?.[1].body).not.toHaveProperty('externalTeamUrl')
    expect(mockApi).toHaveBeenCalledWith(
      '/club-claims/first',
      expect.objectContaining({ body: expect.objectContaining({ directoryEntryId: 'dir-7' }) }),
    )
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('names the colours for screen readers', () => {
    const screen = render(<ClubSetupScreen />)
    expect(screen.getByLabelText('onboardingFlow.clubSetup.colors.navy')).toBeTruthy()
    expect(screen.getByLabelText('onboardingFlow.clubSetup.colors.gold')).toBeTruthy()
  })
})

describe('request pending', () => {
  const pending = {
    request: {
      id: 'jr-1',
      clubId: 'club-1',
      status: 'PENDING',
      club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
    },
  }

  it('M2: a declined request shows the club reason, never a welcome notice', async () => {
    mockAuth = baseAuth({ pendingJoinRequest: { id: 'jr-1', clubId: 'club-1' } })
    mockApi.mockResolvedValueOnce({
      request: null,
      lastDecision: {
        id: 'jr-1',
        clubId: 'club-1',
        status: 'REJECTED',
        reason: 'Die U19 ist voll, frag im Sommer wieder.',
        club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
      },
    })
    const screen = render(<RequestPendingScreen />)
    await waitFor(() => screen.getByTestId('request-rejected'))
    expect(screen.getByTestId('pending-rejected-reason').props.children).toBe(
      'Die U19 ist voll, frag im Sommer wieder.',
    )
    await expect(AsyncStorage.getItem('anstoss:onboarding-welcome:user-1')).resolves.toBeNull()
    await act(async () => {
      fireEvent.press(screen.getByTestId('pending-rejected-continue'))
    })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('an approval leaves a one-time welcome for home', async () => {
    mockAuth = baseAuth({ pendingJoinRequest: { id: 'jr-1', clubId: 'club-1' } })
    mockApi.mockResolvedValueOnce({
      request: null,
      lastDecision: {
        id: 'jr-1',
        clubId: 'club-1',
        status: 'APPROVED',
        reason: null,
        club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
      },
    })
    render(<RequestPendingScreen />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    await expect(AsyncStorage.getItem('anstoss:onboarding-welcome:user-1')).resolves.toContain(
      'SV Albatros',
    )
  })

  it('M7: an expired session redirects to sign-in instead of "no connection"', async () => {
    mockAuth = baseAuth({ pendingJoinRequest: { id: 'jr-1', clubId: 'club-1' } })
    mockApi.mockRejectedValue(new ApiError('expired', 401))
    const screen = render(<RequestPendingScreen />)
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(auth)/welcome',
        params: { reason: 'expired' },
      }),
    )
    expect(screen.queryByText('onboardingFlow.pending.loadError')).toBeNull()
  })

  it('M6: withdrawing clears a stale club-setup draft', async () => {
    mockAuth = baseAuth({ pendingJoinRequest: { id: 'jr-1', clubId: 'club-1' } })
    mockApi.mockImplementation(async (path: string) =>
      path === '/me/join-requests/active' ? pending : {},
    )
    const { Alert } = require('react-native')
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
      const buttons = args[2] as Array<{ onPress?: () => void }>
      buttons[1]?.onPress?.()
    })
    const screen = render(<RequestPendingScreen />)
    await waitFor(() => screen.getByTestId('pending-withdraw'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('pending-withdraw'))
    })
    await waitFor(() => expect(mockResetDraft).toHaveBeenCalled())
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/join-requests/jr-1/withdraw', {
      method: 'POST',
    })
    alert.mockRestore()
  })
})

describe('invite (join)', () => {
  it('H4: signed out, the preview takes the email and sends the code (screen 1 of 3)', async () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    mockParams = { code: 'E2EINV01' }
    mockApi.mockImplementation(async (path: string) =>
      path === '/public/invites/E2EINV01' ? INVITE : {},
    )
    mockStartOtp.mockResolvedValue(undefined)
    const screen = render(<JoinInviteScreen />)
    await waitFor(() => screen.getByTestId('join-email'))
    fireEvent.changeText(screen.getByTestId('join-email'), 'Lukas.Hoffmann@example.de')
    await act(async () => {
      fireEvent.press(screen.getByTestId('join-accept'))
    })
    expect(mockStartOtp).toHaveBeenCalledWith('lukas.hoffmann@example.de', 'signin', 'email')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/sign-in',
      params: { email: 'lukas.hoffmann@example.de', sent: '1', inviteCode: 'E2EINV01' },
    })
    await expect(AsyncStorage.getItem('anstoss.pendingInviteCode')).resolves.toBe('E2EINV01')
  })

  it('H2: never joins on its own, even with nothing to ask', async () => {
    mockParams = { code: 'E2EINV01' }
    mockApi.mockImplementation(async (path: string) =>
      path === '/public/invites/E2EINV01' ? INVITE : { status: 'joined' },
    )
    const screen = render(<JoinInviteScreen />)
    await waitFor(() => screen.getByTestId('join-confirm'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(mockApi).not.toHaveBeenCalledWith('/invites/E2EINV01/redeem', expect.anything())
    await act(async () => {
      fireEvent.press(screen.getByTestId('join-confirm'))
    })
    expect(mockApi).toHaveBeenCalledWith('/invites/E2EINV01/redeem', { method: 'POST', body: {} })
  })

  it('M9: "already a member" opens the club instead of an error', async () => {
    mockParams = { code: 'E2EINV01' }
    await AsyncStorage.setItem('anstoss.pendingInviteCode', 'E2EINV01')
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/public/invites/E2EINV01') return INVITE
      if (path === '/invites/E2EINV01/redeem') throw new ApiError('x', 409, 'ALREADY_MEMBER')
      return {}
    })
    const screen = render(<JoinInviteScreen />)
    await waitFor(() => screen.getByTestId('join-confirm'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('join-confirm'))
    })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(mockRefreshUser).toHaveBeenCalledWith(undefined, {
      preferredClubId: 'club-1',
      throwOnError: true,
    })
    await expect(AsyncStorage.getItem('anstoss.pendingInviteCode')).resolves.toBeNull()
  })

  it('M9: a recipient mismatch is recognised by its code; switching keeps the invite', async () => {
    mockParams = { code: 'E2EINV01' }
    mockApi.mockImplementation(async (path: string) => {
      if (path === '/public/invites/E2EINV01') return INVITE
      if (path === '/invites/E2EINV01/redeem') {
        throw new ApiError('Forbidden', 403, 'INVITE_RECIPIENT_MISMATCH')
      }
      return {}
    })
    const screen = render(<JoinInviteScreen />)
    await waitFor(() => screen.getByTestId('join-confirm'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('join-confirm'))
    })
    await waitFor(() => screen.getByTestId('join-mismatch'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('join-switch-account'))
    })
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ keepPendingInvite: true }))
  })

  it('M3: a 14-year-old on the invite path goes to the same parent handoff, with the invite', async () => {
    jest.requireMock('../../src/launchFeatures').FAMILY_FEATURE_ENABLED = true
    mockAuth = baseAuth({
      user: { id: 'u', email: 'lena@example.de', name: 'lena', dateOfBirth: null },
    })
    mockParams = { code: 'E2EINV01' }
    mockApi.mockImplementation(async (path: string) =>
      path === '/public/invites/E2EINV01' ? INVITE : { sent: true, code: null },
    )
    const screen = render(<JoinInviteScreen />)
    await waitFor(() => screen.getByTestId('join-name'))
    fireEvent.changeText(screen.getByTestId('join-name'), 'Lena Weber')
    typeDob(screen, yearsAgo(14))
    await act(async () => {
      fireEvent.press(screen.getByTestId('join-confirm'))
    })
    expect(screen.getByTestId('handoff-form')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('handoff-guardian-email'), 'anna.weber@example.de')
    await act(async () => {
      fireEvent.press(screen.getByTestId('handoff-send'))
    })
    expect(mockApi).toHaveBeenCalledWith('/me/parent-handoff', {
      method: 'POST',
      body: expect.objectContaining({ inviteCode: 'E2EINV01', childFirstName: 'Lena' }),
    })
    expect(mockApi).not.toHaveBeenCalledWith('/invites/E2EINV01/redeem', expect.anything())
  })
})

describe('parent handoff', () => {
  it('blocks an old family setup link without fetching or redeeming when deferred', async () => {
    await setOnboardingIntent('parent-handoff')
    const screen = render(<ParentHandoff />)
    expect(screen.getByTestId('family-unavailable')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(screen.getByTestId('family-unavailable-done')))
    await expect(getOnboardingIntent()).resolves.toBeNull()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('blocks parent invitations in the deferred release, without redeeming', async () => {
    mockParams = { code: 'PARENT01' }
    await setPendingInvite('PARENT01')
    mockApi.mockResolvedValue({ ...INVITE, role: 'PARENT' })
    const screen = render(<JoinInviteScreen />)
    await waitFor(() => screen.getByTestId('family-unavailable'))
    expect(mockApi.mock.calls.every(([path]) => path === '/public/invites/PARENT01')).toBe(true)
    await act(async () => fireEvent.press(screen.getByTestId('family-unavailable-done')))
    await expect(getPendingInvite()).resolves.toBeNull()
  })

  it('blocks under-16 invitation signup without offering a parent handoff', async () => {
    mockAuth = baseAuth({ user: { id: 'u', email: 'lena@example.de', name: 'lena', dateOfBirth: null } })
    mockParams = { code: 'E2EINV01' }
    mockApi.mockResolvedValue(INVITE)
    const screen = render(<JoinInviteScreen />)
    await waitFor(() => screen.getByTestId('join-name'))
    fireEvent.changeText(screen.getByTestId('join-name'), 'Lena Weber')
    typeDob(screen, yearsAgo(14))
    await act(async () => fireEvent.press(screen.getByTestId('join-confirm')))
    expect(screen.getByTestId('age-limit')).toBeTruthy()
    expect(screen.queryByTestId('handoff-guardian-email')).toBeNull()
    expect(mockApi.mock.calls.every(([path]) => path === '/public/invites/E2EINV01')).toBe(true)
  })

  it('B2: a 17-year-old parent account cannot link a child', async () => {
    jest.requireMock('../../src/launchFeatures').FAMILY_FEATURE_ENABLED = true
    const seventeen = new Date()
    seventeen.setFullYear(seventeen.getFullYear() - 17)
    mockAuth = baseAuth({
      user: { id: 'p', email: 'p@example.de', name: 'Paul', dateOfBirth: seventeen.toISOString() },
    })
    mockApi.mockImplementation(async (path: string) =>
      path === '/parent-handoff/AB23CD45'
        ? {
            childFirstName: 'Lena',
            childDateOfBirth: '2012-05-14T00:00:00.000Z',
            team: {
              team: { id: 't', clubId: 'club-1', name: 'U14', displayName: 'U14' },
              club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
              rosterSlots: [{ id: 's1', fullName: 'Lena Weber', position: null, jerseyNumber: null }],
            },
          }
        : {},
    )
    const screen = render(<ParentHandoff />)
    fireEvent.changeText(screen.getByTestId('parent-handoff-setup-code'), 'AB23CD45')
    await waitFor(() => screen.getByTestId('parent-handoff-slot-s1'))
    expect(screen.getByText('onboardingFlow.parentHandoff.parentTooYoung')).toBeTruthy()
    await act(async () => {
      fireEvent.press(screen.getByTestId('parent-handoff-submit'))
    })
    expect(mockApi).not.toHaveBeenCalledWith('/parent-handoff/redeem', expect.anything())
  })
})

describe('home: club verification (H6)', () => {
  it('shows the dedicated "Dein Verein wird geprüft" state with next steps', () => {
    mockAuth = baseAuth({
      user: { id: 'a', email: 'a@b.de', name: 'Mara Schulte', registrationRole: 'CLUB_ADMIN' },
      activeClub: null,
      teamMembers: [],
      activeRoleMode: null,
      pendingClubClaim: { id: 'claim-1', status: 'SUBMITTED' },
    })
    const screen = render(<HomeOnboardingNotices />)
    expect(screen.getByText('onboardingFlow.home.verificationTitle')).toBeTruthy()
    expect(screen.getByText('onboardingFlow.home.verificationNext1')).toBeTruthy()
    expect(screen.getByText('onboardingFlow.home.verificationPrepare1')).toBeTruthy()
    fireEvent.press(screen.getByTestId('home-verification-details'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/claim-pending',
      params: { claimId: 'claim-1' },
    })
  })
})
