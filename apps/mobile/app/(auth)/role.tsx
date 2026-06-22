import { useEffect } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { RoleCard } from '../../src/components/wizard/RoleCard'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { space } from '../../src/theme/tokens'
import { ONBOARDING_STEP, ONBOARDING_TOTAL, onboardingStep } from '../../src/onboarding/steps'

const ROUTES: Record<RegistrationRole, Href> = {
  [RegistrationRole.PLAYER]: '/(auth)/team-code',
  [RegistrationRole.COACH]: '/(auth)/team-code',
  [RegistrationRole.CLUB_ADMIN]: '/(auth)/club-create',
  [RegistrationRole.PARENT]: '/(auth)/parent-handoff',
  // Free agents skip the in-flow profile editor — they get a dedicated
  // Profile tab post-onboarding where they can fill everything at their
  // own pace, with photos + videos + share-card. Cuts ~1 long screen
  // out of the wizard for the role with the highest abandonment risk.
  [RegistrationRole.FREE_AGENT]: '/(auth)/done',
}

export default function Role() {
  const router = useRouter()
  const { t } = useTranslation()
  const { update, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/role'), [markStep])
  function pick(role: RegistrationRole) {
    update({ role })
    router.push(ROUTES[role])
  }
  return (
    <WizardStep
      title={t('onboarding.role.title')}
      hint={t('onboarding.role.hint', {
        defaultValue: 'Pick what fits best — you can always change it.',
      })}
      step={onboardingStep('role')}
      stepLabel={t('onboarding.stepOf', {
        defaultValue: 'Step {{n}} of {{total}}',
        n: ONBOARDING_STEP.role,
        total: ONBOARDING_TOTAL,
      })}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          <RoleCard
            iconName="football"
            title={t('onboarding.role.play.title')}
            body={t('onboarding.role.play.body')}
            onPress={() => pick(RegistrationRole.PLAYER)}
          />
          <RoleCard
            iconName="whistle"
            title={t('onboarding.role.coach.title')}
            body={t('onboarding.role.coach.body')}
            onPress={() => pick(RegistrationRole.COACH)}
          />
          <RoleCard
            iconName="shield"
            title={t('onboarding.role.starting.title')}
            body={t('onboarding.role.starting.body')}
            onPress={() => pick(RegistrationRole.CLUB_ADMIN)}
          />
          <RoleCard
            iconName="heart"
            title={t('onboarding.role.parent.title', {
              defaultValue: "I'm a parent",
            })}
            body={t('onboarding.role.parent.body', {
              defaultValue: "Set up my child with their parent code.",
            })}
            onPress={() => pick(RegistrationRole.PARENT)}
          />
          <RoleCard
            iconName="search"
            title={t('onboarding.role.looking.title')}
            body={t('onboarding.role.looking.body')}
            onPress={() => pick(RegistrationRole.FREE_AGENT)}
          />
        </View>
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.sm + 4 },
})
