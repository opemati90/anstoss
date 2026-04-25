import React, { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
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
import { ChatInput } from './ChatInput'
import { ConnectionStatus } from './ConnectionStatus'
import { PinnedBanner } from './PinnedBanner'
import { TypingIndicator } from './TypingIndicator'
import { EmptyState } from '../EmptyState'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import {
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
} from '../../theme/tokens'

type Props = {
  teamId: string
  clubId: string
  token: string | null
  userId: string
  apiUrl: string
  primaryColor?: string
}

export function ChatScreen({
  teamId,
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
  } = useChat({ clubId, teamId, token, userId, apiUrl })

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
    async (content: string) => {
      return sendMessage(content, clubId)
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
        />
      )
    },
    [userId, primaryColor],
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
            {
              backgroundColor: primaryColor || c.primary,
              shadowColor: c.textPrimary,
            },
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

      <ChatInput
        onSend={handleSend}
        onTyping={sendTyping}
        disabled={isDisabled}
        primaryColor={primaryColor}
        errorMessage={localizedError}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginTop: 2,
  },
  searchResultTime: {
    marginTop: 2,
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
    bottom: 80,
    width: 44,
    height: 44,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
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
