/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function ClubCreate() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, update, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/club-create'), [markStep])
  const [name, setName] = useState(state.clubName ?? '')
  const [team, setTeam] = useState(state.teamName ?? '')

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const ready = name.trim().length > 1 && team.trim().length > 1

  function handleSubmit() {
    update({ clubName: name.trim(), teamName: team.trim() })
    router.push('/(auth)/club-identity')
  }

  return (
    <WizardStep
      title={t('onboarding.clubCreate.title')}
      hint={t('onboarding.clubCreate.hint', {
        defaultValue: 'Add your club and your first team. You can add more teams later.',
      })}
      ctaLabel={t('common.next')}
      onCta={handleSubmit}
      ctaDisabled={!ready}
      step={{ current: 5, total: 6 }}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.badgeText, { color: colors.surface }]}>{initials || '⚽'}</Text>
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
          {t('onboarding.clubCreate.nameLabel', { defaultValue: 'Club name' })}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.clubCreate.namePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSunken,
            },
          ]}
        />

        <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
          {t('onboarding.clubCreate.teamLabel', { defaultValue: 'First team' })}
        </Text>
        <TextInput
          value={team}
          onChangeText={setTeam}
          placeholder={t('onboarding.clubCreate.teamPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSunken,
            },
          ]}
        />
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  badgeText: {
    fontFamily: fonts.heading,
    fontSize: fontSize['2xl'],
    fontWeight: '800',
  },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    marginBottom: space.md,
  },
})
