import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Animated, { useReducedMotion, ZoomIn, ZoomOut } from 'react-native-reanimated'
import { CHAT } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import * as Haptics from '../../utils/haptics'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import { VoiceRecorderButton, type VoiceRecorderResult } from './VoiceRecorderButton'
import { FONT_FAMILY_REGULAR, FONT_SIZE_BODY, hairline, RADIUS_XL, radius, space } from '../../theme/tokens'

export { pickChatImage, type ChatAttachment } from './chatAttachments'

/** Body text line height in the composer; the field grows to six lines, then scrolls. */
const LINE_HEIGHT = 22
const MAX_LINES = 6
const FIELD_PADDING_V = 10
const MAX_FIELD_HEIGHT = LINE_HEIGHT * MAX_LINES + FIELD_PADDING_V * 2
const DRAFT_PREFIX = 'chat:draft:'

type Props = {
  onSend: (content: string) => Promise<boolean>
  /** Hold-to-record voice notes (mic replaces send while the field is empty). */
  onVoiceRecorded?: (result: VoiceRecorderResult) => Promise<unknown> | void
  /** The + menu (photo/video, file, voice, lineup, manager cards). */
  onOpenMenu?: () => void
  /** Camera shortcut inside the field. */
  onCamera?: () => void
  placeholder?: string
  onTyping: () => void
  disabled?: boolean
  errorMessage?: string | null
  /** One-line tip above the field (e.g. how to record a voice message). */
  hint?: string | null
  /** Per-conversation draft, kept across leaving and re-opening the thread. */
  draftKey?: string | null
  /** Legacy props kept for call-site compatibility. */
  primaryColor?: string
  onSendAttachment?: unknown
  onCompose?: () => void
}

/**
 * One composer: an outlined + circle on the left, a white rounded field
 * that grows to six lines with a camera shortcut, and an ink send circle
 * that springs in over the mic as soon as there is text. Drafts persist
 * per conversation.
 */
export function ChatInput({
  onSend,
  onVoiceRecorded,
  onOpenMenu,
  onCamera,
  onTyping,
  disabled,
  errorMessage,
  placeholder,
  hint,
  draftKey,
  onCompose,
}: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const reduceMotion = useReducedMotion()
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openMenu = onOpenMenu ?? onCompose

  // Restore the draft for this conversation.
  useEffect(() => {
    if (!draftKey) return
    let cancelled = false
    AsyncStorage.getItem(`${DRAFT_PREFIX}${draftKey}`)
      .then((draft) => {
        if (!cancelled && draft) setText((current) => current || draft)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [draftKey])

  const persistDraft = useCallback(
    (value: string) => {
      if (!draftKey) return
      if (draftTimer.current) clearTimeout(draftTimer.current)
      draftTimer.current = setTimeout(() => {
        const key = `${DRAFT_PREFIX}${draftKey}`
        void (value.trim() ? AsyncStorage.setItem(key, value) : AsyncStorage.removeItem(key)).catch(
          () => undefined,
        )
      }, 400)
    },
    [draftKey],
  )

  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    },
    [],
  )

  const handleSend = useCallback(() => {
    void (async () => {
      const trimmed = text.trim()
      if (!trimmed || trimmed.length > CHAT.MAX_MESSAGE_LENGTH || isSending) return

      setIsSending(true)
      try {
        const didSend = await onSend(trimmed)
        if (!didSend) return
        Haptics.tap()
        setText('')
        persistDraft('')
        inputRef.current?.focus()
      } finally {
        setIsSending(false)
      }
    })()
  }, [text, onSend, isSending, persistDraft])

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value)
      persistDraft(value)
      if (value.trim()) onTyping()
    },
    [onTyping, persistDraft],
  )

  const hasText = text.trim().length > 0
  const canSend = hasText && !disabled && !isSending
  const entering = reduceMotion ? undefined : ZoomIn.springify().damping(16).stiffness(220)
  const exiting = reduceMotion ? undefined : ZoomOut.duration(120)

  const handleVoiceRecorded = useCallback(
    async (rec: VoiceRecorderResult) => {
      if (!onVoiceRecorded) return
      await onVoiceRecorded(rec)
    },
    [onVoiceRecorded],
  )

  return (
    <View style={[styles.wrap, { backgroundColor: c.background, borderTopColor: c.borderDefault }]}>
      {errorMessage ? (
        <Text variant="caption1" style={[styles.notice, { color: c.error }]}>
          {errorMessage}
        </Text>
      ) : hint ? (
        <Text variant="footnote" color="secondary" style={styles.notice} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}
      <View style={styles.container}>
        {openMenu ? (
          <Pressable
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel={t('chatThread.attach.open')}
            disabled={disabled}
            android_ripple={{ color: c.borderSubtle, borderless: true, radius: 22 }}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: pressed ? c.surfaceMuted : c.surface, borderColor: c.borderDefault },
            ]}
            testID="chat-attach-open"
          >
            <Icon name="plus" size={20} color={disabled ? c.textTertiary : c.textPrimary} />
          </Pressable>
        ) : null}

        <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: c.textPrimary }]}
            value={text}
            onChangeText={handleChangeText}
            placeholder={placeholder ?? t('chat.inputPlaceholder')}
            placeholderTextColor={c.textTertiary}
            accessibilityLabel={placeholder ?? t('chat.inputPlaceholder')}
            testID="chat-message-input"
            multiline
            scrollEnabled
            textAlignVertical="center"
            maxLength={CHAT.MAX_MESSAGE_LENGTH}
            editable={!disabled}
            returnKeyType="default"
          />
          {onCamera && !hasText ? (
            <Pressable
              onPress={onCamera}
              accessibilityRole="button"
              accessibilityLabel={t('chatThread.attach.camera')}
              disabled={disabled}
              hitSlop={6}
              style={styles.fieldIcon}
              testID="chat-camera"
            >
              <Icon name="camera" size={22} color={c.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.actionSlot}>
          {hasText || isSending || !onVoiceRecorded ? (
            <Animated.View key="send" entering={entering} exiting={exiting}>
              <Pressable
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: canSend || isSending ? c.ink : c.surfaceSunken },
                  pressed && canSend && styles.sendPressed,
                ]}
                onPress={handleSend}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSend, busy: isSending }}
                accessibilityLabel={t('a11y.sendMessage')}
                testID="chat-send-message"
              >
                {isSending ? (
                  <ActivityIndicator color={c.onInk} />
                ) : (
                  <Icon name="arrow.right" size={20} color={canSend ? c.onInk : c.textTertiary} />
                )}
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View key="mic" entering={entering} exiting={exiting}>
              <VoiceRecorderButton onRecorded={handleVoiceRecorded} disabled={disabled} size={44} />
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: hairline },
  notice: { paddingHorizontal: space.md, paddingTop: space.sm },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    gap: space.sm,
  },
  field: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 44,
    borderRadius: RADIUS_XL,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: MAX_FIELD_HEIGHT,
    fontSize: FONT_SIZE_BODY,
    lineHeight: LINE_HEIGHT,
    fontFamily: FONT_FAMILY_REGULAR,
    includeFontPadding: false,
    paddingHorizontal: space.md,
    paddingTop: FIELD_PADDING_V,
    paddingBottom: FIELD_PADDING_V,
  },
  fieldIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPressed: { transform: [{ scale: 0.94 }] },
  iconBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
