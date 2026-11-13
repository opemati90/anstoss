import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { RADIUS_CARD, SCREEN_PADDING, SPACING_MD, SPACING_SM, SPACING_XS } from '../../theme/tokens'
import type { ChatMessage } from '../../hooks/useChat'
import { SoftIcon } from '../ui'
import { Text } from '../ui/Text'

type Props = {
  message: ChatMessage
  /** Legacy prop kept for call-site compatibility (the card is neutral now). */
  primaryColor?: string
  onPress?: () => void
}

/**
 * The pinned message on top of a thread: a white card with a megaphone
 * well, "Angeheftet · <sender>" and the first two lines. Tapping jumps to
 * the message in the thread.
 */
export function PinnedBanner({ message, onPress }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const eyebrow = message.senderName
    ? t('chatThread.pinned.from', { name: message.senderName, defaultValue: 'Pinned · {{name}}' })
    : t('chatThread.pinned.label', { defaultValue: 'Pinned' })

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? c.surfaceMuted : c.surface },
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${t('a11y.scrollToPinned')}, ${eyebrow}, ${message.content ?? ''}`}
        testID="chat-pinned-banner"
      >
        <SoftIcon name="megaphone" />
        <View style={styles.content}>
          <Text variant="caption1" weight="semibold" color="secondary" numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text variant="footnote" color="primary" numberOfLines={2}>
            {message.content}
          </Text>
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_SM,
    paddingBottom: SPACING_XS,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING_MD,
    padding: SPACING_MD + 2,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: SPACING_XS,
  },
})
