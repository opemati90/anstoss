import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from '../src/components/ui'
import { ClubSwitcher } from '../src/components/ClubSwitcher'
import { useAuth } from '../src/context/AuthContext'
import { AdultLaunchScreen } from '../src/onboarding/AdultLaunchScreen'

export default function LaunchComingSoonScreen() {
  const { signOut } = useAuth()
  const { t } = useTranslation()
  const [switching, setSwitching] = useState(false)
  return <>
    <AdultLaunchScreen onDone={() => {
    void signOut().then(() => router.replace('/(auth)/welcome')).catch(() => undefined)
    }}>
      <View>
        <Button label={t('profileHub.switchClub')} variant="bordered" fullWidth onPress={() => setSwitching(true)} />
        <Button label={t('findClub.title')} variant="plain" fullWidth onPress={() => router.replace('/(auth)/club-search')} />
      </View>
    </AdultLaunchScreen>
    <ClubSwitcher visible={switching} onClose={() => { setSwitching(false); router.replace('/') }} />
  </>
}
