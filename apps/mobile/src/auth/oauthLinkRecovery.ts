import { ApiError } from '../api/client'

/** Only call in the linking flow. Ordinary OTP errors remain retryable here;
 * network failures and rate limits must not discard a usable linking ticket. */
export function mustRestartOAuthLink(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    ['OAUTH_LINK_EXPIRED', 'OAUTH_INVALID', 'OAUTH_UNAVAILABLE'].includes(error.code ?? '')
  )
}
