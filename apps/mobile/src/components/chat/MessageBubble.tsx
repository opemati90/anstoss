import { SPACING_XXS } from '../../theme/spacing';
import React, { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  hairline,
  RADIUS_LG,
  RADIUS_SM,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../theme/tokens'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ChatMessage } from '../../hooks/useChat'
import { Icon } from '../ui'
import { Text } from '../ui/Text'

type Props = {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
  primaryColor?: string
}

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
  const resolvedPrimary = primaryColor ?? c.primary
  const isAnnouncement = message.isAnnouncement

  if (isAnnouncement) {
    return (
      <View style={styles.announcementRow}>
        <View
          style={[
            styles.announcementBubble,
            {
              borderLeftColor: resolvedPrimary,
              backgroundColor: c.surface,
              borderColor: c.borderSubtle,
            },
          ]}
        >
          <View style={styles.announcementHeader}>
            <Icon name="megaphone" size="sm" color={resolvedPrimary} />
            <Text
              variant="caption1"
              weight="medium"
              style={{ color: resolvedPrimary }}
            >
              {message.senderName}
            </Text>
          </View>
          <Text variant="body" color="primary">
            {message.content}
          </Text>
          <Text variant="caption2" color="tertiary" style={styles.time}>
            {formatTimestamp(message.createdAt)}
          </Text>
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
            : [
                styles.bubbleOther,
                { backgroundColor: c.chatBubbleOther ?? c.surfaceSunken, borderColor: c.borderSubtle },
              ],
        ]}
      >
        {showSender && !isOwn && (
          <Text
            variant="caption1"
            weight="medium"
            style={[styles.sender, { color: resolvedPrimary }]}
          >
            {message.senderName}
          </Text>
        )}
        <Text
          variant="body"
          style={{ color: isOwn ? c.textInverse : c.textPrimary }}
        >
          {message.content}
        </Text>
        <Text
          variant="caption2"
          style={[
            styles.time,
            { color: isOwn ? `${c.textInverse}B3` : c.textTertiary },
          ]}
        >
          {formatTimestamp(message.createdAt)}
        </Text>
      </View>
    </View>
  )
})

export const MESSAGE_HEIGHT = 72

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_XXS,
  },
  rowOwn: {
    alignItems: 'flex-end',
  },
  rowOther: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_LG,
  },
  bubbleOwn: {
    borderBottomRightRadius: RADIUS_SM,
  },
  bubbleOther: {
    borderBottomLeftRadius: RADIUS_SM,
    borderWidth: hairline,
  },
  sender: {
    marginBottom: SPACING_XXS,
  },
  time: {
    marginTop: SPACING_XS,
    alignSelf: 'flex-end',
  },
  announcementRow: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_XS,
  },
  announcementBubble: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_LG,
    borderLeftWidth: 4,
    borderWidth: hairline,
    gap: SPACING_XS,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
  },
})
