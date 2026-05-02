import { useState } from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

const PHONE_RE = /^\+[1-9]\d{7,14}$/

export default function Phone() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { startPhoneOtp } = useOnboardingAuth()
  const { state, update } = useOnboardingFlow()
  const params = useLocalSearchParams<{ mode?: string }>()
  const mode = params.mode === 'signin' ? 'signin' : 'signup'
  const [value, setValue] = useState(state.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const normalized = value.replace(/[^\d+]/g, '')
    if (!PHONE_RE.test(normalized)) {
      setError(t('onboarding.phone.invalid'))
      return
    }
    setSubmitting(true)
    try {
      await startPhoneOtp(normalized, mode)
      update({ phone: normalized })
      router.push({ pathname: '/(auth)/code', params: { mode } })
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

  return (
    <WizardStep
      stepLabel={t('onboarding.stepOf', { defaultValue: 'Step {{n}} of {{total}}', n: 1, total: 6 })}
      title={t('onboarding.phone.title')}
      hint={t('onboarding.phone.hint')}
      ctaLabel={t('onboarding.phone.cta')}
      onCta={handleSubmit}
      ctaDisabled={submitting || value.trim().length < 6}
      ctaLoading={submitting}
      progress={1 / 6}
    >
      <TextInput
        value={value}
        onChangeText={(v) => {
          setValue(v)
          setError(null)
        }}
        placeholder={t('onboarding.phone.placeholder')}
        placeholderTextColor={colors.textSecondary}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSunken,
          },
        ]}
      />
      {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.data,
    fontSize: fontSize.lg,
  },
  error: { marginTop: space.sm, fontFamily: fonts.body, fontSize: fontSize.sm },
})
