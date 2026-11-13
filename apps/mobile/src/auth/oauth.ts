import type { OAuthProvider } from '@anstoss/shared'

/**
 * Sign in with Apple / Google (design board 03). The contract is
 * POST /auth/oauth/:provider { idToken } → the same session payload as
 * POST /auth/otp/verify (docs/redesign/BACKEND_GAPS.md). Until the server
 * and the native provider modules ship, the call throws
 * OAuthNotAvailableYetError and the sign-in screen shows "Bald verfügbar".
 */
export class OAuthNotAvailableYetError extends Error {
  readonly provider: OAuthProvider

  constructor(provider: OAuthProvider) {
    super(`Sign in with ${provider} is not available yet`)
    this.name = 'OAuthNotAvailableYetError'
    this.provider = provider
  }
}

export async function signInWithOAuth(provider: OAuthProvider): Promise<never> {
  throw new OAuthNotAvailableYetError(provider)
}
