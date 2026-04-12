import React, { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { chatColors, fontSize, fonts, lineHeight, radius, space,
  hairline } from '../../theme/tokens'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ChatMessage } from '../../hooks/useChat'
import { Icon } from '../ui'

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
  primaryColor,
}: Props) {
  const c = useClubColors()
  const resolvedPrimary = primaryColor ?? c.textPrimary
  const isAnnouncement = message.isAnnouncement

  if (isAnnouncement) {
    return (
      <View style={styles.announcementRow}>
        <View style={[styles.announcementBubble, { borderLeftColor: resolvedPrimary, backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.announcementHeader}>
            <Icon name="megaphone" size="sm" color={resolvedPrimary} />
            <Text style={[styles.announcementLabel, { color: resolvedPrimary }]}>{message.senderName}</Text>
          </View>
          <Text style={[styles.announcementContent, { color: c.textPrimary }]}>{message.content}</Text>
          <Text style={[styles.time, { color: c.textTertiary }]}>{formatTimestamp(message.createdAt)}</Text>
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
            ? [styles.bubbleOwn, { backgroundColor: resolvedPrimary }]
            : [styles.bubbleOther, { borderColor: c.border }],
        ]}
      >
        {showSender && !isOwn && (
          <Text style={[styles.sender, { color: resolvedPrimary }]}>
            {message.senderName}
          </Text>
        )}
        <Text style={[styles.content, { color: isOwn ? c.textInverse : c.textPrimary }]}>
          {message.content}
        </Text>
        <Text style={[styles.time, { color: isOwn ? `${c.textInverse}B3` : c.textTertiary }]}>
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
    borderWidth: hairline,
  },
  sender: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    marginBottom: space['2xs'],
  },
  content: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
  },
  time: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.data,
    marginTop: space['2xs'],
    alignSelf: 'flex-end',
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
    borderWidth: hairline,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.xs,
  },
  announcementLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  announcementContent: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
  },
})
