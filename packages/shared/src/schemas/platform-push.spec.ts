import { registerPushTokenSchema } from './platform'

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
