import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { getAppLanguage, setAppLanguage, type AppLanguage } from '../../src/i18n'
import { illustrations } from '../../src/illustrations'
import { neutralColors } from '../../src/theme/tokens'
import {
  resolveVerificationAttempt,
  type UnsupportedVerificationResolution,
} from '../../src/utils/authFlow'
import { waitForSessionToken } from '../../src/utils/clerkSession'

type Step = 'details' | 'code' | 'email-link' | 'path' | 'role'
type AuthMode = 'login' | 'signup'
type VerificationFlow = 'sign-in' | 'sign-up' | null
type VerificationMethod = 'email_code' | 'email_link' | null
type SignupPath = 'JOIN_TEAM' | 'RUN_CLUB' | 'FREE_AGENT'

const PATH_OPTIONS: Array<{
  value: SignupPath
  icon: string
  titleKey: string
  bodyKey: string
}> = [
  {
    value: 'JOIN_TEAM',
    icon: 'JOIN',
    titleKey: 'auth.pathJoinTitle',
    bodyKey: 'auth.pathJoinBody',
  },
  {
    value: 'RUN_CLUB',
    icon: 'CLUB',
    titleKey: 'auth.pathOperateTitle',
    bodyKey: 'auth.pathOperateBody',
  },
  {
    value: 'FREE_AGENT',
    icon: 'FA',
    titleKey: 'auth.pathFreeAgentTitle',
    bodyKey: 'auth.pathFreeAgentBody',
  },
]

const ROLE_OPTIONS: Record<
  Exclude<SignupPath, 'FREE_AGENT'>,
  RegistrationRole[]
