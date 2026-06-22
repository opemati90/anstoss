import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { Icon, Text } from '../../src/components/ui'
import { FormInput } from '../../src/components/FormInput'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { DobScrollPicker } from '../../src/components/wizard/DobScrollPicker'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useAuth } from '../../src/context/AuthContext'
import { api } from '../../src/api/client'
import { usePendingInvite } from '../../src/auth/pendingInvite'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, lineHeight, radius, space } from '../../src/theme/tokens'
import { ONBOARDING_STEP, ONBOARDING_TOTAL, onboardingStep } from '../../src/onboarding/steps'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

function parseStateDob(iso: string | undefined): {
  day: number
  month: number
  year: number
} | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
  }
}

export default function About() {
  const router = useRouter()
  const { inviteCode: inviteCodeParam } = useLocalSearchParams<{ inviteCode?: string }>()
  const storedInvite = usePendingInvite()
  const inviteCode =
    (Array.isArray(inviteCodeParam) ? inviteCodeParam[0] : inviteCodeParam) ??
    storedInvite ??
    undefined
  const { t, i18n } = useTranslation()
  const colors = useClubColors()
  const { setBasicProfile, finalizeSession } = useOnboardingAuth()
  const { signOut } = useAuth()
  const { state, update, reset, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/about'), [markStep])

  const [firstName, setFirstName] = useState(state.firstName ?? '')
  const initialDob = parseStateDob(state.dateOfBirth)
  const defaultYear = new Date().getFullYear() - 25
  const [dob, setDob] = useState({
    day: initialDob?.day ?? 1,
    month: initialDob?.month ?? 1,
    year: initialDob?.year ?? defaultYear,
  })
  const dobRef = useRef(dob)
  const [dobTouched, setDobTouched] = useState(Boolean(initialDob))
  const [submitting, setSubmitting] = useState(false)
  // Under-16 parent handoff: collect the guardian's email, email them an invite,
  // then sign the child out. `sent` flips to the confirmation state.
  const [under16, setUnder16] = useState(false)
  const [guardianEmail, setGuardianEmail] = useState('')
  const [handoffSent, setHandoffSent] = useState(false)
  // The mint result: `sent` = guardian email delivered; `code` is returned only
  // when delivery failed, so the child can pass it to their guardian in person.
  const [handoffResult, setHandoffResult] = useState<{ sent: boolean; code: string | null } | null>(null)
  const [handoffError, setHandoffError] = useState<string | null>(null)

  useEffect(() => {
    dobRef.current = dob
  }, [dob])

  // Progressive disclosure: the DOB picker only reveals once the user
  // has typed enough of their name to commit. Reduces visual noise on
  // first paint + eases users into the form one decision at a time.
  const nameReady = firstName.trim().length >= 2
  const dobReady = nameReady
  const dobFade = useRef(new Animated.Value(state.firstName ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(dobFade, {
      toValue: dobReady ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [dobReady, dobFade])

  const dobDate = new Date(dob.year, dob.month - 1, dob.day)
  const dobValid = !Number.isNaN(dobDate.getTime())
  const canContinue = nameReady && dobTouched && dobValid && !submitting

  const handleDobChange = useCallback((next: { day: number; month: number; year: number }) => {
    const prev = dobRef.current
    if (prev.day === next.day && prev.month === next.month && prev.year === next.year) {
      return
    }
    dobRef.current = next
    setDob(next)
    setDobTouched(true)
  }, [])

  async function handleSubmit() {
    if (!canContinue) return
    if (ageInYears(dobDate) < 16) {
      // Under 16 (GDPR Art. 8 / Germany 16): they can't hold an account
      // themselves. Show the parent-handoff step — we keep the session alive
      // only long enough to email the guardian (localized to the language they
      // picked), then sign out. No child data is persisted server-side.
      setUnder16(true)
      return
    }
    setSubmitting(true)
    try {
      const trimmed = firstName.trim()
      try {
        await setBasicProfile({ firstName: trimmed })
      } catch {
        // setBasicProfile fails when the Clerk signUp is already complete
        // (phone signups that finalized immediately in phone.tsx). The name
        // is persisted via PATCH /me in done.tsx — safe to continue.
      }
      // Activate the Clerk session now that setBasicProfile may have
      // transitioned the signUp from missing_requirements → complete.
      // Without this, team-code.tsx's GET /teams/by-code/:code returns
      // 401 and shows "Invalid code" for every valid code entered.
      try {
        await finalizeSession()
      } catch {
        // Session may already be active (phone path) or not yet ready —
        // done.tsx will retry finalizeSession() and waitForToken().
      }
      const iso = `${dob.year.toString().padStart(4, '0')}-${dob.month
        .toString()
        .padStart(2, '0')}-${dob.day.toString().padStart(2, '0')}`
      update({ firstName: trimmed, dateOfBirth: iso })
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      if (inviteCode) {
        // Invite signup: role + club come from the invite, so skip the role/club
        // wizard. done.tsx (which normally PATCHes the profile) is skipped too,
        // so persist name + DOB here, then hand off to the invite to redeem.
        try {
          await api('/me', { method: 'PATCH', body: { name: trimmed, dateOfBirth: iso } })
        } catch {
          // The join screen still works if this fails; redeem is the gating call.
        }
        router.replace(`/join/${inviteCode}`)
        return
      }
      router.push('/(auth)/role')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendHandoff() {
    const email = guardianEmail.trim()
    if (!EMAIL_RE.test(email) || submitting) return
    // ISO datetime (UTC midnight) — matches the server's z.string().datetime().
    const iso = new Date(Date.UTC(dob.year, dob.month - 1, dob.day)).toISOString()
    setSubmitting(true)
    setHandoffError(null)
    try {
      // Only confirm on a real server response. The endpoint removes the child's
      // account server-side; if the POST itself fails the account is NOT removed,
      // so we must let the child retry rather than claim a handoff that didn't
      // happen.
      const res = await api<{ sent: boolean; code: string | null }>('/me/parent-handoff', {
        method: 'POST',
        body: {
          childFirstName: firstName.trim(),
          childDateOfBirth: iso,
          guardianEmail: email,
        },
      })
      await signOut()
      setHandoffResult(res)
      setHandoffSent(true)
    } catch {
      setHandoffError(
        t('onboarding.dob.handoffEmailError', {
          defaultValue: 'We couldn’t do that just now. Check the email and try again.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSkipHandoff() {
    if (submitting) return
    setSubmitting(true)
    try {
      await signOut()
    } finally {
      setSubmitting(false)
    }
    reset()
    router.replace('/(auth)/welcome')
  }

  if (under16 && handoffSent) {
    const delivered = handoffResult?.sent !== false
    const fallbackCode = handoffResult?.code ?? null
    return (
      <WizardStep
        title={
          delivered
            ? t('onboarding.dob.handoffSentTitle', { defaultValue: 'We’ve emailed your parent' })
            : t('onboarding.dob.handoffCodeTitle', { defaultValue: 'Give your parent this code' })
        }
        hint={
          delivered
            ? t('onboarding.dob.handoffSentBody', {
                defaultValue:
                  'They’ll get an email with how to set you up. Ask them to check their inbox (and spam). You can come back any time once they’re ready.',
              })
            : t('onboarding.dob.handoffCodeBody', {
                defaultValue:
                  'We couldn’t reach that email. Ask a parent to download Anstoss, create their own account, and enter this code to set you up.',
              })
        }
        ctaLabel={t('common.done', { defaultValue: 'Done' })}
        onCta={() => {
          reset()
          router.replace('/(auth)/welcome')
        }}
        step={onboardingStep('about')}
      >
        <View style={[styles.sentCard, { backgroundColor: colors.surfaceSunken, borderColor: colors.borderDefault }]}>
          {delivered ? (
            <>
              <Icon name="checkmark.circle.fill" size={28} color={colors.primary} />
              <Text style={[styles.sentEmail, { color: colors.textPrimary }]}>
                {guardianEmail.trim()}
              </Text>
            </>
          ) : (
            <Text style={[styles.handoffCode, { color: colors.textPrimary }]}>
              {fallbackCode}
            </Text>
          )}
        </View>
      </WizardStep>
    )
  }

  if (under16) {
    return (
      <WizardStep
        title={t('onboarding.dob.under16Title')}
        hint={t('onboarding.dob.handoffEmailBody', {
          defaultValue:
            'You need to be 16 to have your own account. Add a parent or guardian’s email and we’ll send them an invite to set you up.',
        })}
        ctaLabel={t('onboarding.dob.handoffEmailCta', {
          defaultValue: 'Send invite to my parent',
        })}
        onCta={handleSendHandoff}
        ctaDisabled={!EMAIL_RE.test(guardianEmail.trim()) || submitting}
        ctaLoading={submitting}
        step={onboardingStep('about')}
      >
        <View style={styles.body}>
          <FormInput
            label={t('onboarding.dob.handoffEmailLabel', {
              defaultValue: 'PARENT OR GUARDIAN’S EMAIL',
            })}
            value={guardianEmail}
            onChangeText={setGuardianEmail}
            placeholder={t('onboarding.dob.handoffEmailPlaceholder', {
              defaultValue: 'parent@example.com',
            })}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          {handoffError ? (
            <Text style={[styles.handoffErrorText, { color: colors.error }]}>
              {handoffError}
            </Text>
          ) : null}
          <Text
            onPress={handleSkipHandoff}
            accessibilityRole="button"
            style={[styles.skipLink, { color: colors.textSecondary }]}
          >
            {t('onboarding.dob.handoffSkip', { defaultValue: 'Not now' })}
          </Text>
        </View>
      </WizardStep>
    )
  }

  return (
    <WizardStep
      stepLabel={t('onboarding.stepOf', {
        defaultValue: 'Step {{n}} of {{total}}',
        n: ONBOARDING_STEP.about,
        total: ONBOARDING_TOTAL,
      })}
      title={t('onboarding.about.title', { defaultValue: 'About you' })}
      hint={t('onboarding.about.hint', {
        defaultValue: 'A first name + date of birth. Two taps and we\'re done.',
      })}
      ctaLabel={t('onboarding.about.cta', { defaultValue: 'Continue' })}
      onCta={handleSubmit}
      ctaDisabled={!canContinue}
      ctaLoading={submitting}
      step={onboardingStep('about')}
    >
      <View style={styles.body}>
        <FormInput
          label={t('onboarding.about.firstNameLabel', {
            defaultValue: 'FIRST NAME',
          })}
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t('onboarding.name.placeholder')}
          autoCapitalize="words"
          autoComplete="given-name"
        />

        <Animated.View
          pointerEvents={dobReady ? 'auto' : 'none'}
          style={{
            opacity: dobFade,
            transform: [
              {
                translateY: dobFade.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          }}
        >
          <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
            {t('onboarding.about.dobLabel', { defaultValue: 'DATE OF BIRTH' })}
          </Text>
          <View
            style={[
              styles.pickerCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderDefault,
              },
            ]}
          >
            <DobScrollPicker
              initialDay={dob.day}
              initialMonth={dob.month}
              initialYear={dob.year}
              onChange={handleDobChange}
              locale={i18n.language}
            />
          </View>
          <Text style={[styles.dobHint, { color: colors.textTertiary }]}>
            {t('onboarding.about.dobHint', {
              defaultValue:
                'We use this to age-gate accounts and welcome you on your birthday.',
            })}
          </Text>
        </Animated.View>
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.lg },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: fontSize.xs,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: space.xs + 2,
  },
  pickerCard: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
    paddingHorizontal: space.sm,
  },
  dobHint: {
    marginTop: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },

  sentCard: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    gap: space.sm + 2,
  },
  sentEmail: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  handoffCode: {
    fontFamily: fonts.data,
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    letterSpacing: 6,
  },
  handoffErrorText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: space.sm,
  },
  skipLink: {
    alignSelf: 'center',
    marginTop: space.sm,
    paddingVertical: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
})
