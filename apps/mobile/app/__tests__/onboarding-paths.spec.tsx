import '../../test/future-capabilities'

/**
 * Traced onboarding paths (owner's caps). Each test walks one persona through
 * the REAL screens: it renders the screen for the current route, does what a
 * person does there (types, taps the final button), follows the navigation
 * the screen performs, and hands every `router.replace('/')` to the real entry
 * router logic (resolveSignedInRoute) against a fake mockServer that changes state
 * like the API does. Every distinct titled view it passes counts as a screen.
 * The tests then assert the count, the cap, and that the progress bar the
 * screens are built with (steps.ts) matches the walked path.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, waitFor, type RenderAPI } from '@testing-library/react-native'
import type { ReactElement } from 'react'

type Nav = { pathname: string; params: Record<string, string> }
let mockNav: Nav[] = []
let mockParams: Record<string, string> = {}
const mockApi = jest.fn()

type World = {
  signedIn: boolean
  user: {
    id: string
    email: string
    name: string
    registrationRole: string
    dateOfBirth: string | null
    adultConfirmedAt: string | null
  } | null
  memberships: Array<{ id: string; club: { id: string } }>
  pendingJoinRequest: { id: string; clubId: string } | null
  pendingClubClaim: { id: string; status: 'SUBMITTED' } | null
  listed: boolean
}
let mockWorld: World

function mockNavTo(target: unknown) {
  if (typeof target === 'string') mockNav.push({ pathname: target, params: {} })
  else {
    const t = target as { pathname: string; params?: Record<string, string> }
    mockNav.push({ pathname: t.pathname, params: t.params ?? {} })
  }
}

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: (t: unknown) => mockNavTo(t),
    push: (t: unknown) => mockNavTo(t),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  router: { replace: (t: unknown) => mockNavTo(t), push: (t: unknown) => mockNavTo(t), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}))

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
jest.mock('../../src/launchFeatures', () => ({
  ...jest.requireActual('../../src/launchFeatures'),
  OPTIONAL_CLUB_FEATURES: { marketplace: true, statistics: false, sponsorship: false },
}))
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')
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
  useOnboardingAuth: () => ({
    startOtp: jest.fn(async () => undefined),
    verifyOtp: jest.fn(async (_code: string, email: string) => {
      mockWorld.signedIn = true
      // JIT user: named after the email, no DOB, default role.
      mockWorld.user = mockWorld.user ?? {
        id: 'user-1',
        email,
        name: email.split('@')[0],
        registrationRole: 'PLAYER',
        dateOfBirth: null,
        adultConfirmedAt: null,
      }
    }),
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    ...mockWorld,
    isSignedIn: mockWorld.signedIn,
    isLoading: false,
    ageGate: null,
    activeClub: null,
    refreshUser: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: {},
    update: jest.fn(),
    markStep: jest.fn(),
    reset: jest.fn(),
  }),
}))

import Welcome from '../(auth)/welcome'
import SignIn from '../(auth)/sign-in'
import NameScreen from '../(auth)/name'
import ClubSearchScreen from '../(auth)/club-search'
import ClubSetupScreen from '../(auth)/club-setup'
import FreeAgentOnboarding from '../(auth)/free-agent-profile'
import ParentHandoff from '../(auth)/parent-handoff'
import JoinInviteScreen from '../join/[...code]'
import { resolveSignedInRoute } from '../../src/onboarding/routing'
import { getOnboardingIntent } from '../../src/onboarding/intent'
import { getPendingInvite } from '../../src/auth/pendingInvite'
import {
  ONBOARDING_PATHS,
  ONBOARDING_SCREEN_CAPS,
  onboardingProgress,
  type OnboardingPathKey,
  type OnboardingScreenKey,
} from '../../src/onboarding/steps'

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
const LINDEN = {
  id: 'dir-7',
  activeClubId: null,
  directoryEntryId: 'dir-7',
  source: 'DFBNET',
  isActive: false,
  name: 'TSV Linden 1899',
  slug: 'tsv-linden-1899',
  badgeUrl: null,
  primaryColor: null,
  city: 'Hannover',
  state: 'Niedersachsen',
  association: 'NFV',
  memberCount: 0,
}
const INVITE = {
  code: 'E2EINV01',
  status: 'PENDING',
  kind: 'MEMBER_INVITE',
  role: 'PLAYER',
  phase: 'FULL',
  club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C', slug: 'sv-albatros' },
  team: { id: 'team-1', displayName: 'Herren II' },
}
const TEAM_PREVIEW = {
  team: { id: 'team-1', clubId: 'club-1', name: 'U14', displayName: 'U14' },
  club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
  rosterSlots: [{ id: 'slot-lena', fullName: 'Lena Weber', position: 'MID', jerseyNumber: 14 }],
}

/** The fake mockServer: every write changes `mockWorld` like the API would. */
async function mockServer(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
  const method = options.method ?? 'GET'
  const body = options.body ?? {}
  if (method === 'PATCH' && path === '/me') {
    Object.assign(mockWorld.user!, body)
    return mockWorld.user
  }
  if (path.startsWith('/clubs/search')) return { results: [ALBATROS, LINDEN], nextCursor: null }
  if (path === '/me/join-requests/active') return { request: null, lastDecision: null }
  if (path.startsWith('/clubs/lookup')) return { teams: [{ id: 'team-1', displayName: 'Herren I' }] }
  if (method === 'POST' && path === '/clubs/club-1/join-requests') {
    mockWorld.pendingJoinRequest = { id: 'jr-1', clubId: 'club-1' }
    return { id: 'jr-1' }
  }
  if (method === 'POST' && path === '/clubs/club-1/staff-access-requests') {
    mockWorld.pendingClubClaim = { id: 'claim-staff', status: 'SUBMITTED' }
    return { id: 'claim-staff' }
  }
  if (method === 'POST' && path === '/club-claims/first') {
    mockWorld.user!.registrationRole = 'CLUB_ADMIN'
    mockWorld.pendingClubClaim = { id: 'claim-1', status: 'SUBMITTED' }
    return { id: 'claim-1' }
  }
  if (method === 'POST' && path === '/me/free-agent-profile') {
    mockWorld.listed = true
    return {}
  }
  if (path === '/public/invites/E2EINV01') return INVITE
  if (method === 'POST' && path === '/invites/E2EINV01/redeem') {
    mockWorld.memberships.push({ id: 'm-1', club: { id: 'club-1' } })
    return { status: 'joined' }
  }
  if (path === '/parent-handoff/AB23CD45') {
    return { childFirstName: 'Lena', childDateOfBirth: '2012-05-14T00:00:00.000Z', team: TEAM_PREVIEW }
  }
  if (method === 'POST' && path === '/parent-handoff/redeem') {
    mockWorld.memberships.push({ id: 'm-1', club: { id: 'club-1' } })
    return { profile: {} }
  }
  return {}
}

