import { useCallback, useRef } from 'react'
import { api } from '../api/client'
import { setSessionToken } from './sessionToken'

type Mode = 'signup' | 'signin'
type IdentifierKind = 'phone' | 'email'

/**
 * Auto-detect whether a raw identifier is an email or a phone number.
 * Single source of truth — UI calls this so the visible label/keyboard
 * stays in sync with what we send to the backend. The custom email-OTP
 * backend is EMAIL ONLY; phone is detected purely so the UI can show the
 * "phone coming soon" hint, never sent to the server.
 */
export function classifyIdentifier(raw: string): IdentifierKind | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.includes('@')) return 'email'
  const phoneCandidate = trimmed.replace(/[^\d+]/g, '')
  const digitCount = phoneCandidate.replace(/\D/g, '').length
  if (/^[+\d\s()./-]+$/.test(trimmed) && digitCount >= 7) return 'phone'
  return null
}

/** Normalize an identifier. Email is trimmed + lowercased. */
export function normalizeIdentifier(raw: string, kind: IdentifierKind | null): string {
  if (kind === 'email') return raw.trim().toLowerCase()
  if (kind === 'phone') {
    let compact = raw.trim().replace(/[^\d+]/g, '')
    if (compact.startsWith('00')) compact = `+${compact.slice(2)}`
    if (compact.startsWith('+490')) return `+49${compact.slice(4)}`
    if (compact.startsWith('0')) return `+49${compact.slice(1)}`
    return compact
  }
  return raw.trim()
}

type OtpVerifyResponse = {
  token: string
  user: { id: string; clerkId: string; email: string; name: string }
}

/**
 * Custom email-OTP onboarding hook. Backed by the app's own backend:
 *   - startOtp  → POST /auth/otp/request { email }
 *   - verifyOtp → POST /auth/otp/verify  { email, code }
 *
 * There is no longer a sign-in vs sign-up distinction (the backend mints or
 * resolves the user transparently), so the `mode` argument is accepted for
 * call-site compatibility but ignored. On a successful verify the returned
 * JWT is persisted via `setSessionToken`, which AuthContext observes to
 * transition the app to signed-in and load the profile/memberships.
 */
export function useOnboardingAuth() {
  // The email is captured at startOtp and reused at verifyOtp. Phone is never
  // sent — email-only backend.
  const emailRef = useRef<string>('')
  const kindRef = useRef<IdentifierKind>('email')
  const modeRef = useRef<Mode>('signin')

  const startOtp = useCallback(
    async (
      identifier: string,
      requestedMode: Mode = 'signin',
      explicitKind?: IdentifierKind,
    ) => {
      const kind = explicitKind ?? classifyIdentifier(identifier)
      if (!kind) throw new Error('Enter an email address')
      if (kind === 'phone') {
        // Email-only backend — phone is blocked at the UI layer, but guard here
        // too so a phone identifier never reaches the request endpoint.
        throw new Error('Phone sign-in is not available — please use your email')
      }
      const email = normalizeIdentifier(identifier, kind)
      emailRef.current = email
      kindRef.current = kind
      modeRef.current = requestedMode

      // Always returns 200 { ok: true } (no account enumeration). Network /
      // server errors still throw and surface to the caller.
      await api('/auth/otp/request', { method: 'POST', body: { email } })
    },
    [],
  )

  const verifyOtp = useCallback(async (code: string) => {
    const email = emailRef.current
    if (!email) throw new Error('Start the code flow before verifying')
    // 400/401 on failure → ApiError thrown → caller shows the surfaced error.
    const result = await api<OtpVerifyResponse>('/auth/otp/verify', {
      method: 'POST',
      body: { email, code },
    })
    if (!result?.token) throw new Error('Verification did not return a session')
    // Persist the JWT. AuthContext subscribes to session-token changes and
    // transitions to signed-in + loads /me when this fires.
    await setSessionToken(result.token)
  }, [])

  /** Backward-compatible alias kept for any phone-era callers. */
  const startPhoneOtp = useCallback(
    (phone: string, requestedMode: Mode = 'signin') =>
      startOtp(phone, requestedMode, 'phone'),
    [startOtp],
  )

  const verifyPhoneOtp = useCallback((code: string) => verifyOtp(code), [verifyOtp])

  /**
   * Profile fields are persisted via PATCH /me by the onboarding screens
   * (about.tsx / done.tsx). With the custom backend there is no separate
   * provider-side "set first name" step, so this is a no-op kept for
   * call-site compatibility.
   */
  const setBasicProfile = useCallback(async (_input: { firstName: string }) => {
    // no-op — profile is written via PATCH /me downstream
  }, [])

  /**
   * The session is already live the moment verifyOtp stores the JWT, so there
   * is nothing left to "activate". Reported as activated so existing callers
   * (sign-in.tsx) route forward; no missing fields with the custom backend.
   */
  const completeSignUpIfReady = useCallback(async (): Promise<{
    activated: boolean
    missingFields: string[]
  }> => {
    return { activated: true, missingFields: [] }
  }, [])

  /** No-op — the session token is persisted at verify time. */
  const finalizeSession = useCallback(async () => {
    // intentionally empty: token already stored in verifyOtp
  }, [])

  return {
    startOtp,
    verifyOtp,
    startPhoneOtp,
    verifyPhoneOtp,
    setBasicProfile,
    finalizeSession,
    completeSignUpIfReady,
    isLoaded: true,
    mode: modeRef.current,
    identifierKind: kindRef.current,
  }
}