> = {
  JOIN_TEAM: [RegistrationRole.PLAYER, RegistrationRole.PARENT],
  RUN_CLUB: [RegistrationRole.COACH, RegistrationRole.CLUB_ADMIN],
}

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
  const requestedMode: AuthMode | null =
    modeParam === 'signup' ? 'signup' : modeParam === 'login' ? 'login' : null

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
  const [signupPath, setSignupPath] = useState<SignupPath | null>(null)
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
    (step === 'path' || step === 'role')

  const visibleRoleOptions = useMemo(() => {
    if (!signupPath || signupPath === 'FREE_AGENT') {
      return []
    }

    return ROLE_OPTIONS[signupPath]
  }, [signupPath])

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
      router.replace({ pathname: '/join/[code]', params: { code: inviteCode } })
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
    setSignupPath(null)
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
        router.replace({ pathname: '/join/[code]', params: { code: inviteCode } })
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
      await finalizeSignUp(inviteRegistrationRole || RegistrationRole.PLAYER)
      return
    }

    setVerificationMethod(null)
    setStep('path')
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

    if (!isClerkReady) {
      Alert.alert(t('auth.loadingTitle'), t('auth.loadingBody'))
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
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

      Alert.alert(
        t('auth.sendCodeErrorTitle'),
        getAuthErrorMessage(error, t('auth.sendCodeErrorBody')),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const finalizeSignUp = async (registrationRole: RegistrationRole) => {
    if (!postSignUpSessionToken) {
      throw new Error(t('auth.sessionNotReady'))
    }

    await api('/me/registration-role', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${postSignUpSessionToken}`,
      },
      body: { registrationRole },
    })

    await refreshUser(postSignUpSessionToken)

    if (inviteCode) {
      router.replace({ pathname: '/join/[code]', params: { code: inviteCode } })
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

  const handlePathContinue = async () => {
    if (!signupPath) {
      Alert.alert(t('auth.roleRequiredTitle'), t('auth.pathRequiredBody'))
      return
    }

    if (signupPath === 'FREE_AGENT') {
      setSelectedRole(RegistrationRole.FREE_AGENT)
      setIsLoading(true)
      try {
        await finalizeSignUp(RegistrationRole.FREE_AGENT)
      } catch (error) {
        Alert.alert(
          t('auth.finishSignInErrorTitle'),
          getCompletionErrorMessage(error, t('auth.finishSignInErrorBody')),
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    setSelectedRole(null)
    setStep('role')
  }

  const handleRoleContinue = async () => {
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
              <Pressable
                testID="auth-mode-login"
                accessibilityRole="tab"
                accessibilityLabel={t('auth.login')}
                accessibilityState={{ selected: mode === 'login', disabled: isLoading }}
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
              </Pressable>
              <Pressable
                testID="auth-mode-signup"
                accessibilityRole="tab"
                accessibilityLabel={t('auth.signUp')}
                accessibilityState={{ selected: mode === 'signup', disabled: isLoading }}
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
              </Pressable>
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
                >
                  {isLoading ? (
                    <ActivityIndicator color={neutralColors.textInverse} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {t('auth.emailContinue')}
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
                >
                  <Text style={styles.secondaryButtonText}>
                    {t('auth.resendCode')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkButton} onPress={resetVerification}>
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
                >
                  {isLoading ? (
                    <ActivityIndicator color={neutralColors.textPrimary} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>
                      {t('auth.resendEmail')}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkButton} onPress={resetVerification}>
                  <Text style={styles.linkButtonText}>{t('auth.useDifferentEmail')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {step === 'path' ? (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.pathStepTitle')}</Text>
                <View style={styles.choiceStack}>
                  {PATH_OPTIONS.map((option) => {
                    const isActive = signupPath === option.value

                    return (
                      <TouchableOpacity
                        testID={`auth-path-${option.value}`}
                        key={option.value}
                        style={[
                          styles.choiceRow,
                          isActive && styles.choiceRowActive,
                        ]}
                        onPress={() => setSignupPath(option.value)}
                        disabled={isLoading}
                      >
                        <View style={styles.choiceBadge}>
                          <Text style={styles.choiceBadgeText}>{option.icon}</Text>
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
                  onPress={() => void handlePathContinue()}
                  disabled={isLoading}
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
                >
                  <Text style={styles.linkButtonText}>{t('common.back')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {step === 'role' ? (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.roleStepTitle')}</Text>
                <View style={styles.choiceStack}>
                  {visibleRoleOptions.map((role) => {
                    const isActive = selectedRole === role

                    return (
                      <TouchableOpacity
                        testID={`auth-role-${role}`}
                        key={role}
                        style={[
                          styles.choiceRow,
                          isActive && styles.choiceRowActive,
                        ]}
                        onPress={() => setSelectedRole(role)}
                        disabled={isLoading}
                      >
                        <View style={styles.choiceBadge}>
                          <Text style={styles.choiceBadgeText}>{role.slice(0, 3)}</Text>
                        </View>
                        <View style={styles.choiceCopy}>
                          <Text
                            style={[
                              styles.choiceTitle,
                              isActive && styles.choiceTitleActive,
                            ]}
                          >
                            {t(`roles.${role}`)}
                          </Text>
                          <Text style={styles.choiceBody}>
                            {t(`auth.roleBody.${role}`)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                <TouchableOpacity
                  testID="auth-primary-action"
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={() => void handleRoleContinue()}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={neutralColors.textInverse} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{t('auth.continue')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => setStep('path')}
                  disabled={isLoading}
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  topRow: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  heroIllustration: {
    width: 176,
    height: 176,
    marginBottom: 8,
  },
  brand: {
    fontSize: 34,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    letterSpacing: -1,
  },
  heroTitle: {
    marginTop: 10,
    maxWidth: 320,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  heroBody: {
    marginTop: 8,
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  inviteHint: {
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  inviteHintText: {
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  panel: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 18,
    backgroundColor: neutralColors.surface,
    padding: 18,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modeButtonActive: {
    backgroundColor: neutralColors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: neutralColors.textSecondary,
  },
  modeButtonTextActive: {
    color: neutralColors.textPrimary,
  },
  form: {
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.background,
  },
  hint: {
    marginTop: -2,
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  emailLinkNote: {
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  choiceStack: {
    gap: 10,
  },
  choiceRow: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  choiceRowActive: {
    borderColor: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  choiceBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: neutralColors.textSecondary,
    letterSpacing: 0.4,
  },
  choiceCopy: {
    flex: 1,
    gap: 3,
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  choiceTitleActive: {
    color: neutralColors.textPrimary,
  },
  choiceBody: {
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  primaryButton: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: neutralColors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: neutralColors.textInverse,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  linkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  },
  linkButtonText: {
    fontSize: 13,
    color: neutralColors.textSecondary,
    textDecorationLine: 'underline',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
