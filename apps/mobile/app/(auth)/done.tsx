import { Image, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { activateE2EScenario } from '../../src/e2e/session'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

const DEV_SCENARIO_BY_ROLE: Record<
  RegistrationRole,
  'player' | 'parent' | 'coach' | 'club-admin' | 'free-agent'
> = {
  [RegistrationRole.PLAYER]: 'player',
  [RegistrationRole.PARENT]: 'parent',
  [RegistrationRole.COACH]: 'coach',
  [RegistrationRole.CLUB_ADMIN]: 'club-admin',
  [RegistrationRole.FREE_AGENT]: 'free-agent',
}

export default function Done() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { finalizeSession } = useOnboardingAuth()
  const { state, reset } = useOnboardingFlow()

  async function handleCta() {
    if (__DEV__ && state.phone === '+15555550100') {
      const scenario = state.role ? DEV_SCENARIO_BY_ROLE[state.role] : 'player'
      await activateE2EScenario(scenario)
      reset()
      router.replace('/')
      return
    }
    await finalizeSession()
    reset()
    router.replace('/')
  }

  const clubName = state.clubName ?? 'Anstoss'
  const initials = clubName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  return (
    <WizardStep
      title={t('onboarding.done.title')}
      ctaLabel={t('onboarding.done.cta')}
      onCta={handleCta}
      progress={1}
    >
      <View style={styles.body}>
        {state.clubBadgeUrl ? (
          <Image source={{ uri: state.clubBadgeUrl }} style={styles.badge} />
        ) : (
          <View style={[styles.badgePlaceholder, { backgroundColor: colors.primary }]}>
            <Text variant="title1" weight="bold" color="inverse">
              {initials || 'A'}
            </Text>
          </View>
        )}
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('onboarding.done.body', { club: clubName })}
        </Text>
      </View>
    </WizardStep>
  )
}

const BADGE_SIZE = 96

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: space.lg, gap: space.md },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  badgePlaceholder: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { fontFamily: fonts.body, fontSize: fontSize.md, textAlign: 'center' },
})
