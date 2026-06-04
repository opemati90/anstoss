import { useState } from 'react'
import { Alert, View, StyleSheet, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import type { Channel } from '@anstoss/shared'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { ChatScreen } from '../../../src/components/chat'
import { ChannelRail } from '../../../src/components/chat/ChannelRail'
import { ChannelInfoSheet } from '../../../src/components/chat/ChannelInfoSheet'
import { CreateGroupSheet } from '../../../src/components/chat/CreateGroupSheet'
import { DmListView } from '../../../src/components/DmListView'
import { api } from '../../../src/api/client'
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
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [channelInfoOpen, setChannelInfoOpen] = useState(false)
  const [channelRailKey, setChannelRailKey] = useState(0)

  const canCreateGroup =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH'

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
            paddingTop: space.sm,
          },
        ]}
      >
        <Text variant="largeTitle" color="primary" style={styles.title}>
          {t('chat.screenTitle')}
        </Text>
        <SegmentedControl<ChatMode>
          segments={[
            {
              key: 'team',
              label: t('chat.channelsTab', { defaultValue: 'Channels' }),
            },
            { key: 'direct', label: t('chat.directTab') },
          ]}
          value={chatMode}
          onChange={setChatMode}
        />
      </View>

      {chatMode === 'team' ? (
        activeTeamId ? (
          <View style={{ flex: 1 }}>
            <View
              style={[
                styles.railWrap,
                {
                  borderBottomColor: c.borderDefault,
                  backgroundColor: c.background,
                },
              ]}
            >
              <ChannelRail
                key={channelRailKey}
                teamId={activeTeamId}
                selectedChannelId={activeChannel?.id ?? null}
                onSelect={(ch) => {
                  if (activeChannel?.id === ch.id) {
                    setChannelInfoOpen(true)
                  } else {
                    setActiveChannel(ch)
                  }
                }}
              />
            </View>
            <ChatScreen
              key={`${activeTeamId}:${activeChannel?.id ?? 'team'}`}
              teamId={activeTeamId}
              channelId={activeChannel?.id ?? null}
              clubId={activeClub.club.id}
              userId={user.id}
              token={token}
              apiUrl={API_URL}
              primaryColor={c.primary}
            />
            {canCreateGroup ? (
              <Pressable
                style={[styles.fab, { backgroundColor: c.primary, ...elevation.hero }]}
                onPress={() => setCreateGroupOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.newGroup', { defaultValue: 'New group' })}
              >
                <Icon name="plus" size="lg" color="inverse" />
              </Pressable>
            ) : null}
          </View>
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

      {activeTeamId && activeChannel ? (
        <ChannelInfoSheet
          visible={channelInfoOpen}
          channel={activeChannel}
          teamId={activeTeamId}
          currentUserId={user.id}
          canManage={canCreateGroup}
          onClose={() => setChannelInfoOpen(false)}
          onChanged={() => setChannelRailKey((k) => k + 1)}
        />
      ) : null}

      <CreateGroupSheet
        visible={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onSubmit={async (input) => {
          if (!activeClub || !activeTeamId) {
            // Without team context there's no place for the channel to live.
            // Surface this instead of resolving silently — otherwise the
            // sheet closes and the user sees nothing change.
            throw new Error(
              t('chat.newGroupErrorNoTeam', {
                defaultValue: 'Pick a team before creating a group.',
              }),
            )
          }
          try {
            await api(`/clubs/${activeClub.club.id}/channels`, {
              method: 'POST',
              body: { name: input.name, description: input.description, teamId: activeTeamId },
            })
            setChannelRailKey((k) => k + 1)
          } catch (err) {
            // Re-throw so CreateGroupSheet keeps the form open with the
            // submitting state cleared. Show a real alert too — silent
            // failure is the worst possible UX for a create flow.
            const message =
              err instanceof Error && err.message
                ? err.message
                : t('chat.newGroupError', {
                    defaultValue: 'Could not create the group. Please try again.',
                  })
            Alert.alert(t('common.error'), message)
            throw err
          }
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
    borderBottomWidth: hairline,
    gap: space.sm,
  },
  title: {
    paddingBottom: space.xs,
  },
  railWrap: {},
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
