import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { fontSize, fonts, fontWeight, neutralColors, radius, semanticColors, space } from '../../theme/tokens'
import type { ChatMessage } from '../../hooks/useChat'

type Props = {
  message: ChatMessage
  primaryColor?: string
  onPress?: () => void
}

export function PinnedBanner({ message, primaryColor = semanticColors.info, onPress }: Props) {
  return (
    <Pressable style={styles.container} onPress={onPress} accessibilityRole="button" accessibilityLabel="Scroll to pinned message">
      <View style={[styles.accent, { backgroundColor: primaryColor }]} />
      <Ionicons name="pin" size={14} color={primaryColor} />
      <View style={styles.content}>
        <Text style={styles.sender} numberOfLines={1}>
          {message.senderName}
        </Text>
        <Text style={styles.text} numberOfLines={1}>
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
    backgroundColor: neutralColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
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
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  text: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
})
