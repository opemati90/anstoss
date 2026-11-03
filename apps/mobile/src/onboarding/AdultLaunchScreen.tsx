import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui'
import { OnboardingScreen } from './ui'

/** A release boundary, not a claim rejection or a data-deletion action. */
export function AdultLaunchScreen({ onDone, onBack, children }: { onDone: () => void; onBack?: () => void; children?: ReactNode }) {
  const { t } = useTranslation()
  return <OnboardingScreen title={t('onboardingFlow.launch.adultsTitle')}
    subtitle={t('onboardingFlow.launch.adultsBody')} onBack={onBack ?? null}
    primary={{ label: t('onboardingFlow.common.signOut'), onPress: onDone, testID: 'adult-launch-sign-out' }}
    testID="adult-launch-notice">
    <Button label={t('onboardingFlow.launch.privacyActions')} variant="bordered" fullWidth
      onPress={() => router.push('/account-privacy')} testID="adult-launch-privacy" />
    {children}
  </OnboardingScreen>
}
