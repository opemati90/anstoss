import { View, Text, StyleSheet } from 'react-native'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { ChatScreen } from '../../../src/components/chat'
import { neutralColors } from '../../../src/theme/tokens'
import { API_URL } from '../../../src/api/client'

export default function ChatTab() {
  const { user, activeClub, activeTeamId, token } = useAuth()
  const theme = useClubColors()

  if (!activeClub || !user || !token || !activeTeamId) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>Join a club to start chatting</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
        <Text style={styles.headerSubtitle}>{activeClub.club.name}</Text>
      </View>
      <ChatScreen
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
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  headerSubtitle: { fontSize: 14, color: neutralColors.textSecondary, marginTop: 2 },
  emptyText: { fontSize: 16, color: neutralColors.textSecondary, textAlign: 'center', marginTop: 100 },
})
