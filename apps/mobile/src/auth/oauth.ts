import { Platform, TurboModuleRegistry } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { oauthAvailabilitySchema, oauthLinkSchema, oauthNonceSchema, oauthSignInResultSchema,
  oauthSignInSchema, oauthTicketSchema, type OAuthProvider, type OAuthSignInResult } from '@anstoss/shared'
import { api } from '../api/client'
import { setSessionToken } from './sessionToken'

// Public client IDs, not secrets. Restricted to the Anstoss project.
const GOOGLE_WEB_CLIENT = '387307271714-6um2fcotjbrr8p3eo5754f416iao6e5k.apps.googleusercontent.com'
const GOOGLE_IOS_CLIENT = '387307271714-7ucmis3qn03b8canv0ucijfk98imhvbm.apps.googleusercontent.com'
export type OAuthAvailability = { google: boolean; apple: boolean }
export class OAuthNotAvailableYetError extends Error {
  constructor(readonly provider: OAuthProvider) { super('Sign in with your email for now'); this.name = 'OAuthNotAvailableYetError' }
}
export class OAuthCancelledError extends Error {
  constructor() { super('Sign-in cancelled'); this.name = 'OAuthCancelledError' }
}

// Keep native imports behind availability checks. Metro bundles these modules,
// but older binaries must never evaluate a missing module's native binding.
function appleSdk(): typeof import('expo-apple-authentication') {
  return require('expo-apple-authentication')
}
function googleSdk(): typeof import('@react-native-google-signin/google-signin') {
  return require('@react-native-google-signin/google-signin')
}

export function visibleOAuthProviders(platform: string, server: OAuthAvailability, native: OAuthAvailability): OAuthAvailability {
  const apple = platform === 'ios' && server.apple && native.apple
  // Don't expose Google-only login on iOS while Apple is unavailable.
  return { apple, google: server.google && native.google && (platform === 'android' || apple) }
}

export async function getOAuthAvailability(): Promise<OAuthAvailability> {
  try {
    const server = oauthAvailabilitySchema.parse(await api<unknown>('/auth/oauth/availability'))
    const google = Boolean(TurboModuleRegistry.get('RNGoogleSignin'))
    const appleModule = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoAppleAuthentication')
    const apple = Boolean(appleModule && await appleSdk().isAvailableAsync())
    return visibleOAuthProviders(Platform.OS, server, { google, apple })
  } catch { return { google: false, apple: false } }
}

async function saveResult(response: unknown): Promise<OAuthSignInResult> {
  const result = oauthSignInResultSchema.parse(response)
  if (result.kind === 'session') {
    if (!result.token) throw new Error('Sign-in returned no session')
    await setSessionToken(result.token)
  }
  return result
}

export async function signInWithOAuth(provider: OAuthProvider): Promise<OAuthSignInResult> {
  if (!(await getOAuthAvailability())[provider]) throw new OAuthNotAvailableYetError(provider)
  if (provider === 'google') {
    // Lazy load only after native availability is confirmed: safe for old binaries.
    const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = googleSdk()
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT, iosClientId: GOOGLE_IOS_CLIENT, offlineAccess: false })
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      await GoogleSignin.signOut()
      const credential = await GoogleSignin.signIn()
      if (!isSuccessResponse(credential)) throw new OAuthCancelledError()
      if (!credential.data.idToken) throw new Error('Google returned no identity token')
      const body = oauthSignInSchema.parse({ idToken: credential.data.idToken })
      return await saveResult(await api<OAuthSignInResult>('/auth/oauth/google', { method: 'POST', body }))
    } catch (error) {
      if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) throw new OAuthCancelledError()
      throw error
    } finally {
      // Anstoss sessions live in SecureStore. Don't silently restore the previous
      // person's Google SDK session when the next person uses this phone.
      await GoogleSignin.signOut().catch(() => undefined)
    }
  }
  const Apple = appleSdk()
  const { nonce } = oauthNonceSchema.parse(await api<unknown>('/auth/oauth/apple/challenge', { method: 'POST' }))
  try {
    const credential = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.EMAIL, Apple.AppleAuthenticationScope.FULL_NAME],
      nonce, state: nonce,
    })
    if (credential.state !== nonce || !credential.identityToken || !credential.authorizationCode) {
      throw new Error('Apple returned an incomplete credential')
    }
    const fullName = credential.fullName ? Apple.formatFullName(credential.fullName).trim().slice(0, 120) : undefined
    const body = oauthSignInSchema.parse({ idToken: credential.identityToken,
      authorizationCode: credential.authorizationCode, nonce, fullName: fullName || undefined })
    return await saveResult(await api<OAuthSignInResult>('/auth/oauth/apple', { method: 'POST', body }))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') throw new OAuthCancelledError()
    throw error
  }
}

export async function completeOAuthLink(ticket: string, code: string) {
  const body = oauthLinkSchema.parse({ ticket, code })
  return saveResult(await api<unknown>('/auth/oauth/link', { method: 'POST', body }))
}
export async function resendOAuthLink(ticket: string) {
  await api('/auth/oauth/link/resend', { method: 'POST', body: oauthTicketSchema.parse({ ticket }) })
}
