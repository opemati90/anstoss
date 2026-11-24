import { Platform, TurboModuleRegistry } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as Apple from 'expo-apple-authentication'
import { api } from '../api/client'
import { setSessionToken } from './sessionToken'
import { completeOAuthLink, getOAuthAvailability, OAuthCancelledError, OAuthNotAvailableYetError,
  resendOAuthLink, signInWithOAuth, visibleOAuthProviders } from './oauth'

jest.mock('../api/client', () => ({ api: jest.fn() }))
jest.mock('./sessionToken', () => ({ setSessionToken: jest.fn() }))
jest.mock('expo-modules-core', () => ({
  // Availability is the boundary under test. Preserve Expo's other helpers:
  // its lazy fetch setup also calls requireNativeModule during Jest cleanup.
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: jest.fn(),
}))
jest.mock('expo-apple-authentication', () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true),
  signInAsync: jest.fn(), formatFullName: jest.fn().mockReturnValue('Player'),
  AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 },
}))
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn().mockResolvedValue(true),
    signOut: jest.fn().mockResolvedValue(null), signIn: jest.fn() },
  isSuccessResponse: (value: { type: string }) => value.type === 'success',
  isErrorWithCode: (value: unknown) => !!value && typeof value === 'object' && 'code' in value,
  statusCodes: { SIGN_IN_CANCELLED: 'CANCELLED' },
}))

