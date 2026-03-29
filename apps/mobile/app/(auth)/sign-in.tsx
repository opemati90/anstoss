import { useEffect, useState } from 'react'
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
import {
  isClerkAPIResponseError,
  useSignIn,
  useSignUp,
} from '@clerk/clerk-expo'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from '../../src/components/LanguageSwitch'
import { api, ApiError } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { setAppLanguage, type AppLanguage } from '../../src/i18n'
import { illustrations } from '../../src/illustrations'
import { neutralColors } from '../../src/theme/tokens'
import {
  resolveVerificationAttempt,
  type UnsupportedVerificationResolution,
} from '../../src/utils/authFlow'
import {
  formatDateOfBirthInput,
  parseDateOfBirthInput,
} from '../../src/utils/dateOfBirth'
import { waitForSessionToken } from '../../src/utils/clerkSession'

type Step = 'email' | 'age-gate' | 'code'
type VerificationFlow = 'sign-in' | 'sign-up' | null

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

export default function SignInScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ inviteCode?: string | string[] }>()
  const { t, i18n } = useTranslation()
  const { isSignedIn, refreshUser } = useAuth()
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn()
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp()
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<Step>('email')
  const [flow, setFlow] = useState<VerificationFlow>(null)
  const [signInEmailAddressId, setSignInEmailAddressId] = useState<string | null>(null)
  const [hasVerifiedSession, setHasVerifiedSession] = useState(false)

  const isClerkReady = isSignInLoaded && isSignUpLoaded
  const inviteCode = Array.isArray(params.inviteCode)
    ? params.inviteCode[0]
    : params.inviteCode
  const currentLanguage: AppLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'de'
  const translatedAuthErrors = new Set([
    t('auth.authNotReady'),
    t('auth.restartSignIn'),
    t('auth.restartVerification'),
    t('auth.emailCodeNotEnabled'),
    t('auth.verifyIncomplete'),
    t('auth.sessionNotReady'),
  ])

  useEffect(() => {
    if (isSignedIn) {
      if (inviteCode) {
        router.replace({ pathname: '/join/[code]', params: { code: inviteCode } })
        return
      }

      router.replace('/')
    }
  }, [inviteCode, isSignedIn, router])

  const resetToEmailStep = () => {
    setStep('email')
    setDob('')
    setCode('')
    setFlow(null)
    setSignInEmailAddressId(null)
    setHasVerifiedSession(false)
  }

  const handleLanguageChange = async (language: AppLanguage) => {
    if (language === currentLanguage || isLoading) return
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
    console.warn('Unsupported Clerk verification state', {
      flow: resolution.flow,
      status: resolution.status,
      missingFields: resolution.missingFields,
      unverifiedFields: resolution.unverifiedFields,
    })

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
    if (
      !isClerkAPIResponseError(error) &&
      error instanceof Error &&
      translatedAuthErrors.has(error.message)
    ) {
      return error.message
    }

    return fallback
  }

  const getCompletionErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      if (translatedAuthErrors.has(error.message)) {
        return error.message
      }

      return error.message
    }

    return fallback
  }

  const startSignInFlow = async (normalizedEmail: string) => {
    if (!signIn || !setSignInActive) {
      throw new Error(t('auth.authNotReady'))
    }

    const signInAttempt = await signIn.create({
      identifier: normalizedEmail,
    })

    const emailFactor = signInAttempt.supportedFirstFactors?.find(
      (factor) => factor.strategy === 'email_code' && 'emailAddressId' in factor,
    )

    if (!emailFactor || !('emailAddressId' in emailFactor)) {
      throw new Error(t('auth.emailCodeNotEnabled'))
    }

    await signInAttempt.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailFactor.emailAddressId,
    })

    setHasVerifiedSession(false)
    setFlow('sign-in')
    setSignInEmailAddressId(emailFactor.emailAddressId)
  }

  const startSignUpFlow = async (normalizedEmail: string) => {
    if (!signUp || !setSignUpActive) {
      throw new Error(t('auth.authNotReady'))
    }

    const signUpAttempt = await signUp.create({
      emailAddress: normalizedEmail,
    })

    await signUpAttempt.prepareEmailAddressVerification({
      strategy: 'email_code',
    })

    setHasVerifiedSession(false)
    setFlow('sign-up')
  }

  const handleSendCode = () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert(t('auth.invalidEmailTitle'), t('auth.invalidEmailBody'))
      return
    }

    setStep('age-gate')
  }

  const handleAgeGate = async () => {
    if (!dob.trim()) {
      Alert.alert(
        t('auth.dateOfBirthRequiredTitle'),
        t('auth.dateOfBirthRequiredBody'),
      )
      return
    }

    const parsedDob = parseDateOfBirthInput(dob)
    if (!parsedDob) {
      Alert.alert(
        t('auth.dateOfBirthInvalidTitle'),
        t('auth.dateOfBirthInvalidBody'),
      )
      return
    }

    if (!isClerkReady) {
      Alert.alert(t('auth.loadingTitle'), t('auth.loadingBody'))
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    setIsLoading(true)

    try {
      try {
        await startSignInFlow(normalizedEmail)
      } catch (error) {
        if (error instanceof UnsupportedClerkFlowError) {
          throw error
        }

        if (!isIdentifierNotFoundError(error)) {
          throw error
        }

        await startSignUpFlow(normalizedEmail)
      }

      setStep('code')
      setCode('')
      Alert.alert(
        t('auth.checkEmailTitle'),
        t('auth.checkEmailBody', { email: normalizedEmail }),
      )
    } catch (error) {
      if (error instanceof UnsupportedClerkFlowError) {
        showUnsupportedClerkAlert(error.resolution)
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

  const handleVerifyCode = async () => {
    if (!code.trim()) return

    const parsedDob = parseDateOfBirthInput(dob)
    if (!parsedDob) {
      Alert.alert(
        t('auth.dateOfBirthInvalidTitle'),
        t('auth.dateOfBirthInvalidBody'),
      )
      setStep('age-gate')
      return
    }

    if (!isClerkReady) {
      Alert.alert(t('auth.loadingTitle'), t('auth.loadingBody'))
      return
    }

    setIsLoading(true)

    try {
      if (!hasVerifiedSession) {
        if (flow === 'sign-in') {
          if (!signIn || !setSignInActive) {
            throw new Error(t('auth.authNotReady'))
          }

          const attempt = await signIn.attemptFirstFactor({
            strategy: 'email_code',
            code: code.trim(),
          })

          const resolution = resolveVerificationAttempt('sign-in', attempt)
          if (resolution.kind !== 'session') {
            throw new UnsupportedClerkFlowError(resolution)
          }

          await setSignInActive({ session: resolution.sessionId })
        } else if (flow === 'sign-up') {
          if (!signUp || !setSignUpActive) {
            throw new Error(t('auth.authNotReady'))
          }

          const attempt = await signUp.attemptEmailAddressVerification({
            code: code.trim(),
          })

          const resolution = resolveVerificationAttempt('sign-up', attempt)
          if (resolution.kind !== 'session') {
            throw new UnsupportedClerkFlowError(resolution)
          }

          await setSignUpActive({ session: resolution.sessionId })
        } else {
          throw new Error(t('auth.restartVerification'))
        }

        setHasVerifiedSession(true)
      }

      const sessionToken = await waitForSessionToken()
      if (!sessionToken) {
        throw new Error(t('auth.sessionNotReady'))
      }

      try {
        await api('/me', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
          body: { dateOfBirth: parsedDob.iso },
        })
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes('read-only')
        ) {
          throw error
        }
      }

      await refreshUser(sessionToken)
      if (inviteCode) {
        router.replace({ pathname: '/join/[code]', params: { code: inviteCode } })
        return
      }

      router.replace('/')
    } catch (error) {
      if (error instanceof UnsupportedClerkFlowError) {
        setHasVerifiedSession(false)
        showUnsupportedClerkAlert(error.resolution)
      } else if (isClerkAPIResponseError(error)) {
        setHasVerifiedSession(false)
        Alert.alert(
          t('auth.verifyCodeErrorTitle'),
          getAuthErrorMessage(error, t('auth.verifyCodeErrorBody')),
        )
      } else if (error instanceof ApiError && error.code === 'UPGRADE_REQUIRED') {
        // ForceUpdateScreen in _layout.tsx handles this — don't show an alert
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
    if (hasVerifiedSession) {
      await handleVerifyCode()
      return
    }

    if (!isClerkReady) {
      Alert.alert(t('auth.loadingTitle'), t('auth.loadingBody'))
      return
    }

    setIsLoading(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()

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
      Alert.alert(
        t('auth.codeSentTitle'),
        t('auth.codeSentBody', { email: email.trim().toLowerCase() }),
      )
    } catch (error) {
      if (error instanceof UnsupportedClerkFlowError) {
        showUnsupportedClerkAlert(error.resolution)
        return
      }

      Alert.alert(
        t('auth.resendCodeErrorTitle'),
        getAuthErrorMessage(error, t('auth.resendCodeErrorBody')),
      )
    } finally {
      setIsLoading(false)
    }
  }

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
            <Text style={styles.languageLabel}>{t('common.language')}</Text>
            <LanguageSwitch value={currentLanguage} onChange={handleLanguageChange} />
          </View>

          <View style={styles.header}>
            <Image
              source={illustrations.onboardingHero}
              style={styles.heroIllustration}
              resizeMode="contain"
            />
            <Text style={styles.logo}>Anstoss</Text>
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          </View>

          {inviteCode ? (
            <View style={styles.inviteHintCard}>
              <Text style={styles.inviteHintText}>{t('auth.inviteResumeHint')}</Text>
            </View>
          ) : null}

          <View style={styles.formCard}>
            {step === 'email' && (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.emailLabel')}</Text>
                <TextInput
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
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleSendCode}
                  disabled={isLoading}
                >
                  <Text style={styles.buttonText}>{t('auth.emailContinue')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'age-gate' && (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.dateOfBirth')}</Text>
                <Text style={styles.hint}>{t('auth.dateOfBirthHint')}</Text>
                <TextInput
                  style={styles.input}
                  value={dob}
                  onChangeText={(value) => setDob(formatDateOfBirthInput(value))}
                  placeholder={t('auth.dateOfBirthPlaceholder')}
                  placeholderTextColor={neutralColors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={10}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleAgeGate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.buttonText}>{t('auth.continue')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.backLink} onPress={() => setStep('email')}>
                  <Text style={styles.backLinkText}>{t('auth.useDifferentEmail')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'code' && (
              <View style={styles.form}>
                <Text style={styles.label}>{t('auth.verificationCodeLabel')}</Text>
                <Text style={styles.hint}>
                  {t('auth.verificationCodeHint', { email: email.trim().toLowerCase() })}
                </Text>
                <TextInput
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
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleVerifyCode}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.buttonText}>{t('auth.verify')}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleResendCode}
                  disabled={isLoading}
                >
                  <Text style={styles.secondaryButtonText}>
                    {hasVerifiedSession
                      ? t('auth.retryFinishSignIn')
                      : t('auth.resendCode')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backLink} onPress={resetToEmailStep}>
                  <Text style={styles.backLinkText}>{t('auth.useDifferentEmail')}</Text>
                </TouchableOpacity>
              </View>
            )}
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
    paddingTop: 28,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: neutralColors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  heroIllustration: {
    width: 228,
    height: 164,
    marginBottom: 8,
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    letterSpacing: -1,
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 23,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  formCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 16,
    backgroundColor: neutralColors.surface,
    padding: 20,
  },
  inviteHintCard: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inviteHintText: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  hint: {
    marginTop: -4,
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.background,
  },
  button: {
    height: 52,
    borderRadius: 10,
    backgroundColor: neutralColors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: neutralColors.textInverse,
  },
  secondaryButton: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: neutralColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: neutralColors.surface,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backLinkText: {
    fontSize: 14,
    color: neutralColors.textSecondary,
    textDecorationLine: 'underline',
  },
})
