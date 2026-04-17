import * as SecureStore from 'expo-secure-store'
import { tokenCache } from './token-cache'

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}))

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>

describe('tokenCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reads and writes tokens through SecureStore', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce('token-1')

    await expect(tokenCache.getToken('session')).resolves.toBe('token-1')
    await tokenCache.saveToken('session', 'token-2')

    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('session')
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('session', 'token-2')
  })

  it('treats SecureStore failures as non-fatal', async () => {
    mockSecureStore.getItemAsync.mockRejectedValueOnce(new Error('locked'))
    mockSecureStore.setItemAsync.mockRejectedValueOnce(new Error('locked'))

    await expect(tokenCache.getToken('session')).resolves.toBeNull()
    await expect(tokenCache.saveToken('session', 'token-2')).resolves.toBeUndefined()
  })
})
