import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { RegistrationRole, type PublicInvitePayload } from '@anstoss/shared'
import {
  isClerkAPIResponseError,
  useSignIn,
  useSignUp,
} from '@clerk/clerk-expo'
import * as ExpoLinking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../src/components/LanguageSwitch'
import { api, ApiError } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import {
  activateE2EPostSignupRole,
  isE2ESupported,
} from '../../src/e2e/session'
import { getAppLanguage, setAppLanguage, type AppLanguage } from '../../src/i18n'
import { illustrations } from '../../src/illustrations'
import { Ionicons } from '@expo/vector-icons'
import { neutralColors, fontSize, space, radius, fonts, fontWeight } from '../../src/theme/tokens'
import {
  resolveVerificationAttempt,
  type UnsupportedVerificationResolution,
} from '../../src/utils/authFlow'
import { waitForSessionToken } from '../../src/utils/clerkSession'

type Step = 'details' | 'code' | 'email-link' | 'intent'
type AuthMode = 'login' | 'signup'
type VerificationFlow = 'sign-in' | 'sign-up' | null
type VerificationMethod = 'email_code' | 'email_link' | null
const ROLE_FINALIZATION_RETRY_DELAY_MS = 350

const INTENT_OPTIONS: Array<{
  role: RegistrationRole
  icon: string
  titleKey: string
  bodyKey: string
}> = [
  {
    role: RegistrationRole.PLAYER,
    icon: 'football-outline',
    titleKey: 'auth.intentPlayer',
    bodyKey: 'auth.intentPlayerBody',
  },
  {
    role: RegistrationRole.PARENT,
    icon: 'people-outline',
    titleKey: 'auth.intentParent',
    bodyKey: 'auth.intentParentBody',
  },
  {
    role: RegistrationRole.COACH,
    icon: 'clipboard-outline',
    titleKey: 'auth.intentCoach',
    bodyKey: 'auth.intentCoachBody',
  },
  {
    role: RegistrationRole.CLUB_ADMIN,
    icon: 'shield-outline',
    titleKey: 'auth.intentClubAdmin',
    bodyKey: 'auth.intentClubAdminBody',
  },
  {
    role: RegistrationRole.FREE_AGENT,
    icon: 'person-outline',
    titleKey: 'auth.intentFreeAgent',
    bodyKey: 'auth.intentFreeAgentBody',
  },
]

const AUTH_REQUIREMENT_TRANSLATION_KEYS: Record<string, string> = {
  emailAddress: 'auth.requirementLabels.emailAddress',
  email_address: 'auth.requirementLabels.email_address',
  phoneNumber: 'auth.requirementLabels.phoneNumber',
  phone_number: 'auth.requirementLabels.phone_number',
  firstName: 'auth.requirementLabels.firstName',
  first_name: 'auth.requirementLabels.first_name',
  lastName: 'auth.requirementLabels.lastName',
  last_name: 'auth.requirementLabels.last_name',
  username: 'auth.requirementLabels.username',
  password: 'auth.requirementLabels.password',
  legalAccepted: 'auth.requirementLabels.legalAccepted',
  legal_accepted: 'auth.requirementLabels.legal_accepted',
}

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

function getApiStatus(error: unknown) {
  if (error instanceof ApiError) {
    return error.status
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status
  }

  return null
}

