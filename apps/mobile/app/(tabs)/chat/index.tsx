import { View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { ChatScreen } from '../../../src/components/chat'
import { EmptyState } from '../../../src/components/EmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { neutralColors, space } from '../../../src/theme/tokens'
import { API_URL } from '../../../src/api/client'

export default function ChatTab() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId, activeTeamAccess, token } = useAuth()
  const theme = useClubColors()

  if (!activeClub || !user || !token || !activeTeamId) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          icon="chatbubbles-outline"
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
          compact
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
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    backgroundColor: neutralColors.background,
  },
})
