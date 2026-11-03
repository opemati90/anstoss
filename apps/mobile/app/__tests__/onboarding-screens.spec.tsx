import '../../test/future-capabilities'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockBack = jest.fn()
let mockParams: Record<string, string> = {}
const mockApi = jest.fn()
const mockRefreshUser = jest.fn().mockResolvedValue(undefined)
const mockSignOut = jest.fn().mockResolvedValue(undefined)
const mockVerifyOtp = jest.fn()
const mockStartOtp = jest.fn()
const mockResetDraft = jest.fn()
let mockAuth: Record<string, unknown> = {}
let mockKeyboardInset = 0
let mockKeyboardVisible = false
let mockLanguage = 'de'

jest.mock('../../src/onboarding/ui', () => ({
  ...jest.requireActual('../../src/onboarding/ui'),
  useKeyboardInset: () => mockKeyboardInset,
  useKeyboardVisible: () => mockKeyboardVisible,
}))

// This suite also exercises preserved post-launch marketplace behaviour.
jest.mock('../../src/launchFeatures', () => ({
  OPTIONAL_CLUB_FEATURES: { marketplace: true, statistics: false, sponsorship: false },
  COMPLIANCE_FEATURE_ENABLED: false,
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
    i18n: { language: mockLanguage },
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
jest.mock('../../src/components/wizard/PolicyOverlay', () => ({
  PolicyOverlay: ({ visible, kind }: { visible: boolean; kind: string }) =>
    visible ? require('react').createElement(require('react-native').View, { testID: `policy-${kind}` }) : null,
}))

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

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: {},
    update: jest.fn(),
    markStep: jest.fn(),
    reset: mockResetDraft,
  }),
}))

import SignIn from '../(auth)/sign-in'
import NameScreen from '../(auth)/name'
import ClubSearchScreen, { classifySearchInput, clubNameWithoutTeamSuffix } from '../(auth)/club-search'
import ClubSetupScreen, { isOfficialTeamLink } from '../(auth)/club-setup'
import RequestPendingScreen from '../(auth)/request-pending'
import ParentHandoff from '../(auth)/parent-handoff'
import Welcome from '../(auth)/welcome'
import JoinInviteScreen from '../join/[...code]'
import { HomeOnboardingNotices } from '../../src/onboarding/HomeOnboardingNotices'
import { ApiError } from '../../src/api/client'
import { LAUNCH_FEATURES } from '@anstoss/shared'

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
  jest.clearAllMocks()
  await AsyncStorage.clear()
  mockParams = {}
  mockAuth = baseAuth()
  mockApi.mockResolvedValue({})
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

