import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Pressable, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { OtpCellInput } from '../../src/components/wizard/OtpCellInput'
import {
  classifyIdentifier,
  normalizeIdentifier,
  useOnboardingAuth,
} from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api, ApiError } from '../../src/api/client'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const PHONE_RE = /^\+[1-9]\d{7,14}$/
const RESEND_COOLDOWN_S = 30

type PendingClaim = {
  slotId: string
  fullName: string
  position: string | null
  jerseyNumber: number | null
  team: { id: string; name: string }
  club: { id: string; name: string; primaryColor: string | null; badgeUrl: string | null }
}

/**
 * Combined phone + OTP signup screen. Progressive disclosure: phone
 * field shows first; tap "Send code" and the OTP cells fade in below
 * with the phone field collapsing to a tappable summary. Same UX as
 * the dedicated /sign-in screen, but for signup mode (creates the
 * Clerk signUp record + checks for roster claims after verify).
 *
 * Replaces the previous 2-screen phone → code wizard. Saves a tap +
 * keeps the user in flow.
 */
export default function PhoneOtpSignup() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { startOtp, verifyOtp, finalizeSession } = useOnboardingAuth()
  const { state, update, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/phone'), [markStep])

  // Pre-fill with whichever identifier the user typed on sign-in. The
  // sign-in screen passes the typed value into flow state before
  // redirecting here.
  const [phone, setPhone] = useState(state.email ?? state.phone ?? '')
  const [stage, setStage] = useState<'phone' | 'otp'>('phone')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const phoneFade = useRef(new Animated.Value(1)).current
  const otpFade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Accept either a phone number (+…) or an email address (anything
  // with @). The classifier resolves which Clerk strategy startOtp uses.
  const identifierKind = classifyIdentifier(phone)
  const normalized = normalizeIdentifier(phone, identifierKind)
  const phoneValid =
    identifierKind === 'email'
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      : identifierKind === 'phone'
        ? PHONE_RE.test(normalized)
        : false

  async function handleSendCode() {
    if (!phoneValid || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await startOtp(normalized, 'signup', identifierKind ?? undefined)
      if (identifierKind === 'email') {
        update({ email: normalized, phone: undefined })
      } else {
        update({ phone: normalized, email: undefined })
      }
      setStage('otp')
      setCooldown(RESEND_COOLDOWN_S)
      Animated.parallel([
        Animated.timing(phoneFade, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(otpFade, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start()
    } catch (e) {
      if (__DEV__) console.warn('startPhoneOtp failed', e)
      const clerkMessage =
        (e as { errors?: { message?: string; longMessage?: string }[] })?.errors?.[0]
          ?.longMessage ??
        (e as { errors?: { message?: string }[] })?.errors?.[0]?.message ??
        (e as { message?: string })?.message ??
        null
      setError(clerkMessage ?? t('onboarding.phone.sendFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify() {
    if (code.length < 6 || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await verifyOtp(code)
      // Activate the Clerk session immediately after OTP verification so
      // the token getter has a live token before we call protected APIs.
      // Without this, api() calls below run without a Bearer token and
      // the server returns 401, which was previously (incorrectly) treated
      // as "no pending claims".
      await finalizeSession()
      // Auto-claim short-circuit: if the phone matches a pre-created
      // roster slot, jump straight to the claim confirmation screen.
      // We now distinguish a real 401 (auth failure → surface error) from
      // an empty result (no claims → continue to wizard).
      let claims: PendingClaim[] = []
      try {
        claims = (await api<PendingClaim[]>('/onboarding/pending-claims')) ?? []
      } catch (e) {
        // A 401 here means the session token isn't usable yet — surface
        // the error rather than silently dropping into the wizard with a
        // broken session. Any other network error is tolerated (empty list).
        if (e instanceof ApiError && e.status === 401) {
          throw e
        }
        claims = []
      }
      if (claims.length > 0) {
        router.push('/(auth)/auto-claim')
      } else {
        router.push('/(auth)/about')
      }
    } catch (e) {
      // Re-use the OTP error message for OTP failures; show a distinct
      // message if the session activation or claims fetch 401'd.
      if (e instanceof ApiError && e.status === 401) {
        setError(t('onboarding.code.sessionError', { defaultValue: 'Session setup failed. Please try again.' }))
      } else {
        setError(t('onboarding.code.wrong'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !normalized) return
    try {
      await startOtp(normalized, 'signup', identifierKind ?? undefined)
      setCooldown(RESEND_COOLDOWN_S)
    } catch {
      // tolerated
    }
  }

  function editPhone() {
    setStage('phone')
    setCode('')
    setError(null)
    Animated.parallel([
      Animated.timing(otpFade, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(phoneFade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start()
  }

  return (
    <WizardStep
      stepLabel={t('onboarding.stepOf', {
        defaultValue: 'Step {{n}} of {{total}}',
        n: 1,
        total: 4,
      })}
      title={
        stage === 'phone'
          ? t('onboarding.phone.title')
          : t('onboarding.code.title')
      }
      hint={
        stage === 'phone'
          ? t('onboarding.phone.hint')
          : t('onboarding.phone.codeHint', {
              defaultValue: 'Sent to {{phone}}. Tap to edit.',
              phone: normalized,
            })
      }
      ctaLabel={
        stage === 'phone'
          ? t('onboarding.phone.cta')
          : t('onboarding.code.cta')
      }
      onCta={stage === 'phone' ? handleSendCode : handleVerify}
      ctaDisabled={
        submitting ||
        (stage === 'phone' ? !phoneValid : code.length < 6)
      }
      ctaLoading={submitting}
      step={{ current: 1, total: 4 }}
    >
      {stage === 'phone' ? (
        <Animated.View style={{ opacity: phoneFade }}>
          <TextInput
            value={phone}
            onChangeText={(v) => {
              setPhone(v)
              setError(null)
            }}
            placeholder={t('onboarding.phone.identifierPlaceholder', {
              defaultValue: 'Phone number or email',
            })}
            placeholderTextColor={colors.textSecondary}
            keyboardType={
              identifierKind === 'email'
                ? 'email-address'
                : identifierKind === 'phone'
                  ? 'phone-pad'
                  : 'default'
            }
            autoCapitalize="none"
            autoComplete={identifierKind === 'email' ? 'email' : 'tel'}
            textContentType={
              identifierKind === 'email' ? 'emailAddress' : 'telephoneNumber'
            }
            autoCorrect={false}
            autoFocus
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSunken,
              },
            ]}
          />
        </Animated.View>
      ) : (
        <>
          <Pressable
            onPress={editPhone}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.phone.editPhone', {
              defaultValue: 'Edit phone number',
            })}
            style={[
              styles.phoneSummary,
              {
                borderColor: colors.borderDefault,
                backgroundColor: colors.surfaceSunken,
              },
            ]}
          >
            <Text style={[styles.phoneSummaryText, { color: colors.textPrimary }]}>
              {normalized}
            </Text>
            <Text style={[styles.phoneSummaryEdit, { color: colors.primary }]}>
              {t('common.edit')}
            </Text>
          </Pressable>
          <Animated.View style={{ opacity: otpFade, marginTop: space.md }}>
            <OtpCellInput
              value={code}
              onChange={(v) => {
                setCode(v)
                setError(null)
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleResend}
              disabled={cooldown > 0}
              style={styles.resend}
            >
              <Text
                style={[
                  styles.resendText,
                  {
                    color:
                      cooldown > 0 ? colors.textSecondary : colors.primary,
                  },
                ]}
              >
                {cooldown > 0
                  ? t('onboarding.code.resendIn', { seconds: cooldown })
                  : t('onboarding.code.resend')}
              </Text>
            </Pressable>
          </Animated.View>
        </>
      )}

      {error ? (
        <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
      ) : null}
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
  },
  phoneSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.md,
  },
  phoneSummaryText: {
    fontFamily: fonts.data,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  phoneSummaryEdit: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  resend: {
    marginTop: space.lg,
    alignItems: 'center',
  },
  resendText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  error: {
    marginTop: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
})
