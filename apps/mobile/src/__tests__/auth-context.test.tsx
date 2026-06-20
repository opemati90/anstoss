import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Text } from 'react-native'
import { waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthProvider, useAuth } from '../context/AuthContext'

const mockGetToken = jest.fn(() => Promise.resolve('token_123'))
const mockClerkSignOut = jest.fn(() => Promise.resolve())
const mockApi = jest.fn()
const mockSetTokenGetter = jest.fn()
let mockRegisteredSignOutHandler: (() => Promise<void>) | null = null
const mockSetAuthExpiryHandlingSuspended = jest.fn()
const mockClearMemoryCache = jest.fn()
const mockUnregisterPushToken = jest.fn((_apiUrl: string, _authToken: string) =>
  Promise.resolve(),
)
const mockGetE2ESession = jest.fn(() => null)
const mockClearE2ESession = jest.fn(() => Promise.resolve())
const mockHydrateStoredE2ESession = jest.fn(() => Promise.resolve(null))
const mockSubscribeToE2ESession = jest.fn(
  (_listener: (session: unknown) => void) => jest.fn(),
)
const mockClerkUser = {
  id: 'clerk-1',
  primaryEmailAddress: {
    emailAddress: 'free@example.com',
  },
}
let mockClerkSignedIn = true

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    getToken: mockGetToken,
    isSignedIn: mockClerkSignedIn,
    signOut: mockClerkSignOut,
  }),
  useUser: () => ({
    user: mockClerkUser,
  }),
}))

jest.mock('../api/client', () => ({
  API_URL: 'http://api.test',
  api: (...args: unknown[]) => mockApi(...args),
  setTokenGetter: (...args: unknown[]) => mockSetTokenGetter(...args),
  setSignOutHandler: (handler: (() => Promise<void>) | null) => {
    mockRegisteredSignOutHandler = handler
  },
  setAuthExpiryHandlingSuspended: (...args: unknown[]) =>
    mockSetAuthExpiryHandlingSuspended(...args),
}))

jest.mock('../utils/cache', () => ({
  prefetchTeamData: jest.fn(),
  clearMemoryCache: () => mockClearMemoryCache(),
}))

jest.mock('../hooks/usePushNotifications', () => ({
  unregisterPushToken: (apiUrl: string, authToken: string) =>
    mockUnregisterPushToken(apiUrl, authToken),
}))

jest.mock('../e2e/session', () => ({
  clearE2ESession: () => mockClearE2ESession(),
  getE2ESession: () => mockGetE2ESession(),
  hydrateStoredE2ESession: () => mockHydrateStoredE2ESession(),
  isE2ESupported: () => false,
  subscribeToE2ESession: (listener: (session: unknown) => void) =>
    mockSubscribeToE2ESession(listener),
}))

let latestAuth: ReturnType<typeof useAuth> | null = null

function Probe() {
  latestAuth = useAuth()
  return <Text>{latestAuth.isSignedIn ? latestAuth.user?.registrationRole : 'signed-out'}</Text>
}

function makeTeamMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-member-1',
    role: 'PLAYER',
    phase: 'FULL',
    status: 'ACTIVE',
    team: {
      id: 'team-1',
      name: 'U12',
      displayName: null,
      clubId: 'club-1',
      ageGroup: 'U12',
    },
    ...overrides,
  }
}

function mockBackendUser({
  withClub = false,
  teamMembers,
}: {
  withClub?: boolean
  teamMembers?: Array<Record<string, unknown>>
} = {}) {
  mockApi.mockResolvedValue({
    id: 'user-1',
    clerkId: 'clerk-1',
    email: 'stale@example.com',
    name: 'Free Agent',
    avatarUrl: null,
    registrationRole: 'FREE_AGENT',
    memberships: withClub
      ? [
          {
            id: 'membership-1',
            role: 'PLAYER',
            operationalRoles: [],
            club: {
              id: 'club-1',
              name: 'FC QA',
              slug: 'fc-qa',
              badgeUrl: null,
              primaryColor: '#1E3A5F',
            },
          },
        ]
      : [],
    teamMembers: withClub ? (teamMembers ?? [makeTeamMember()]) : [],
    ageGate: null,
  })
}

