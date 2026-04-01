import { useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useDmChat, type DmMessage } from '../src/hooks/useDmChat'
import { ModalHeader } from '../src/components/ModalHeader'
import { API_URL } from '../src/api/client'
import { neutralColors, fontSize, fontWeight, space, radius, fonts, lineHeight } from '../src/theme/tokens'

export default function DmChatScreen() {
  const { conversationId, userName } = useLocalSearchParams<{
    conversationId: string
    userName?: string
  }>()
  const { t } = useTranslation()
  const { user, token } = useAuth()
  const theme = useClubColors()
  const [inputText, setInputText] = useState('')
  const flatListRef = useRef<FlatList>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
              ? [styles.messageBubbleMine, { backgroundColor: theme.clubPrimary }]
              : styles.messageBubbleOther,
          ]}
        >
          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
            {item.content}
          </Text>
          <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
            {time}
          </Text>
        </View>
      </View>
    )
  }

  if (!conversationId || !user || !token) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('dm.title')} mode="back" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ModalHeader title={userName || t('dm.title')} mode="back" />

      {connectionState === 'reconnecting' && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionText}>{t('dm.reconnecting')}</Text>
        </View>
      )}

      {connectionState === 'offline' && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{t('chat.offline')}</Text>
          <TouchableOpacity onPress={reconnect} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.offlineRetry, { color: theme.clubPrimary }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {lastError === 'send_error' && connectionState === 'connected' && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{t('chat.sendError')}</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => markAsRead()}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        inverted
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>{t('dm.chatEmpty')}</Text>
          </View>
        }
      />

      {typingUsers.length > 0 && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>
            {typingUsers.join(', ')} {t('dm.isTyping')}
          </Text>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={handleTextChange}
          placeholder={t('dm.inputPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: theme.clubPrimary }]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('dm.send')}
        >
          <Ionicons name="send" size={18} color={neutralColors.textInverse} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  connectionBanner: {
    backgroundColor: neutralColors.textTertiary,
    paddingVertical: space.xs,
    alignItems: 'center',
  },
  connectionText: { fontSize: fontSize.xs, fontFamily: fonts.body, color: neutralColors.textInverse },
  offlineBanner: {
    backgroundColor: neutralColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offlineText: { fontSize: fontSize.xs, fontFamily: fonts.body, color: neutralColors.textSecondary },
  offlineRetry: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, fontFamily: fonts.label },
  messageList: { padding: space.md, paddingBottom: space.sm },
  messageBubbleRow: { flexDirection: 'row', marginBottom: space.sm },
  messageBubbleRowMine: { justifyContent: 'flex-end' },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  messageBubbleMine: { borderBottomRightRadius: radius.sm },
  messageBubbleOther: {
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderBottomLeftRadius: radius.sm,
  },
  messageText: { fontSize: fontSize.sm, fontFamily: fonts.body, color: neutralColors.textPrimary, lineHeight: lineHeight.sm },
  messageTextMine: { color: neutralColors.textInverse },
  messageTime: { fontSize: fontSize['2xs'], fontFamily: fonts.data, color: neutralColors.textTertiary, marginTop: space['2xs'], alignSelf: 'flex-end' },
  messageTimeMine: { color: 'rgba(255,255,255,0.7)' },
  typingIndicator: { paddingHorizontal: space.md, paddingVertical: space.xs },
  typingText: { fontSize: fontSize.xs, fontFamily: fonts.body, color: neutralColors.textTertiary, fontStyle: 'italic' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    gap: space.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.background,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textTertiary,
    textAlign: 'center',
  },
})
