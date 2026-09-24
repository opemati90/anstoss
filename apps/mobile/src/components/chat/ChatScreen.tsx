import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect, router } from 'expo-router'
import { BackHandler, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import type { ChannelKind, DmLineupInput } from '@anstoss/shared'
import type { ChatMessage } from '../../hooks/useChat'
import { useConversation } from '../../hooks/useConversation'
import { uploadDmMedia } from '../../hooks/dmMedia'
import { getInboxUnread } from '../../hooks/useInbox'
import { uploadMedia } from '../../api/uploadMedia'
import { MessageBubble, type ReadState } from './MessageBubble'
import { EditMessageSheet } from './EditMessageSheet'
import { ChatInput } from './ChatInput'
import { ConnectionStatus } from './ConnectionStatus'
import { PinnedBanner } from './PinnedBanner'
import { TypingIndicator } from './TypingIndicator'
import { ComposeSheet } from './ComposeSheet'
import { AttachmentMenuSheet, type AttachmentAction } from './AttachmentMenuSheet'
import { LineupShareSheet } from './LineupShareSheet'
import { MediaViewer, type ViewerMedia } from './MediaViewer'
import { ReportSheet, type ModerationTarget } from './ReportSheet'
import {
  attachmentMessageType,
  attachmentMeta,
  pickLibraryMedia,
  pickPdf,
  takeCameraPhoto,
  type ChatAttachment,
} from './chatAttachments'
import { buildThreadRows, type ThreadRow } from './chatGrouping'
import { daySeparatorLabel } from './chatDates'
import type { VoiceRecorderResult } from './VoiceRecorderButton'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Skeleton } from '../Skeleton'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon, Text } from '../ui'
import type { ConversationKind } from './inboxModel'
import {
  elevation,
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
  hairline,
  radius,
  RADIUS_MD,
  space,
} from '../../theme/tokens'

type Props = {
  kind: ConversationKind
  /** channelId or conversationId */
  conversationId: string
  /** Team the channel is served through (channels only). */
  teamId: string | null
  clubId: string
  token: string | null
  userId: string
  apiUrl: string
  /** Can the reader post here? False renders the read-only footer instead of the composer. */
  canWrite: boolean
  /** Why the reader can't post, when canWrite is false. */
  readOnlyNotice?: string
  channelKind?: ChannelKind | null
  /** Channel managers: poll / event / team lineup, pin and moderation. */
  canCompose?: boolean
  /** Bottom safe-area inset to keep the composer above the home indicator. */
  bottomInset?: number
  /** Search is opened from the header; ChatScreen renders the field + results. */
  searchOpen?: boolean
  onCloseSearch?: () => void
  /** DM peer, for the block action. */
  peer?: { id: string; name: string } | null
  /** Header subtitle hint: who is typing right now. */
  onTypingChange?: (names: string[]) => void
}

/**
 * The conversation body shared by channels and direct messages (WhatsApp /
 * iMessage conventions): an inverted list anchored to the newest message,
 * grouped bubbles with day pills and a "Neue Nachrichten" divider, a jump
 * button with the unread count, swipe-to-reply, one composer that rides the
 * keyboard on iOS and Android edge-to-edge, and the + menu (photo/video,
 * camera, PDF, voice, lineup card, manager cards).
 */
