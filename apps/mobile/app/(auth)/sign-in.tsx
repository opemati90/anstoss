import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { OtpCellInput } from '../../src/components/wizard/OtpCellInput'
import { usePendingInvite } from '../../src/auth/pendingInvite'
import { PolicyOverlay } from '../../src/components/wizard/PolicyOverlay'
import type { PolicyKind } from '../../src/content/policies'
import {
  classifyIdentifier,
  normalizeIdentifier,
  useOnboardingAuth,
} from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Icon, Text } from '../../src/components/ui'
import { goBackOrReplace } from '../../src/utils/navigation'
import { Sentry } from '../../src/utils/sentry'
import { fontSize, fontWeight, fonts, hairline, radius, space } from '../../src/theme/tokens'

const RESEND_COOLDOWN_S = 30

// Phone OTP requires an SMS provider (e.g. Twilio) wired into the backend
// email-OTP service. Until that's configured, the app ships EMAIL-only OTP.
// Flip to true once SMS delivery is connected server-side.
const PHONE_OTP_ENABLED = false

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
  // Carried through from an invite deep link (/join/<code> -> sign-in) so the
  // user lands back on the invite to redeem it once authenticated. Prefer the
  // route param; fall back to the persisted code after a cold relaunch.
  const { inviteCode: inviteCodeParam } = useLocalSearchParams<{ inviteCode?: string }>()
  const storedInvite = usePendingInvite()
  const inviteCode =
    (Array.isArray(inviteCodeParam) ? inviteCodeParam[0] : inviteCodeParam) ??
    storedInvite ??
    undefined
  const { startOtp, verifyOtp, completeSignUpIfReady, setBasicProfile } = useOnboardingAuth()
  const { update } = useOnboardingFlow()

  const [identifier, setIdentifier] = useState('')
  const [stage, setStage] = useState<'phone' | 'otp' | 'name'>('phone')
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [policyKind, setPolicyKind] = useState<PolicyKind | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  // Atomic in-flight guard (see phone.tsx): defeats a CTA tap racing the OTP
  // auto-submit in the same tick before `submitting` state re-renders.
  const verifyingRef = useRef(false)
  // Single source of truth for which OTP flow is live (signin vs the
  // signup-fallback), set synchronously so resend can't read a stale value.
  const modeRef = useRef<'signin' | 'signup'>('signin')

  // Smart identifier detection — single input accepts either an email
  // (anything with @) or a phone number (anything starting with +).
  // startOtp routes to the matching OTP strategy (email today; phone later).
  const identifierKind = classifyIdentifier(identifier)
  const normalizedIdentifier = normalizeIdentifier(identifier, identifierKind)
  const identifierValid =
    identifierKind === 'email'
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)
      : identifierKind === 'phone'
        ? /^\+\d{7,}$/.test(normalizedIdentifier)
        : false

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  function isNoAccount(err: unknown) {
    // Only the auth service's structured "no such identifier" code triggers the seamless
    // signin->signup fallback. Matching free-form message text risks turning an
    // unrelated network/proxy "not found" into an accidental signup.
    const m = err as { errors?: Array<{ code?: string }> }
    return m?.errors?.[0]?.code === 'form_identifier_not_found'
  }

  // Surface the auth service's actual reason instead of swallowing it — without this the
  // generic "couldn't send a code" hides the real cause (e.g. dev-instance
  // restrictions, rate limits, provider not configured) making it undebuggable.
  function authErrorMessage(err: unknown): string | null {
    const e = (err as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0]
    return e?.longMessage || e?.message || null
  }

  function revealOtp() {
    setStage('otp')
    setCooldown(RESEND_COOLDOWN_S)
  }

  async function handleSendCode() {
    if (!identifierValid || submitting) return
    if (!PHONE_OTP_ENABLED && identifierKind === 'phone') {
      setError(
        t('auth.signin.phoneSoon', {
          defaultValue: 'Use your email to sign in.',
        }),
      )
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Seamless: try sign-in first; if no account exists yet, transparently
      // start a sign-up with the same code step. The user never has to choose
      // "sign in vs sign up" and never hits a "no account" dead-end.
      let resolvedMode: 'signin' | 'signup' = 'signin'
      try {
        await startOtp(normalizedIdentifier, 'signin', identifierKind ?? undefined)
      } catch (err) {
        if (!isNoAccount(err)) throw err
        await startOtp(normalizedIdentifier, 'signup', identifierKind ?? undefined)
        resolvedMode = 'signup'
      }
      modeRef.current = resolvedMode
      revealOtp()
    } catch (err) {
      // Log the real auth error so prod failures are diagnosable (Sentry +
      // dev console), and show the service reason when available.
      Sentry.captureException(err, { tags: { flow: 'send-otp' } })
      if (__DEV__) console.warn('[send-otp] failed:', err)
      setError(
        authErrorMessage(err) ??
          t('onboarding.phone.sendFailed', {
            defaultValue: "We couldn't send a code. Check the email and try again.",
          }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Only navigate once an auth session is genuinely active.
  //  - Returning sign-in → index.tsx routes by membership/role.
  //  - New sign-up → the profile wizard (name + DOB → role → club), now entered
  //    on an authenticated, durable account so it's fully resumable and still
  //    captures the role + date-of-birth the age gate needs. We keep the
  //    onboarding flow state (it carries the display name) — don't reset here.
  function routeAfterAuth() {
    if (modeRef.current === 'signup') {
      // New user: collect name + DOB first (about). Forward the invite so about
      // can redeem it after the profile step instead of going to role/club.
      router.replace(
        inviteCode ? { pathname: '/(auth)/about', params: { inviteCode } } : '/(auth)/about',
      )
    } else if (inviteCode) {
      // Returning user already has a profile — go straight to redeem.
      router.replace(`/join/${inviteCode}`)
    } else {
      router.replace('/')
    }
  }

  async function handleVerify(submittedCode: string = code) {
    if (submittedCode.length < 6 || submitting || verifyingRef.current) return
    verifyingRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      await verifyOtp(submittedCode)
      // Activate the moment the auth service has everything it needs — the account is now
      // durable, so the rest of onboarding is resumable on a signed-in user.
      const { activated, missingFields } = await completeSignUpIfReady()
      if (activated) {
        routeAfterAuth()
        return
      }
      // New sign-ups may still owe a display name; collect it inline.
      if (missingFields.includes('first_name')) {
        setStage('name')
        return
      }
      // Anything else the auth service needs can't be collected here — never navigate on an
      // un-activated session (that would bounce back to this screen with the
      // code already spent). Surface a recoverable error and stay put.
      setError(
        t('auth.signin.couldNotComplete', {
          defaultValue: 'We couldn’t finish that. Please try again.',
        }),
      )
    } catch {
      setError(
        t('onboarding.code.wrong', {
          defaultValue: "That code didn't work. Check it and try again.",
        }),
      )
    } finally {
      verifyingRef.current = false
      setSubmitting(false)
    }
  }

  async function handleSubmitName() {
    const trimmed = firstName.trim()
    if (trimmed.length < 2 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await setBasicProfile({ firstName: trimmed })
      update({ firstName: trimmed })
      const { activated } = await completeSignUpIfReady()
      if (activated) {
        routeAfterAuth()
        return
      }
      // Still not complete after the name — don't strand the user mid-screen.
      setError(
        t('auth.signin.couldNotComplete', {
          defaultValue: 'We couldn’t finish that. Please try again.',
        }),
      )
    } catch {
      setError(
        t('auth.signin.couldNotComplete', {
          defaultValue: 'We couldn’t finish that. Please try again.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !normalizedIdentifier) return
    try {
      await startOtp(normalizedIdentifier, modeRef.current, identifierKind ?? undefined)
      setCooldown(RESEND_COOLDOWN_S)
    } catch {
      // tolerated
    }
  }

  function editPhone() {
    setStage('phone')
    setCode('')
    setError(null)
  }

  // Back: the OTP / name stages step back to the identifier within this screen;
  // the identifier stage leaves sign-in for the welcome hero (or replaces to it
  // when sign-in was the cold-launch entry and there's no back stack to pop).
  function handleBack() {
    if (stage !== 'phone') {
      editPhone()
      return
    }
    goBackOrReplace(router, '/(auth)/welcome')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + space.xl,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Icon name="chevron.left" size={24} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {stage === 'phone'
            ? t('auth.signin.title', { defaultValue: 'Welcome' })
            : stage === 'otp'
              ? t('auth.signin.titleOtp', { defaultValue: 'Enter the code' })
              : t('auth.signin.titleName', { defaultValue: 'What’s your name?' })}
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {stage === 'phone'
            ? t('auth.signin.hintIdentifier', {
                defaultValue: 'Enter your email. We’ll send a 6-digit code.',
              })
            : stage === 'otp'
              ? t('auth.signin.hintOtp', {
                  defaultValue: 'Sent to {{identifier}}. Tap to edit.',
                  identifier: identifier.trim(),
                  phone: identifier.trim(),
                })
              : t('auth.signin.hintName', {
                  defaultValue: 'Choose the name or username people will see.',
                })}
        </Text>

        {/* Identifier field — accepts either phone (+…) or email (anything
            with @). Keyboard type switches automatically based on what
            the user has typed so far; falls back to `default` until we
            can tell. Collapses to a tappable summary once the code is sent. */}
        {stage === 'phone' ? (
          <View style={styles.identifierWrap}>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={
                PHONE_OTP_ENABLED
                  ? t('auth.signin.identifierPlaceholder', {
                      defaultValue: 'Email or phone',
                    })
                  : t('auth.signin.emailPlaceholder', {
                      defaultValue: 'Email address',
                    })
              }
              placeholderTextColor={colors.textSecondary}
              // Keep keyboardType STABLE. Switching it reactively as the user
              // types (default -> phone-pad once "+" appears) remounts the input
              // on iOS and drops/reorders characters mid-entry. The default
              // keyboard handles both "+digits" and "name@host" fine for a
              // dual phone-or-email field. Email-only mode uses the email keyboard.
              keyboardType={PHONE_OTP_ENABLED ? 'default' : 'email-address'}
              autoCapitalize="none"
              autoComplete={identifierKind === 'email' ? 'email' : 'tel'}
              autoCorrect={false}
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
          </View>
        ) : stage === 'otp' ? (
          <Pressable
            onPress={editPhone}
            accessibilityRole="button"
            accessibilityLabel={t('auth.signin.editIdentifier', {
              defaultValue: 'Edit email',
            })}
            style={[
              styles.phoneSummary,
              { borderColor: colors.borderDefault, backgroundColor: colors.surfaceSunken },
            ]}
          >
            <Text style={[styles.phoneSummaryText, { color: colors.textPrimary }]}>
              {identifier.trim()}
            </Text>
            <Text style={[styles.phoneSummaryEdit, { color: colors.primary }]}>
              {t('common.edit', { defaultValue: 'Edit' })}
            </Text>
          </Pressable>
        ) : null}

        {/* OTP cells — visible immediately once Send fires; auto-submit on the 6th digit. */}
        {stage === 'otp' ? (
          <View style={styles.otpWrap}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('auth.signin.codeLabel', { defaultValue: '6-digit code' })}
            </Text>
            <OtpCellInput
              value={code}
              onChange={(v) => {
                setCode(v)
                setError(null)
              }}
              onComplete={(c) => handleVerify(c)}
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
                  ? t('onboarding.code.resendIn', {
                      defaultValue: 'Resend in {{seconds}}s',
                      seconds: cooldown,
                    })
                  : t('onboarding.code.resend', {
                      defaultValue: 'Resend code',
                    })}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Display name — real name or username, shown to other members. */}
        {stage === 'name' ? (
          <View style={styles.identifierWrap}>
            <TextInput
              value={firstName}
              onChangeText={(v) => {
                setFirstName(v)
                setError(null)
              }}
              placeholder={t('onboarding.name.placeholder', {
                defaultValue: 'Your name or username',
              })}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmitName}
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  borderColor: colors.borderDefault,
                  backgroundColor: colors.surfaceSunken,
                },
              ]}
            />
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

        {/* Primary CTA stays in the scroll flow so the keyboard can't overdraw
            the OTP cells on short phones. */}
        <View style={styles.ctaWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={
              stage === 'phone'
                ? handleSendCode
                : stage === 'otp'
                  ? () => handleVerify()
                  : handleSubmitName
            }
            disabled={
              submitting ||
              (stage === 'phone'
                ? !identifierValid
                : stage === 'otp'
                  ? code.length < 6
                  : firstName.trim().length < 2)
            }
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.primary },
              (submitting ||
                (stage === 'phone'
                  ? !identifierValid
                  : stage === 'otp'
                    ? code.length < 6
                    : firstName.trim().length < 2)) && {
                opacity: 0.5,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={[styles.ctaLabel, { color: colors.textInverse }]}>
                {stage === 'phone'
                  ? t('auth.signin.sendCode', { defaultValue: 'Send code' })
                  : t('auth.signin.continue', { defaultValue: 'Continue' })}
              </Text>
            )}
          </Pressable>

          {stage === 'phone' ? (
            <Text style={[styles.consent, { color: colors.textTertiary }]}>
              {t('auth.signin.consentPrefix', {
                defaultValue: 'By continuing you agree to our ',
              })}
              <Text
                onPress={() => setPolicyKind('terms')}
                style={[styles.consentLink, { color: colors.textSecondary }]}
              >
                {t('onboarding.welcome.policyTerms', { defaultValue: 'Terms' })}
              </Text>
              {t('onboarding.welcome.policyAnd', { defaultValue: ' and ' })}
              <Text
                onPress={() => setPolicyKind('privacy')}
                style={[styles.consentLink, { color: colors.textSecondary }]}
              >
                {t('onboarding.welcome.policyPrivacy', { defaultValue: 'Privacy Policy' })}
              </Text>
              .
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <PolicyOverlay
        visible={policyKind !== null}
        kind={policyKind ?? 'terms'}
        onClose={() => setPolicyKind(null)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    gap: space.xs + 2,
  },
  ctaWrap: {
    marginTop: space.xl,
    gap: space.md,
  },
  identifierWrap: {
    marginTop: space.lg,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: space.sm,
    marginLeft: -(space.xs + 2),
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize['3xl'],
    lineHeight: 36,
    fontWeight: fontWeight.bold,
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
    fontWeight: fontWeight.medium,
  },
  phoneSummaryEdit: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  otpWrap: {
    marginTop: space.lg,
    gap: space.sm,
  },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  resend: {
    marginTop: space.lg,
    alignItems: 'center',
  },
  resendText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  error: {
    marginTop: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  cta: {
    height: 54,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.2,
  },
  consent: {
    marginTop: space.md,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  consentLink: {
    // Nested <Text> from the custom ui component otherwise re-applies its
    // default body size (16) and the links balloon next to the xs sentence —
    // pin size + lineHeight so the whole line is uniform.
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    lineHeight: 18,
    fontWeight: fontWeight.bold,
    textDecorationLine: 'underline',
  },
})
