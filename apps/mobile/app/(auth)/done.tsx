import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, space } from '../../src/theme/tokens'

export default function Done() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { finalizeSession } = useOnboardingAuth()
  const { state, reset } = useOnboardingFlow()

  async function handleCta() {
    await finalizeSession()
    reset()
    router.replace('/')
  }

  return (
    <WizardStep
      title={t('onboarding.done.title')}
      ctaLabel={t('onboarding.done.cta')}
      onCta={handleCta}
      progress={1}
    >
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('onboarding.done.body', {
            club: state.firstName ?? '',
          })}
        </Text>
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: space.xl },
  subtitle: { fontFamily: fonts.body, fontSize: fontSize.md, textAlign: 'center' },
})
