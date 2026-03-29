import React, { useCallback, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { CHAT } from '@anstoss/shared'
import { fontSize, neutralColors, radius, space } from '../../theme/tokens'

type Props = {
  onSend: (content: string) => Promise<boolean>
  onTyping: () => void
  disabled?: boolean
  primaryColor?: string
  errorMessage?: string | null
}

export function ChatInput({
  onSend,
  onTyping,
  disabled,
  primaryColor = '#2563A0',
  errorMessage,
}: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const handleSend = useCallback(() => {
    void (async () => {
      const trimmed = text.trim()
      if (!trimmed || trimmed.length > CHAT.MAX_MESSAGE_LENGTH || isSending) return

      setIsSending(true)
      try {
        const didSend = await onSend(trimmed)
        if (!didSend) return

        setText('')
        inputRef.current?.focus()
      } finally {
        setIsSending(false)
      }
    })()
  }, [text, onSend, isSending])

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value)
      if (value.trim()) onTyping()
    },
    [onTyping],
  )

  const canSend = text.trim().length > 0 && !disabled && !isSending

  return (
    <View style={styles.wrap}>
      {errorMessage ? (
        <Text style={styles.errorLabel}>{errorMessage}</Text>
      ) : null}
      <View style={styles.container}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={handleChangeText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          multiline
          maxLength={CHAT.MAX_MESSAGE_LENGTH}
          editable={!disabled}
          returnKeyType="default"
        />
        <Pressable
          style={[
            styles.sendButton,
            canSend
              ? { backgroundColor: primaryColor }
              : styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!canSend}
        >
          <Ionicons
            name="send"
            size={18}
            color={canSend ? '#FFFFFF' : neutralColors.textTertiary}
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: neutralColors.surface,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  errorLabel: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    fontSize: fontSize.xs,
    color: '#8A261E',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: neutralColors.surface,
    gap: space.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.background,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: neutralColors.background,
  },
})
