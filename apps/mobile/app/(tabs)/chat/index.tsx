import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { ChatScreen } from '../../../src/components/chat'
import { DmListView } from '../../../src/components/DmListView'
import { EmptyState } from '../../../src/components/EmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { API_URL } from '../../../src/api/client'
import { neutralColors, fontSize, fontWeight, space, radius, fonts } from '../../../src/theme/tokens'

type ChatMode = 'team' | 'direct'

export default function ChatTab() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId, activeTeamAccess, token } = useAuth()
  const theme = useClubColors()
  const [chatMode, setChatMode] = useState<ChatMode>('team')

  if (!activeClub || !user || !token) {
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
          compact
        />
        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[
              styles.segmentChip,
              chatMode === 'team' && { backgroundColor: theme.clubPrimary, borderColor: theme.clubPrimary },
            ]}
            onPress={() => setChatMode('team')}
            accessibilityRole="button"
            accessibilityLabel={t('chat.teamTab')}
          >
            <Text style={[styles.segmentText, chatMode === 'team' && styles.segmentTextActive]}>
              {t('chat.teamTab')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentChip,
              chatMode === 'direct' && { backgroundColor: theme.clubPrimary, borderColor: theme.clubPrimary },
            ]}
            onPress={() => setChatMode('direct')}
            accessibilityRole="button"
            accessibilityLabel={t('chat.directTab')}
          >
            <Text style={[styles.segmentText, chatMode === 'direct' && styles.segmentTextActive]}>
              {t('chat.directTab')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {chatMode === 'team' ? (
        activeTeamId ? (
          <ChatScreen
            key={activeTeamId}
            teamId={activeTeamId}
            clubId={activeClub.club.id}
            userId={user.id}
            token={token}
            apiUrl={API_URL}
            primaryColor={theme.clubPrimary}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon="chatbubbles-outline"
              title={t('chat.screenTitle')}
              description={t('chat.emptyWithoutClub')}
            />
          </View>
        )
      ) : (
        <View style={styles.dmContainer}>
          <DmListView />
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: theme.clubPrimary }]}
            onPress={() => router.push('/dm-new')}
            accessibilityRole="button"
            accessibilityLabel={t('dm.newConversation')}
          >
            <Ionicons name="create-outline" size={22} color={neutralColors.textInverse} />
          </TouchableOpacity>
        </View>
      )}
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
  segmentRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingBottom: space.sm,
  },
  segmentChip: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  segmentTextActive: {
    color: neutralColors.textInverse,
  },
  dmContainer: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: space.lg,
    right: space.md,
    width: 52,
    height: 52,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
})
