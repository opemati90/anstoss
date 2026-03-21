import React, { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { fontSize, neutralColors, radius, space } from '../../theme/tokens'
import type { ChatMessage } from '../../hooks/useChat'

type Props = {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
  primaryColor?: string
}

/**
 * Format timestamp: relative if < 24h, otherwise absolute.
 */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showSender,
  primaryColor = '#2563A0',
}: Props) {
  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      <View
        style={[
          styles.bubble,
          isOwn
            ? [styles.bubbleOwn, { backgroundColor: primaryColor }]
            : styles.bubbleOther,
        ]}
      >
        {showSender && !isOwn && (
          <Text style={[styles.sender, { color: primaryColor }]}>
            {message.senderName}
          </Text>
        )}
        <Text style={[styles.content, isOwn && styles.contentOwn]}>
          {message.content}
        </Text>
        <Text style={[styles.time, isOwn && styles.timeOwn]}>
          {formatTimestamp(message.createdAt)}
        </Text>
      </View>
    </View>
  )
})

// Fixed height for getItemLayout optimization
export const MESSAGE_HEIGHT = 72

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.md,
    paddingVertical: space['2xs'],
  },
  rowOwn: {
    alignItems: 'flex-end',
  },
  rowOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
  },
  bubbleOwn: {
    borderBottomRightRadius: radius.sm,
  },
  bubbleOther: {
    backgroundColor: neutralColors.surface,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  sender: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: space['2xs'],
  },
  content: {
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    lineHeight: 22,
  },
  contentOwn: {
    color: neutralColors.textInverse,
  },
  time: {
    fontSize: fontSize['2xs'],
    color: neutralColors.textTertiary,
    marginTop: space['2xs'],
    alignSelf: 'flex-end',
  },
  timeOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
})
