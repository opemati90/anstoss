import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { FormInput } from '../../src/components/FormInput'
import { space } from '../../src/theme/tokens'

export default function FreeAgentProfile() {
  const router = useRouter()
  const { t } = useTranslation()
  const [position, setPosition] = useState('')
  const [league, setLeague] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')

  function handleFinish() {
    router.push('/(auth)/done')
  }

  return (
    <WizardStep
      title={t('onboarding.freeAgent.titlePosition')}
      ctaLabel={t('onboarding.freeAgent.finishCta')}
      onCta={handleFinish}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.fields}>
          <FormInput
            label={t('onboarding.freeAgent.titlePosition')}
            value={position}
            onChangeText={setPosition}
            placeholder={t('onboarding.freeAgent.positionPlaceholder')}
          />
          <FormInput
            label={t('onboarding.freeAgent.titleLeague')}
            value={league}
            onChangeText={setLeague}
            placeholder={t('onboarding.freeAgent.leaguePlaceholder')}
          />
          <FormInput
            label={t('onboarding.freeAgent.titleCity')}
            value={city}
            onChangeText={setCity}
            placeholder={t('onboarding.freeAgent.cityPlaceholder')}
          />
          <FormInput
            label={t('onboarding.freeAgent.titleBio')}
            value={bio}
            onChangeText={setBio}
            placeholder={t('onboarding.freeAgent.bioPlaceholder')}
            multiline
            style={styles.textarea}
          />
        </View>
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  fields: {
    gap: space.md,
  },
  textarea: {
    height: 120,
    paddingTop: space.sm,
    textAlignVertical: 'top',
  },
})
