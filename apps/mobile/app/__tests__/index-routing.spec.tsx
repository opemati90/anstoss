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
      user: {
        registrationRole: 'PLAYER',
      },
    })

    const { getByText } = render(<Index />)

    expect(getByText('/account-next-step')).toBeTruthy()
  })
})
