import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API_URL } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { useConversationDetail } from '../../src/hooks/useConversationDetail'
import { refreshInbox } from '../../src/hooks/useInbox'
import { ChatScreen } from '../../src/components/chat/ChatScreen'
import { ConversationAvatar } from '../../src/components/chat/ConversationAvatar'
import { openConversationInfo } from '../../src/components/chat/chatRoutes'
import { conversationTitle, type ConversationKind } from '../../src/components/chat/inboxModel'
import { EmptyState } from '../../src/components/EmptyState'
import { ErrorState } from '../../src/components/ErrorState'
import { IconButton, Icon, Text } from '../../src/components/ui'
import { space } from '../../src/theme/tokens'

/**
 * One conversation, channel or direct message. The header names it and
 * opens the info screen; the body is the shared ChatScreen.
 */
export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; teamId?: string; title?: string }>()
  const id = String(params.id ?? '')
  const kind: ConversationKind = params.kind === 'dm' ? 'dm' : 'channel'
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const { width: windowWidth } = useWindowDimensions()
  const { user, token, activeClub, activeTeamId, teamsForActiveClub } = useAuth()
  const detail = useConversationDetail(kind, id)
  const [searchOpen, setSearchOpen] = useState(false)
  const [typingNames, setTypingNames] = useState<string[]>([])
  const clubId = activeClub?.club.id ?? null

  // Leaving the thread: the inbox should show it as read straight away.
  useFocusEffect(
    useCallback(() => {
      return () => {
        void refreshInbox(clubId)
      }
    }, [clubId]),
  )

  const channel = detail.channel
  const seed = detail.seed
  const channelTeamId = channel?.teamId ?? seed?.teamId ?? params.teamId ?? null
  // Club-level channels ride on any team the reader belongs to.
  const socketTeamId =
    kind === 'channel'
      ? channelTeamId ?? activeTeamId ?? teamsForActiveClub?.[0]?.team.id ?? null
      : null

  const title = useMemo(() => {
    if (kind === 'dm') return detail.dm?.otherUser?.name ?? seed?.title ?? params.title ?? ''
    if (channel) {
      return conversationTitle(
        { type: 'CHANNEL', kind: channel.kind, teamId: channel.teamId, title: channel.name },
        t,
      )
    }
    if (seed) return conversationTitle(seed, t)
    return params.title ?? ''
  }, [channel, detail.dm?.otherUser?.name, kind, params.title, seed, t])

  // No presence API exists, so the subtitle never claims "online"; it shows
  // who is typing, else the member count (groups) or "Direktnachricht".
  const subtitle =
    typingNames.length > 0
      ? kind === 'dm'
        ? t('chatThread.header.typing')
        : typingNames.length === 1
          ? t('chatThread.header.typingOne', { name: typingNames[0] })
          : t('chatThread.header.typingMany', { count: typingNames.length })
      : kind === 'dm'
        ? detail.dm?.peerLeftClub
          ? t('chatThread.header.peerLeft')
          : t('chatHub.header.dmSubtitle')
        : channel
          ? t('chatHub.header.members', { count: channel.memberCount })
          : null

  const clubRole = activeClub?.role
  const coachesTeam = teamsForActiveClub?.some(
    (tm) =>
      tm.team.id === channelTeamId &&
      (tm.status == null || tm.status === 'ACTIVE') &&
      (tm.role === 'HEAD_COACH' || tm.role === 'ASSISTANT_COACH'),
  )
  const canCompose =
    kind === 'channel' &&
    (clubRole === 'OWNER' || clubRole === 'ADMIN' || clubRole === 'COACH' || !!coachesTeam)

  const canWrite =
    kind === 'dm'
      ? detail.dm
        ? detail.dm.canMessage
        : detail.status !== 'forbidden'
      : (channel?.canWrite ?? seed?.canWrite ?? false)

  const infoParams = { kind, id, teamId: channelTeamId, title }
  const headerKind = kind === 'dm' ? 'DM' : (channel?.kind ?? seed?.kind ?? 'CUSTOM')

  const header = (
    <Stack.Screen
      options={{
        headerTitleAlign: 'left',
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.primary,
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: true,
        headerTitle: () => (
          <Pressable
            onPress={() => openConversationInfo(infoParams)}
            accessibilityRole="button"
            accessibilityLabel={t('chatHub.header.openInfo', { name: title })}
            style={[styles.titleButton, { maxWidth: Math.max(160, windowWidth - 128) }]}
            android_ripple={{ color: c.borderSubtle, borderless: false }}
            testID="chat-header-title"
          >
            <ConversationAvatar
              kind={headerKind}
              clubLevel={kind === 'channel' && !channelTeamId}
              name={title}
              avatarUrl={detail.dm?.otherUser?.avatarUrl ?? seed?.avatarUrl ?? null}
              crestUrl={activeClub?.club.badgeUrl ?? null}
              size={34}
            />
            <View style={styles.titleText}>
              <Text variant="headline" color="primary" numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text variant="caption1" color="secondary" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ),
        headerRight: () => (
          <IconButton
            onPress={() => setSearchOpen((open) => !open)}
            accessibilityLabel={searchOpen ? t('common.close') : t('chatHub.searchInChat')}
            testID="chat-header-search"
          >
            <Icon name={searchOpen ? 'xmark' : 'magnifyingglass'} size="md" color={c.textPrimary} />
          </IconButton>
        ),
      }}
    />
  )

  if (!clubId || !user || !token) {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: c.background }]}>
        {header}
        <EmptyState icon="bubble" title={t('chatHub.unavailable.title')} description={t('chatHub.unavailable.body')} />
      </View>
    )
  }

  if (detail.status === 'forbidden') {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: c.background }]}>
        {header}
        <EmptyState
          icon="lock"
          title={t('chatHub.unavailable.title')}
          description={t('chatHub.unavailable.body')}
          actionLabel={t('chatHub.backToInbox')}
          onAction={() => router.back()}
        />
      </View>
    )
  }

  if (detail.status === 'error' && !seed) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        {header}
        <ErrorState
          message={t('chatHub.errors.threadTitle')}
          hint={t('chatHub.errors.threadHint')}
          onRetry={detail.reload}
          fillContainer
        />
      </View>
    )
  }

  if (kind === 'channel' && !socketTeamId) {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: c.background }]}>
        {header}
        <EmptyState icon="bubble" title={t('chatHub.unavailable.title')} description={t('chatHub.unavailable.body')} />
      </View>
    )
  }

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      {header}
      <ChatScreen
        key={`${kind}:${id}`}
        kind={kind}
        conversationId={id}
        teamId={socketTeamId}
        clubId={clubId}
        token={token}
        userId={user.id}
        apiUrl={API_URL}
        canWrite={canWrite}
        readOnlyNotice={
          kind === 'dm'
            ? detail.dm?.peerLeftClub
              ? t('chatThread.peerLeftNotice', { name: detail.dm?.otherUser?.name ?? '' })
              : t('chatHub.dmReadOnly')
            : t('chatHub.readOnly')
        }
        onTypingChange={setTypingNames}
        channelKind={kind === 'channel' ? (channel?.kind ?? (seed && seed.kind !== 'DM' ? seed.kind : null)) : null}
        canCompose={canCompose}
        bottomInset={insets.bottom}
        searchOpen={searchOpen}
        onCloseSearch={() => setSearchOpen(false)}
        peer={
          kind === 'dm' && detail.dm?.otherUser
            ? { id: detail.dm.otherUser.id, name: detail.dm.otherUser.name }
            : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { justifyContent: 'center', paddingHorizontal: space.md },
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    flexShrink: 1,
  },
  titleText: { flexShrink: 1 },
})