describe('welcome', () => {
  it('groups the email and primary action before the legal information', () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    const screen = render(<Welcome />)
    const form = within(screen.getByTestId('welcome-form'))
    expect(form.getByTestId('welcome-email')).toBeTruthy()
    expect(form.getByTestId('welcome-continue')).toBeTruthy()
    expect(within(screen.getByTestId('welcome-legal')).getByText('onboardingFlow.welcome.consentIntro')).toBeTruthy()
  })
  it('preserves the email when accessibility text size changes', () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions')
    dimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 1 })
    try {
      const screen = render(<Welcome />)
      fireEvent.changeText(screen.getByTestId('welcome-email'), 'player@example.com')
      dimensions.mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 2 })
      screen.rerender(<Welcome />)
      expect(screen.getByTestId('welcome-email').props.value).toBe('player@example.com')
    } finally {
      dimensions.mockRestore()
    }
  })
  it('opens the terms and privacy policy from the agreement section', () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    const screen = render(<Welcome />)
    fireEvent.press(screen.getByText('onboardingFlow.welcome.termsLink'))
    expect(screen.getByTestId('policy-terms')).toBeTruthy()
    fireEvent.press(screen.getByText('onboardingFlow.welcome.privacyPolicyLink'))
    expect(screen.getByTestId('policy-privacy')).toBeTruthy()
  })
  it('hides the hero when Android resizes the window and keyboard overlap is zero', () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    mockKeyboardInset = 0
    mockKeyboardVisible = true
    try {
      const screen = render(<Welcome />)
      expect(screen.queryByTestId('welcome-hero')).toBeNull()
    } finally {
      mockKeyboardVisible = false
    }
  })
  it('keeps the language control in normal flow when the compact keyboard hides the hero', () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    mockKeyboardInset = 300
    mockKeyboardVisible = true
    const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 320, height: 568, scale: 2, fontScale: 2,
    })
    try {
      const screen = render(<Welcome />)
      const topBar = StyleSheet.flatten(screen.getByTestId('welcome-language-container').props.style)
      expect(topBar.position).not.toBe('absolute')
      expect(topBar.flexDirection).toBe('row')
    } finally {
      mockKeyboardInset = 0
      mockKeyboardVisible = false
      dimensions.mockRestore()
    }
  })
  it('leaves space for the language control at large text sizes over the hero', () => {
    mockAuth = baseAuth({ isSignedIn: false, user: null })
    const dimensions = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({
      width: 320, height: 568, scale: 2, fontScale: 2,
    })
    try {
      const screen = render(<Welcome />)
      expect(screen.queryByText('Anstoss')).toBeNull()
      expect(StyleSheet.flatten(screen.getByTestId('welcome-language-container').props.style).flexDirection).toBe('row')
      expect(screen.getByText('Deutsch')).toBeTruthy()
    } finally {
      dimensions.mockRestore()
    }
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

  it('keeps the German day-month-year order even in English', () => {
    mockLanguage = 'en'
    mockAuth = baseAuth({ user: fresh })
    try {
      const screen = render(<NameScreen />)
      const fields = within(screen.getByTestId('dob-segments')).getAllByTestId(/^dob-(day|month|year)$/)
      expect(fields.map((field) => field.props.testID)).toEqual(['dob-day', 'dob-month', 'dob-year'])
    } finally {
      mockLanguage = 'de'
    }
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
    await waitFor(() => expect(screen.getByText('onboardingFlow.age.under13Title')).toBeTruthy())
    fireEvent.press(screen.getByTestId('under13-done'))
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

  it('finds the club name when a search includes a squad suffix', () => {
    expect(clubNameWithoutTeamSuffix('FC Treptow III')).toBe('FC Treptow')
    expect(clubNameWithoutTeamSuffix('FC Treptow')).toBeNull()
  })

  it('retries an empty team-suffix search using the club name', async () => {
    searchApi((path) => {
      if (path === '/clubs/search?q=FC%20Treptow%20III&limit=20') return { results: [] }
      if (path === '/clubs/search?q=FC%20Treptow&limit=20') return { results: [ALBATROS] }
      return undefined
    })
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'FC Treptow III')
    await waitFor(() => screen.getByTestId('find-club-row-sv-albatros'))
    expect(screen.getByText('onboardingFlow.club.showingClubResults {"club":"FC Treptow"}')).toBeTruthy()
  })

  it('does not carry the squad number into the club name during setup', () => {
    searchApi()
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'FC Treptow III')
    fireEvent.press(screen.getByTestId('club-create-link'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/club-setup', params: { clubName: 'FC Treptow' },
    })
  })

  it('H4: picks the role inline on the club row and sends from the same screen, no DOB asked', async () => {
    searchApi()
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'Albatros')
    await waitFor(() => screen.getByTestId('find-club-row-sv-albatros'))
    fireEvent.press(screen.getByTestId('find-club-row-sv-albatros'))
    expect(screen.getByTestId('club-join-question')).toBeTruthy()
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

  it('M4: a coach with a team code defaults to Co-Trainer', async () => {
    searchApi((path) =>
      path.startsWith('/teams/by-code/')
        ? {
            team: { id: 'team-1', name: 'Herren I', displayName: 'Herren I', clubId: 'club-1' },
            club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
          }
        : undefined,
    )
    const screen = render(<ClubSearchScreen />)
    fireEvent.changeText(screen.getByTestId('find-club-search'), 'SVAB2345HX')
    await waitFor(() => screen.getByTestId('club-team-match'))
    fireEvent.press(screen.getByTestId('club-team-match'))
    fireEvent.press(screen.getByTestId('club-role-coach'))
    await act(async () => {
      fireEvent.press(screen.getByTestId('club-send-request'))
    })
    expect(mockApi).toHaveBeenCalledWith('/onboarding/join-team', {
      method: 'POST',
      body: { joinCode: 'SVAB2345HX', role: 'COACH', teamRole: 'ASSISTANT_COACH' },
    })
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
    searchApi()
    const screen = render(<ClubSearchScreen />)
    fireEvent.press(screen.getByTestId('club-setup-code-link'))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/parent-handoff')
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
  it('accepts the supplied FUSSBALL.DE team-page link', () => {
    expect(isOfficialTeamLink('https://www.fussball.de/mannschaft/-/team-id/01OMGSGV0S000000VV0AG811VTVBGE70/tab/overview/')).toBe(true)
    expect(isOfficialTeamLink('https://fussball.de/?team=1')).toBe(false)
    expect(isOfficialTeamLink('https://name:secret@fussball.de/team')).toBe(false)
    expect(isOfficialTeamLink('https://fussball.de:444/team')).toBe(false)
    expect(isOfficialTeamLink('https://fussball.de.evil.example/team')).toBe(false)
    expect(isOfficialTeamLink(`https://fussball.de/${'x'.repeat(500)}`)).toBe(false)
  })
  it('submits the supplied FUSSBALL.DE page after the team name is entered', async () => {
    const link = 'https://www.fussball.de/mannschaft/-/team-id/01OMGSGV0S000000VV0AG811VTVBGE70/tab/overview/'
    mockParams = { clubName: 'FC Treptow' }
    mockApi.mockImplementation(async (path: string) =>
      path === '/club-claims/first' ? { id: 'claim-1' } : { results: [] },
    )
    const screen = render(<ClubSetupScreen />)
    fireEvent.changeText(screen.getByTestId('club-setup-link-input'), link)
    expect(screen.getByText('onboardingFlow.clubSetup.requiredTeam')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'Herren III')
    await act(async () => fireEvent.press(screen.getByTestId('club-setup-submit')))
    expect(mockApi).toHaveBeenCalledWith('/club-claims/first', expect.objectContaining({
      body: expect.objectContaining({ clubName: 'FC Treptow', teamName: 'Herren III', externalTeamUrl: link }),
    }))
  })
  it('H3: sends only the claim; the server sets CLUB_ADMIN with it', async () => {
    mockParams = { directoryEntryId: 'dir-7', clubName: 'TSV Linden 1899' }
    mockApi.mockImplementation(async (path: string) =>
      path === '/club-claims/first' ? { id: 'claim-1' } : { results: [] },
    )
    const screen = render(<ClubSetupScreen />)
    fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'Herren I')
    fireEvent.changeText(
      screen.getByTestId('club-setup-link-input'),
      'https://www.fussball.de/mannschaft/tsv-linden',
    )
    await act(async () => {
      fireEvent.press(screen.getByTestId('club-setup-submit'))
    })
    expect(mockApi).not.toHaveBeenCalledWith('/me', expect.anything())
    expect(mockApi).toHaveBeenCalledWith(
      '/club-claims/first',
      expect.objectContaining({ body: expect.objectContaining({ directoryEntryId: 'dir-7' }) }),
    )
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('names the colours for screen readers', () => {
    const screen = render(<ClubSetupScreen />)
    fireEvent.press(screen.getByTestId('club-setup-optional-toggle'))
    expect(screen.getByLabelText('onboardingFlow.clubSetup.colors.navy')).toBeTruthy()
    expect(screen.getByLabelText('onboardingFlow.clubSetup.colors.gold')).toBeTruthy()
  })

  it('keeps optional role selections when the section is collapsed', () => {
    const screen = render(<ClubSetupScreen />)
    const toggle = screen.getByTestId('club-setup-optional-toggle')
    fireEvent.press(toggle)
    const coach = screen.getByLabelText('onboardingFlow.clubSetup.participationCoach')
    fireEvent.press(coach)
    expect(coach.props.accessibilityState.checked).toBe(true)
    fireEvent.press(toggle)
    fireEvent.press(toggle)
    expect(screen.getByLabelText('onboardingFlow.clubSetup.participationCoach').props.accessibilityState.checked).toBe(true)
  })

  it('does not offer youth teams when the adult launch flag is off', async () => {
    const features = LAUNCH_FEATURES as { youthParticipation: boolean }
    const original = features.youthParticipation
    features.youthParticipation = false
    try {
      mockParams = { clubName: 'FC Treptow' }
      mockApi.mockImplementation(async (path: string) =>
        path === '/club-claims/first' ? { id: 'claim-1' } : { results: [] },
      )
      const screen = render(<ClubSetupScreen />)
      expect(screen.queryByText('onboardingFlow.clubSetup.groupYouth')).toBeNull()
      fireEvent.changeText(screen.getByTestId('club-setup-team-name-input'), 'Herren III')
      fireEvent.changeText(screen.getByTestId('club-setup-link-input'), 'https://www.fussball.de/mannschaft/example')
      await act(async () => fireEvent.press(screen.getByTestId('club-setup-submit')))
      expect(mockApi).toHaveBeenCalledWith('/club-claims/first', expect.objectContaining({
        body: expect.objectContaining({ teamGroupType: 'SENIOR' }),
      }))
    } finally {
      features.youthParticipation = original
    }
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
  it('B2: a 17-year-old parent account cannot link a child', async () => {
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
    expect(screen.getByText('onboardingFlow.home.verificationBody')).toBeTruthy()
    expect(screen.queryByText('onboardingFlow.home.verificationPrepare1')).toBeNull()
    fireEvent.press(screen.getByTestId('home-verification-details'))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/claim-pending',
      params: { claimId: 'claim-1' },
    })
  })
})
