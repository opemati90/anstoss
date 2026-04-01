import React, { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { chatColors, fontSize, fonts, fontWeight, lineHeight, neutralColors, radius, space } from '../../theme/tokens'
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
  primaryColor = neutralColors.textPrimary,
}: Props) {
  const isAnnouncement = message.isAnnouncement

  if (isAnnouncement) {
    return (
      <View style={styles.announcementRow}>
        <View style={[styles.announcementBubble, { borderLeftColor: primaryColor }]}>
          <View style={styles.announcementHeader}>
            <Ionicons name="megaphone" size={14} color={primaryColor} />
            <Text style={[styles.announcementLabel, { color: primaryColor }]}>{message.senderName}</Text>
          </View>
          <Text style={styles.announcementContent}>{message.content}</Text>
          <Text style={[styles.time, { color: neutralColors.textTertiary }]}>{formatTimestamp(message.createdAt)}</Text>
        </View>
      </View>
    )
  }

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
    backgroundColor: chatColors.bubbleOther,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  sender: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    marginBottom: space['2xs'],
  },
  content: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
    lineHeight: lineHeight.md,
  },
  contentOwn: {
    color: neutralColors.textInverse,
  },
  time: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
    marginTop: space['2xs'],
    alignSelf: 'flex-end',
  },
  timeOwn: {
    color: `${neutralColors.textInverse}B3`,
  },
  announcementRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  announcementBubble: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.xs,
  },
  announcementLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  announcementContent: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
    lineHeight: lineHeight.md,
  },
})
