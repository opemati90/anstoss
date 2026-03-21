import React, { useCallback, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CHAT } from '@anstoss/shared'
import { fontSize, neutralColors, radius, space } from '../../theme/tokens'

type Props = {
  onSend: (content: string) => void
  onTyping: () => void
  disabled?: boolean
  primaryColor?: string
}

export function ChatInput({ onSend, onTyping, disabled, primaryColor = '#2563A0' }: Props) {
  const [text, setText] = useState('')
  const inputRef = useRef<TextInput>(null)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > CHAT.MAX_MESSAGE_LENGTH) return

    onSend(trimmed)
    setText('')
    inputRef.current?.focus()
  }, [text, onSend])

  const handleChangeText = useCallback(
    (value: string) => {
      setText(value)
      if (value.trim()) onTyping()
    },
    [onTyping],
  )

  const canSend = text.trim().length > 0 && !disabled

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={text}
        onChangeText={handleChangeText}
        placeholder="Nachricht..."
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
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: neutralColors.surface,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
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
