import { StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Screen } from '../../../src/components/ui'
import { SPACING_LG } from '../../../src/theme/tokens'
import {
  ProfileEditor,
  useProfileRefreshControl,
} from '../../../src/features/wechsel/player/ProfileEditor'

/** Free-agent "Profil" tab: the player profile clubs see in their search. */
export default function ProfileTab() {
  const { t } = useTranslation()
  const refreshControl = useProfileRefreshControl()
  return (
    <Screen
      scroll
      padded={false}
      edges={['left', 'right']}
      largeTitle={t('spielerprofil.title')}
      contentStyle={styles.content}
      refreshControl={refreshControl}
    >
      <ProfileEditor />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACING_LG },
})
