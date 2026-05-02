import { useState } from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function Name() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { setBasicProfile } = useOnboardingAuth()
  const { state, update } = useOnboardingFlow()
  const [firstName, setFirstName] = useState(state.firstName ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await setBasicProfile({ firstName: firstName.trim() })
      update({ firstName: firstName.trim() })
      router.push('/(auth)/dob')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WizardStep
      stepLabel={t('onboarding.stepOf', { defaultValue: 'Step {{n}} of {{total}}', n: 3, total: 6 })}
      title={t('onboarding.name.title')}
      ctaLabel={t('onboarding.name.cta')}
      onCta={handleSubmit}
      ctaDisabled={submitting || firstName.trim().length === 0}
      ctaLoading={submitting}
      progress={3 / 6}
    >
      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        placeholder={t('onboarding.name.placeholder')}
        placeholderTextColor={colors.textSecondary}
        autoFocus
        autoCapitalize="words"
        autoComplete="given-name"
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSunken,
          },
        ]}
      />
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
})
