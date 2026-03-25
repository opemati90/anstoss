import * as SecureStore from 'expo-secure-store'
import type { TokenCache } from '@clerk/clerk-expo'

/**
 * Clerk token cache backed by expo-secure-store.
 * Tokens are encrypted at rest on the device.
 */
export const tokenCache: TokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      // SecureStore can fail on some devices — non-fatal
    }
  },
}
