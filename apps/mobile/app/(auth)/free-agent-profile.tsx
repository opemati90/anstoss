import { useState } from 'react'
import { ScrollView, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function FreeAgentProfile() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const [position, setPosition] = useState('')
  const [league, setLeague] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')

  function handleFinish() {
    router.push('/(auth)/done')
  }

  const inputStyle = [
    styles.input,
    {
      color: colors.textPrimary,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSunken,
    },
  ]

  return (
    <WizardStep
      title={t('onboarding.freeAgent.titlePosition')}
      ctaLabel={t('onboarding.freeAgent.finishCta')}
      onCta={handleFinish}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TextInput
          value={position}
          onChangeText={setPosition}
          placeholder={t('onboarding.freeAgent.positionPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={inputStyle}
        />
        <TextInput
          value={league}
          onChangeText={setLeague}
          placeholder={t('onboarding.freeAgent.leaguePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={inputStyle}
        />
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder={t('onboarding.freeAgent.cityPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={inputStyle}
        />
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder={t('onboarding.freeAgent.bioPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[inputStyle, styles.textarea]}
        />
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
  textarea: {
    height: 120,
    paddingTop: space.sm,
    textAlignVertical: 'top',
  },
})
