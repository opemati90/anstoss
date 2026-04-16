import { useEffect, useRef, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RegistrationRole, type PublicInvitePayload } from '@anstoss/shared'
import { isClerkAPIResponseError, useSignIn, useSignUp } from '@clerk/clerk-expo'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../src/components/LanguageSwitch'
import { StepIndicator } from '../../src/components/StepIndicator'
import { FormInput } from '../../src/components/FormInput'
import { InlineError } from '../../src/components/InlineError'
import { api, ApiError } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { activateE2EPostSignupRole, isE2ESupported } from '../../src/e2e/session'
import { getAppLanguage, setAppLanguage, type AppLanguage } from '../../src/i18n'
import { illustrations } from '../../src/illustrations'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Button, Text, Icon, type IconName } from '../../src/components/ui'
import { fontSize, lineHeight, space, radius, fonts, hairline } from '../../src/theme/tokens'
import {
  resolveVerificationAttempt,
  type UnsupportedVerificationResolution,
} from '../../src/utils/authFlow'
import { waitForSessionToken } from '../../src/utils/clerkSession'
import { formatDateOfBirthInput, parseDateOfBirthInput } from '../../src/utils/dateOfBirth'
import { isValidEmail } from '../../src/utils/email'

type Step = 'email' | 'code' | 'profile' | 'dob' | 'intent'
type AuthMode = 'login' | 'signup'
type VerificationFlow = 'sign-in' | 'sign-up' | null
const ROLE_FINALIZATION_RETRY_DELAY_MS = 350

const SIGNUP_STEPS: Step[] = ['email', 'code', 'profile', 'dob', 'intent']

function getSignupStepNumber(step: Step): number {
  const idx = SIGNUP_STEPS.indexOf(step)
  return idx >= 0 ? idx + 1 : 1
}

const INTENT_OPTIONS: Array<{
  role: RegistrationRole
  icon: IconName
  titleKey: string
  bodyKey: string
}> = [
  {
    role: RegistrationRole.PLAYER,
    icon: 'figure.soccer',
    titleKey: 'auth.intentPlayer',
    bodyKey: 'auth.intentPlayerBody',
  },
  {
    role: RegistrationRole.PARENT,
    icon: 'person.2',
    titleKey: 'auth.intentParent',
    bodyKey: 'auth.intentParentBody',
  },
  {
    role: RegistrationRole.COACH,
    icon: 'list.clipboard',
    titleKey: 'auth.intentCoach',
    bodyKey: 'auth.intentCoachBody',
  },
  {
    role: RegistrationRole.CLUB_ADMIN,
    icon: 'shield',
    titleKey: 'auth.intentClubAdmin',
    bodyKey: 'auth.intentClubAdminBody',
  },
  {
    role: RegistrationRole.FREE_AGENT,
    icon: 'person',
    titleKey: 'auth.intentFreeAgent',
    bodyKey: 'auth.intentFreeAgentBody',
  },
]

class UnsupportedClerkFlowError extends Error {
  constructor(readonly resolution: UnsupportedVerificationResolution) {
    super(`Unsupported Clerk ${resolution.flow} state: ${resolution.status ?? 'unknown'}`)
    this.name = 'UnsupportedClerkFlowError'
  }
}

function isIdentifierNotFoundError(error: unknown) {
  return (
    isClerkAPIResponseError(error) &&
    error.errors.some((entry) => entry.code === 'form_identifier_not_found')
  )
}

function isIdentifierExistsError(error: unknown) {
  return (
    isClerkAPIResponseError(error) &&
    error.errors.some((entry) => entry.code === 'form_identifier_exists')
  )
}

function isSessionExistsError(error: unknown) {
  return (
    isClerkAPIResponseError(error) &&
    error.errors.some(
      (entry) =>
        entry.code === 'session_exists' ||
        entry.message?.toLowerCase().includes('already signed in'),
    )
  )
}

function isRetryableRoleFinalizationError(error: unknown) {
  if (error instanceof ApiError) return error.status >= 500
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const s = (error as { status?: unknown }).status
    return typeof s === 'number' && s >= 500
  }
  return false
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function mapInviteRoleToRegistrationRole(role: PublicInvitePayload['role']): RegistrationRole {
  if (role === 'PARENT') return RegistrationRole.PARENT
  if (role === 'HEAD_COACH' || role === 'ASSISTANT_COACH') return RegistrationRole.COACH
  return RegistrationRole.PLAYER
}

function getClerkErrorMessage(error: unknown): string | null {
  if (isClerkAPIResponseError(error)) {
    return (
      error.errors
        .map((entry) => entry.longMessage || entry.message || entry.code)
        .find((entry): entry is string => Boolean(entry)) ?? null
    )
  }
  if (error instanceof Error) return error.message
  return null
}

