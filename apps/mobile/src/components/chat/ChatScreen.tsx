import React, { useCallback, useRef } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useChat, type ChatMessage } from '../../hooks/useChat'
import { MessageBubble, MESSAGE_HEIGHT } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { ConnectionStatus } from './ConnectionStatus'
import { PinnedBanner } from './PinnedBanner'
import { TypingIndicator } from './TypingIndicator'
import { IllustratedEmptyState } from '../IllustratedEmptyState'
import { illustrations } from '../../illustrations'
import { fontSize, neutralColors, radius, space } from '../../theme/tokens'

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
  const flatListRef = useRef<FlatList<ChatMessage>>(null)

  const {
    messages,
    pinnedMessage,
    connectionState,
    typingUsers,
    hasMore,
    loadingHistory,
    unreadCount,
    sendMessage,
    sendTyping,
    loadMore,
    setIsAtBottom,
  } = useChat({ clubId, teamId, token, userId, apiUrl })

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content, clubId)
    },
    [sendMessage, clubId],
  )

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true })
  }, [])

  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const atBottom = contentOffset.y >= contentSize.height - layoutMeasurement.height - 50
      setIsAtBottom(atBottom)
    },
    [setIsAtBottom],
  )

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isOwn = item.senderId === userId
      // Show sender name if previous message is from a different person
      const prev = messages[index - 1]
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
    [userId, messages, primaryColor],
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ConnectionStatus state={connectionState} />
      {pinnedMessage ? (
        <PinnedBanner
          message={pinnedMessage}
          primaryColor={primaryColor}
          onPress={scrollToBottom}
        />
      ) : null}

      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <IllustratedEmptyState
            illustration={illustrations.emptyChat}
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
          onEndReached={hasMore && !loadingHistory ? loadMore : undefined}
          onEndReachedThreshold={0.3}
          onContentSizeChange={() => {
            // Auto-scroll to bottom on new messages when already at bottom
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          }}
        />
      )}

      {/* Scroll-to-bottom FAB */}
      {unreadCount > 0 && (
        <Pressable
          style={[styles.fab, primaryColor ? { backgroundColor: primaryColor } : undefined]}
          onPress={scrollToBottom}
        >
          <Ionicons name="chevron-down" size={20} color="#FFFFFF" />
          <Text style={styles.fabBadge}>{unreadCount}</Text>
        </Pressable>
      )}

      <TypingIndicator users={typingUsers} />

      <ChatInput
        onSend={handleSend}
        onTyping={sendTyping}
        disabled={isDisabled}
        primaryColor={primaryColor}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  messageList: {
    paddingVertical: space.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  fab: {
    position: 'absolute',
    right: space.md,
    bottom: 80,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: '#2563A0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#C4372C',
    color: '#FFFFFF',
    fontSize: fontSize['2xs'],
    fontWeight: '700',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
    paddingHorizontal: 4,
  },
})