function isRetryableRoleFinalizationError(error: unknown) {
  const status = getApiStatus(error)

  return status !== null && status >= 500
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function mapInviteRoleToRegistrationRole(
  role: PublicInvitePayload['role'],
): RegistrationRole {
  if (role === 'PARENT') {
    return RegistrationRole.PARENT
  }

  if (role === 'HEAD_COACH' || role === 'ASSISTANT_COACH') {
    return RegistrationRole.COACH
  }

  return RegistrationRole.PLAYER
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
  const inviteCode = Array.isArray(params.inviteCode)
    ? params.inviteCode[0]
    : params.inviteCode
  const joinClubSlug = Array.isArray(params.joinClubSlug)
    ? params.joinClubSlug[0]
    : params.joinClubSlug
  const modeParam = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const e2eBypassParam = Array.isArray(params.e2eBypass)
    ? params.e2eBypass[0]
    : params.e2eBypass
  const requestedMode: AuthMode | null =
    modeParam === 'signup' ? 'signup' : modeParam === 'login' ? 'login' : null
  const e2eBypassEnabled =
    isE2ESupported() &&
    (e2eBypassParam === '1' || e2eBypassParam === 'true')

  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn()
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp()

  const [mode, setMode] = useState<AuthMode>(
    inviteCode ? 'signup' : requestedMode || 'login',
  )
  const [step, setStep] = useState<Step>('details')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [flow, setFlow] = useState<VerificationFlow>(null)
  const [verificationMethod, setVerificationMethod] =
    useState<VerificationMethod>(null)
  const [signInEmailAddressId, setSignInEmailAddressId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<RegistrationRole | null>(null)
  const [postSignUpSessionToken, setPostSignUpSessionToken] = useState<string | null>(null)
  const [inviteRegistrationRole, setInviteRegistrationRole] =
    useState<RegistrationRole | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const emailLinkRequestIdRef = useRef(0)

  const isClerkReady = isSignInLoaded && isSignUpLoaded
  const currentLanguage: AppLanguage = getAppLanguage()
  const translatedAuthErrors = new Set([
    t('auth.authNotReady'),
    t('auth.restartSignIn'),
    t('auth.restartVerification'),
    t('auth.emailCodeNotEnabled'),
    t('auth.verifyIncomplete'),
    t('auth.sessionNotReady'),
  ])
  const shouldHoldRedirect =
    mode === 'signup' &&
    !inviteCode &&
    Boolean(postSignUpSessionToken) &&
    step === 'intent'

  useEffect(() => {
    if (!inviteCode) {
      return
    }

    let cancelled = false

    void api<PublicInvitePayload>(`/public/invites/${inviteCode}`)
      .then((payload) => {
        if (!cancelled) {
          setInviteRegistrationRole(mapInviteRoleToRegistrationRole(payload.role))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInviteRegistrationRole(RegistrationRole.PLAYER)
        }
      })

    return () => {
      cancelled = true
    }
  }, [inviteCode])

  useEffect(() => {
    if (!isSignedIn || shouldHoldRedirect) {
      return
    }

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

  const resetVerification = () => {
    emailLinkRequestIdRef.current += 1
    setStep('details')
    setCode('')
    setFlow(null)
    setVerificationMethod(null)
    setSignInEmailAddressId(null)
    setSelectedRole(null)
    setPostSignUpSessionToken(null)
  }

  useEffect(() => {
    const nextMode = inviteCode ? 'signup' : requestedMode

    if (!nextMode || nextMode === mode) {
      return
    }

    setMode(nextMode)
    resetVerification()
  }, [inviteCode, mode, requestedMode])

  const handleModeChange = (nextMode: AuthMode) => {
    if (nextMode === mode || isLoading) {
      return
    }

    setMode(nextMode)
    resetVerification()
  }

  const handleLanguageChange = async (language: AppLanguage) => {
    if (language === currentLanguage || isLoading) {
      return
    }

    await setAppLanguage(language)
  }

  const formatStatusLabel = (status: string | null) => {
    const value = status || t('auth.unknownStatus')

    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  const formatRequirementLabel = (field: string) => {
    const translationKey = AUTH_REQUIREMENT_TRANSLATION_KEYS[field]

    if (translationKey) {
      return t(translationKey)
    }

    return field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }

  const showUnsupportedClerkAlert = (
    resolution: UnsupportedVerificationResolution,
  ) => {
    if (resolution.flow === 'sign-up') {
      const requirements = Array.from(
        new Set([...resolution.missingFields, ...resolution.unverifiedFields]),
      )

      Alert.alert(
        t('auth.unsupportedSignUpStateTitle'),
        t('auth.unsupportedSignUpStateBody', {
          requirements: requirements.length
            ? requirements.map(formatRequirementLabel).join(', ')
            : t('auth.unsupportedSignUpStateFallback'),
        }),
      )

      return
    }

    Alert.alert(
      t('auth.unsupportedSignInStateTitle'),
      t('auth.unsupportedSignInStateBody', {
        status: formatStatusLabel(resolution.status),
      }),
    )
  }

  const getAuthErrorMessage = (error: unknown, fallback: string) => {
    if (isClerkAPIResponseError(error)) {
      const message = error.errors
        .map((entry) => entry.longMessage || entry.message || entry.code)
        .find((entry): entry is string => Boolean(entry))

      if (message) {
        return message
      }
    }

    if (
      !isClerkAPIResponseError(error) &&
      error instanceof Error &&
      translatedAuthErrors.has(error.message)
    ) {
      return error.message
    }

    return fallback
  }

  const redirectUrl = ExpoLinking.createURL('/sign-in')

  const getCompletionErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      if (translatedAuthErrors.has(error.message)) {
        return error.message
      }

      return error.message
    }

    return fallback
  }

  const showVerificationSentAlert = (
    method: Exclude<VerificationMethod, null>,
    normalizedEmail: string,
    kind: 'initial' | 'resend',
  ) => {
    if (method === 'email_link') {
      return
    }

    if (kind === 'initial') {
      Alert.alert(
        t('auth.checkEmailTitle'),
        t('auth.checkEmailBody', { email: normalizedEmail }),
      )
      return
    }

    Alert.alert(
      t('auth.codeSentTitle'),
      t('auth.codeSentBody', { email: normalizedEmail }),
    )
  }

  const completeResolvedVerification = async (
    verificationFlow: Exclude<VerificationFlow, null>,
    attempt: {
      status?: string | null
      createdSessionId?: string | null
      missingFields?: string[] | null
      unverifiedFields?: string[] | null
    },
  ) => {
    const resolution = resolveVerificationAttempt(verificationFlow, attempt)
    if (resolution.kind !== 'session') {
      throw new UnsupportedClerkFlowError(resolution)
    }

    if (verificationFlow === 'sign-in') {
      if (!setSignInActive) {
        throw new Error(t('auth.authNotReady'))
      }

      await setSignInActive({ session: resolution.sessionId })
      const sessionToken = await waitForSessionToken()
      if (!sessionToken) {
        throw new Error(t('auth.sessionNotReady'))
      }

      await refreshUser(sessionToken)
      if (inviteCode) {
        router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })
        return
      }

      if (joinClubSlug) {
        router.replace({ pathname: '/join-club', params: { slug: joinClubSlug } })
        return
      }

      router.replace('/')
      return
    }

    if (!setSignUpActive) {
      throw new Error(t('auth.authNotReady'))
    }

    await setSignUpActive({ session: resolution.sessionId })
    const sessionToken = await waitForSessionToken()
    if (!sessionToken) {
      throw new Error(t('auth.sessionNotReady'))
    }

    setPostSignUpSessionToken(sessionToken)

    if (inviteCode) {
      await finalizeSignUp(inviteRegistrationRole || RegistrationRole.PLAYER, sessionToken)
      return
    }

    setVerificationMethod(null)
    setStep('intent')
    setCode('')
  }

  const beginEmailLinkFlow = (
    verificationFlow: Exclude<VerificationFlow, null>,
    normalizedEmail: string,
    startFlow: () => Promise<{
      status?: string | null
      createdSessionId?: string | null
      missingFields?: string[] | null
      unverifiedFields?: string[] | null
    }>,
    fallbackToCode?: () => Promise<void>,
  ) => {
    const requestId = ++emailLinkRequestIdRef.current

    setFlow(verificationFlow)
    setVerificationMethod('email_link')
    setStep('email-link')
    setCode('')

    void startFlow()
      .then((attempt) => {
        if (emailLinkRequestIdRef.current !== requestId) {
          return
        }

        void completeResolvedVerification(verificationFlow, attempt).catch((error) => {
          if (error instanceof UnsupportedClerkFlowError) {
            showUnsupportedClerkAlert(error.resolution)
            return
          }

          Alert.alert(
            t('auth.finishSignInErrorTitle'),
            getCompletionErrorMessage(error, t('auth.finishSignInErrorBody')),
          )
        })
      })
      .catch((error) => {
        if (emailLinkRequestIdRef.current !== requestId) {
          return
        }

        void (async () => {
          if (fallbackToCode) {
            try {
              await fallbackToCode()
              showVerificationSentAlert('email_code', normalizedEmail, 'initial')
              return
            } catch (fallbackError) {
              Alert.alert(
                t('auth.sendCodeErrorTitle'),
                getAuthErrorMessage(fallbackError, t('auth.sendCodeErrorBody')),
              )
              return
            }
          }

          Alert.alert(
            t('auth.sendCodeErrorTitle'),
            getAuthErrorMessage(error, t('auth.sendCodeErrorBody')),
          )
        })()
      })
  }

  const startSignInFlow = async (
    normalizedEmail: string,
  ): Promise<Exclude<VerificationMethod, null>> => {
    if (!signIn || !setSignInActive) {
      throw new Error(t('auth.authNotReady'))
    }

    const signInAttempt = await signIn.create({
      identifier: normalizedEmail,
    })

    const emailFactor = signInAttempt.supportedFirstFactors?.find(
      (factor) => factor.strategy === 'email_code' && 'emailAddressId' in factor,
    )
    const emailLinkFactor = signInAttempt.supportedFirstFactors?.find(
      (factor) => factor.strategy === 'email_link' && 'emailAddressId' in factor,
    )

    if (emailLinkFactor && 'emailAddressId' in emailLinkFactor) {
      beginEmailLinkFlow(
        'sign-in',
        normalizedEmail,
        () =>
          signInAttempt.createEmailLinkFlow().startEmailLinkFlow({
            emailAddressId: emailLinkFactor.emailAddressId,
            redirectUrl,
          }),
        emailFactor && 'emailAddressId' in emailFactor
          ? async () => {
              await signInAttempt.prepareFirstFactor({
                strategy: 'email_code',
                emailAddressId: emailFactor.emailAddressId,
              })
              setFlow('sign-in')
              setVerificationMethod('email_code')
              setStep('code')
              setSignInEmailAddressId(emailFactor.emailAddressId)
            }
          : undefined,
      )

      return 'email_link'
    }

    if (!emailFactor || !('emailAddressId' in emailFactor)) {
      throw new Error(t('auth.emailCodeNotEnabled'))
    }

    await signInAttempt.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailFactor.emailAddressId,
    })

    setFlow('sign-in')
    setVerificationMethod('email_code')
    setStep('code')
    setSignInEmailAddressId(emailFactor.emailAddressId)
    return 'email_code'
  }

  const startSignUpFlow = async (
    normalizedEmail: string,
  ): Promise<Exclude<VerificationMethod, null>> => {
    if (!signUp || !setSignUpActive) {
      throw new Error(t('auth.authNotReady'))
    }

    const signUpAttempt = await signUp.create({
      emailAddress: normalizedEmail,
    })

    if (typeof signUpAttempt.createEmailLinkFlow === 'function') {
      beginEmailLinkFlow(
        'sign-up',
        normalizedEmail,
        () =>
          signUpAttempt.createEmailLinkFlow().startEmailLinkFlow({
            redirectUrl,
          }),
        async () => {
          await signUpAttempt.prepareEmailAddressVerification({
            strategy: 'email_code',
          })
          setFlow('sign-up')
          setVerificationMethod('email_code')
          setStep('code')
        },
      )

      return 'email_link'
    }

    await signUpAttempt.prepareEmailAddressVerification({
      strategy: 'email_code',
    })

    setFlow('sign-up')
    setVerificationMethod('email_code')
    setStep('code')
    return 'email_code'
  }

  const handleContinue = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert(t('auth.invalidEmailTitle'), t('auth.invalidEmailBody'))
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (mode === 'signup' && e2eBypassEnabled) {
      setFlow('sign-up')
      setVerificationMethod('email_code')
      setStep('code')
      setCode('')
      return
    }

    if (!isClerkReady) {
      Alert.alert(t('auth.loadingTitle'), t('auth.loadingBody'))
      return
    }

    setIsLoading(true)

    try {
      const method =
        mode === 'login'
          ? await startSignInFlow(normalizedEmail)
          : await startSignUpFlow(normalizedEmail)

      setCode('')
      showVerificationSentAlert(method, normalizedEmail, 'initial')
    } catch (error) {
      if (error instanceof UnsupportedClerkFlowError) {
        showUnsupportedClerkAlert(error.resolution)
        return
      }

      if (mode === 'login' && isIdentifierNotFoundError(error)) {
        setMode('signup')
        resetVerification()
        Alert.alert(t('auth.noAccountTitle'), t('auth.noAccountBody'))
        return
      }

      if (mode === 'signup' && isIdentifierExistsError(error)) {
        setMode('login')
        resetVerification()
        Alert.alert(t('auth.accountExistsTitle'), t('auth.accountExistsBody'))
        return
      }

      if (isSessionExistsError(error)) {
        // Clerk already has an active session — redirect instead of showing error
        await refreshUser()
        router.replace('/')
        return
      }

      Alert.alert(
        t('auth.sendCodeErrorTitle'),
        getAuthErrorMessage(error, t('auth.sendCodeErrorBody')),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const finalizeSignUp = async (registrationRole: RegistrationRole, tokenOverride?: string) => {
    const effectiveToken = tokenOverride || postSignUpSessionToken
    if (!effectiveToken) {
      throw new Error(t('auth.sessionNotReady'))
    }

    if (e2eBypassEnabled && effectiveToken === 'e2e-signup-token') {
      await activateE2EPostSignupRole(registrationRole)
      router.replace('/')
      return
    }

    let finalizationError: unknown = null

    for (let attemptIndex = 0; attemptIndex < 2; attemptIndex += 1) {
      try {
        await api('/me/registration-role', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
          body: { registrationRole },
        })
        finalizationError = null
        break
      } catch (error) {
        finalizationError = error

        if (
          attemptIndex === 1 ||
          !isRetryableRoleFinalizationError(error)
        ) {
          throw error
        }

        await delay(ROLE_FINALIZATION_RETRY_DELAY_MS)
      }
    }

    if (finalizationError) {
      throw finalizationError
    }

    await refreshUser(effectiveToken)

    if (inviteCode) {
      router.replace({ pathname: '/join/[...code]', params: { code: inviteCode } })
      return
    }

    if (joinClubSlug) {
      router.replace({ pathname: '/join-club', params: { slug: joinClubSlug } })
      return
    }

    router.replace('/')
  }

  const handleVerifyCode = async () => {
    if (!code.trim()) {
      return
    }

    if (mode !== 'login' && e2eBypassEnabled) {
      setPostSignUpSessionToken('e2e-signup-token')
      setVerificationMethod(null)
      setStep('intent')
      setCode('')
      return
    }

    if (!isClerkReady) {
      Alert.alert(t('auth.loadingTitle'), t('auth.loadingBody'))
      return
    }

    setIsLoading(true)

    try {
      if (mode === 'login') {
        if (!signIn || !setSignInActive) {
          throw new Error(t('auth.authNotReady'))
        }

        const attempt = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: code.trim(),
        })

        await completeResolvedVerification('sign-in', attempt)
        return
      }

      if (!signUp || !setSignUpActive) {
        throw new Error(t('auth.authNotReady'))
      }

      const attempt = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      })

      await completeResolvedVerification('sign-up', attempt)
    } catch (error) {
      if (error instanceof UnsupportedClerkFlowError) {
        showUnsupportedClerkAlert(error.resolution)
      } else if (isClerkAPIResponseError(error)) {
        Alert.alert(
          t('auth.verifyCodeErrorTitle'),
          getAuthErrorMessage(error, t('auth.verifyCodeErrorBody')),
        )
      } else if (error instanceof ApiError && error.code === 'UPGRADE_REQUIRED') {
        // ForceUpdateScreen in _layout.tsx handles this.
      } else {
        Alert.alert(
          t('auth.finishSignInErrorTitle'),
          getCompletionErrorMessage(error, t('auth.finishSignInErrorBody')),
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!isClerkReady) {
      Alert.alert(t('auth.loadingTitle'), t('auth.loadingBody'))
      return
    }

    setIsLoading(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()

      if (verificationMethod === 'email_link') {
        const method =
          flow === 'sign-in'
            ? await startSignInFlow(normalizedEmail)
            : await startSignUpFlow(normalizedEmail)

        if (method === 'email_code') {
          showVerificationSentAlert('email_code', normalizedEmail, 'resend')
        }

        return
      }

      if (flow === 'sign-in') {
        if (!signIn || !signInEmailAddressId) {
          throw new Error(t('auth.restartSignIn'))
        }

        try {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: signInEmailAddressId,
          })
        } catch {
          await startSignInFlow(normalizedEmail)
        }
      } else if (flow === 'sign-up') {
        if (!signUp) {
          throw new Error(t('auth.restartSignIn'))
        }

        try {
          await signUp.prepareEmailAddressVerification({
            strategy: 'email_code',
          })
        } catch {
          await startSignUpFlow(normalizedEmail)
        }
      } else {
        throw new Error(t('auth.restartVerification'))
      }

      setCode('')
      showVerificationSentAlert('email_code', normalizedEmail, 'resend')
    } catch (error) {
      Alert.alert(
        t('auth.resendCodeErrorTitle'),
        getAuthErrorMessage(error, t('auth.resendCodeErrorBody')),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleIntentContinue = async () => {
    if (!selectedRole) {
      Alert.alert(t('auth.roleRequiredTitle'), t('auth.roleRequiredBody'))
      return
    }

    setIsLoading(true)
    try {
      await finalizeSignUp(selectedRole)
    } catch (error) {
      Alert.alert(
        t('auth.finishSignInErrorTitle'),
        getCompletionErrorMessage(error, t('auth.finishSignInErrorBody')),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const heroTitle = t('auth.tagline')
  const detailsStepCtaLabel =
    mode === 'signup' ? t('auth.signUpContinue') : t('auth.emailContinue')

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.topRow}>
            <LanguageSwitch value={currentLanguage} onChange={handleLanguageChange} />
          </View>

          <View style={styles.hero}>
            <Image
              source={illustrations.onboardingHero}
              style={styles.heroIllustration}
              resizeMode="contain"
            />
            <Text style={styles.brand}>Anstoss</Text>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
          </View>

          {inviteCode ? (
            <View style={styles.inviteHint}>
              <Text style={styles.inviteHintText}>{t('auth.inviteResumeHint')}</Text>
            </View>
          ) : null}

          <View style={styles.panel}>
            <View style={styles.modeRow}>
              <TouchableOpacity
                testID="auth-mode-login"
                accessibilityRole="tab"
                accessibilityLabel={t('auth.login')}
                accessibilityState={{ selected: mode === 'login', disabled: isLoading }}
                activeOpacity={0.88}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}
                onPress={() => handleModeChange('login')}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === 'login' && styles.modeButtonTextActive,
                  ]}
                >
                  {t('auth.login')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="auth-mode-signup"
                accessibilityRole="tab"
                accessibilityLabel={t('auth.signUp')}
                accessibilityState={{ selected: mode === 'signup', disabled: isLoading }}
                activeOpacity={0.88}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}
                onPress={() => handleModeChange('signup')}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === 'signup' && styles.modeButtonTextActive,
                  ]}
                >
                  {t('auth.signUp')}
                </Text>
              </TouchableOpacity>
            </View>

            {step === 'details' ? (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.emailLabel')}</Text>
                <TextInput
                  testID="auth-email-input"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={neutralColors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                />

                <TouchableOpacity
                  testID="auth-primary-action"
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={() => void handleContinue()}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={detailsStepCtaLabel}
                >
                  {isLoading ? (
                    <ActivityIndicator color={neutralColors.textInverse} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {detailsStepCtaLabel}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            {step === 'code' ? (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.verificationCodeLabel')}</Text>
                <Text style={styles.hint}>
                  {t('auth.verificationCodeHint', { email: email.trim().toLowerCase() })}
                </Text>
                <TextInput
                  testID="auth-code-input"
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder={t('auth.verificationCodePlaceholder')}
                  placeholderTextColor={neutralColors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!isLoading}
                />

                <TouchableOpacity
                  testID="auth-primary-action"
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={() => void handleVerifyCode()}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={mode === 'login' ? t('auth.verify') : t('auth.continue')}
                >
                  {isLoading ? (
                    <ActivityIndicator color={neutralColors.textInverse} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {mode === 'login' ? t('auth.verify') : t('auth.continue')}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => void handleResendCode()}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.resendCode')}
                >
                  <Text style={styles.secondaryButtonText}>
                    {t('auth.resendCode')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkButton} onPress={resetVerification} accessibilityRole="button" accessibilityLabel={t('auth.useDifferentEmail')}>
                  <Text style={styles.linkButtonText}>{t('auth.useDifferentEmail')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {step === 'email-link' ? (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.checkEmailTitle')}</Text>
                <Text style={styles.hint}>
                  {t('auth.checkEmailLinkBody', {
                    email: email.trim().toLowerCase(),
                  })}
                </Text>
                <Text style={styles.emailLinkNote}>
                  {t('auth.emailLinkDeviceHint')}
                </Text>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => void handleResendCode()}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.resendEmail')}
                >
                  {isLoading ? (
                    <ActivityIndicator color={neutralColors.textPrimary} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>
                      {t('auth.resendEmail')}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkButton} onPress={resetVerification} accessibilityRole="button" accessibilityLabel={t('auth.useDifferentEmail')}>
                  <Text style={styles.linkButtonText}>{t('auth.useDifferentEmail')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {step === 'intent' ? (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.intentStepTitle')}</Text>
                <View style={styles.choiceStack}>
                  {INTENT_OPTIONS.map((option) => {
                    const isActive = selectedRole === option.role

                    return (
                      <TouchableOpacity
                        testID={`auth-intent-${option.role}`}
                        key={option.role}
                        style={[
                          styles.choiceRow,
                          isActive && styles.choiceRowActive,
                        ]}
                        onPress={() => setSelectedRole(option.role)}
                        disabled={isLoading}
                        accessibilityRole="button"
                        accessibilityLabel={t(option.titleKey)}
                      >
                        <View style={styles.choiceBadge}>
                          <Ionicons name={option.icon as any} size={18} color={neutralColors.textSecondary} />
                        </View>
                        <View style={styles.choiceCopy}>
                          <Text
                            style={[
                              styles.choiceTitle,
                              isActive && styles.choiceTitleActive,
                            ]}
                          >
                            {t(option.titleKey)}
                          </Text>
                          <Text style={styles.choiceBody}>{t(option.bodyKey)}</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                <TouchableOpacity
                  testID="auth-primary-action"
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={() => void handleIntentContinue()}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.continue')}
                >
                  {isLoading ? (
                    <ActivityIndicator color={neutralColors.textInverse} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t('auth.continue')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => setStep('code')}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.back')}
                >
                  <Text style={styles.linkButtonText}>{t('common.back')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: space.xl,
    justifyContent: 'center',
  },
  topRow: {
    alignItems: 'flex-end',
    marginBottom: space.md,
  },
  hero: {
    alignItems: 'center',
    marginBottom: space.lg,
  },
  heroIllustration: {
    width: 176,
    height: 176,
    marginBottom: space.sm,
  },
  brand: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    letterSpacing: -1,
    fontFamily: fonts.heading,
  },
  heroTitle: {
    marginTop: space.sm,
    maxWidth: 320,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  heroBody: {
    marginTop: space.sm,
    maxWidth: 320,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  inviteHint: {
    marginBottom: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  inviteHintText: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  panel: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
  },
  modeRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.lg,
    padding: space.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  modeButtonActive: {
    backgroundColor: neutralColors.textPrimary,
    borderColor: neutralColors.textPrimary,
  },
  modeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: neutralColors.textSecondary,
    fontFamily: fonts.label,
  },
  modeButtonTextActive: {
    color: neutralColors.textInverse,
  },
  form: {
    gap: space.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontFamily: fonts.label,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.background,
    fontFamily: fonts.body,
  },
  hint: {
    marginTop: -2,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  emailLinkNote: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  choiceStack: {
    gap: space.sm,
  },
  choiceRow: {
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  choiceRowActive: {
    borderColor: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  choiceBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceBadgeText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textSecondary,
    letterSpacing: 0.4,
    fontFamily: fonts.label,
  },
  choiceCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  choiceTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    fontFamily: fonts.heading,
  },
  choiceTitleActive: {
    color: neutralColors.textPrimary,
  },
  choiceBody: {
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  primaryButton: {
    minHeight: 52,
    marginTop: space.sm,
    borderRadius: radius.md,
    backgroundColor: neutralColors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
    fontFamily: fonts.label,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    fontFamily: fonts.label,
  },
  linkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.sm,
    paddingBottom: space['2xs'],
  },
  linkButtonText: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    textDecorationLine: 'underline',
    fontFamily: fonts.body,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
