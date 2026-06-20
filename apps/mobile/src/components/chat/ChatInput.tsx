/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import React, { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'
import { CHAT } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import { VoiceRecorderButton, type VoiceRecorderResult } from './VoiceRecorderButton'
import {
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  SPACING_MD,
  SPACING_SM,
} from '../../theme/tokens'

export type ChatAttachment =
  | {
      kind: 'voice'
      uri: string
      durationMs: number
      contentType: string
    }
  | {
      kind: 'image'
      uri: string
      contentType: string
      width?: number
      height?: number
    }

type Props = {
  onSend: (content: string) => Promise<boolean>
  onSendAttachment?: (attachment: ChatAttachment) => Promise<boolean>
  onTyping: () => void
  disabled?: boolean
  primaryColor?: string
  errorMessage?: string | null
}

export function ChatInput({
  onSend,
  onSendAttachment,
  onTyping,
  disabled,
  primaryColor,
  errorMessage,
}: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const resolvedPrimary = primaryColor || c.primary
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

  const handleVoiceRecorded = useCallback(
    async (rec: VoiceRecorderResult) => {
      if (!onSendAttachment) return
      await onSendAttachment({
        kind: 'voice',
        uri: rec.uri,
        durationMs: rec.durationMs,
        contentType: rec.contentType,
      })
    },
    [onSendAttachment],
  )

  const handlePickImage = useCallback(async () => {
    if (!onSendAttachment) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    await onSendAttachment({
      kind: 'image',
      uri: asset.uri,
      contentType: asset.mimeType ?? 'image/jpeg',
      width: asset.width,
      height: asset.height,
    })
  }, [onSendAttachment])

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: c.surface, borderTopColor: c.borderSubtle },
      ]}
    >
      {errorMessage ? (
        <Text variant="caption1" style={[styles.errorLabel, { color: c.error }]}>
          {errorMessage}
        </Text>
      ) : null}
      <View style={[styles.container, { backgroundColor: c.surface }]}>
        {onSendAttachment ? (
          <Pressable
            onPress={() => void handlePickImage()}
            accessibilityRole="button"
            accessibilityLabel="Attach photo"
            disabled={disabled}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: pressed ? c.surfaceSunken : 'transparent',
              },
            ]}
            hitSlop={4}
          >
            <Icon name="photo" size="md" color={c.textSecondary} />
          </Pressable>
        ) : null}

        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color: c.textPrimary,
              backgroundColor: c.surfaceSunken,
              borderColor: c.borderDefault,
            },
          ]}
          value={text}
          onChangeText={handleChangeText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={t('chat.inputPlaceholder')}
          multiline
          textAlignVertical="top"
          maxLength={CHAT.MAX_MESSAGE_LENGTH}
          editable={!disabled}
          returnKeyType="default"
        />
        {canSend ? (
          <Pressable
            style={[
              styles.sendButton,
              { backgroundColor: resolvedPrimary },
            ]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Icon name="paperplane.fill" size="md" color={c.textInverse} />
          </Pressable>
        ) : onSendAttachment ? (
          <VoiceRecorderButton
            onRecorded={handleVoiceRecorded}
            disabled={disabled}
            size={44}
          />
        ) : (
          <Pressable
            style={[styles.sendButton, { backgroundColor: c.surfaceSunken }]}
            disabled
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Icon name="paperplane.fill" size="md" color={c.textTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: hairline,
  },
  errorLabel: {
    paddingHorizontal: SPACING_MD,
    paddingTop: SPACING_SM,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    gap: SPACING_SM,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE_BODY,
    fontFamily: FONT_FAMILY_REGULAR,
    borderRadius: RADIUS_LG,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    maxHeight: 120,
    borderWidth: hairline,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})