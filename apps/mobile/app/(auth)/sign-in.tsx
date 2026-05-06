/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { OtpCellInput } from '../../src/components/wizard/OtpCellInput'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Text } from '../../src/components/ui'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const RESEND_COOLDOWN_S = 30

/**
 * Sign-in entry — bare phone-then-OTP on a single screen. Used as the
 * default route for unsigned users (welcome.tsx is reserved for
 * first-time signup). Progressive disclosure: phone field, then on
 * "Send code" the OTP cells reveal inline below + the phone field
 * collapses to a tappable summary.
 */
export default function SignIn() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { startPhoneOtp, verifyPhoneOtp, finalizeSession } = useOnboardingAuth()
  const { reset } = useOnboardingFlow()

  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState<'phone' | 'otp'>('phone')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const otpFade = useRef(new Animated.Value(0)).current
  const phoneFade = useRef(new Animated.Value(1)).current

  const phoneValid = /^\+\d[\d ]{6,}$/.test(phone.trim())

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function handleSendCode() {
    if (!phoneValid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await startPhoneOtp(phone.trim(), 'signin')
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
    } catch (err) {
      setError(
        err instanceof Error
          ? t('auth.signin.notFound', {
              defaultValue:
                'No account uses that number. Tap "Create account" below.',
            })
          : t('onboarding.phone.sendFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify() {
    if (code.length < 6 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await verifyPhoneOtp(code)
      await finalizeSession()
      reset()
      router.replace('/')
    } catch {
      setError(t('onboarding.code.wrong'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !phone.trim()) return
    try {
      await startPhoneOtp(phone.trim(), 'signin')
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View style={[styles.body, { paddingTop: insets.top + space.xl }]}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
        />

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {stage === 'phone'
            ? t('auth.signin.title', { defaultValue: 'Welcome back' })
            : t('auth.signin.titleOtp', { defaultValue: 'Enter the code' })}
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {stage === 'phone'
            ? t('auth.signin.hint', {
                defaultValue: 'Use the phone number on your account.',
              })
            : t('auth.signin.hintOtp', {
                defaultValue: 'Sent to {{phone}}. Tap to edit.',
                phone: phone.trim(),
              })}
        </Text>

        {/* Phone field — visible on stage=phone, collapsed summary on stage=otp */}
        {stage === 'phone' ? (
          <Animated.View style={{ opacity: phoneFade, marginTop: space.lg }}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+49 151 1234 5678"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              autoFocus
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  borderColor: colors.borderDefault,
                  backgroundColor: colors.surfaceSunken,
                },
              ]}
            />
          </Animated.View>
        ) : (
          <Pressable
            onPress={editPhone}
            accessibilityRole="button"
            accessibilityLabel={t('auth.signin.editPhone', { defaultValue: 'Edit number' })}
            style={[
              styles.phoneSummary,
              { borderColor: colors.borderDefault, backgroundColor: colors.surfaceSunken },
            ]}
          >
            <Text style={[styles.phoneSummaryText, { color: colors.textPrimary }]}>
              {phone.trim()}
            </Text>
            <Text style={[styles.phoneSummaryEdit, { color: colors.primary }]}>
              {t('common.edit')}
            </Text>
          </Pressable>
        )}

        {/* OTP cells — animate in once Send fires */}
        {stage === 'otp' ? (
          <Animated.View style={{ opacity: otpFade, marginTop: space.lg }}>
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
                  { color: cooldown > 0 ? colors.textSecondary : colors.primary },
                ]}
              >
                {cooldown > 0
                  ? t('onboarding.code.resendIn', { seconds: cooldown })
                  : t('onboarding.code.resend')}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Pressable
          accessibilityRole="button"
          onPress={stage === 'phone' ? handleSendCode : handleVerify}
          disabled={
            submitting ||
            (stage === 'phone' ? !phoneValid : code.length < 6)
          }
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.textPrimary },
            (submitting ||
              (stage === 'phone' ? !phoneValid : code.length < 6)) && {
              opacity: 0.5,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={[styles.ctaLabel, { color: colors.surface }]}>
              {stage === 'phone'
                ? t('auth.signin.sendCode', { defaultValue: 'Send code' })
                : t('auth.signin.verify', { defaultValue: 'Sign in' })}
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/(auth)/welcome')}
          hitSlop={12}
          style={styles.signupLink}
        >
          <Text style={[styles.signupText, { color: colors.textSecondary }]}>
            {t('auth.signin.noAccount', { defaultValue: 'First time?' })}{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>
              {t('auth.signin.signup', { defaultValue: 'Create account' })}
            </Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: space.lg,
    gap: 6,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    marginBottom: space.lg,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
  },
  phoneSummary: {
    marginTop: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.md,
  },
  phoneSummaryText: {
    fontFamily: fonts.body,
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
  footer: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  cta: {
    height: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  signupLink: { alignSelf: 'center', paddingVertical: space.sm },
  signupText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
})
