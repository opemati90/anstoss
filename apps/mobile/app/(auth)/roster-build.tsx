import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function RosterBuild() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state } = useOnboardingFlow()
  const [names, setNames] = useState<string[]>([''])
  const [submitting, setSubmitting] = useState(false)

  const filled = names.map((n) => n.trim()).filter(Boolean)
  const ready = filled.length > 0 && Boolean(state.clubId) && Boolean(state.teamId)

  async function handleSubmit() {
    if (!ready) return
    setSubmitting(true)
    try {
      await api(`/clubs/${state.clubId}/teams/${state.teamId}/roster-slots`, {
        method: 'POST',
        body: { slots: filled.map((fullName) => ({ fullName })) },
      })
      router.push('/(auth)/team-code-share')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WizardStep
      title={t('onboarding.rosterBuild.title')}
      hint={t('onboarding.rosterBuild.hint')}
      ctaLabel={t('onboarding.rosterBuild.cta')}
      onCta={handleSubmit}
      ctaDisabled={!ready || submitting}
      ctaLoading={submitting}
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
            placeholder="Mara K."
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
  addText: { fontFamily: fonts.body, fontSize: fontSize.sm, fontWeight: '700' },
})
