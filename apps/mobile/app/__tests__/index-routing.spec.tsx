import '../../test/future-capabilities'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { render } from '@testing-library/react-native'
import Index from '../index'
import { ONBOARDING_FLOW_STORAGE_KEY } from '../../src/onboarding/storageKeys'

const mockUseAuth = jest.fn()

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, href)
  },
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

function signedIn(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isSignedIn: true,
    memberships: [],
    ageGate: null,
    pendingJoinRequest: null,
    pendingClubClaim: null,
    user: {
      id: 'user-1',
      email: 'tim.weber@example.de',
      name: 'Tim Weber',
      registrationRole: 'PLAYER',
      dateOfBirth: '1998-05-15',
    },
    ...overrides,
  }
}

describe('Index routing (onboarding revamp)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
  })

  it('sends signed-out users to the welcome screen with the email field', () => {
    mockUseAuth.mockReturnValue({ ...signedIn(), isSignedIn: false, user: null })
    const { getByText } = render(<Index />)
    expect(getByText('/(auth)/welcome')).toBeTruthy()
  })

  it('asks a fresh account (named after its email) for a name first', async () => {
    mockUseAuth.mockReturnValue(
      signedIn({ user: { id: 'u', email: 'tim.weber@example.de', name: 'tim.weber' } }),
    )
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/name')).toBeTruthy()
  })

  it('sends a named account without a club to Verein finden', async () => {
    mockUseAuth.mockReturnValue(signedIn())
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/club-search')).toBeTruthy()
  })

  it('sends a pending join request to the waiting screen', async () => {
    mockUseAuth.mockReturnValue(signedIn({ pendingJoinRequest: { id: 'jr', clubId: 'c' } }))
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/request-pending')).toBeTruthy()
  })

  it('sends a coach with a pending staff request to the waiting screen', async () => {
    mockUseAuth.mockReturnValue(
      signedIn({
        pendingClubClaim: { id: 'claim-7', status: 'SUBMITTED' },
        user: { id: 'u', email: 'a@b.de', name: 'Coach Albrecht', registrationRole: 'COACH' },
      }),
    )
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/request-pending')).toBeTruthy()
  })

  it('lets a club admin with a claim in review onto home (banner, not a blocking screen)', async () => {
    mockUseAuth.mockReturnValue(
      signedIn({
        pendingClubClaim: { id: 'claim-1', status: 'SUBMITTED' },
        user: { id: 'u', email: 'a@b.de', name: 'Mara Schulte', registrationRole: 'CLUB_ADMIN' },
      }),
    )
    const { findByText } = render(<Index />)
    expect(await findByText('/(tabs)')).toBeTruthy()
  })

  it('returns to a saved invite after sign-in', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) =>
      key === 'anstoss.pendingInviteCode' ? 'E2EINV01' : null,
    )
    mockUseAuth.mockReturnValue(signedIn())
    const { findByText } = render(<Index />)
    expect(await findByText('/join/E2EINV01')).toBeTruthy()
  })

  it('resumes the club setup draft but never a deleted step', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) =>
      key === ONBOARDING_FLOW_STORAGE_KEY
        ? JSON.stringify({ ownerUserId: 'user-1', lastStep: '/(auth)/club-setup' })
        : null,
    )
    mockUseAuth.mockReturnValue(signedIn())
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/club-setup')).toBeTruthy()
  })

  it('keeps the DOB gate only for legacy members without a DOB', async () => {
    mockUseAuth.mockReturnValue(
      signedIn({ memberships: [{ id: 'm' }], ageGate: { status: 'DOB_REQUIRED' } }),
    )
    const { findByText } = render(<Index />)
    expect(await findByText('/enter-dob')).toBeTruthy()
  })

  it('sends members home', async () => {
    mockUseAuth.mockReturnValue(signedIn({ memberships: [{ id: 'm' }] }))
    const { findByText } = render(<Index />)
    expect(await findByText('/(tabs)')).toBeTruthy()
  })

  // onboarding review fixes
  it('asks a named account without a date of birth for it on "Wie heißt du?" (B1)', async () => {
    mockUseAuth.mockReturnValue(
      signedIn({
        user: { id: 'u', email: 'a@b.de', name: 'Tim Weber', registrationRole: 'PARENT', dateOfBirth: null },
      }),
    )
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/name')).toBeTruthy()
  })

  it('lets a legacy 16+ declaration through without a DOB', async () => {
    mockUseAuth.mockReturnValue(
      signedIn({
        user: {
          id: 'u',
          email: 'a@b.de',
          name: 'Tim Weber',
          registrationRole: 'COACH',
          dateOfBirth: null,
          adultConfirmedAt: '2026-08-01T00:00:00.000Z',
        },
      }),
    )
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/club-search')).toBeTruthy()
  })

  it('H1: a member with a saved invite lands on the invite, not silently on home', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) =>
      key === 'anstoss.pendingInviteCode' ? 'E2EINV01' : null,
    )
    mockUseAuth.mockReturnValue(signedIn({ memberships: [{ id: 'm' }] }))
    const { findByText } = render(<Index />)
    expect(await findByText('/join/E2EINV01')).toBeTruthy()
  })

  it('H5: the setup-code intent goes from the name to "Kind hinzufügen"', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) =>
      key === 'anstoss:onboarding-intent' ? 'parent-handoff' : null,
    )
    mockUseAuth.mockReturnValue(signedIn())
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/parent-handoff')).toBeTruthy()
  })

  it('sends the free-agent intent from the name to the player profile', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) =>
      key === 'anstoss:onboarding-intent' ? 'free-agent' : null,
    )
    mockUseAuth.mockReturnValue(signedIn())
    const { findByText } = render(<Index />)
    expect(await findByText('/(auth)/free-agent-profile')).toBeTruthy()
  })

  it('sends free agents to their own tab bar (Wechselbörse)', async () => {
    mockUseAuth.mockReturnValue(
      signedIn({ user: { id: 'u', email: 'a@b.de', name: 'Amir Kaya', registrationRole: 'FREE_AGENT' } }),
    )
    const { findByText } = render(<Index />)
    expect(await findByText('/(tabs)')).toBeTruthy()
  })
})