describe('social login availability and session boundaries', () => {
  const originalPlatform = Platform.OS
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(api).mockReset() })
  afterEach(() => { jest.restoreAllMocks(); Platform.OS = originalPlatform })
  const all = { google: true, apple: true }
  const none = { google: false, apple: false }

  it('shows both available providers on iOS', () => {
    expect(visibleOAuthProviders('ios', all, all)).toEqual(all)
  })
  it('never shows Apple on Android', () => {
    expect(visibleOAuthProviders('android', all, all)).toEqual({ google: true, apple: false })
  })
  it('hides Google-only login on iOS until Apple is available', () => {
    expect(visibleOAuthProviders('ios', { google: true, apple: false }, all)).toEqual(none)
  })
  it('hides providers in old binaries with no native module', async () => {
    Platform.OS = 'ios'
    jest.mocked(api).mockResolvedValue(all)
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null)
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null)
    await expect(getOAuthAvailability()).resolves.toEqual(none)
    await expect(signInWithOAuth('google')).rejects.toBeInstanceOf(OAuthNotAvailableYetError)
  })
  it('fails closed when the server is unreachable', async () => {
    jest.mocked(api).mockRejectedValue(new Error('offline'))
    await expect(getOAuthAvailability()).resolves.toEqual(none)
    expect(setSessionToken).not.toHaveBeenCalled()
  })
  it('rejects non-boolean feature flags', async () => {
    jest.mocked(api).mockResolvedValue({ google: 'true', apple: 'false' })
    await expect(getOAuthAvailability()).resolves.toEqual(none)
  })
  it('stores a validated session after email linking', async () => {
    jest.mocked(api).mockResolvedValue({ kind: 'session', token: 'test-session' })
    await expect(completeOAuthLink('t'.repeat(43), '123456')).resolves.toEqual({ kind: 'session', token: 'test-session' })
    expect(setSessionToken).toHaveBeenCalledWith('test-session')
  })
  it.each([{ kind: 'session', token: '' }, { kind: 'session', token: 123 }, { kind: 'unknown', token: 'unexpected' }])(
    'rejects malformed session responses: %p', async (response) => {
      jest.mocked(api).mockResolvedValue(response)
      await expect(completeOAuthLink('t'.repeat(43), '123456')).rejects.toThrow()
      expect(setSessionToken).not.toHaveBeenCalled()
    },
  )
  it('does not save a session when linking is still required', async () => {
    jest.mocked(api).mockResolvedValue({ kind: 'link_required', ticket: 't'.repeat(43), email: 'test@example.com' })
    await completeOAuthLink('t'.repeat(43), '123456')
    expect(setSessionToken).not.toHaveBeenCalled()
  })
  it('rejects malformed proof input before sending it', async () => {
    await expect(completeOAuthLink('short', '123456')).rejects.toThrow()
    await expect(completeOAuthLink('t'.repeat(43), 'not-code')).rejects.toThrow()
    await expect(resendOAuthLink('short')).rejects.toThrow()
    expect(api).not.toHaveBeenCalled()
  })

  function nativeProviders(platform: 'ios' | 'android') {
    Platform.OS = platform
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({})
    jest.mocked(requireOptionalNativeModule).mockReturnValue({})
    jest.mocked(api).mockResolvedValueOnce(all)
  }
  it('exchanges Google identity tokens for Anstoss sessions and clears the SDK account', async () => {
    nativeProviders('android')
    jest.mocked(GoogleSignin.signIn).mockResolvedValue({ type: 'success', data: { idToken: 'google-token' } } as never)
    jest.mocked(api).mockResolvedValueOnce({ kind: 'session', token: 'anstoss-session' })
    await expect(signInWithOAuth('google')).resolves.toEqual({ kind: 'session', token: 'anstoss-session' })
    expect(api).toHaveBeenLastCalledWith('/auth/oauth/google', { method: 'POST', body: { idToken: 'google-token' } })
    expect(setSessionToken).toHaveBeenCalledWith('anstoss-session')
    expect(setSessionToken).not.toHaveBeenCalledWith('google-token')
    expect(GoogleSignin.signOut).toHaveBeenCalledTimes(2)
  })
  it('keeps existing-account proof pending without saving a session', async () => {
    nativeProviders('android')
    jest.mocked(GoogleSignin.signIn).mockResolvedValue({ type: 'success', data: { idToken: 'google-token' } } as never)
    const pending = { kind: 'link_required', ticket: 't'.repeat(43), email: 'player@example.com' }
    jest.mocked(api).mockResolvedValueOnce(pending)
    await expect(signInWithOAuth('google')).resolves.toEqual(pending)
    expect(setSessionToken).not.toHaveBeenCalled()
  })
  it('handles Google user cancellation without an API exchange', async () => {
    nativeProviders('android')
    jest.mocked(GoogleSignin.signIn).mockResolvedValue({ type: 'cancelled', data: null })
    await expect(signInWithOAuth('google')).rejects.toBeInstanceOf(OAuthCancelledError)
    expect(api).toHaveBeenCalledTimes(1)
    expect(setSessionToken).not.toHaveBeenCalled()
  })
  it('does not persist a session if the Google token is rejected', async () => {
    nativeProviders('android')
    jest.mocked(GoogleSignin.signIn).mockResolvedValue({ type: 'success', data: { idToken: 'google-token' } } as never)
    jest.mocked(api).mockRejectedValueOnce(new Error('Rejected'))
    await expect(signInWithOAuth('google')).rejects.toThrow('Rejected')
    expect(setSessionToken).not.toHaveBeenCalled()
    expect(GoogleSignin.signOut).toHaveBeenCalledTimes(2)
  })
  it('binds Apple login to the server nonce and exchanges the authorization code', async () => {
    nativeProviders('ios')
    const nonce = 'n'.repeat(43)
    jest.mocked(api).mockResolvedValueOnce({ nonce }).mockResolvedValueOnce({ kind: 'session', token: 'anstoss-session' })
    jest.mocked(Apple.signInAsync).mockResolvedValue({ state: nonce, identityToken: 'apple-token',
      authorizationCode: 'one-use-code', fullName: { givenName: 'Player' } } as never)
    await signInWithOAuth('apple')
    expect(Apple.signInAsync).toHaveBeenCalledWith(expect.objectContaining({ nonce, state: nonce }))
    expect(api).toHaveBeenLastCalledWith('/auth/oauth/apple', { method: 'POST', body: {
      idToken: 'apple-token', authorizationCode: 'one-use-code', nonce, fullName: 'Player',
    } })
    expect(setSessionToken).toHaveBeenCalledWith('anstoss-session')
  })
  it('rejects mismatched Apple state without an API exchange', async () => {
    nativeProviders('ios')
    jest.mocked(api).mockResolvedValueOnce({ nonce: 'n'.repeat(43) })
    jest.mocked(Apple.signInAsync).mockResolvedValue({ state: 'different', identityToken: 'apple-token', authorizationCode: 'code' } as never)
    await expect(signInWithOAuth('apple')).rejects.toThrow('incomplete credential')
    expect(api).toHaveBeenCalledTimes(2)
    expect(setSessionToken).not.toHaveBeenCalled()
  })
  it('handles Apple cancellation without saving a session', async () => {
    nativeProviders('ios')
    jest.mocked(api).mockResolvedValueOnce({ nonce: 'n'.repeat(43) })
    jest.mocked(Apple.signInAsync).mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
    await expect(signInWithOAuth('apple')).rejects.toBeInstanceOf(OAuthCancelledError)
    expect(setSessionToken).not.toHaveBeenCalled()
  })
})
