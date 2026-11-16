import { registerPushTokenSchema, unregisterPushTokenSchema } from './platform'

describe('push registration lease validation', () => {
  const token = 'ExponentPushToken[test-device]'
  const registration = { id: 'registration-id', updatedAt: '2026-11-16T10:00:00.000Z' }
  it('accepts an explicit first claim and an exact returned lease', () => {
    expect(registerPushTokenSchema.parse({ token, platform: 'ios', registration: null }).registration).toBeNull()
    expect(unregisterPushTokenSchema.parse({ token, registration }).registration).toEqual(registration)
  })
  it('rejects malformed leases and fields beyond the public version identifier', () => {
    for (const bad of [{ ...registration, updatedAt: 'yesterday' }, { ...registration, id: '' },
      { ...registration, userId: 'another-user' }]) {
      expect(unregisterPushTokenSchema.safeParse({ token, registration: bad }).success).toBe(false)
    }
  })
})

describe('push token registration', () => {
  it.each(['ExponentPushToken[abc_123-xyz]', 'ExpoPushToken[abc_123-xyz]'])(
    'accepts supported Expo token format %s',
    (token) => {
      expect(registerPushTokenSchema.safeParse({ token, platform: 'android' }).success).toBe(true)
    },
  )

  it.each(['', 'invalid', 'ExpoPushToken[]', 'ExpoPushToken[with space]', 'ExpoPushToken[abc]\n'])(
    'rejects malformed tokens: %s',
    (token) => {
      expect(registerPushTokenSchema.safeParse({ token, platform: 'ios' }).success).toBe(false)
    },
  )
})