const SCREENS: Record<string, { key: (signedIn: boolean) => OnboardingScreenKey; el: () => ReactElement }> = {
  '/(auth)/welcome': { key: () => 'welcome', el: () => <Welcome /> },
  '/(auth)/sign-in': { key: () => 'code', el: () => <SignIn /> },
  '/(auth)/name': { key: () => 'profile', el: () => <NameScreen /> },
  '/(auth)/club-search': { key: () => 'clubSearch', el: () => <ClubSearchScreen /> },
  '/(auth)/club-setup': { key: () => 'clubSetup', el: () => <ClubSetupScreen /> },
  '/(auth)/free-agent-profile': { key: () => 'freeAgentProfile', el: () => <FreeAgentOnboarding /> },
  '/(auth)/parent-handoff': { key: () => 'parentHandoff', el: () => <ParentHandoff /> },
  '/join': {
    key: (signedIn) => (signedIn ? 'inviteConfirm' : 'invitePreview'),
    el: () => <JoinInviteScreen />,
  },
}

const TERMINAL = new Set(['/(tabs)', '/(auth)/request-pending'])

/** What index.tsx does with `router.replace('/')`. */
async function entryRoute(): Promise<string> {
  if (!mockWorld.signedIn) return '/(auth)/welcome'
  return resolveSignedInRoute({
    user: mockWorld.user,
    memberships: mockWorld.memberships,
    ageGate: null,
    pendingJoinRequest: mockWorld.pendingJoinRequest,
    pendingClubClaim: mockWorld.pendingClubClaim,
    pendingInviteCode: await getPendingInvite(),
    resumeTarget: null,
    intent: await getOnboardingIntent(),
  })
}

