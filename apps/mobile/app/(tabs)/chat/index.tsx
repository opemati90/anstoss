import { useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { ChatScreen } from '../../../src/components/chat'
import { DmListView } from '../../../src/components/DmListView'
import { EmptyState } from '../../../src/components/EmptyState'
import { Icon, SegmentedControl, Text } from '../../../src/components/ui'
import { API_URL } from '../../../src/api/client'
import { elevation, hairline, space } from '../../../src/theme/tokens'

type ChatMode = 'team' | 'direct'

export default function ChatTab() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId, token } = useAuth()
  const c = useClubColors()
  const [chatMode, setChatMode] = useState<ChatMode>('team')

  if (!activeClub || !user || !token) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: c.background }]}>
        <EmptyState
          icon="bubble.fill"
          title={t('chat.screenTitle')}
          description={t('chat.emptyWithoutClub')}
        />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: c.borderDefault,
            backgroundColor: c.background,
            paddingTop: space.md,
          },
        ]}
      >
        <Text variant="largeTitle" color="primary" style={styles.title}>
          {t('chat.screenTitle')}
        </Text>
        <SegmentedControl<ChatMode>
          segments={[
            { key: 'team', label: t('chat.teamTab') },
            { key: 'direct', label: t('chat.directTab') },
          ]}
          value={chatMode}
          onChange={setChatMode}
        />
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
            primaryColor={c.primary}
          />
        ) : (
          <View style={[styles.emptyContainer, { backgroundColor: c.background }]}>
            <EmptyState
              icon="bubble.fill"
              title={t('chat.screenTitle')}
              description={t('chat.emptyWithoutClub')}
            />
          </View>
        )
      ) : (
        <View style={styles.dmContainer}>
          <DmListView />
          <Pressable
            style={[styles.fab, { backgroundColor: c.primary, ...elevation.hero }]}
            onPress={() => router.push('/dm-new')}
            accessibilityRole="button"
            accessibilityLabel={t('dm.newConversation')}
          >
            <Icon name="square.and.pencil" size="lg" color="inverse" />
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: hairline,
    gap: space.sm,
  },
  title: {
    paddingBottom: space.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  dmContainer: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: space.lg,
    right: space.md,
    width: 56,
    height: 56,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 28,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