describe('AuthContext signOut', () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

  beforeEach(async () => {
    jest.clearAllMocks()
    mockClerkSignedIn = true
    mockClerkSignOut.mockResolvedValue(undefined)
    mockGetE2ESession.mockReturnValue(null)
    mockBackendUser()
    latestAuth = null
    mockRegisteredSignOutHandler = null
    await AsyncStorage.clear()
  })

  afterAll(() => {
    warnSpy.mockRestore()
  })

  it('clears stale local user state and resolves before remote cleanup finishes', async () => {
    let tree: ReturnType<typeof renderer.create>
    let resolveUnregisterPush: () => void = () => {}
    mockBackendUser({ withClub: true })
    mockUnregisterPushToken.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveUnregisterPush = resolve
      }),
    )

    await act(async () => {
      tree = renderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
    })

    await waitFor(() => {
      expect(latestAuth?.isSignedIn).toBe(true)
      expect(latestAuth?.user?.registrationRole).toBe('FREE_AGENT')
      expect(latestAuth?.token).toBe('token_123')
    })
    mockApi.mockClear()
    mockSetAuthExpiryHandlingSuspended.mockClear()

    let signOutResolved = false

    await act(async () => {
      await latestAuth!.signOut().then(() => {
        signOutResolved = true
      })
    })

    expect(signOutResolved).toBe(true)
    expect(latestAuth?.isSignedIn).toBe(false)
    expect(latestAuth?.user).toBeNull()
    expect(latestAuth?.memberships).toEqual([])
    expect(mockSetAuthExpiryHandlingSuspended).toHaveBeenCalledWith(true)
    expect(mockSetAuthExpiryHandlingSuspended).not.toHaveBeenCalledWith(false)
    expect(mockUnregisterPushToken).toHaveBeenCalledWith('http://api.test', 'token_123')
    expect(mockClerkSignOut).not.toHaveBeenCalled()
    expect(mockApi).not.toHaveBeenCalled()

    await act(async () => {
      resolveUnregisterPush()
      await Promise.resolve()
    })

    expect(mockClerkSignOut).toHaveBeenCalledTimes(1)

    act(() => {
      tree!.unmount()
    })
  })

  it('uses the same local reset for the global 401 sign-out handler', async () => {
    let tree: ReturnType<typeof renderer.create>

    await act(async () => {
      tree = renderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
    })

    await waitFor(() => {
      expect(latestAuth?.isSignedIn).toBe(true)
      expect(mockRegisteredSignOutHandler).toEqual(expect.any(Function))
    })

    await act(async () => {
      await mockRegisteredSignOutHandler?.()
    })

    expect(latestAuth?.isSignedIn).toBe(false)
    expect(latestAuth?.user).toBeNull()

    act(() => {
      tree!.unmount()
    })
  })

  it('does not expose pending team access as active team context', async () => {
    let tree: ReturnType<typeof renderer.create>
    mockBackendUser({
      withClub: true,
      teamMembers: [
        makeTeamMember({
          id: 'pending-coach-access',
          role: 'ASSISTANT_COACH',
          status: 'PENDING',
        }),
      ],
    })

    await act(async () => {
      tree = renderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
    })

    await waitFor(() => {
      expect(latestAuth?.activeClub?.club.id).toBe('club-1')
      expect(latestAuth?.activeTeamId).toBeNull()
      expect(latestAuth?.activeTeamAccess).toBeNull()
      expect(latestAuth?.teamsForActiveClub).toEqual([])
    })

    act(() => {
      tree!.unmount()
    })
  })

  it('selects the highest-priority active access for the selected team', async () => {
    let tree: ReturnType<typeof renderer.create>
    mockBackendUser({
      withClub: true,
      teamMembers: [
        makeTeamMember({
          id: 'parent-access',
          role: 'PARENT',
        }),
        makeTeamMember({
          id: 'coach-access',
          role: 'ASSISTANT_COACH',
        }),
      ],
    })

    await act(async () => {
      tree = renderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
    })

    await waitFor(() => {
      expect(latestAuth?.activeTeamId).toBe('team-1')
      expect(latestAuth?.activeTeamAccess?.id).toBe('coach-access')
      expect(latestAuth?.activeTeamAccess?.role).toBe('ASSISTANT_COACH')
      expect(latestAuth?.teamsForActiveClub).toHaveLength(1)
      expect(latestAuth?.teamsForActiveClub[0].id).toBe('coach-access')
    })

    act(() => {
      tree!.unmount()
    })
  })
})
