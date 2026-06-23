import { SPACING_XXS } from '../../theme/spacing';
import React, { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useChat, type ChatMessage } from '../../hooks/useChat'
import { MessageBubble, MESSAGE_HEIGHT } from './MessageBubble'
import { EditMessageSheet } from './EditMessageSheet'
import { PollSheet, type PollOption } from './PollSheet'
import { api } from '../../api/client'
import { uploadMedia } from '../../api/uploadMedia'
import { ChatInput } from './ChatInput'
import { ConnectionStatus } from './ConnectionStatus'
import { PinnedBanner } from './PinnedBanner'
import { TypingIndicator } from './TypingIndicator'
import { EmptyState } from '../EmptyState'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import {
  elevation,
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY_SMALL,
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  RADIUS_MD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  TAB_BAR_CLEARANCE,
} from '../../theme/tokens'

type Props = {
  teamId: string
  /** When omitted, ChatScreen renders the team's primary General
   * channel. When set, ChatScreen scopes its history + send pipeline
   * to a single channel — used by the chat tab when an admin or
   * coach picks a specific channel from the rail. */
  channelId?: string | null
  clubId: string
  token: string | null
  userId: string
  apiUrl: string
  primaryColor?: string
}

export function ChatScreen({
  teamId,
  channelId,
  clubId,
  token,
  userId,
  apiUrl,
  primaryColor,
}: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const flatListRef = useRef<FlatList<ChatMessage>>(null)

  const {
    messages,
    pinnedMessage,
    connectionState,
    lastError,
    typingUsers,
    hasMore,
    loadingHistory,
    unreadCount,
    sendMessage,
    sendTyping,
    loadMore,
    setIsAtBottom,
    searchMessages,
    refreshHistory,
    reactToMessage,
    unreactToMessage,
    editMessage,
    deleteMessage,
    fetchPollForMessage,
    fetchPoll,
    votePollOption,
    sendMediaMessage,
  } = useChat({ clubId, teamId, channelId, token, userId, apiUrl })

  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null)

  // Apple Guideline 1.2 — report + block surface for UGC chat. Reasons
  // map to the API enum (SPAM/ABUSE/INAPPROPRIATE/OTHER). Severe
  // reasons (ABUSE/INAPPROPRIATE) auto-soft-delete the message
  // server-side until admins triage; the user gets confirmation either
  // way. Block hides the offender's messages from this user's chat
  // history + DMs and is reversible from More → Blocked users.
  const handleReport = useCallback(
    async (msg: ChatMessage) => {
      const submit = async (reason: 'SPAM' | 'ABUSE' | 'INAPPROPRIATE' | 'OTHER') => {
        try {
          await api(`/messages/${msg.id}/report`, {
            method: 'POST',
            body: { reason },
          })
          Alert.alert(
            t('chat.reportSubmitted'),
            t('chat.reportSubmittedBody'),
          )
        } catch {
          Alert.alert(t('chat.reportFailed'), t('chat.reportFailedBody'))
        }
      }
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: t('chat.reportTitle'),
            options: [
              t('chat.reportSpam'),
              t('chat.reportAbuse'),
              t('chat.reportInappropriate'),
              t('chat.reportOther'),
              t('common.cancel'),
            ],
            destructiveButtonIndex: 1,
            cancelButtonIndex: 4,
          },
          (idx) => {
            if (idx === 0) void submit('SPAM')
            else if (idx === 1) void submit('ABUSE')
            else if (idx === 2) void submit('INAPPROPRIATE')
            else if (idx === 3) void submit('OTHER')
          },
        )
      } else {
        Alert.alert(
          t('chat.reportTitle'),
          t('chat.reportTitle'),
          [
            { text: t('chat.reportSpam'), onPress: () => void submit('SPAM') },
            { text: t('chat.reportAbuse'), onPress: () => void submit('ABUSE'), style: 'destructive' },
            { text: t('chat.reportInappropriate'), onPress: () => void submit('INAPPROPRIATE'), style: 'destructive' },
            { text: t('chat.reportOther'), onPress: () => void submit('OTHER') },
            { text: t('common.cancel'), style: 'cancel' },
          ],
        )
      }
    },
    [t],
  )

  const handleBlock = useCallback(async (msg: ChatMessage) => {
    Alert.alert(
      t('chat.blockTitle', { name: msg.senderName }),
      t('chat.blockBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('chat.blockConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/users/${msg.senderId}/block`, { method: 'POST' })
              Alert.alert(
                t('chat.blocked'),
                t('chat.blockedBody', { name: msg.senderName }),
              )
            } catch {
              Alert.alert(t('chat.blockFailed'), t('chat.blockFailedBody'))
            }
          },
        },
      ],
    )
  }, [t])

  type ActivePoll = {
    id: string
    question: string
    options: PollOption[]
    totalVotes: number
    myVoteOptionId: string | null
    closesAt: string | null
  }
  const [activePoll, setActivePoll] = useState<ActivePoll | null>(null)

  const openPoll = useCallback(
    async (message: ChatMessage) => {
      const poll = await fetchPollForMessage(message.id)
      if (!poll) return
      setActivePoll({
        id: poll.id,
        question: poll.question,
        options: poll.options,
        totalVotes: poll.totalVotes,
        myVoteOptionId: poll.myVoteOptionIds[0] ?? null,
        closesAt: poll.closesAt,
      })
    },
    [fetchPollForMessage],
  )

  const handleVote = useCallback(
    async (optionId: string) => {
      if (!activePoll) return
      await votePollOption(activePoll.id, optionId)
      const refreshed = await fetchPoll(activePoll.id)
      if (refreshed) {
        setActivePoll((curr) =>
          curr
            ? {
                ...curr,
                options: refreshed.options,
                totalVotes: refreshed.totalVotes,
                myVoteOptionId: refreshed.myVoteOptionIds[0] ?? null,
              }
            : curr,
        )
      } else {
        // Naive optimistic local bump
        setActivePoll((curr) =>
          curr
            ? {
                ...curr,
                myVoteOptionId: optionId,
                totalVotes: curr.totalVotes + (curr.myVoteOptionId ? 0 : 1),
                options: curr.options.map((o) =>
                  o.id === optionId
                    ? { ...o, votes: o.votes + (curr.myVoteOptionId === optionId ? 0 : 1) }
                    : o,
                ),
              }
            : curr,
        )
      }
    },
    [activePoll, fetchPoll, votePollOption],
  )

  useFocusEffect(
    useCallback(() => {
      refreshHistory()
    }, [refreshHistory]),
  )

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if (!query.trim()) {
        setSearchResults([])
        return
      }
      setIsSearching(true)
      searchTimerRef.current = setTimeout(async () => {
        const results = await searchMessages(query)
        setSearchResults(results)
        setIsSearching(false)
      }, 300)
    },
    [searchMessages],
  )

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearchQuery('')
        setSearchResults([])
      }
      return !prev
    })
  }, [])

  const localizedError =
    lastError === 'connect_error'
      ? t('chat.connectError')
      : lastError === 'offline'
        ? t('chat.offline')
        : lastError === 'send_error'
          ? t('chat.sendError')
          : lastError

  const handleSend = useCallback(
    async (content: string, replyToId?: string | null) => {
      return sendMessage(content, clubId, replyToId)
    },
    [sendMessage, clubId],
  )

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true })
  }, [])

  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { y: number }
        contentSize: { height: number }
        layoutMeasurement: { height: number }
      }
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const atBottom =
        contentOffset.y >= contentSize.height - layoutMeasurement.height - 50
      setIsAtBottom(atBottom)
    },
    [setIsAtBottom],
  )

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isOwn = item.senderId === userId
      const prev = messagesRef.current[index - 1]
      const showSender = !prev || prev.senderId !== item.senderId

      return (
        <MessageBubble
          message={item}
          isOwn={isOwn}
          showSender={showSender}
          primaryColor={primaryColor}
          myUserId={userId}
          onReact={reactToMessage}
          onUnreact={unreactToMessage}
          onReply={setReplyTarget}
          onEdit={(msg) => setEditTarget(msg)}
          onDelete={(msg) => {
            void deleteMessage(msg.id)
          }}
          onReport={(msg) => {
            void handleReport(msg)
          }}
          onBlock={(msg) => {
            void handleBlock(msg)
          }}
          onOpenPoll={(msg) => {
            void openPoll(msg)
          }}
        />
      )
    },
    [
      userId,
      primaryColor,
      reactToMessage,
      unreactToMessage,
      editMessage,
      deleteMessage,
      handleReport,
      handleBlock,
    ],
  )

  const getItemLayout = useCallback(
    (_data: ArrayLike<ChatMessage> | null | undefined, index: number) => ({
      length: MESSAGE_HEIGHT,
      offset: MESSAGE_HEIGHT * index,
      index,
    }),
    [],
  )

  const keyExtractor = useCallback((item: ChatMessage) => item.id, [])

  const isDisabled = connectionState !== 'connected'

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.topBar}>
        <ConnectionStatus state={connectionState} />
        <Pressable
          onPress={toggleSearch}
          style={styles.searchToggle}
          accessibilityRole="button"
          accessibilityLabel={
            searchOpen ? t('common.close') : t('chatSearch.placeholder')
          }
        >
          <Icon
            name={searchOpen ? 'xmark' : 'magnifyingglass'}
            size="md"
            color={c.textSecondary}
          />
        </Pressable>
      </View>

      {localizedError ? (
        <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]}>
          <Text variant="footnote" style={{ color: c.error }}>
            {localizedError}
          </Text>
        </View>
      ) : null}

      {searchOpen && (
        <View
          style={[
            styles.searchBar,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <Icon name="magnifyingglass" size="sm" color={c.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            placeholder={t('chatSearch.placeholder')}
            placeholderTextColor={c.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
            returnKeyType="search"
          />
          {isSearching && (
            <Text variant="caption1" color="tertiary">
              {t('common.loading')}
            </Text>
          )}
        </View>
      )}

      {searchOpen && searchResults.length > 0 && (
        <View
          style={[
            styles.searchResults,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <FlatList
            data={searchResults}
            keyExtractor={(item) => `search-${item.id}`}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.searchResultItem,
                  { borderBottomColor: c.borderSubtle },
                ]}
              >
                <Text variant="caption1" color="secondary" weight="medium">
                  {item.senderName}
                </Text>
                <Text
                  variant="footnote"
                  color="primary"
                  numberOfLines={2}
                  style={styles.searchResultContent}
                >
                  {item.content}
                </Text>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={styles.searchResultTime}
                >
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
              </View>
            )}
            style={styles.searchResultsList}
          />
        </View>
      )}

      {pinnedMessage ? (
        <PinnedBanner
          message={pinnedMessage}
          primaryColor={primaryColor}
          onPress={scrollToBottom}
        />
      ) : null}

      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <EmptyState
            icon="message"
            title={t('chat.screenTitle')}
            description={t('chat.emptyState')}
          />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          contentContainerStyle={styles.messageList}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          removeClippedSubviews
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={10}
          onEndReached={hasMore && !loadingHistory ? loadMore : undefined}
          onEndReachedThreshold={0.3}
          onContentSizeChange={() => {
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          }}
        />
      )}

      {unreadCount > 0 && (
        <Pressable
          style={[
            styles.fab,
            elevation.fab,
            { backgroundColor: primaryColor || c.primary },
          ]}
          onPress={scrollToBottom}
          accessibilityRole="button"
          accessibilityLabel={t('chat.scrollToBottom')}
        >
          <Icon name="chevron.down" size="md" color={c.textInverse} />
          <Text
            variant="caption2"
            weight="bold"
            style={[
              styles.fabBadge,
              { backgroundColor: c.error, color: c.textInverse },
            ]}
          >
            {unreadCount}
          </Text>
        </Pressable>
      )}

      <TypingIndicator users={typingUsers} />

      {replyTarget ? (
        <View
          style={[
            styles.replyBar,
            { backgroundColor: c.surfaceSunken, borderTopColor: c.borderSubtle },
          ]}
        >
          <View style={[styles.replyAccent, { backgroundColor: primaryColor ?? c.primary }]} />
          <View style={styles.replyBody}>
            <Text variant="caption2" weight="semibold" style={{ color: primaryColor ?? c.primary }}>
              {t('chat.replyingTo', { name: replyTarget.senderName })}
            </Text>
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {(replyTarget.content || '').slice(0, 120)}
            </Text>
          </View>
          <Pressable
            onPress={() => setReplyTarget(null)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.cancelReply')}
            hitSlop={8}
            style={styles.replyClose}
          >
            <Icon name="close" size={18} color={c.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <ChatInput
        onSend={(content: string) => {
          const promise = handleSend(content, replyTarget?.id ?? null)
          if (replyTarget) setReplyTarget(null)
          return promise
        }}
        onSendAttachment={async (att) => {
          const upload = await uploadMedia({
            teamId,
            token: token!,
            uri: att.uri,
            contentType: att.contentType,
            kind: att.kind === 'voice' ? 'voice' : 'image',
          })
          if (!upload) return false
          const meta: Record<string, unknown> =
            att.kind === 'voice'
              ? { durationMs: att.durationMs }
              : { width: att.width, height: att.height }
          const ok = await sendMediaMessage({
            messageType: att.kind === 'voice' ? 'VOICE' : 'IMAGE',
            attachmentUrl: upload.publicUrl,
            attachmentMeta: meta,
            replyToId: replyTarget?.id,
          })
          if (replyTarget) setReplyTarget(null)
          return ok
        }}
        onTyping={sendTyping}
        disabled={isDisabled}
        primaryColor={primaryColor}
        errorMessage={localizedError}
      />

      <EditMessageSheet
        visible={!!editTarget}
        initialContent={editTarget?.content ?? ''}
        onClose={() => setEditTarget(null)}
        onSubmit={async (content) => {
          if (!editTarget) return
          await editMessage(editTarget.id, content)
        }}
      />

      <PollSheet
        visible={!!activePoll}
        question={activePoll?.question ?? ''}
        options={activePoll?.options ?? []}
        totalVotes={activePoll?.totalVotes ?? 0}
        myVoteOptionId={activePoll?.myVoteOptionId ?? null}
        closesAt={activePoll?.closesAt ?? null}
        onVote={handleVote}
        onClose={() => setActivePoll(null)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderTopWidth: hairline,
    gap: SPACING_SM,
  },
  replyAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: SPACING_XXS,
  },
  replyBody: {
    flex: 1,
    gap: SPACING_XXS,
  },
  replyClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING_SM,
  },
  searchToggle: {
    padding: SPACING_SM,
    marginRight: SPACING_XS,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING_SM,
    marginBottom: SPACING_XS,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_MD,
    borderWidth: hairline,
    gap: SPACING_XS,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE_BODY_SMALL,
    fontFamily: FONT_FAMILY_REGULAR,
    paddingVertical: SPACING_XS,
  },
  searchResults: {
    maxHeight: 280,
    marginHorizontal: SPACING_SM,
    marginBottom: SPACING_XS,
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
  },
  searchResultsList: {
    maxHeight: 280,
  },
  searchResultItem: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderBottomWidth: hairline,
  },
  searchResultContent: {
    marginTop: SPACING_XXS,
  },
  searchResultTime: {
    marginTop: SPACING_XXS,
  },
  messageList: {
    paddingVertical: SPACING_SM,
  },
  errorBanner: {
    marginHorizontal: SPACING_SM,
    marginBottom: SPACING_XS,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_MD,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING_XL,
  },
  fab: {
    position: 'absolute',
    right: SPACING_LG,
    bottom: 80 + TAB_BAR_CLEARANCE,
    width: 44,
    height: 44,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: RADIUS_FULL,
    textAlign: 'center',
    overflow: 'hidden',
    paddingHorizontal: SPACING_XS,
  },
})