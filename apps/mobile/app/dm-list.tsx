import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ModalHeader } from '../src/components/ModalHeader'
import { DmListView } from '../src/components/DmListView'
import { neutralColors } from '../src/theme/tokens'

export default function DmListScreen() {
  const { t } = useTranslation()
  const theme = useClubColors()

  return (
    <View style={styles.container}>
      <ModalHeader
        title={t('dm.title')}
        mode="back"
        rightAction={
          <TouchableOpacity
            onPress={() => router.push('/dm-new')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('dm.newConversation')}
          >
            <Ionicons name="create-outline" size={22} color={theme.clubPrimary} />
          </TouchableOpacity>
        }
      />
      <DmListView />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
})
