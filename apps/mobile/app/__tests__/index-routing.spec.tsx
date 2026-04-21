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

  it('routes club admins without memberships to club setup', () => {
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

    expect(getByText('/club-setup')).toBeTruthy()
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

  it('routes fresh signups (no memberships, no DOB) to /register', () => {
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

    expect(getByText('/register')).toBeTruthy()
  })

  it('does NOT route to /register when user has a DOB (legacy user, no memberships)', () => {
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
