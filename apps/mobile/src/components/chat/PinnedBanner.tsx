import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space,
  hairline } from '../../theme/tokens'
import type { ChatMessage } from '../../hooks/useChat'
import { Icon } from '../ui'

type Props = {
  message: ChatMessage
  primaryColor?: string
  onPress?: () => void
}

export function PinnedBanner({ message, primaryColor, onPress }: Props) {
  const c = useClubColors()
  const accentColor = primaryColor || c.info

  return (
    <Pressable
      style={[styles.container, { backgroundColor: c.surface, borderBottomColor: c.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Scroll to pinned message"
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <Icon name="pin.fill" size="sm" color={accentColor} />
      <View style={styles.content}>
        <Text style={[styles.sender, { color: c.textPrimary }]} numberOfLines={1}>
          {message.senderName}
        </Text>
        <Text style={[styles.text, { color: c.textSecondary }]} numberOfLines={1}>
          {message.content}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
  },
  accent: {
    width: 3,
    height: '100%',
    borderRadius: radius.sm,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
    marginLeft: space.xs,
  },
  sender: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
  },
  text: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
})
