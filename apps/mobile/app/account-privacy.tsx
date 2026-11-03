import { Redirect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { ModalHeader } from '../src/components/ModalHeader'
import { Button, Screen, SectionGroup, Text } from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { useAccountPrivacyActions } from '../src/hooks/useAccountPrivacyActions'
import { router } from 'expo-router'
import { useClubColors } from '../src/context/ClubThemeContext'

/** No team, events or child feed is mounted here. Privacy rights remain open. */
export default function AccountPrivacyScreen() {
  const { isSignedIn, isLoading } = useAuth()
  const colors = useClubColors()
  const { t } = useTranslation()
  const { handleExportData, handleDeleteAccount, exporting } = useAccountPrivacyActions()
  if (isLoading) return <Screen><ActivityIndicator color={colors.textPrimary} /></Screen>
  if (!isSignedIn) return <Redirect href="/(auth)/welcome" />
  return <Screen scroll>
    <ModalHeader title={t('onboardingFlow.launch.privacyActions')} />
    <Text variant="body" color="secondary">{t('onboardingFlow.launch.privacyBody')}</Text>
    <SectionGroup>
      <Button label={t('more.exportData')} variant="bordered" fullWidth loading={exporting}
        onPress={() => void handleExportData()} testID="privacy-export" />
      <Button label={t('childConsent.title')} variant="bordered" fullWidth
        onPress={() => router.push('/child-consent')} testID="privacy-existing-consent" />
      <Button label={t('more.deleteAccount')} variant="bordered" fullWidth
        onPress={handleDeleteAccount} testID="privacy-delete" />
    </SectionGroup>
  </Screen>
}
