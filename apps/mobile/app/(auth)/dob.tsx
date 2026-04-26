import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

function parseDeDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

const HANDOFF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function makeHandoffCode(): string {
  let s = ''
  for (let i = 0; i < 6; i++) s += HANDOFF_ALPHABET[Math.floor(Math.random() * HANDOFF_ALPHABET.length)]
  return s
}

export default function Dob() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { update, reset } = useOnboardingFlow()
  const [value, setValue] = useState('')
  const [under16, setUnder16] = useState<{ code: string } | null>(null)

  function handleSubmit() {
    const dob = parseDeDate(value)
    if (!dob) return
    if (ageInYears(dob) < 16) {
      setUnder16({ code: makeHandoffCode() })
      return
    }
    update({ dateOfBirth: dob.toISOString().slice(0, 10) })
    router.push('/(auth)/role')
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
        progress={4 / 6}
      >
        <View
          style={[
            styles.codeBox,
            { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.code, { color: colors.textPrimary }]}>{under16.code}</Text>
        </View>
      </WizardStep>
    )
  }

  return (
    <WizardStep
      title={t('onboarding.dob.title')}
      hint={t('onboarding.dob.hint')}
      ctaLabel={t('onboarding.dob.cta')}
      onCta={handleSubmit}
      ctaDisabled={!parseDeDate(value)}
      progress={4 / 6}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={t('onboarding.dob.placeholder')}
        placeholderTextColor={colors.textSecondary}
        keyboardType="number-pad"
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
    textAlign: 'center',
  },
  codeBox: {
    marginTop: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  code: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    letterSpacing: 4,
  },
})
