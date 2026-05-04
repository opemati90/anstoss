import { useState } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function ClubCreate() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { update } = useOnboardingFlow()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [team, setTeam] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const ready = name.trim().length > 1 && city.trim().length > 1 && team.trim().length > 1

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const club = await api<{ id: string; name: string }>('/clubs', {
        method: 'POST',
        body: { name: name.trim(), city: city.trim() },
      })
      const tm = await api<{ id: string; name: string }>(`/clubs/${club.id}/teams`, {
        method: 'POST',
        body: { name: team.trim() },
      })
      update({ clubId: club.id, teamId: tm.id })
      router.push('/(auth)/roster-build')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WizardStep
      title={t('onboarding.clubCreate.title')}
      ctaLabel={
        ready ? t('onboarding.clubCreate.cta', { name }) : t('onboarding.clubCreate.title')
      }
      onCta={handleSubmit}
      ctaDisabled={!ready || submitting}
      ctaLoading={submitting}
      step={{ current: 5, total: 5 }}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.badgeText, { color: colors.surface }]}>{initials || '⚽'}</Text>
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.clubCreate.namePlaceholder')}
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
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder={t('onboarding.clubCreate.cityPlaceholder')}
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
        <TextInput
          value={team}
          onChangeText={setTeam}
          placeholder={t('onboarding.clubCreate.teamPlaceholder')}
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
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  badge: {
    width: 88,
    height: 88,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
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
