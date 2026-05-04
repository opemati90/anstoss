/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { ScrollView, StyleSheet, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { RoleCard } from '../../src/components/wizard/RoleCard'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { space } from '../../src/theme/tokens'

const ROUTES: Record<RegistrationRole, Href> = {
  [RegistrationRole.PLAYER]: '/(auth)/team-code',
  [RegistrationRole.COACH]: '/(auth)/team-code',
  [RegistrationRole.CLUB_ADMIN]: '/(auth)/club-create',
  [RegistrationRole.PARENT]: '/(auth)/team-code',
  [RegistrationRole.FREE_AGENT]: '/(auth)/free-agent-profile',
}

// Role tints — each role wears its identity colour through the rest
// of the wizard. Player navy, Coach forest, Admin charcoal, Parent
// warm-amber, Free Agent rose. All pass WCAG AA on white surface.
const ROLE_TINTS: Record<RegistrationRole, string> = {
  [RegistrationRole.PLAYER]: '#1E3A5F',
  [RegistrationRole.COACH]: '#1F5C42',
  [RegistrationRole.CLUB_ADMIN]: '#2E2E36',
  [RegistrationRole.PARENT]: '#A8642A',
  [RegistrationRole.FREE_AGENT]: '#A8364E',
}

export default function Role() {
  const router = useRouter()
  const { t } = useTranslation()
  const { update } = useOnboardingFlow()
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
      step={{ current: 5, total: 6 }}
      stepLabel={t('onboarding.stepOf', {
        defaultValue: 'Step {{n}} of {{total}}',
        n: 5,
        total: 6,
      })}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          <RoleCard
            icon="⚽"
            title={t('onboarding.role.play.title')}
            body={t('onboarding.role.play.body')}
            tint={ROLE_TINTS[RegistrationRole.PLAYER]}
            onPress={() => pick(RegistrationRole.PLAYER)}
          />
          <RoleCard
            icon="📋"
            title={t('onboarding.role.coach.title')}
            body={t('onboarding.role.coach.body')}
            tint={ROLE_TINTS[RegistrationRole.COACH]}
            onPress={() => pick(RegistrationRole.COACH)}
          />
          <RoleCard
            icon="⭐"
            title={t('onboarding.role.starting.title')}
            body={t('onboarding.role.starting.body')}
            tint={ROLE_TINTS[RegistrationRole.CLUB_ADMIN]}
            onPress={() => pick(RegistrationRole.CLUB_ADMIN)}
          />
          <RoleCard
            icon="❤"
            title={t('onboarding.role.parent.title')}
            body={t('onboarding.role.parent.body')}
            tint={ROLE_TINTS[RegistrationRole.PARENT]}
            onPress={() => pick(RegistrationRole.PARENT)}
          />
          <RoleCard
            icon="🔍"
            title={t('onboarding.role.looking.title')}
            body={t('onboarding.role.looking.body')}
            tint={ROLE_TINTS[RegistrationRole.FREE_AGENT]}
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
