import { SPACING_XL, SPACING_XS } from '../src/theme/spacing';
import { useEffect, useRef, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useDmChat, type DmMessage } from '../src/hooks/useDmChat'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { Banner, Icon, Text } from '../src/components/ui'
import { API_URL, api } from '../src/api/client'
import { getE2ESession } from '../src/e2e/session'
import { fonts, fontSize, hairline, space } from '../src/theme/tokens'

const isE2EMockMode = () => Boolean(getE2ESession())

export default function DmChatScreen() {
  const params = useLocalSearchParams<{
    conversationId?: string
    userId?: string
    userName?: string
  }>()
  const { conversationId: paramConversationId, userId, userName } = params
  const { t } = useTranslation()
  const { user, token, activeClub } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const [inputText, setInputText] = useState('')
  const [resolvedConversationId, setResolvedConversationId] = useState<string | null>(
    paramConversationId ?? null,
  )
  const [resolveError, setResolveError] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If we arrived with just a userId (e.g. tapping a player from Squad), ask
  // the API to find or create the 1:1 conversation, then use that id.
  useEffect(() => {
    if (resolvedConversationId || !userId || !activeClub) return
    let cancelled = false
    void (async () => {
      try {
        const res = await api<{ id: string }>(
          `/clubs/${activeClub.club.id}/conversations`,
          { method: 'POST', body: { participantId: userId } },
        )
        if (!cancelled && res?.id) setResolvedConversationId(res.id)
      } catch (err) {
        if (__DEV__) console.warn('[dm-chat] resolve conversation failed:', err)
        if (!cancelled) setResolveError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeClub, resolvedConversationId, userId])

  const conversationId = resolvedConversationId ?? ''

  const {
    messages,
    connectionState,
    lastError,
    typingUsers,
    hasMore,
    sendMessage,
    sendTyping,
    markAsRead,
    loadMore,
    reconnect,
  } = useDmChat({
    conversationId: conversationId || '',
    token,
    userId: user?.id || '',
    apiUrl: API_URL,
  })

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    await sendMessage(text)
  }

  const handleTextChange = (text: string) => {
    setInputText(text)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    sendTyping()
    typingTimerRef.current = setTimeout(() => {}, 3000)
  }

  const renderMessage = ({ item }: { item: DmMessage }) => {
    const isMine = item.senderId === user?.id
    const time = new Date(item.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    return (
      <View style={[styles.messageBubbleRow, isMine && styles.messageBubbleRowMine]}>
        <View
          style={[
            styles.messageBubble,
            isMine
              ? [styles.messageBubbleMine, { backgroundColor: c.primary }]
              : [styles.messageBubbleOther, { backgroundColor: c.surface, borderColor: c.borderDefault }],
          ]}
        >
          <Text variant="body" color={isMine ? 'inverse' : 'primary'}>
            {item.content}
          </Text>
          <Text
            variant="caption2"
            color={isMine ? 'inverseMuted' : 'tertiary'}
            tabular
            style={styles.messageTime}
          >
            {time}
          </Text>
        </View>
      </View>
    )
  }

  if (resolveError) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title={t('dm.title')} mode="back" />
        <ErrorState
          message={t('dm.resolveError', { defaultValue: 'Could not open conversation.' })}
          onRetry={() => {
            setResolveError(false)
            setResolvedConversationId(null)
          }}
          fillContainer
        />
      </View>
    )
  }

  if (!conversationId || !user || !token) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ModalHeader title={t('dm.title')} mode="back" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 56}
    >
      <ModalHeader title={userName || t('dm.title')} mode="back" />

      {connectionState === 'reconnecting' ? (
        <Banner tone="warning" title={t('dm.reconnecting')} style={styles.bannerInline} />
      ) : null}

      {connectionState === 'offline' && !isE2EMockMode() ? (
        <Banner
          tone="error"
          title={t('chat.offline')}
          action={{ label: t('common.retry'), onPress: reconnect }}
          style={styles.bannerInline}
        />
      ) : null}

      {lastError === 'send_error' && connectionState === 'connected' ? (
        <Banner tone="error" title={t('chat.sendError')} style={styles.bannerInline} />
      ) : null}

      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => markAsRead()}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        inverted
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text variant="subheadline" color="tertiary" align="center">
              {t('dm.chatEmpty')}
            </Text>
          </View>
        }
      />

      {typingUsers.length > 0 ? (
        <View style={styles.typingIndicator}>
          <Text variant="footnote" color="tertiary">
            {typingUsers.join(', ')} {t('dm.isTyping')}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.inputBar,
          {
            borderTopColor: c.borderDefault,
            backgroundColor: c.surface,
            paddingBottom: space.sm + insets.bottom,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              borderColor: c.borderDefault,
              color: c.textPrimary,
              backgroundColor: c.background,
            },
          ]}
          value={inputText}
          onChangeText={handleTextChange}
          placeholder={t('dm.inputPlaceholder')}
          placeholderTextColor={c.textTertiary}
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />
        <Pressable
          style={[
            styles.sendButton,
            {
              backgroundColor: inputText.trim() ? c.primary : c.borderDefault,
            },
          ]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('dm.send')}
        >
          <Icon name="arrow.up" size="md" color="inverse" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bannerInline: {
    marginHorizontal: space.md,
    marginTop: space.xs,
  },
  messageList: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  messageBubbleRow: { flexDirection: 'row', marginBottom: space.md },
  messageBubbleRowMine: { justifyContent: 'flex-end' },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
  messageBubbleMine: { borderBottomRightRadius: 6 },
  messageBubbleOther: {
    borderWidth: hairline,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderBottomLeftRadius: 6,
  },
  messageTime: {
    marginTop: space['2xs'],
    alignSelf: 'flex-end',
  },
  typingIndicator: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    borderTopWidth: hairline,
    gap: space.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: SPACING_XL,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  sendButton: {
    width: 36,
    height: 36,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING_XS,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
    transform: [{ scaleY: -1 }],
  },
})
