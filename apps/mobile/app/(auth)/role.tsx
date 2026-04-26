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

export default function Role() {
  const router = useRouter()
  const { t } = useTranslation()
  const { update } = useOnboardingFlow()
  function pick(role: RegistrationRole) {
    update({ role })
    router.push(ROUTES[role])
  }
  return (
    <WizardStep title={t('onboarding.role.title')} progress={5 / 6}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          <RoleCard
            icon="⚽"
            title={t('onboarding.role.play.title')}
            body={t('onboarding.role.play.body')}
            onPress={() => pick(RegistrationRole.PLAYER)}
          />
          <RoleCard
            icon="📋"
            title={t('onboarding.role.coach.title')}
            body={t('onboarding.role.coach.body')}
            onPress={() => pick(RegistrationRole.COACH)}
          />
          <RoleCard
            icon="⭐"
            title={t('onboarding.role.starting.title')}
            body={t('onboarding.role.starting.body')}
            onPress={() => pick(RegistrationRole.CLUB_ADMIN)}
          />
          <RoleCard
            icon="❤"
            title={t('onboarding.role.parent.title')}
            body={t('onboarding.role.parent.body')}
            onPress={() => pick(RegistrationRole.PARENT)}
          />
          <RoleCard
            icon="🔍"
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
  list: { gap: space.md },
})
