import React from 'react'
import { Text } from 'react-native'
import renderer, { act } from 'react-test-renderer'
import { PushNotificationProvider } from '../PushNotificationProvider'

const mockUsePushNotifications = jest.fn().mockReturnValue({ lastNotification: null })

let mockAuthState = {
  user: null as { dateOfBirth: string; registrationRole: string } | null,
  token: 'token_123',
  memberships: [] as any[],
  pendingJoinRequest: null as { id: string; clubId: string } | null,
  pendingClubClaim: null as { id: string } | null,
}

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

jest.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: (options: unknown) => mockUsePushNotifications(options),
}))

jest.mock('../../api/client', () => ({
  API_URL: 'http://localhost:3001',
}))

describe('PushNotificationProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthState = {
      user: null,
      token: 'token_123',
      memberships: [],
      pendingJoinRequest: null,
      pendingClubClaim: null,
    }
  })

  it('defers push registration until the user has a club membership', () => {
    act(() => {
      renderer.create(
        <PushNotificationProvider>
          <Text>child</Text>
        </PushNotificationProvider>,
      )
    })

    expect(mockUsePushNotifications).toHaveBeenCalledWith({
      apiUrl: 'http://localhost:3001',
      token: null,
    })
  })

  it('registers for push after the user has entered a club workspace', () => {
    mockAuthState = {
      ...mockAuthState,
      token: 'token_123',
      memberships: [{ id: 'membership_1' }],
    }

    act(() => {
      renderer.create(
        <PushNotificationProvider>
          <Text>child</Text>
        </PushNotificationProvider>,
      )
    })

    expect(mockUsePushNotifications).toHaveBeenCalledWith({
      apiUrl: 'http://localhost:3001',
      token: 'token_123',
    })
  })

  it('registers while awaiting approval, before membership exists', () => {
    mockAuthState.pendingJoinRequest = { id: 'request-1', clubId: 'club-1' }
    act(() => {
      renderer.create(
        <PushNotificationProvider>
          <Text>waiting</Text>
        </PushNotificationProvider>,
      )
    })
    expect(mockUsePushNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'token_123' }),
    )
  })

  it.each(['FREE_AGENT', 'COACH', 'PLAYER', 'CLUB_ADMIN'])(
    'registers a completed %s account without a club',
    (registrationRole) => {
      mockAuthState.user = { registrationRole, dateOfBirth: '1990-05-23' }
      act(() => {
        renderer.create(
          <PushNotificationProvider>
            <Text>portal</Text>
          </PushNotificationProvider>,
        )
      })
      expect(mockUsePushNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token_123' }),
      )
    },
  )
})
