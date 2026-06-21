import AsyncStorage from '@react-native-async-storage/async-storage'
import { render } from '@testing-library/react-native'
import Index from '../index'
import { ONBOARDING_FLOW_STORAGE_KEY } from '../../src/context/OnboardingFlowContext'

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

jest.mock('../../src/onboarding/welcomeSeen', () => ({
  useWelcomeSeen: () => true,
}))

describe('Index routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
  })

  it('routes signed-out users to auth', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: false,
      memberships: [],
      ageGate: null,
      needsOnboarding: false,
      needsRegistration: false,
      user: null,
    })

    const { getByText } = render(<Index />)

    // Default route for unsigned users is the bare sign-in screen.
    // Welcome.tsx is only reachable via the "Create account" link inside.
    expect(getByText('/(auth)/sign-in')).toBeTruthy()
  })

  it('routes free agents without memberships to the free-agent profile', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: null,
      needsOnboarding: false,
      needsRegistration: false,
      user: {
        registrationRole: 'FREE_AGENT',
      },
    })

    const { getByText } = render(<Index />)

    expect(getByText('/free-agent/profile')).toBeTruthy()
  })

  it('routes club admins without memberships to /(tabs) with a setup CTA on home', () => {
    // Hard-redirecting to /club-setup used to lock admins out of all other
    // navigation (marketplace, more, sign-out). Now they land on tabs and
    // see a "Finish setting up your club" empty-state with a CTA to
    // /club-setup — but they can also navigate elsewhere.
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: null,
      needsOnboarding: false,
      needsRegistration: false,
      user: {
        registrationRole: 'CLUB_ADMIN',
      },
    })

    const { getByText } = render(<Index />)

    expect(getByText('/(tabs)')).toBeTruthy()
  })

  it('routes players without memberships to the next-step holding screen', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: null,
      needsOnboarding: false,
      needsRegistration: false,
      user: {
        registrationRole: 'PLAYER',
      },
    })

    const { getByText } = render(<Index />)

    expect(getByText('/account-next-step')).toBeTruthy()
  })

  it('keeps the standalone DOB gate for already-registered users', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [
        {
          id: 'membership-1',
          club: { id: 'club-1', name: 'FC Test' },
        },
      ],
      ageGate: { status: 'DOB_REQUIRED' },
      needsOnboarding: false,
      needsRegistration: false,
      user: {
        clerkId: 'clerk-existing',
        registrationRole: 'PLAYER',
        dateOfBirth: null,
      },
    })

    const { getByText } = render(<Index />)

    expect(getByText('/enter-dob')).toBeTruthy()
  })

  it('routes fresh signups with no saved state back into registration', async () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: { status: 'DOB_REQUIRED' },
      needsOnboarding: false,
      needsRegistration: true,
      user: {
        clerkId: 'clerk-fresh',
        registrationRole: '',
        dateOfBirth: null,
      },
    })

    const { findByText } = render(<Index />)

    // With no saved wizard state, un-roled users restart the registration wizard.
    expect(await findByText('/(auth)/about')).toBeTruthy()
  })

  it('resumes fresh signups from the saved onboarding step', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
      if (key === ONBOARDING_FLOW_STORAGE_KEY) {
        return JSON.stringify({
          ownerClerkId: 'clerk-fresh',
          firstName: 'Mara',
          dateOfBirth: '1997-04-12',
          lastStep: '/(auth)/role',
        })
      }
      return null
    })
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: { status: 'DOB_REQUIRED' },
      needsOnboarding: false,
      needsRegistration: true,
      user: {
        clerkId: 'clerk-fresh',
        registrationRole: '',
        dateOfBirth: null,
      },
    })

    const { findByText } = render(<Index />)

    expect(await findByText('/(auth)/role')).toBeTruthy()
  })

  it('resumes fresh signups from the final onboarding action screen', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
      if (key === ONBOARDING_FLOW_STORAGE_KEY) {
        return JSON.stringify({
          ownerClerkId: 'clerk-fresh',
          firstName: 'Mara',
          dateOfBirth: '1997-04-12',
          role: 'FREE_AGENT',
          lastStep: '/(auth)/done',
        })
      }
      return null
    })
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: { status: 'DOB_REQUIRED' },
      needsOnboarding: false,
      needsRegistration: true,
      user: {
        clerkId: 'clerk-fresh',
        registrationRole: '',
        dateOfBirth: null,
      },
    })

    const { findByText } = render(<Index />)

    expect(await findByText('/(auth)/done')).toBeTruthy()
  })

  it('ignores saved onboarding state from another signed-in account', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementation(async (key) => {
      if (key === ONBOARDING_FLOW_STORAGE_KEY) {
        return JSON.stringify({
          ownerClerkId: 'other-clerk',
          firstName: 'Mara',
          dateOfBirth: '1997-04-12',
          lastStep: '/(auth)/role',
        })
      }
      return null
    })
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: { status: 'DOB_REQUIRED' },
      needsOnboarding: false,
      needsRegistration: true,
      user: {
        clerkId: 'clerk-fresh',
        registrationRole: '',
        dateOfBirth: null,
      },
    })

    const { findByText } = render(<Index />)

    expect(await findByText('/(auth)/about')).toBeTruthy()
  })

  it('keeps legacy users (with DOB, no memberships) on the role-specific landing', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: null,
      needsOnboarding: false,
      needsRegistration: false,
      user: {
        registrationRole: 'FREE_AGENT',
        dateOfBirth: '1995-06-15',
      },
    })

    const { getByText } = render(<Index />)

    // Falls through to the legacy FREE_AGENT path, not /register
    expect(getByText('/free-agent/profile')).toBeTruthy()
  })
})
