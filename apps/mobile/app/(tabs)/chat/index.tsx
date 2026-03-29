import { View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { ChatScreen } from '../../../src/components/chat'
import { IllustratedEmptyState } from '../../../src/components/IllustratedEmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { illustrations } from '../../../src/illustrations'
import { neutralColors } from '../../../src/theme/tokens'
import { API_URL } from '../../../src/api/client'

export default function ChatTab() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId, activeTeamAccess, token } = useAuth()
  const theme = useClubColors()

  if (!activeClub || !user || !token || !activeTeamId) {
    return (
      <View style={styles.emptyContainer}>
        <IllustratedEmptyState
          illustration={illustrations.emptyChat}
          title={t('chat.screenTitle')}
          description={t('chat.emptyWithoutClub')}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TabScreenHeader
          title={t('chat.screenTitle')}
          subtitle={activeTeamAccess?.team.displayName || activeClub.club.name}
        />
      </View>
      <ChatScreen
        key={activeTeamId}
        teamId={activeTeamId}
        clubId={activeClub.club.id}
        userId={user.id}
        token={token}
        apiUrl={API_URL}
        primaryColor={theme.clubPrimary}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: neutralColors.background,
  },
})