export function ChatScreen({
  kind,
  conversationId,
  teamId,
  clubId,
  token,
  userId,
  apiUrl,
  canWrite,
  readOnlyNotice,
  channelKind = null,
  canCompose = false,
  bottomInset = 0,
  searchOpen = false,
  onCloseSearch,
  peer = null,
  onTypingChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const listRef = useRef<FlatList<ThreadRow>>(null)
  const isDm = kind === 'dm'
  const isAnnouncements = channelKind === 'ANNOUNCEMENTS'

  // M7: the composer follows the keyboard frame by frame (iOS and Android 15
  // edge-to-edge alike). A spacer under the composer takes the keyboard's
  // height; the safe-area inset fades out as the keyboard comes up.
  const keyboard = useReanimatedKeyboardAnimation()
  const keyboardSpacer = useAnimatedStyle(() => ({
    height: Math.max(0, -keyboard.height.value),
  }))
  const composerInset = useAnimatedStyle(() => ({
    paddingBottom: bottomInset * (1 - Math.min(1, Math.max(0, keyboard.progress.value))),
  }))

  const convo = useConversation({ kind, conversationId, teamId, clubId, token, userId, apiUrl })
  const {
    messages,
    pinnedMessage,
    connectionState,
    lastError,
    historyLoaded,
    typingUsers,
    hasMore,
    loadingHistory,
    unreadCount,
    send,
    sendTyping,
    loadMore,
    setIsAtBottom,
    searchMessages,
    refreshHistory,
    reactToMessage,
    unreactToMessage,
    editMessage,
    deleteMessage,
    pinMessage,
    sendMediaMessage,
    appendMessage,
    markRead,
    capabilities,
    peerLastReadAt,
    sendDmAttachment,
    sendDmLineup,
  } = convo

  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [lineupOpen, setLineupOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null)
  const [moderation, setModeration] = useState<ModerationTarget | null>(null)
  const [viewer, setViewer] = useState<ViewerMedia | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [composerHint, setComposerHint] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [blockedPeer, setBlockedPeer] = useState(false)

  // "Neue Nachrichten": the unread count the inbox showed when the thread opened.
  const [unreadOnOpen] = useState(() => getInboxUnread(conversationId))
  const didInitialScroll = useRef(false)
  // Only messages that arrive after the first render animate in.
  const initialIdsRef = useRef<Set<string> | null>(null)
  if (initialIdsRef.current === null && historyLoaded) {
    initialIdsRef.current = new Set(messages.map((m) => m.id))
  }

  useEffect(() => {
    onTypingChange?.(typingUsers)
  }, [onTypingChange, typingUsers])

  useFocusEffect(
    useCallback(() => {
      refreshHistory()
      markRead()
    }, [markRead, refreshHistory]),
  )

  // A DM is read while it is on screen (the peer's ✓✓ turns on).
  const lastMessageId = messages[messages.length - 1]?.id
  useEffect(() => {
    if (isDm && lastMessageId) markRead()
  }, [isDm, lastMessageId, markRead])

  // ── Search (opened from the header) ─────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRequestIdRef = useRef(0)

  // Hardware back closes the search panel before leaving the thread.
  useEffect(() => {
    if (!searchOpen || !onCloseSearch) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseSearch()
      return true
    })
    return () => sub.remove()
  }, [onCloseSearch, searchOpen])

  useEffect(() => {
    if (searchOpen) return
    searchRequestIdRef.current += 1
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    setSearchQuery('')
    setSearchResults([])
    setIsSearching(false)
  }, [searchOpen])

  const handleSearch = useCallback(
    (query: string) => {
      searchRequestIdRef.current += 1
      setSearchQuery(query)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      if (query.trim().length < 2) {
        setSearchResults([])
        setIsSearching(false)
        return
      }
      setIsSearching(true)
      const requestId = searchRequestIdRef.current
      searchTimerRef.current = setTimeout(async () => {
        try {
          const needle = query.trim().toLowerCase()
          const results = isDm
            ? messages.filter((m) => m.content.toLowerCase().includes(needle))
            : (await searchMessages(query)).filter(
                (m) => (m as { channelId?: string | null }).channelId === conversationId,
              )
          if (requestId === searchRequestIdRef.current) setSearchResults(results)
        } catch {
          if (requestId === searchRequestIdRef.current) setSearchResults([])
        } finally {
          if (requestId === searchRequestIdRef.current) setIsSearching(false)
        }
      }, 300)
    },
    [conversationId, isDm, messages, searchMessages],
  )

  const localizedError =
    lastError === 'connect_error'
      ? t('chat.connectError')
      : lastError === 'offline'
        ? t('chat.offline')
        : lastError === 'send_error'
          ? t('chat.sendError')
          : lastError === 'dm_forbidden'
            ? t('chatThread.errors.dmForbidden')
            : lastError === 'history_error'
              ? t('chatHub.errors.historyFailed')
              : null

  // Rows oldest-first, then reversed for the inverted list.
  const rows = useMemo(
    () =>
      buildThreadRows({
        messages,
        isGroupChat: !isDm,
        myUserId: userId,
        unreadOnOpen,
        locale: i18n.language,
        t,
      }).reverse(),
    [i18n.language, isDm, messages, t, unreadOnOpen, userId],
  )

  // Open at the first unread message, if any.
  useEffect(() => {
    if (didInitialScroll.current || !historyLoaded || rows.length === 0) return
    didInitialScroll.current = true
    const index = rows.findIndex((row) => row.type === 'unread')
    if (index > 0) {
      requestAnimationFrame(() =>
        listRef.current?.scrollToIndex({ index, viewPosition: 0.9, animated: false }),
      )
    }
  }, [historyLoaded, rows])

  const scrollToLatest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
  }, [])

  const jumpTo = useCallback(
    (messageId: string) => {
      const index = rows.findIndex((row) => row.type === 'message' && row.message.id === messageId)
      if (index < 0) return
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true })
      setHighlightId(messageId)
      setTimeout(() => setHighlightId((current) => (current === messageId ? null : current)), 1600)
    },
    [rows],
  )

  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      // Inverted: offset 0 is the newest message.
      const bottom = event.nativeEvent.contentOffset.y < 80
      setAtBottom((prev) => (prev === bottom ? prev : bottom))
      setIsAtBottom(bottom)
    },
    [setIsAtBottom],
  )

  const readStateFor = useCallback(
    (message: ChatMessage): ReadState => {
      if (message.senderId !== userId) return null
      if (message.id.startsWith('pending:')) return 'pending'
      if (!isDm) return 'sent'
      return peerLastReadAt && message.createdAt <= peerLastReadAt ? 'read' : 'sent'
    },
    [isDm, peerLastReadAt, userId],
  )

  const openModeration = useCallback(
    (mode: 'report' | 'block') => (msg: ChatMessage) =>
      setModeration({
        mode,
        messageId: msg.id,
        isDm,
        senderId: msg.senderId ?? peer?.id ?? null,
        senderName: msg.senderName ?? peer?.name ?? '',
      }),
    [isDm, peer?.id, peer?.name],
  )

  const renderRow = useCallback(
    ({ item }: { item: ThreadRow }) => {
      if (item.type === 'day') {
        return (
          <View style={styles.dayRow} accessibilityRole="header">
            <View style={[styles.dayPill, { backgroundColor: c.surfaceSunken }]}>
              <Text variant="caption1" weight="medium" color="secondary">
                {item.label}
              </Text>
            </View>
          </View>
        )
      }
      if (item.type === 'unread') {
        return (
          <View style={styles.unreadRow} accessibilityRole="header" testID="chat-unread-divider">
            <View style={[styles.unreadLine, { backgroundColor: c.borderSubtle }]} />
            <Text variant="caption1" weight="semibold" color="tint">
              {t('chatThread.newMessages', { count: item.count })}
            </Text>
            <View style={[styles.unreadLine, { backgroundColor: c.borderSubtle }]} />
          </View>
        )
      }
      const message = item.message
      const own = message.senderId === userId
      return (
        <MessageBubble
          message={message}
          isOwn={own}
          isGroupChat={!isDm}
          firstInGroup={item.firstInGroup}
          lastInGroup={item.lastInGroup}
          showSender={item.showSender}
          showAvatar={item.showAvatar}
          readState={readStateFor(message)}
          canModerate={!isDm && canCompose}
          canPin={!isDm && canCompose && capabilities.pin}
          myUserId={userId}
          clubId={clubId}
          dmMedia={isDm ? { clubId, conversationId } : null}
          highlighted={highlightId === message.id}
          animateIn={!!initialIdsRef.current && !initialIdsRef.current.has(message.id)}
          onReact={capabilities.reactions && canWrite ? reactToMessage : undefined}
          onUnreact={capabilities.reactions && canWrite ? unreactToMessage : undefined}
          onReply={capabilities.replies && canWrite ? setReplyTarget : undefined}
          onEdit={capabilities.edit ? setEditTarget : undefined}
          onDelete={(msg) => void deleteMessage(msg.id)}
          onPin={(msg) => void pinMessage(msg).catch(() => setComposerHint(t('errors.server')))}
          onReport={openModeration('report')}
          onBlock={isDm ? openModeration('block') : undefined}
          onOpenMedia={setViewer}
          onJumpTo={jumpTo}
        />
      )
    },
    [
      c.borderSubtle,
      c.surfaceSunken,
      canCompose,
      canWrite,
      capabilities,
      clubId,
      conversationId,
      deleteMessage,
      highlightId,
      isDm,
      jumpTo,
      openModeration,
      pinMessage,
      reactToMessage,
      readStateFor,
      t,
      unreactToMessage,
      userId,
    ],
  )

  // ── Attachments ──────────────────────────────────────────────────────
  const sendAttachment = useCallback(
    async (att: ChatAttachment): Promise<boolean> => {
      if (!token) return false
      setUploading(true)
      setComposerHint(t('chatThread.attach.uploading'))
      try {
        const messageType = attachmentMessageType(att)
        const filename = att.kind === 'file' ? att.fileName : undefined
        const meta = attachmentMeta(att)
        const replyToId = replyTarget?.id
        if (isDm) {
          const upload = await uploadDmMedia({
            clubId,
            conversationId,
            uri: att.uri,
            contentType: att.contentType,
            kind: att.kind,
            filename,
          })
          if (!upload.ok) {
            setComposerHint(
              upload.reason === 'forbidden'
                ? t('chatThread.errors.dmForbidden')
                : upload.reason === 'unavailable'
                  ? t('chatThread.errors.uploadUnavailable')
                  : t('chatHub.errors.uploadFailed'),
            )
            return false
          }
          const result = await sendDmAttachment!({
            messageType,
            attachmentUrl: upload.publicUrl,
            attachmentMeta: meta,
            ...(replyToId ? { replyToId } : {}),
          })
          if (result !== 'ok') {
            setComposerHint(
              result === 'forbidden' ? t('chatThread.errors.dmForbidden') : t('chatHub.errors.uploadFailed'),
            )
            return false
          }
        } else {
          if (!teamId) return false
          const upload = await uploadMedia({
            teamId,
            token,
            uri: att.uri,
            contentType: att.contentType,
            kind: att.kind,
            filename,
          })
          if (!upload) {
            setComposerHint(t('chatHub.errors.uploadFailed'))
            return false
          }
          const ok = await sendMediaMessage({
            messageType,
            attachmentUrl: upload.publicUrl,
            attachmentMeta: meta,
            ...(replyToId ? { replyToId } : {}),
          })
          if (!ok) {
            setComposerHint(t('chatHub.errors.uploadFailed'))
            return false
          }
        }
        setComposerHint(null)
        if (replyTarget) setReplyTarget(null)
        return true
      } finally {
        setUploading(false)
      }
    },
    [clubId, conversationId, isDm, replyTarget, sendDmAttachment, sendMediaMessage, t, teamId, token],
  )

  const handleVoice = useCallback(
    (rec: VoiceRecorderResult) =>
      sendAttachment({ kind: 'voice', uri: rec.uri, durationMs: rec.durationMs, contentType: rec.contentType }),
    [sendAttachment],
  )

  const runAfterSheet = (fn: () => void) => {
    // Let the sheet finish dismissing before a system picker presents;
    // presenting over a closing sheet freezes iOS.
    setTimeout(fn, 350)
  }

  const handleMenu = useCallback(
    (action: AttachmentAction) => {
      setMenuOpen(false)
      if (action === 'voice') {
        setComposerHint(t('chatThread.attach.voiceTip'))
        return
      }
      if (action === 'lineup') {
        runAfterSheet(() => setLineupOpen(true))
        return
      }
      if (action === 'compose') {
        runAfterSheet(() => setComposeOpen(true))
        return
      }
      runAfterSheet(() => {
        const pick =
          action === 'library' ? pickLibraryMedia() : action === 'camera' ? takeCameraPhoto() : pickPdf()
        void pick.then((att) => {
          if (att) void sendAttachment(att)
        })
      })
    },
    [sendAttachment, t],
  )

  const handleShareLineup = useCallback(
    (lineup: DmLineupInput) => sendDmLineup!(lineup, replyTarget?.id ?? null),
    [replyTarget?.id, sendDmLineup],
  )

  const isDisabled = connectionState !== 'connected' || uploading
  const showSkeleton = messages.length === 0 && !historyLoaded && lastError !== 'connect_error'
  const showLoadError = messages.length === 0 && !historyLoaded && lastError === 'connect_error'
  const composerEnabled = canWrite && !blockedPeer

  const emptyCopy = isDm
    ? { title: t('chatHub.emptyThread.dmTitle'), body: t('chatHub.emptyThread.dmBody', { name: peer?.name ?? '' }) }
    : isAnnouncements
      ? { title: t('chatHub.emptyThread.announcementsTitle'), body: t('chatHub.emptyThread.announcementsBody') }
      : { title: t('chatHub.emptyThread.title'), body: t('chatHub.emptyThread.body') }

  const trimmedQuery = searchQuery.trim()
  const showJump = !atBottom || unreadCount > 0

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ConnectionStatus state={connectionState} />

      {searchOpen ? (
        <View style={[styles.searchPanel, { borderBottomColor: c.borderSubtle, backgroundColor: c.background }]}>
          <View style={[styles.searchField, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            <Icon name="magnifyingglass" size="sm" color={c.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: c.textPrimary }]}
              placeholder={t('chatHub.searchInChat')}
              placeholderTextColor={c.textTertiary}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
              returnKeyType="search"
              accessibilityLabel={t('chatHub.searchInChat')}
            />
            <Pressable
              onPress={onCloseSearch}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={8}
              style={styles.searchClose}
            >
              <Icon name="xmark.circle.fill" size="md" color={c.textTertiary} />
            </Pressable>
          </View>
          {trimmedQuery.length >= 2 ? (
            <View style={styles.searchResults}>
              {isSearching ? (
                <Text variant="footnote" color="tertiary">
                  {t('common.loading')}
                </Text>
              ) : searchResults.length === 0 ? (
                <Text variant="footnote" color="secondary">
                  {t('chatHub.searchNoResults', { query: trimmedQuery })}
                </Text>
              ) : (
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => `search-${item.id}`}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        onCloseSearch?.()
                        jumpTo(item.id)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.senderName ?? ''}: ${item.content}`}
                      style={[styles.searchResultItem, { borderBottomColor: c.borderSubtle }]}
                    >
                      <View style={styles.searchResultHead}>
                        <Text variant="footnote" weight="semibold" color="primary" numberOfLines={1} style={styles.flex}>
                          {item.senderName ?? ''}
                        </Text>
                        <Text variant="caption1" color="tertiary" tabular>
                          {daySeparatorLabel(item.createdAt, i18n.language, t)}
                        </Text>
                      </View>
                      <Text variant="subheadline" color="secondary" numberOfLines={2}>
                        {item.content}
                      </Text>
                    </Pressable>
                  )}
                  style={styles.searchResultsList}
                />
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {pinnedMessage ? (
        <PinnedBanner
          message={pinnedMessage}
          primaryColor={c.primary}
          onPress={() => jumpTo(pinnedMessage.id)}
        />
      ) : null}

      <View style={styles.flex}>
        {showSkeleton ? (
          <ThreadSkeleton />
        ) : showLoadError ? (
          <ErrorState
            message={t('chatHub.errors.threadTitle')}
            hint={t('chatHub.errors.threadHint')}
            onRetry={refreshHistory}
            fillContainer
          />
        ) : messages.length === 0 ? (
          <View style={styles.emptyState}>
            <EmptyState icon={isDm ? 'bubble' : 'message'} title={emptyCopy.title} description={emptyCopy.body} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            inverted
            data={rows}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={renderRow}
            keyExtractor={(row) => row.key}
            contentContainerStyle={styles.messageList}
            onScroll={handleScroll}
            scrollEventThrottle={32}
            // Older messages load at the top; the inverted list stays anchored.
            maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
            onEndReached={hasMore && !loadingHistory ? loadMore : undefined}
            onEndReachedThreshold={0.4}
            initialNumToRender={24}
            maxToRenderPerBatch={12}
            windowSize={11}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              })
              setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5 }), 120)
            }}
            testID="chat-thread"
          />
        )}

        {showJump && messages.length > 0 ? (
          <Pressable
            style={[styles.fab, elevation.fab, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            onPress={scrollToLatest}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0 ? t('chatThread.jumpToLatestUnread', { count: unreadCount }) : t('chat.scrollToBottom')
            }
            testID="chat-jump-latest"
          >
            <Icon name="chevron.down" size="md" color={c.textPrimary} />
            {unreadCount > 0 ? (
              <View style={[styles.fabBadge, { backgroundColor: c.primary }]}>
                <Text variant="caption1" weight="bold" tabular color={c.onPrimary}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      <TypingIndicator users={typingUsers} />

      {localizedError && messages.length > 0 ? (
        <View style={[styles.errorBanner, { backgroundColor: c.errorBg }]} accessibilityLiveRegion="polite">
          <Text variant="footnote" style={{ color: c.error }}>
            {localizedError}
          </Text>
        </View>
      ) : null}

      {replyTarget && composerEnabled ? (
        <View style={[styles.replyBar, { backgroundColor: c.surface, borderTopColor: c.borderSubtle }]}>
          <View style={[styles.replyAccent, { backgroundColor: c.primary }]} />
          <Pressable
            onPress={() => jumpTo(replyTarget.id)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.replyingTo', { name: replyTarget.senderName })}
            style={styles.replyBody}
          >
            <Text variant="caption1" weight="semibold" color="tint">
              {t('chat.replyingTo', { name: replyTarget.senderName })}
            </Text>
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {(replyTarget.content || t(`chatThread.media.a11y.${replyTarget.messageType ?? 'TEXT'}`, { defaultValue: '' })).slice(0, 120)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setReplyTarget(null)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.cancelReply')}
            hitSlop={8}
            style={styles.replyClose}
          >
            <Icon name="xmark" size={18} color={c.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <Animated.View style={composerInset}>
        {composerEnabled ? (
          <ChatInput
            onSend={(content: string) => {
              const promise = send(content, replyTarget?.id ?? null, { isAnnouncement: isAnnouncements })
              if (replyTarget) setReplyTarget(null)
              setComposerHint(null)
              return promise
            }}
            onVoiceRecorded={capabilities.media ? handleVoice : undefined}
            onOpenMenu={capabilities.media ? () => setMenuOpen(true) : undefined}
            onCamera={
              capabilities.media
                ? () =>
                    void takeCameraPhoto().then((att) => {
                      if (att) void sendAttachment(att)
                    })
                : undefined
            }
            onTyping={sendTyping}
            disabled={isDisabled}
            hint={composerHint}
            draftKey={`${kind}:${conversationId}`}
            placeholder={isAnnouncements ? t('chatHub.announcementPlaceholder') : undefined}
          />
        ) : (
          <View
            style={[styles.readOnly, { backgroundColor: c.surface, borderTopColor: c.borderSubtle }]}
            accessibilityRole="text"
            testID="chat-read-only"
          >
            <Icon name="lock.fill" size={14} color={c.textTertiary} />
            <Text variant="footnote" color="secondary" style={styles.flex}>
              {blockedPeer ? t('chatThread.block.blockedNotice', { name: peer?.name ?? '' }) : readOnlyNotice ?? t('chatHub.readOnly')}
            </Text>
          </View>
        )}
      </Animated.View>
      <Animated.View style={keyboardSpacer} />

      <AttachmentMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={handleMenu}
        showLineup={capabilities.shareLineup}
        showCompose={!isDm && canCompose && capabilities.compose && !!teamId}
      />

      {!isDm && canCompose && capabilities.compose && teamId ? (
        <ComposeSheet
          visible={composeOpen}
          clubId={clubId}
          teamId={teamId}
          channelId={conversationId}
          locale={i18n.language}
          onClose={() => setComposeOpen(false)}
          onPosted={appendMessage}
          onAction={(action) => {
            setComposeOpen(false)
            if (action === 'photo') {
              runAfterSheet(() => {
                void pickLibraryMedia().then((att) => {
                  if (att) void sendAttachment(att)
                })
              })
            } else {
              router.push({ pathname: '/lineup-builder', params: { teamId } } as never)
            }
          }}
        />
      ) : null}

      {isDm && capabilities.shareLineup ? (
        <LineupShareSheet
          visible={lineupOpen}
          clubId={clubId}
          conversationId={conversationId}
          locale={i18n.language}
          onClose={() => setLineupOpen(false)}
          onShare={handleShareLineup}
        />
      ) : null}

      <ReportSheet
        target={moderation}
        onClose={() => setModeration(null)}
        onBlocked={() => {
          if (isDm) setBlockedPeer(true)
        }}
      />

      <MediaViewer media={viewer} onClose={() => setViewer(null)} />

      <EditMessageSheet
        visible={!!editTarget}
        initialContent={editTarget?.content ?? ''}
        onClose={() => setEditTarget(null)}
        onSubmit={async (content) => {
          if (!editTarget) return
          await editMessage(editTarget.id, content)
        }}
      />
    </View>
  )
}

function ThreadSkeleton() {
  const widths = ['62%', '48%', '70%', '40%', '55%'] as const
  return (
    <View style={styles.skeleton} importantForAccessibility="no-hide-descendants">
      {widths.map((width, index) => (
        <View key={index} style={[styles.skeletonRow, index % 2 === 1 && styles.skeletonOwn]}>
          <Skeleton width={width} height={44} style={styles.skeletonBubble} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  dayRow: { alignItems: 'center', paddingVertical: space.sm },
  dayPill: {
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  unreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  unreadLine: { flex: 1, height: hairline },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: hairline,
    gap: space.sm,
  },
  replyAccent: { width: 3, alignSelf: 'stretch', borderRadius: space['2xs'] },
  replyBody: { flex: 1, gap: space['2xs'], minHeight: 44, justifyContent: 'center' },
  replyClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderTopWidth: hairline,
  },
  searchPanel: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    gap: space.sm,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingLeft: space.md,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE_BODY,
    fontFamily: FONT_FAMILY_REGULAR,
    paddingVertical: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  searchClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchResults: { maxHeight: 300 },
  searchResultsList: { maxHeight: 300 },
  searchResultItem: {
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    gap: space['2xs'],
    minHeight: 44,
  },
  searchResultHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  messageList: { paddingVertical: space.sm },
  errorBanner: {
    marginHorizontal: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  emptyState: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg },
  fab: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: space.xs,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeleton: { flex: 1, paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm },
  skeletonRow: { alignItems: 'flex-start' },
  skeletonOwn: { alignItems: 'flex-end' },
  skeletonBubble: { borderRadius: radius.lg },
})
