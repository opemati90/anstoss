/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Share, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { Icon, Text } from '../../src/components/ui'
import { FormInput } from '../../src/components/FormInput'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { DobScrollPicker } from '../../src/components/wizard/DobScrollPicker'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../src/theme/tokens'

const HANDOFF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function makeHandoffCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += HANDOFF_ALPHABET[Math.floor(Math.random() * HANDOFF_ALPHABET.length)]
  }
  return s
}

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
  const { t, i18n } = useTranslation()
  const colors = useClubColors()
  const { setBasicProfile, finalizeSession } = useOnboardingAuth()
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
  const [submitting, setSubmitting] = useState(false)
  const [under16, setUnder16] = useState<{ code: string } | null>(null)

  // Progressive disclosure: the DOB picker only reveals once the user
  // has typed enough of their name to commit. Reduces visual noise on
  // first paint + eases users into the form one decision at a time.
  const dobReady = firstName.trim().length >= 2
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
  const canContinue = firstName.trim().length > 0 && dobValid && !submitting

  async function handleSubmit() {
    if (!canContinue) return
    if (ageInYears(dobDate) < 16) {
      setUnder16({ code: makeHandoffCode() })
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
      router.push('/(auth)/role')
    } finally {
      setSubmitting(false)
    }
  }

  if (under16) {
    return (
      <WizardStep
        title={t('onboarding.dob.under16Title')}
        hint={t('onboarding.dob.under16Body')}
        ctaLabel={t('onboarding.dob.under16Cta')}
        onCta={() => {
          reset()
          router.replace('/(auth)/welcome')
        }}
        step={{ current: 3, total: 5 }}
      >
        <View
          style={[
            styles.codeCard,
            {
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.borderDefault,
            },
          ]}
        >
          <Text style={[styles.codeEyebrow, { color: colors.textTertiary }]}>
            {t('onboarding.dob.handoffEyebrow', {
              defaultValue: 'PARENT HANDOFF CODE',
            })}
          </Text>
          <Text style={[styles.codeText, { color: colors.textPrimary }]}>
            {under16.code}
          </Text>
          <Text
            onPress={async () => {
              try {
                await Share.share({
                  message: t('onboarding.dob.handoffShare', {
                    defaultValue:
                      'My Anstoss handoff code is {{code}}. Help me set up the app — open https://anstoss.io/parent and enter the code.',
                    code: under16.code,
                  }),
                })
              } catch {
                // user cancelled
              }
            }}
            style={[styles.codeShare, { color: colors.primary }]}
            accessibilityRole="button"
          >
            <Icon name="square.and.arrow.up" size={11} color={colors.primary} />
            {'  '}
            {t('onboarding.dob.handoffShareCta', {
              defaultValue: 'Send code to a parent',
            })}
          </Text>
        </View>
      </WizardStep>
    )
  }

  return (
    <WizardStep
      stepLabel={t('onboarding.stepOf', {
        defaultValue: 'Step {{n}} of {{total}}',
        n: 3,
        total: 5,
      })}
      title={t('onboarding.about.title', { defaultValue: 'About you' })}
      hint={t('onboarding.about.hint', {
        defaultValue: 'A first name + date of birth. Two taps and we\'re done.',
      })}
      ctaLabel={t('onboarding.about.cta', { defaultValue: 'Continue' })}
      onCta={handleSubmit}
      ctaDisabled={!canContinue}
      ctaLoading={submitting}
      step={{ current: 3, total: 5 }}
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
              onChange={setDob}
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
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: 6,
  },
  pickerCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
    paddingHorizontal: space.sm,
  },
  dobHint: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },

  codeCard: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    gap: 12,
  },
  codeEyebrow: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  codeText: {
    fontFamily: fonts.data,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 6,
  },
  codeShare: {
    fontFamily: fonts.label,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
})