type Actions = Partial<Record<OnboardingScreenKey, (screen: RenderAPI) => Promise<void>>>

async function walk(start: string, actions: Actions): Promise<{ screens: OnboardingScreenKey[]; end: string }> {
  let route = start
  let params: Record<string, string> = {}
  const screens: OnboardingScreenKey[] = []
  for (let hop = 0; hop < 10; hop += 1) {
    if (route === '/') route = await entryRoute()
    if (TERMINAL.has(route)) return { screens, end: route }
    let screenPath = route
    if (route.startsWith('/join/')) {
      params = { code: route.slice('/join/'.length) }
      screenPath = '/join'
    }
    const entry = SCREENS[screenPath]
    if (!entry) throw new Error(`no screen for ${route}`)
    const key = entry.key(mockWorld.signedIn)
    screens.push(key)
    mockParams = params
    mockNav = []
    const screen = render(entry.el())
    const action = actions[key]
    if (!action) throw new Error(`no action for ${key} (${route})`)
    await action(screen)
    await waitFor(() => expect(mockNav.length).toBeGreaterThan(0), { timeout: 3000 })
    const next = mockNav[mockNav.length - 1]
    screen.unmount()
    // The next screen reads the params of the navigation that led there.
    route = next.pathname
    params = next.params
  }
  throw new Error('path did not end')
}

// ── actions: what a person does on each screen ─────────────────────────────
const typeEmailOnWelcome = (button = 'welcome-continue') => async (s: RenderAPI) => {
  fireEvent.changeText(s.getByTestId('welcome-email'), 'tim.weber@example.de')
  await act(async () => {
    fireEvent.press(s.getByTestId(button))
  })
}
const typeCode = async (s: RenderAPI) => {
  await act(async () => {
    fireEvent.changeText(s.getByTestId('otp-input'), '424242')
  })
}
const nameAndAdultDob = async (s: RenderAPI) => {
  fireEvent.changeText(s.getByTestId('name-input'), 'Tim Weber')
  fireEvent.changeText(s.getByTestId('dob-day'), '04')
  fireEvent.changeText(s.getByTestId('dob-month'), '03')
  fireEvent.changeText(s.getByTestId('dob-year'), '1996')
  await act(async () => {
    fireEvent.press(s.getByTestId('name-continue'))
  })
}
const searchAlbatros = async (s: RenderAPI) => {
  fireEvent.changeText(s.getByTestId('find-club-search'), 'Albatros')
  await waitFor(() => s.getByTestId('find-club-row-sv-albatros'), { timeout: 3000 })
}
const requestAs = (chip: string, extra?: (s: RenderAPI) => Promise<void>) => async (s: RenderAPI) => {
  await searchAlbatros(s)
  fireEvent.press(s.getByTestId('find-club-row-sv-albatros'))
  fireEvent.press(s.getByTestId(chip))
  if (extra) await extra(s)
  await act(async () => {
    fireEvent.press(s.getByTestId('club-send-request'))
  })
}
const fillClubSetup = async (s: RenderAPI) => {
  fireEvent.changeText(s.getByTestId('club-setup-team-name-input'), 'Herren I')
  fireEvent.changeText(
    s.getByTestId('club-setup-link-input'),
    'https://www.fussball.de/mannschaft/tsv-linden-1899',
  )
  await act(async () => {
    fireEvent.press(s.getByTestId('club-setup-submit'))
  })
}

function assertPath(path: OnboardingPathKey, screens: OnboardingScreenKey[]) {
  expect(screens).toEqual(ONBOARDING_PATHS[path])
  expect(screens.length).toBeLessThanOrEqual(ONBOARDING_SCREEN_CAPS[path])
  // The progress bar each screen shows is the walked path.
  screens.forEach((screen, index) => {
    expect(onboardingProgress(path, screen)).toEqual({ current: index + 1, total: screens.length })
  })
}

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  mockNav = []
  mockParams = {}
  mockWorld = {
    signedIn: false,
    user: null,
    memberships: [],
    pendingJoinRequest: null,
    pendingClubClaim: null,
    listed: false,
  }
  mockApi.mockImplementation(mockServer)
})

