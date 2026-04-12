import React, { useCallback, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { CHAT } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon } from '../ui'
import { fontSize, fonts, radius, space,
  hairline } from '../../theme/tokens'

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
  primaryColor,
  errorMessage,
}: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const resolvedPrimary = primaryColor || c.textPrimary
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
    <View style={[styles.wrap, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      {errorMessage ? (
        <Text style={[styles.errorLabel, { color: c.error }]}>{errorMessage}</Text>
      ) : null}
      <View style={[styles.container, { backgroundColor: c.surface }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: c.textPrimary, backgroundColor: c.background, borderColor: c.border }]}
          value={text}
          onChangeText={handleChangeText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={t('chat.inputPlaceholder')}
          multiline
          maxLength={CHAT.MAX_MESSAGE_LENGTH}
          editable={!disabled}
          returnKeyType="default"
        />
        <Pressable
          style={[
            styles.sendButton,
            canSend
              ? { backgroundColor: resolvedPrimary }
              : { backgroundColor: c.background },
          ]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Icon
            name="paperplane.fill"
            size="md"
            color={canSend ? c.textInverse : c.textTertiary}
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: hairline,
  },
  errorLabel: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxHeight: 100,
    borderWidth: hairline,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
