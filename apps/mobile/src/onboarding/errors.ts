import { ApiError } from '../api/client'

/**
 * Onboarding error mapping. Always by HTTP status and the server's stable
 * `code`, never by English message text (the API answers in English while the
 * app speaks six languages).
 */
export type ErrorCopy = { key: string; values?: Record<string, unknown> }

export function apiErrorCode(error: unknown): string | null {
  return error instanceof ApiError && typeof error.code === 'string' ? error.code : null
}

export function isStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status
}

/** The session behind this screen is gone (expired or revoked). */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/** Seconds the server asked us to wait, when it said so. */
export function retryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof ApiError)) return null
  const data = error.data as { error?: { retryAfterSeconds?: unknown } } | undefined
  const value = data?.error?.retryAfterSeconds
  return typeof value === 'number' && value > 0 ? value : null
}

/** i18n key for a failed "send me a code" request. */
export function sendCodeErrorKey(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return 'onboardingFlow.welcome.rateLimited'
  if (error instanceof ApiError && error.status === 0) return 'onboardingFlow.common.networkError'
  return 'onboardingFlow.welcome.sendFailed'
}

/**
 * A failed code check (M1): a wrong code, a burned code (five wrong tries,
 * ask for a new one), the hourly cap (wait the real time), the general rate
 * limit, a blocked under-16 address, or no connection.
 */
export function verifyCodeError(error: unknown): ErrorCopy & { resendNow?: boolean } {
  if (!(error instanceof ApiError) || error.status === 0) {
    return { key: 'onboardingFlow.common.networkError' }
  }
  const code = apiErrorCode(error)
  if (code === 'UNDERAGE_EMAIL_BLOCKED') return { key: 'onboardingFlow.code.underageBlocked' }
  if (error.status === 429) {
    if (code === 'OTP_CODE_LOCKED') return { key: 'onboardingFlow.code.codeLocked', resendNow: true }
    if (code === 'OTP_HOURLY_CAP') {
      const minutes = Math.max(1, Math.ceil((retryAfterSeconds(error) ?? 3600) / 60))
      return { key: 'onboardingFlow.code.hourlyCap', values: { count: minutes } }
    }
    return { key: 'onboardingFlow.code.tooManyAttempts' }
  }
  return { key: 'onboardingFlow.code.wrong' }
}

/** Kept for callers that only need the key. */
export function verifyCodeErrorKey(error: unknown): string {
  return verifyCodeError(error).key
}

export type InviteRedeemOutcome =
  | { kind: 'mismatch' }
  | { kind: 'alreadyMember' }
  | { kind: 'error'; key: string }

/** M9: invite redemption errors by status and code. */
export function inviteRedeemError(error: unknown): InviteRedeemOutcome {
  if (!(error instanceof ApiError) || error.status === 0) {
    return { kind: 'error', key: 'onboardingFlow.common.networkError' }
  }
  const code = apiErrorCode(error)
  if (code === 'INVITE_RECIPIENT_MISMATCH') return { kind: 'mismatch' }
  if (code === 'ALREADY_MEMBER') return { kind: 'alreadyMember' }
  if (code === 'UNDER_13') return { kind: 'error', key: 'onboardingFlow.age.under13Body' }
  if (code === 'GUARDIAN_UNDER_18') {
    return { kind: 'error', key: 'onboardingFlow.parentHandoff.parentTooYoung' }
  }
  if (error.status === 409 || error.status === 400 || error.status === 404) {
    return { kind: 'error', key: 'onboardingFlow.invite.usedBody' }
  }
  if (error.status === 429) return { kind: 'error', key: 'onboardingFlow.welcome.rateLimited' }
  return { kind: 'error', key: 'onboardingFlow.invite.redeemFailed' }
}
