import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ModalHeader } from '../src/components/ModalHeader'
import { DmListView } from '../src/components/DmListView'
import { Icon, IconButton, Screen } from '../src/components/ui'

export default function DmListScreen() {
  const { t } = useTranslation()
  const c = useClubColors()

  return (
    <Screen
      header={
        <ModalHeader
          title={t('dm.title')}
          mode="back"
          rightAction={
            <IconButton
              onPress={() => router.push('/dm-new')}
              accessibilityRole="button"
              accessibilityLabel={t('dm.newConversation')}
              style={{ backgroundColor: c.primary50 }}
            >
              <Icon name="square.and.pencil" size="lg" color="tint" />
            </IconButton>
          }
        />
      }
      padded={false}
    >
      <DmListView />
    </Screen>
  )
}
