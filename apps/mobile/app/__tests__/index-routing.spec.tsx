import { render } from '@testing-library/react-native'
import Index from '../index'

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

describe('Index routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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

    expect(getByText('/(auth)/welcome')).toBeTruthy()
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

  it('routes fresh signups (no memberships, no role) to the next-step holding screen', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isSignedIn: true,
      memberships: [],
      ageGate: null,
      needsOnboarding: false,
      needsRegistration: true,
      user: {
        registrationRole: '',
        dateOfBirth: null,
      },
    })

    const { getByText } = render(<Index />)

    // /register has been removed; un-roled users land on the holding screen
    expect(getByText('/account-next-step')).toBeTruthy()
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
