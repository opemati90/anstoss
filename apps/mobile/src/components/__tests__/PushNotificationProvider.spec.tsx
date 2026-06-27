import React from 'react'
import { Text } from 'react-native'
import renderer, { act } from 'react-test-renderer'
import { PushNotificationProvider } from '../PushNotificationProvider'

const mockUsePushNotifications = jest.fn().mockReturnValue({ lastNotification: null })

let mockAuthState = {
  token: 'token_123',
  memberships: [] as any[],
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
      token: 'token_123',
      memberships: [],
    }
  })

  it('defers push registration until the user has a club membership', () => {
    act(() => {
      renderer.create(<PushNotificationProvider><Text>child</Text></PushNotificationProvider>)
    })

    expect(mockUsePushNotifications).toHaveBeenCalledWith({
      apiUrl: 'http://localhost:3001',
      token: null,
    })
  })

  it('registers for push after the user has entered a club workspace', () => {
    mockAuthState = {
      token: 'token_123',
      memberships: [{ id: 'membership_1' }],
    }

    act(() => {
      renderer.create(<PushNotificationProvider><Text>child</Text></PushNotificationProvider>)
    })

    expect(mockUsePushNotifications).toHaveBeenCalledWith({
      apiUrl: 'http://localhost:3001',
      token: 'token_123',
    })
  })
})
