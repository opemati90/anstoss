import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fontWeight, fonts, radius, space } from '../../src/theme/tokens'

export default function RosterBuild() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, update, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/roster-build'), [markStep])
  const [names, setNames] = useState<string[]>(
    state.rosterNames && state.rosterNames.length > 0 ? state.rosterNames : [''],
  )

  const filled = names.map((n) => n.trim()).filter(Boolean)

  function handleSubmit() {
    update({ rosterNames: filled })
    router.push('/(auth)/done')
  }

  function handleSkip() {
    update({ rosterNames: [] })
    router.push('/(auth)/done')
  }

  return (
    <WizardStep
      title={t('onboarding.rosterBuild.title')}
      hint={t('onboarding.rosterBuild.hint')}
      ctaLabel={
        filled.length > 0
          ? t('onboarding.rosterBuild.cta')
          : t('onboarding.rosterBuild.skip', { defaultValue: 'Skip, I’ll add later' })
      }
      onCta={filled.length > 0 ? handleSubmit : handleSkip}
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {names.map((n, i) => (
          <TextInput
            key={i}
            testID={`roster-name-${i}`}
            value={n}
            onChangeText={(v) =>
              setNames((arr) => arr.map((it, idx) => (idx === i ? v : it)))
            }
            placeholder={t('onboarding.rosterBuild.namePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSunken,
              },
            ]}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setNames((arr) => [...arr, ''])}
          style={styles.addBtn}
        >
          <Text style={[styles.addText, { color: colors.primary }]}>
            + {t('onboarding.rosterBuild.addRow')}
          </Text>
        </Pressable>
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    marginBottom: space.sm,
  },
  addBtn: { paddingVertical: space.md, alignItems: 'center' },
  addText: { fontFamily: fonts.body, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
})