describe('traced onboarding paths (caps)', () => {
  it('player without an invite: 4 screens, the send tap is on screen 4', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome(),
      code: typeCode,
      profile: nameAndAdultDob,
      clubSearch: requestAs('club-role-player', async (s) => {
        await waitFor(() => s.getByTestId('club-team-team-1'))
        fireEvent.press(s.getByTestId('club-team-team-1'))
      }),
    })
    assertPath('member', screens)
    expect(end).toBe('/(auth)/request-pending')
    expect(mockWorld.pendingJoinRequest).not.toBeNull()
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/join-requests', {
      method: 'POST',
      body: { role: 'PLAYER', teamId: 'team-1' },
    })
  })

  it('parent without an invite: 4 screens, role chosen inline on the club row', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome(),
      code: typeCode,
      profile: nameAndAdultDob,
      clubSearch: requestAs('club-role-parent'),
    })
    assertPath('member', screens)
    expect(end).toBe('/(auth)/request-pending')
    expect(mockWorld.user?.registrationRole).toBe('PARENT')
  })

  it('coach without an invite: 4 screens, picks team and Cheftrainer inline', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome(),
      code: typeCode,
      profile: nameAndAdultDob,
      clubSearch: requestAs('club-role-coach', async (s) => {
        await waitFor(() => s.getByTestId('club-team-team-1'))
        fireEvent.press(s.getByTestId('club-team-team-1'))
        fireEvent.press(s.getByTestId('club-coach-head'))
      }),
    })
    assertPath('member', screens)
    expect(end).toBe('/(auth)/request-pending')
    expect(mockApi).toHaveBeenCalledWith('/clubs/club-1/staff-access-requests', {
      method: 'POST',
      body: { desiredRole: 'COACH', requestedTeamIds: ['team-1'], teamRoles: ['HEAD_COACH'] },
    })
  })

  it('club admin via "Verein nicht dabei?": 5 screens to a usable home', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome(),
      code: typeCode,
      profile: nameAndAdultDob,
      clubSearch: async (s) => {
        fireEvent.changeText(s.getByTestId('find-club-search'), 'TSV Linden 1899')
        await act(async () => {
          fireEvent.press(s.getByTestId('club-create-link'))
        })
      },
      clubSetup: fillClubSetup,
    })
    assertPath('admin', screens)
    expect(end).toBe('/(tabs)')
    // H3: nothing wrote CLUB_ADMIN before the claim went through.
    expect(mockApi).not.toHaveBeenCalledWith('/me', expect.objectContaining({
      body: expect.objectContaining({ registrationRole: 'CLUB_ADMIN' }),
    }))
  })

  it('club admin via a directory result: straight to "Verein einrichten", 5 screens', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome(),
      code: typeCode,
      profile: nameAndAdultDob,
      clubSearch: async (s) => {
        fireEvent.changeText(s.getByTestId('find-club-search'), 'Linden')
        await waitFor(() => s.getByTestId('find-club-row-tsv-linden-1899'), { timeout: 3000 })
        await act(async () => {
          fireEvent.press(s.getByTestId('find-club-row-tsv-linden-1899'))
        })
      },
      clubSetup: fillClubSetup,
    })
    assertPath('admin', screens)
    expect(end).toBe('/(tabs)')
    expect(mockApi).toHaveBeenCalledWith(
      '/club-claims/first',
      expect.objectContaining({ body: expect.objectContaining({ directoryEntryId: 'dir-7' }) }),
    )
  })

  it('free agent from welcome: 4 screens to a listed profile', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome('welcome-free-agent'),
      code: typeCode,
      profile: nameAndAdultDob,
      freeAgentProfile: async (s) => {
        fireEvent.press(s.getByText('spielerprofil.position.MID'))
        fireEvent.changeText(s.getByLabelText('spielerprofil.fieldPostalCode'), '14482')
        await act(async () => {
          fireEvent.press(s.getByText('spielerprofil.onboardingCta'))
        })
      },
    })
    assertPath('freeAgent', screens)
    expect(end).toBe('/(tabs)')
    expect(mockWorld.listed).toBe(true)
  })

  it('free agent from Verein finden: listed on screen 4, no second name screen', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome(),
      code: typeCode,
      profile: nameAndAdultDob,
      clubSearch: async (s) => {
        fireEvent.press(s.getByTestId('club-free-agent-link'))
        fireEvent.press(s.getByTestId('club-free-agent-position-FWD'))
        fireEvent.changeText(s.getByTestId('club-free-agent-plz'), '14482')
        await act(async () => {
          fireEvent.press(s.getByTestId('club-free-agent-publish'))
        })
      },
    })
    expect(screens).toEqual(['welcome', 'code', 'profile', 'clubSearch'])
    expect(screens.length).toBeLessThanOrEqual(ONBOARDING_SCREEN_CAPS.freeAgent)
    expect(end).toBe('/(tabs)')
    expect(mockWorld.listed).toBe(true)
  })

  it('guardian with a setup code from welcome: 4 screens, no club needed, team from the invite', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome('welcome-setup-code'),
      code: typeCode,
      profile: nameAndAdultDob,
      parentHandoff: async (s) => {
        fireEvent.changeText(s.getByTestId('parent-handoff-setup-code'), 'AB23CD45')
        await waitFor(() => s.getByTestId('parent-handoff-slot-slot-lena'))
        await act(async () => {
          fireEvent.press(s.getByTestId('parent-handoff-submit'))
        })
      },
    })
    assertPath('guardian', screens)
    expect(end).toBe('/(tabs)')
    // H5: the team code is optional when the handoff knows the team.
    expect(mockApi).toHaveBeenCalledWith('/parent-handoff/redeem', {
      method: 'POST',
      body: { code: 'AB23CD45', rosterSlotId: 'slot-lena' },
    })
  })

  it('invite link, signed out: preview with email → code → Beitreten = 3, one tap to join', async () => {
    const { screens, end } = await walk('/join/E2EINV01', {
      invitePreview: async (s) => {
        await waitFor(() => s.getByTestId('join-email'))
        fireEvent.changeText(s.getByTestId('join-email'), 'lukas.hoffmann@example.de')
        await act(async () => {
          fireEvent.press(s.getByTestId('join-accept'))
        })
      },
      code: typeCode,
      inviteConfirm: async (s) => {
        await waitFor(() => s.getByTestId('join-confirm'))
        fireEvent.changeText(s.getByTestId('join-name'), 'Lukas Hoffmann')
        fireEvent.changeText(s.getByTestId('dob-day'), '12')
        fireEvent.changeText(s.getByTestId('dob-month'), '07')
        fireEvent.changeText(s.getByTestId('dob-year'), '2001')
        // H2: nothing joins until the tap.
        expect(mockWorld.memberships).toHaveLength(0)
        await act(async () => {
          fireEvent.press(s.getByTestId('join-confirm'))
        })
      },
    })
    assertPath('invite', screens)
    expect(end).toBe('/(tabs)')
    // H1: the saved code is gone once redeemed.
    await expect(getPendingInvite()).resolves.toBeNull()
  })

  it('invite code typed into Verein finden joins on screen 4', async () => {
    const { screens, end } = await walk('/', {
      welcome: typeEmailOnWelcome(),
      code: typeCode,
      profile: nameAndAdultDob,
      clubSearch: async (s) => {
        fireEvent.changeText(s.getByTestId('find-club-search'), 'E2EINV01')
        await waitFor(() => s.getByTestId('club-invite-match'), { timeout: 3000 })
        fireEvent.press(s.getByTestId('club-invite-match'))
        await act(async () => {
          fireEvent.press(s.getByTestId('club-invite-join'))
        })
      },
    })
    expect(screens).toHaveLength(4)
    expect(end).toBe('/(tabs)')
  })

  it('member opening an invite link: straight to Beitreten, then home', async () => {
    mockWorld.signedIn = true
    mockWorld.user = {
      id: 'user-9',
      email: 'jonas@example.de',
      name: 'Jonas Becker',
      registrationRole: 'PLAYER',
      dateOfBirth: '1995-02-01',
      adultConfirmedAt: null,
    }
    mockWorld.memberships = [{ id: 'm-0', club: { id: 'club-0' } }]
    await AsyncStorage.setItem('anstoss.pendingInviteCode', 'E2EINV01')
    const { screens, end } = await walk('/', {
      inviteConfirm: async (s) => {
        await waitFor(() => s.getByTestId('join-confirm'))
        await act(async () => {
          fireEvent.press(s.getByTestId('join-confirm'))
        })
      },
    })
    expect(screens).toEqual(['inviteConfirm'])
    expect(end).toBe('/(tabs)')
  })
})