export default function SignInScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    inviteCode?: string | string[]
    joinClubSlug?: string | string[]
    mode?: string | string[]
    e2eBypass?: string | string[]
  }>()
  const { t } = useTranslation()
  const { isSignedIn, refreshUser } = useAuth()
  const insets = useSafeAreaInsets()
  const c = useClubColors()
  const inviteCode = Array.isArray(params.inviteCode) ? params.inviteCode[0] : params.inviteCode
  const joinClubSlug = Array.isArray(params.joinClubSlug)
    ? params.joinClubSlug[0]
    : params.joinClubSlug
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const e2eBypassParam = Array.isArray(params.e2eBypass) ? params.e2eBypass[0] : params.e2eBypass
  const requestedMode: AuthMode | null =
    modeParam === 'signup' ? 'signup' : modeParam === 'login' ? 'login' : null
  const e2eBypassEnabled = isE2ESupported() && (e2eBypassParam === '1' || e2eBypassParam === 'true')

  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn()
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp()

  // Core state
  const [mode, setMode] = useState<AuthMode>(inviteCode ? 'signup' : requestedMode || 'login')
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [dobText, setDobText] = useState('')
  const [selectedRole, setSelectedRole] = useState<RegistrationRole | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [useCodeLogin, setUseCodeLogin] = useState(false)

  // Inline errors
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [dobError, setDobError] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)

  // Clerk state
  const [flow, setFlow] = useState<VerificationFlow>(null)
  const [signInEmailAddressId, setSignInEmailAddressId] = useState<string | null>(null)
  const [postSignUpSessionToken, setPostSignUpSessionToken] = useState<string | null>(null)
  const [inviteRegistrationRole, setInviteRegistrationRole] = useState<RegistrationRole | null>(
    null,
  )
  const [showPassword, setShowPassword] = useState(false)

  const postSignUpRedirectHoldRef = useRef(false)
  const isClerkReady = isSignInLoaded && isSignUpLoaded
  const currentLanguage: AppLanguage = getAppLanguage()

  const shouldHoldRedirect = mode === 'signup' && postSignUpRedirectHoldRef.current

  // Invite code lookup
  useEffect(() => {
    if (!inviteCode) return
    let cancelled = false
    void api<PublicInvitePayload>(`/public/invites/${inviteCode}`)
      .then((payload) => {
        if (!cancelled) setInviteRegistrationRole(mapInviteRoleToRegistrationRole(payload.role))
      })
      .catch(() => {
        if (!cancelled) {
          setInviteRegistrationRole(RegistrationRole.PLAYER)
          if (__DEV__) console.warn('[auth] invite role lookup failed, defaulting to PLAYER')
        }
      })
    return () => {
      cancelled = true
    }
  }, [inviteCode])

  // Redirect when signed in
  useEffect(() => {
    if (!isSignedIn || shouldHoldRedirect) return
    if (inviteCode) {
      router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })
      return
    }
    if (joinClubSlug) {
      router.replace({ pathname: '/join-club', params: { slug: joinClubSlug } })
      return
    }
    router.replace('/')
  }, [inviteCode, isSignedIn, joinClubSlug, router, shouldHoldRedirect])

  // Sync mode from params
  useEffect(() => {
    const nextMode = inviteCode ? 'signup' : requestedMode
    if (!nextMode || nextMode === mode) return
    setMode(nextMode)
    resetAll()
  }, [inviteCode, mode, requestedMode])

  const clearErrors = () => {
    setEmailError(null)
    setPasswordError(null)
    setNameError(null)
    setCodeError(null)
    setDobError(null)
    setRoleError(null)
    setGeneralError(null)
  }

  const resetAll = () => {
    postSignUpRedirectHoldRef.current = false
    setStep('email')
    setCode('')
    setPassword('')
    setName('')
    setDobText('')
    setFlow(null)
    setSignInEmailAddressId(null)
    setSelectedRole(null)
    setPostSignUpSessionToken(null)
    setUseCodeLogin(false)
    setShowPassword(false)
    clearErrors()
  }

  const handleModeChange = (nextMode: AuthMode) => {
    if (nextMode === mode || isLoading) return
    setMode(nextMode)
    resetAll()
  }

  const handleLanguageChange = async (language: AppLanguage) => {
    if (language === currentLanguage || isLoading) return
    await setAppLanguage(language)
  }

  // ── Clerk sign-in with password ──
  const handlePasswordLogin = async () => {
    clearErrors()
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setEmailError(t('auth.invalidEmailBody'))
      return
    }
    if (!password) {
      setPasswordError(t('auth.passwordRequired'))
      return
    }
    if (!isClerkReady || !signIn || !setSignInActive) {
      setGeneralError(t('auth.authNotReady'))
      return
    }

    setIsLoading(true)
    try {
      const result = await signIn.create({
        identifier: normalizedEmail,
        password,
      })

      if (result.status === 'complete' && result.createdSessionId) {
        await setSignInActive({ session: result.createdSessionId })
        const sessionToken = await waitForSessionToken()
        if (!sessionToken) throw new Error(t('auth.sessionNotReady'))
        await refreshUser(sessionToken, { throwOnError: true })
        if (inviteCode) {
          router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })
        } else if (joinClubSlug) {
          router.replace({ pathname: '/join-club', params: { slug: joinClubSlug } })
        } else {
          router.replace('/')
        }
        return
      }

      // Password worked but needs additional factor (shouldn't happen, but handle gracefully)
      // Fall back to code-based verification
      setUseCodeLogin(true)
      await startCodeSignIn(normalizedEmail)
    } catch (error) {
      if (isIdentifierNotFoundError(error)) {
        setMode('signup')
        resetAll()
        setEmail(normalizedEmail)
        setGeneralError(t('auth.noAccountBody'))
        return
      }
      if (isSessionExistsError(error)) {
        try {
          const sessionToken = await waitForSessionToken()
          await refreshUser(sessionToken || undefined, { throwOnError: true })
          router.replace('/')
        } catch {
          setGeneralError(t('auth.accountSyncError'))
        }
        return
      }
      if (error instanceof ApiError) {
        setGeneralError(t('auth.accountSyncError'))
        return
      }
      const msg = getClerkErrorMessage(error)
      setPasswordError(msg || t('auth.passwordIncorrect'))
    } finally {
      setIsLoading(false)
    }
  }

  // ── Clerk sign-in with code (fallback) ──
  const startCodeSignIn = async (normalizedEmail: string) => {
    if (!signIn || !setSignInActive) throw new Error(t('auth.authNotReady'))

    const signInAttempt = await signIn.create({ identifier: normalizedEmail })

    type SupportedFactor = NonNullable<typeof signInAttempt.supportedFirstFactors>[number]
    type EmailCodeFactor = Extract<SupportedFactor, { strategy: 'email_code' }>

    const factors = signIn.supportedFirstFactors?.length
      ? signIn.supportedFirstFactors
      : signInAttempt.supportedFirstFactors

    const emailFactor = factors?.find((f) => f.strategy === 'email_code') as
      | EmailCodeFactor
      | undefined

    if (!emailFactor) throw new Error(t('auth.emailCodeNotEnabled'))

    await signIn.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailFactor.emailAddressId,
    })

    setFlow('sign-in')
    setSignInEmailAddressId(emailFactor.emailAddressId)
    setStep('code')
    setCode('')
  }

  // ── Clerk sign-up: email step ──
  const handleSignupEmail = async () => {
    clearErrors()
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setEmailError(t('auth.invalidEmailBody'))
      return
    }

    if (e2eBypassEnabled) {
      setFlow('sign-up')
      setStep('code')
      setCode('')
      return
    }

    if (!isClerkReady || !signUp) {
      setGeneralError(t('auth.authNotReady'))
      return
    }

    setIsLoading(true)
    try {
      await signUp.create({ emailAddress: normalizedEmail })
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setFlow('sign-up')
      setStep('code')
      setCode('')
    } catch (error) {
      if (isSessionExistsError(error)) {
        const sessionToken = await waitForSessionToken()
        await refreshUser(sessionToken || undefined)
        router.replace('/')
        return
      }
      if (isIdentifierExistsError(error)) {
        setMode('login')
        resetAll()
        setEmail(normalizedEmail)
        setGeneralError(t('auth.accountExistsBody'))
        return
      }
      const msg = getClerkErrorMessage(error)
      setEmailError(msg || t('auth.sendCodeErrorBody'))
    } finally {
      setIsLoading(false)
    }
  }

  // ── Handle email step submit ──
  const handleEmailSubmit = async () => {
    if (mode === 'login') {
      if (useCodeLogin) {
        // Code-based login
        clearErrors()
        const normalizedEmail = email.trim().toLowerCase()
        if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
          setEmailError(t('auth.invalidEmailBody'))
          return
        }
        if (!isClerkReady) {
          setGeneralError(t('auth.authNotReady'))
          return
        }
        setIsLoading(true)
        try {
          await startCodeSignIn(normalizedEmail)
        } catch (error) {
          if (isIdentifierNotFoundError(error)) {
            setMode('signup')
            resetAll()
            setEmail(normalizedEmail)
            setGeneralError(t('auth.noAccountBody'))
            return
          }
          const msg = getClerkErrorMessage(error)
          setEmailError(msg || t('auth.sendCodeErrorBody'))
        } finally {
          setIsLoading(false)
        }
      } else {
        await handlePasswordLogin()
      }
    } else {
      await handleSignupEmail()
    }
  }

  // ── Verify code ──
  const handleVerifyCode = async () => {
    clearErrors()
    if (!code.trim()) {
      setCodeError(t('auth.verifyCodeErrorBody'))
      return
    }

    // E2E bypass
    if (mode === 'signup' && e2eBypassEnabled) {
      setPostSignUpSessionToken('e2e-signup-token')
      // Skip profile step in e2e, go straight to DOB or intent
      setStep('dob')
      setCode('')
      return
    }

    if (!isClerkReady) {
      setGeneralError(t('auth.authNotReady'))
      return
    }

    setIsLoading(true)
    try {
      if (mode === 'login') {
        // Sign-in code verification
        if (!signIn || !setSignInActive) throw new Error(t('auth.authNotReady'))
        const attempt = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: code.trim(),
        })
        const resolution = resolveVerificationAttempt('sign-in', attempt)
        if (resolution.kind !== 'session') throw new UnsupportedClerkFlowError(resolution)

        await setSignInActive({ session: resolution.sessionId })
        const sessionToken = await waitForSessionToken()
        if (!sessionToken) throw new Error(t('auth.sessionNotReady'))
        await refreshUser(sessionToken, { throwOnError: true })
        if (inviteCode) {
          router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })
        } else if (joinClubSlug) {
          router.replace({ pathname: '/join-club', params: { slug: joinClubSlug } })
        } else {
          router.replace('/')
        }
        return
      }

      // Sign-up code verification
      if (!signUp || !setSignUpActive) throw new Error(t('auth.authNotReady'))
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() })

      if (attempt.status === 'complete' && attempt.createdSessionId) {
        // No password required by Clerk, session is ready
        // Still go to profile step for name collection, but password is optional
        postSignUpRedirectHoldRef.current = true
        await setSignUpActive({ session: attempt.createdSessionId })
        const sessionToken = await waitForSessionToken()
        if (!sessionToken) throw new Error(t('auth.sessionNotReady'))
        setPostSignUpSessionToken(sessionToken)
        setStep('profile')
        setCode('')
        return
      }

      // Status is missing_requirements, need password/name
      setStep('profile')
      setCode('')
    } catch (error) {
      if (error instanceof UnsupportedClerkFlowError) {
        setGeneralError(
          error.resolution.flow === 'sign-up'
            ? t('auth.unsupportedSignUpStateBody', {
                requirements:
                  [...error.resolution.missingFields, ...error.resolution.unverifiedFields].join(
                    ', ',
                  ) || t('auth.unsupportedSignUpStateFallback'),
              })
            : t('auth.unsupportedSignInStateBody', {
                status: error.resolution.status || t('auth.unknownStatus'),
              }),
        )
      } else if (error instanceof ApiError && error.code === 'UPGRADE_REQUIRED') {
        // ForceUpdateScreen in _layout.tsx handles this
      } else if (error instanceof ApiError) {
        setGeneralError(t('auth.accountSyncError'))
      } else {
        const msg = getClerkErrorMessage(error)
        setCodeError(msg || t('auth.verifyCodeErrorBody'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ── Profile step: name + password ──
  const handleProfile = async () => {
    clearErrors()
    if (!name.trim()) {
      setNameError(t('auth.nameRequired'))
      return
    }
    if (!postSignUpSessionToken && !password) {
      // If we don't have a session yet, password is required (Clerk needs it)
      setPasswordError(t('auth.passwordRequired'))
      return
    }
    if (password && password.length < 8) {
      setPasswordError(t('auth.passwordTooShort'))
      return
    }

    setIsLoading(true)
    try {
      if (postSignUpSessionToken) {
        // Session already active (Clerk didn't require password). Update name via our API.
        await api('/me', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${postSignUpSessionToken}` },
          body: { name: name.trim() },
        })
        // If user entered a password optionally, set it via Clerk
        if (password && signUp) {
          try {
            await signUp.update({ password })
          } catch {
            if (__DEV__) console.warn('[auth] optional password update failed')
          }
        }
        setStep('dob')
        return
      }

      // Session not active yet, need to complete Clerk signup with password
      if (!signUp || !setSignUpActive) throw new Error(t('auth.authNotReady'))

      const updateResult = await signUp.update({
        password,
        firstName: name.trim(),
      })

      if (updateResult.status === 'complete' && updateResult.createdSessionId) {
        postSignUpRedirectHoldRef.current = true
        await setSignUpActive({ session: updateResult.createdSessionId })
        const sessionToken = await waitForSessionToken()
        if (!sessionToken) throw new Error(t('auth.sessionNotReady'))
        setPostSignUpSessionToken(sessionToken)

        // Also update name in our API
        try {
          await api('/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${sessionToken}` },
            body: { name: name.trim() },
          })
        } catch {
          if (__DEV__) console.warn('[auth] name update failed')
        }

        setStep('dob')
        return
      }

      // Still missing requirements after setting password/name
      const resolution = resolveVerificationAttempt('sign-up', updateResult as any)
      if (resolution.kind !== 'session') {
        throw new UnsupportedClerkFlowError(resolution)
      }
    } catch (error) {
      if (error instanceof UnsupportedClerkFlowError) {
        setGeneralError(
          t('auth.unsupportedSignUpStateBody', {
            requirements:
              [...error.resolution.missingFields, ...error.resolution.unverifiedFields].join(
                ', ',
              ) || t('auth.unsupportedSignUpStateFallback'),
          }),
        )
      } else {
        const msg = getClerkErrorMessage(error)
        setGeneralError(msg || t('auth.finishSignInErrorBody'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  // ── DOB step ──
  const handleDob = async () => {
    clearErrors()
    const parsed = parseDateOfBirthInput(dobText)
    if (!parsed) {
      setDobError(t('auth.dateOfBirthInvalidBody'))
      return
    }
    // Precise age: compare year, month, and day (GDPR Article 8, Germany = 16)
    const now = new Date()
    let age = now.getFullYear() - parsed.date.getFullYear()
    const monthDiff = now.getMonth() - parsed.date.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.date.getDate())) {
      age--
    }
    if (age < 5 || age > 120) {
      setDobError(t('auth.dateOfBirthInvalidBody'))
      return
    }

    const effectiveToken = postSignUpSessionToken
    if (!effectiveToken && !e2eBypassEnabled) {
      setGeneralError(t('auth.sessionNotReady'))
      return
    }

    setIsLoading(true)
    try {
      if (e2eBypassEnabled) {
        // Skip API call in e2e mode
        if (inviteCode) {
          setStep('intent')
          return
        }
        setStep('intent')
        return
      }

      await api('/me', {
        method: 'PATCH',
        headers: effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : undefined,
        body: { dateOfBirth: parsed.iso },
      })

      if (inviteCode) {
        // Skip role selection, use invite role
        await finalizeSignUp(inviteRegistrationRole || RegistrationRole.PLAYER, effectiveToken!)
        return
      }

      setStep('intent')
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : getClerkErrorMessage(error)
      setDobError(msg || t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  // ── Role finalization ──
  const finalizeSignUp = async (registrationRole: RegistrationRole, tokenOverride?: string) => {
    const effectiveToken = tokenOverride || postSignUpSessionToken
    if (!effectiveToken) throw new Error(t('auth.sessionNotReady'))

    if (e2eBypassEnabled && effectiveToken === 'e2e-signup-token') {
      await activateE2EPostSignupRole(registrationRole)
      router.replace('/')
      return
    }

    for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
      try {
        await api('/me/registration-role', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${effectiveToken}` },
          body: { registrationRole },
        })
        break
      } catch (error) {
        if (attemptIndex === 1 || !isRetryableRoleFinalizationError(error)) throw error
        await delay(ROLE_FINALIZATION_RETRY_DELAY_MS)
      }
    }

    await refreshUser(effectiveToken)
    postSignUpRedirectHoldRef.current = false

    if (inviteCode) {
      router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })
    } else if (joinClubSlug) {
      router.replace({ pathname: '/join-club', params: { slug: joinClubSlug } })
    } else {
      router.replace('/')
    }
  }

  const handleIntentContinue = async () => {
    clearErrors()
    if (!selectedRole) {
      setRoleError(t('auth.roleRequiredBody'))
      return
    }
    setIsLoading(true)
    try {
      await finalizeSignUp(selectedRole)
    } catch (error) {
      const msg = getClerkErrorMessage(error)
      setGeneralError(msg || t('auth.finishSignInErrorBody'))
    } finally {
      setIsLoading(false)
    }
  }

  // ── Resend code ──
  const handleResendCode = async () => {
    clearErrors()
    if (!isClerkReady) {
      setGeneralError(t('auth.authNotReady'))
      return
    }
    setIsLoading(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (flow === 'sign-in') {
        if (!signIn || !signInEmailAddressId) throw new Error(t('auth.restartSignIn'))
        try {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: signInEmailAddressId,
          })
        } catch {
          await startCodeSignIn(normalizedEmail)
        }
      } else if (flow === 'sign-up') {
        if (!signUp) throw new Error(t('auth.restartSignIn'))
        try {
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
        } catch {
          await signUp.create({ emailAddress: normalizedEmail })
          await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
        }
      } else {
        throw new Error(t('auth.restartVerification'))
      }
      setCode('')
      setGeneralError(null)
    } catch (error) {
      const msg = getClerkErrorMessage(error)
      setGeneralError(msg || t('auth.resendCodeErrorBody'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    clearErrors()
    if (mode === 'login') {
      if (step === 'code') {
        setStep('email')
        setCode('')
      }
      return
    }
    // Signup back navigation
    const idx = SIGNUP_STEPS.indexOf(step)
    if (idx > 0) {
      setStep(SIGNUP_STEPS[idx - 1])
    }
  }

  const isSignupStepper = mode === 'signup' && step !== 'email'
  const showBackButton =
    (mode === 'signup' && step !== 'email') || (mode === 'login' && step === 'code')

  // ── Render ──
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + space.sm,
            paddingBottom: Math.max(insets.bottom + space.xl, space['2xl']),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        bounces={false}
        alwaysBounceVertical={false}
      >
        <View style={styles.content}>
          <View style={styles.topRow}>
            {showBackButton ? (
              <Pressable
                style={[
                  styles.backButton,
                  {
                    backgroundColor: c.surface,
                    borderColor: c.border,
                  },
                ]}
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <Icon name="chevron.left" size="md" color={c.textPrimary} />
              </Pressable>
            ) : (
              <View style={styles.backSpacer} />
            )}
            <LanguageSwitch value={currentLanguage} onChange={handleLanguageChange} />
          </View>

          {step === 'email' && (
            <View style={styles.hero}>
              <Image
                source={illustrations.onboardingHero}
                style={styles.heroIllustration}
                resizeMode="contain"
              />
              <Text style={[styles.brand, { color: c.textPrimary }]}>Anstoss</Text>
              <Text style={[styles.heroTitle, { color: c.textSecondary }]}>
                {t('auth.tagline')}
              </Text>
            </View>
          )}

          {isSignupStepper && (
            <View style={styles.stepIndicatorWrap}>
              <StepIndicator
                currentStep={getSignupStepNumber(step)}
                totalSteps={inviteCode ? 4 : 5}
              />
              <Text style={[styles.stepLabel, { color: c.textSecondary }]}>
                {step === 'code' && t('auth.stepCode')}
                {step === 'profile' && t('auth.stepProfileTitle')}
                {step === 'dob' && t('auth.stepDateOfBirth')}
                {step === 'intent' && t('auth.intentStepTitle')}
              </Text>
            </View>
          )}

          {inviteCode && step === 'email' ? (
            <View
              style={[
                styles.inviteHint,
                {
                  borderColor: c.border,
                  backgroundColor: c.surface,
                },
              ]}
            >
              <Text style={[styles.inviteHintText, { color: c.textSecondary }]}>
                {t('auth.inviteResumeHint')}
              </Text>
            </View>
          ) : null}

          <InlineError message={generalError} style={styles.generalError} />

          {/* ── EMAIL STEP ── */}
          {step === 'email' && (
            <View
              style={[
                styles.panel,
                {
                  borderColor: c.border,
                  backgroundColor: c.surface,
                },
              ]}
            >
              {/* Segmented control: Log in | Sign up */}
              <View style={[styles.segmentedRow, { backgroundColor: c.background }]}>
                <Pressable
                  style={[
                    styles.segmentedTab,
                    mode === 'login' && { backgroundColor: c.textPrimary },
                  ]}
                  onPress={() => handleModeChange('login')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === 'login' }}
                >
                  <Text
                    style={[
                      styles.segmentedTabText,
                      { color: mode === 'login' ? c.textInverse : c.textSecondary },
                    ]}
                  >
                    {t('auth.login')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segmentedTab,
                    mode === 'signup' && { backgroundColor: c.textPrimary },
                  ]}
                  onPress={() => handleModeChange('signup')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === 'signup' }}
                >
                  <Text
                    style={[
                      styles.segmentedTabText,
                      { color: mode === 'signup' ? c.textInverse : c.textSecondary },
                    ]}
                  >
                    {t('auth.signUp')}
                  </Text>
                </Pressable>
              </View>

              {mode === 'login' && !useCodeLogin ? (
                <View style={styles.form}>
                  <FormInput
                    label={t('auth.emailLabel')}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v)
                      setEmailError(null)
                    }}
                    error={emailError}
                    placeholder={t('auth.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                    testID="auth-email-input"
                  />
                  <View>
                    <FormInput
                      label={t('auth.passwordLabel')}
                      value={password}
                      onChangeText={(v) => {
                        setPassword(v)
                        setPasswordError(null)
                      }}
                      error={passwordError}
                      placeholder={t('auth.passwordPlaceholder')}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                      testID="auth-password-input"
                    />
                    <Pressable
                      style={styles.passwordToggle}
                      onPress={() => setShowPassword(!showPassword)}
                      accessibilityLabel={
                        showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                      }
                    >
                      <Icon name={showPassword ? 'eye.slash' : 'eye'} size="md" color="tertiary" />
                    </Pressable>
                  </View>

                  <Button
                    testID="auth-primary-action"
                    label={t('auth.login')}
                    variant="filled"
                    size="lg"
                    fullWidth
                    loading={isLoading}
                    onPress={() => void handleEmailSubmit()}
                  />

                  <Pressable
                    style={styles.linkButton}
                    onPress={() => {
                      setUseCodeLogin(true)
                      clearErrors()
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.linkButtonText, { color: c.textSecondary }]}>
                      {t('auth.useCodeInstead')}
                    </Text>
                  </Pressable>
                </View>
              ) : mode === 'login' && useCodeLogin ? (
                <View style={styles.form}>
                  <FormInput
                    label={t('auth.emailLabel')}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v)
                      setEmailError(null)
                    }}
                    error={emailError}
                    placeholder={t('auth.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                    testID="auth-email-input"
                  />

                  <Button
                    testID="auth-primary-action"
                    label={t('auth.emailContinue')}
                    variant="filled"
                    size="lg"
                    fullWidth
                    loading={isLoading}
                    onPress={() => void handleEmailSubmit()}
                  />

                  <Pressable
                    style={styles.linkButton}
                    onPress={() => {
                      setUseCodeLogin(false)
                      clearErrors()
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.linkButtonText, { color: c.textSecondary }]}>
                      {t('auth.usePasswordInstead')}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.form}>
                  <FormInput
                    label={t('auth.emailLabel')}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v)
                      setEmailError(null)
                    }}
                    error={emailError}
                    placeholder={t('auth.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                    testID="auth-email-input"
                  />

                  <Button
                    testID="auth-primary-action"
                    label={t('auth.continue')}
                    variant="filled"
                    size="lg"
                    fullWidth
                    loading={isLoading}
                    onPress={() => void handleEmailSubmit()}
                  />
                </View>
              )}
            </View>
          )}

          {/* ── CODE STEP ── */}
          {step === 'code' && (
            <View
              style={[
                styles.panel,
                {
                  borderColor: c.border,
                  backgroundColor: c.surface,
                },
              ]}
            >
              <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
                {t('auth.checkEmailTitle')}
              </Text>
              <Text style={[styles.panelHint, { color: c.textSecondary }]}>
                {t('auth.verificationCodeHint', { email: email.trim().toLowerCase() })}
              </Text>
              <View style={styles.form}>
                <FormInput
                  label={t('auth.verificationCodeLabel')}
                  value={code}
                  onChangeText={(v) => {
                    setCode(v)
                    setCodeError(null)
                  }}
                  error={codeError}
                  placeholder={t('auth.verificationCodePlaceholder')}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!isLoading}
                  testID="auth-code-input"
                />

                <Button
                  testID="auth-primary-action"
                  label={t('auth.verify')}
                  variant="filled"
                  size="lg"
                  fullWidth
                  loading={isLoading}
                  onPress={() => void handleVerifyCode()}
                />

                <Button
                  label={t('auth.resendCode')}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={isLoading}
                  onPress={() => void handleResendCode()}
                />

                <Pressable
                  style={styles.linkButton}
                  onPress={() => {
                    resetAll()
                    setEmail(email)
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.linkButtonText, { color: c.textSecondary }]}>
                    {t('auth.useDifferentEmail')}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── PROFILE STEP (name + password) ── */}
          {step === 'profile' && (
            <View
              style={[
                styles.panel,
                {
                  borderColor: c.border,
                  backgroundColor: c.surface,
                },
              ]}
            >
              <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
                {t('auth.stepProfileTitle')}
              </Text>
              <Text style={[styles.panelHint, { color: c.textSecondary }]}>
                {t('auth.stepProfileHint')}
              </Text>
              <View style={styles.form}>
                <FormInput
                  label={t('auth.nameLabel')}
                  value={name}
                  onChangeText={(v) => {
                    setName(v)
                    setNameError(null)
                  }}
                  error={nameError}
                  placeholder={t('auth.namePlaceholder')}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isLoading}
                  testID="auth-name-input"
                />

                <View>
                  <FormInput
                    label={t('auth.passwordLabel')}
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v)
                      setPasswordError(null)
                    }}
                    error={passwordError}
                    placeholder={t('auth.passwordPlaceholder')}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                    testID="auth-password-input"
                  />
                  <Pressable
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                    accessibilityLabel={
                      showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                    }
                  >
                    <Icon
                      name={showPassword ? 'eye.slash' : 'eye'}
                      size="md"
                      color={c.textTertiary}
                    />
                  </Pressable>
                </View>

                <Button
                  testID="auth-primary-action"
                  label={t('auth.continue')}
                  variant="filled"
                  size="lg"
                  fullWidth
                  loading={isLoading}
                  onPress={() => void handleProfile()}
                />
              </View>
            </View>
          )}

          {/* ── DOB STEP ── */}
          {step === 'dob' && (
            <View
              style={[
                styles.panel,
                {
                  borderColor: c.border,
                  backgroundColor: c.surface,
                },
              ]}
            >
              <View style={styles.dobIconRow}>
                <View
                  style={[
                    styles.dobIconCircle,
                    {
                      backgroundColor: c.background,
                      borderColor: c.border,
                    },
                  ]}
                >
                  <Icon name="calendar" size="md" color={c.textPrimary} />
                </View>
              </View>
              <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
                {t('auth.dateOfBirth')}
              </Text>
              <Text style={[styles.panelHint, { color: c.textSecondary }]}>
                {t('auth.dateOfBirthHint')}
              </Text>
              <View style={styles.form}>
                <TextInput
                  style={[
                    styles.dobInput,
                    {
                      borderColor: c.border,
                      color: c.textPrimary,
                      backgroundColor: c.background,
                    },
                    dobError ? { borderColor: c.error } : null,
                  ]}
                  value={dobText}
                  onChangeText={(v) => {
                    setDobText(formatDateOfBirthInput(v))
                    setDobError(null)
                  }}
                  placeholder={t('auth.dateOfBirthPlaceholder')}
                  placeholderTextColor={c.textTertiary}
                  keyboardType="number-pad"
                  maxLength={10}
                  testID="auth-dob-input"
                />
                <InlineError message={dobError} />

                <Button
                  testID="auth-primary-action"
                  label={t('auth.continue')}
                  variant="filled"
                  size="lg"
                  fullWidth
                  loading={isLoading}
                  disabled={dobText.length < 10}
                  onPress={() => void handleDob()}
                />
              </View>
            </View>
          )}

          {/* ── INTENT/ROLE STEP ── */}
          {step === 'intent' && (
            <View
              style={[
                styles.panel,
                {
                  borderColor: c.border,
                  backgroundColor: c.surface,
                },
              ]}
            >
              <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
                {t('auth.intentStepTitle')}
              </Text>
              <InlineError message={roleError} />
              <View style={styles.choiceStack}>
                {INTENT_OPTIONS.map((option) => {
                  const isActive = selectedRole === option.role
                  return (
                    <Pressable
                      testID={`auth-intent-${option.role}`}
                      key={option.role}
                      style={[
                        styles.choiceRow,
                        {
                          borderColor: c.border,
                          backgroundColor: c.background,
                        },
                        isActive && {
                          borderColor: c.textPrimary,
                          backgroundColor: c.surface,
                        },
                      ]}
                      onPress={() => {
                        setSelectedRole(option.role)
                        setRoleError(null)
                      }}
                      disabled={isLoading}
                      accessibilityRole="button"
                      accessibilityLabel={t(option.titleKey)}
                    >
                      <View
                        style={[
                          styles.choiceBadge,
                          {
                            borderColor: c.border,
                            backgroundColor: c.surface,
                          },
                        ]}
                      >
                        <Icon name={option.icon as string} size="sm" color="secondary" />
                      </View>
                      <View style={styles.choiceCopy}>
                        <Text style={[styles.choiceTitle, { color: c.textPrimary }]}>
                          {t(option.titleKey)}
                        </Text>
                        <Text style={[styles.choiceBody, { color: c.textSecondary }]}>
                          {t(option.bodyKey)}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>

              <Button
                testID="auth-primary-action"
                label={t('auth.finish')}
                variant="filled"
                size="lg"
                fullWidth
                loading={isLoading}
                onPress={() => void handleIntentContinue()}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    paddingHorizontal: space.lg,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: {
    width: 44,
  },
  hero: {
    alignItems: 'center',
    marginTop: space.xs,
    marginBottom: space.md,
  },
  heroIllustration: {
    width: 200,
    height: 160,
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  brand: {
    fontSize: fontSize['3xl'],
    lineHeight: fontSize['3xl'] * 1.3,
    letterSpacing: -1,
    fontFamily: fonts.heading,
    paddingTop: 4,
  },
  heroTitle: {
    marginTop: space.sm,
    maxWidth: 320,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  stepIndicatorWrap: {
    alignItems: 'center',
    marginBottom: space.lg,
  },
  stepLabel: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  inviteHint: {
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  inviteHintText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  generalError: {
    textAlign: 'center',
    marginBottom: space.sm,
  },
  panel: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md + 2,
  },
  panelTitle: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.xl,
    marginBottom: space.md,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: space['2xs'],
    marginBottom: space.lg,
  },
  segmentedTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedTabText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  panelHint: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
    marginBottom: space.md,
  },
  form: {
    gap: space.md,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  linkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  linkButtonText: {
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
    fontFamily: fonts.body,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  passwordToggle: {
    position: 'absolute',
    right: space.md,
    top: 32,
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dobIconRow: {
    alignItems: 'center',
    marginBottom: space.md,
  },
  dobIconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    borderWidth: hairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dobInput: {
    minHeight: 56,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    fontSize: fontSize.lg,
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: fonts.data,
  },
  choiceStack: {
    gap: space.sm,
    marginBottom: space.md,
  },
  choiceRow: {
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  choiceBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  choiceTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  choiceBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
})
