import { useCallback, useRef } from 'react'
import { useSignIn, useSignUp } from '@clerk/clerk-expo'

type Mode = 'signup' | 'signin'
type IdentifierKind = 'phone' | 'email'

/**
 * Auto-detect whether a raw identifier is an email or a phone number.
 * Single source of truth — UI calls this so the visible label/keyboard
 * stays in sync with what we send to Clerk.
 */
export function classifyIdentifier(raw: string): IdentifierKind | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.includes('@')) return 'email'
  if (/^\+\d/.test(trimmed)) return 'phone'
  return null
}

/** Strip phone formatting (spaces, dashes, parens) for Clerk lookup. */
export function normalizeIdentifier(raw: string, kind: IdentifierKind | null): string {
  if (kind === 'email') return raw.trim().toLowerCase()
  if (kind === 'phone') return raw.replace(/[^\d+]/g, '')
  return raw.trim()
}

export function useOnboardingAuth() {
  const signUpHook = useSignUp()
  const signInHook = useSignIn()
  const modeRef = useRef<Mode>('signup')
  const kindRef = useRef<IdentifierKind>('phone')

  const isLoaded = signUpHook.isLoaded && signInHook.isLoaded

  /**
   * Start an OTP flow with either a phone number or an email. The
   * identifier kind is auto-detected via classifyIdentifier; callers can
   * pass an explicit `kind` to override (useful when the UI already
   * routed the input to a specific keyboard).
   */
  const startOtp = useCallback(
    async (
      identifier: string,
      requestedMode: Mode = 'signup',
      explicitKind?: IdentifierKind,
    ) => {
      if (!isLoaded) throw new Error('Auth not ready')
      const kind = explicitKind ?? classifyIdentifier(identifier)
      if (!kind) throw new Error('Enter a phone number (+49…) or an email address')
      kindRef.current = kind
      const normalized = normalizeIdentifier(identifier, kind)

      if (requestedMode === 'signin') {
        const { signIn } = signInHook
        if (!signIn) throw new Error('Auth not ready')
        const attempt = await signIn.create({ identifier: normalized })

        if (kind === 'phone') {
          const phoneFactor = attempt.supportedFirstFactors?.find(
            (f) => f.strategy === 'phone_code',
          ) as { phoneNumberId: string } | undefined
          if (!phoneFactor) throw new Error('Phone OTP not available for this number')
          await signIn.prepareFirstFactor({
            strategy: 'phone_code',
            phoneNumberId: phoneFactor.phoneNumberId,
          })
        } else {
          const emailFactor = attempt.supportedFirstFactors?.find(
            (f) => f.strategy === 'email_code',
          ) as { emailAddressId: string } | undefined
          if (!emailFactor) throw new Error('Email OTP not available for this account')
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          })
        }
        modeRef.current = 'signin'
        return
      }

      const { signUp } = signUpHook
      if (!signUp) throw new Error('Auth not ready')
      if (kind === 'phone') {
        await signUp.create({ phoneNumber: normalized })
        await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })
      } else {
        await signUp.create({ emailAddress: normalized })
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      }
      modeRef.current = 'signup'
    },
    [isLoaded, signInHook, signUpHook],
  )

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!isLoaded) throw new Error('Auth not ready')
      const kind = kindRef.current
      if (modeRef.current === 'signin') {
        const { signIn } = signInHook
        if (!signIn) throw new Error('Auth not ready')
        await signIn.attemptFirstFactor({
          strategy: kind === 'phone' ? 'phone_code' : 'email_code',
          code,
        })
        return
      }
      const { signUp } = signUpHook
      if (!signUp) throw new Error('Auth not ready')
      if (kind === 'phone') {
        await signUp.attemptPhoneNumberVerification({ code })
      } else {
        await signUp.attemptEmailAddressVerification({ code })
      }
    },
    [isLoaded, signInHook, signUpHook],
  )

  /**
   * Backward-compatible alias. Existing callers that pass a phone number
   * keep working unchanged; new callers should use `startOtp` to support
   * email too.
   */
  const startPhoneOtp = useCallback(
    (phone: string, requestedMode: Mode = 'signup') =>
      startOtp(phone, requestedMode, 'phone'),
    [startOtp],
  )

  /** Alias mirroring startPhoneOtp. */
  const verifyPhoneOtp = useCallback((code: string) => verifyOtp(code), [verifyOtp])

  const setBasicProfile = useCallback(
    async (input: { firstName: string }) => {
      if (!isLoaded) throw new Error('Auth not ready')
      if (modeRef.current === 'signin') return
      const { signUp } = signUpHook
      if (!signUp) throw new Error('Auth not ready')
      await signUp.update({ firstName: input.firstName })
    },
    [isLoaded, signUpHook],
  )

  /**
   * Seamless-onboarding core: activate the session the moment the signUp has
   * everything Clerk requires, instead of deferring `setActive` to the last
   * onboarding screen (the old behaviour that stranded users who abandoned the
   * wizard — they verified their OTP but no durable Clerk user was ever created,
   * so they couldn't sign in later).
   *
   * Returns `{ activated, missingFields }`:
   *  - activated=true  → the Clerk user + session are now live (durable).
   *  - activated=false → Clerk still needs `missingFields` (e.g. ['first_name'])
   *    before it will complete; collect only those, call `setBasicProfile`, then
   *    call this again.
   */
  const completeSignUpIfReady = useCallback(async (): Promise<{
    activated: boolean
    missingFields: string[]
  }> => {
    if (!isLoaded) throw new Error('Auth not ready')
    if (modeRef.current === 'signin') {
      const { signIn, setActive } = signInHook
      if (signIn?.createdSessionId && setActive) {
        await setActive({ session: signIn.createdSessionId })
        return { activated: true, missingFields: [] }
      }
      return { activated: false, missingFields: [] }
    }
    const { signUp, setActive } = signUpHook
    if (!signUp || !setActive) return { activated: false, missingFields: [] }
    if (signUp.status === 'complete' && signUp.createdSessionId) {
      await setActive({ session: signUp.createdSessionId })
      return { activated: true, missingFields: [] }
    }
    return { activated: false, missingFields: signUp.missingFields ?? [] }
  }, [isLoaded, signInHook, signUpHook])

  const finalizeSession = useCallback(async () => {
    if (!isLoaded) throw new Error('Auth not ready')
    if (modeRef.current === 'signin') {
      const { signIn, setActive } = signInHook
      if (!signIn?.createdSessionId || !setActive) {
        throw new Error('Session not ready after sign-in')
      }
      await setActive({ session: signIn.createdSessionId })
      return
    }
    const { signUp, setActive } = signUpHook
    // createdSessionId is null when Clerk requires additional fields
    // (e.g. firstName) before completing signup — status: 'missing_requirements'.
    // In that case the session is finalized later in done.tsx after the
    // wizard collects the required fields. Silently return here.
    if (!signUp?.createdSessionId || !setActive) return
    await setActive({ session: signUp.createdSessionId })
  }, [isLoaded, signInHook, signUpHook])

  return {
    startOtp,
    verifyOtp,
    startPhoneOtp,
    verifyPhoneOtp,
    setBasicProfile,
    finalizeSession,
    completeSignUpIfReady,
    isLoaded,
    mode: modeRef.current,
    identifierKind: kindRef.current,
  }
}
