import { StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../../src/components/ModalHeader'
import { Screen } from '../../src/components/ui'
import { SPACING_LG } from '../../src/theme/tokens'
import {
  ProfileEditor,
  useProfileRefreshControl,
} from '../../src/features/wechsel/player/ProfileEditor'

/**
 * Standalone player-profile editor (deep links, More menu). Free agents
 * normally edit it in their Profil tab; this route renders the same editor.
 */
export default function FreeAgentProfileScreen() {
  const { t } = useTranslation()
  const refreshControl = useProfileRefreshControl()
  return (
    <Screen
      header={<ModalHeader title={t('spielerprofil.title')} fallbackHref="/(tabs)" />}
      scroll
      padded={false}
      contentStyle={styles.content}
      refreshControl={refreshControl}
    >
      <ProfileEditor />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACING_LG, paddingTop: SPACING_LG },
})
