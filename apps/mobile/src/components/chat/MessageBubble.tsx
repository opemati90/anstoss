/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { SPACING_XXS } from '../../theme/spacing'
import React, { memo, useState } from 'react'
import { Pressable, StyleSheet, View, Image, Linking } from 'react-native'
import { Share } from 'react-native'
import {
  hairline,
  RADIUS_FULL,
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
import { ReplyQuote } from './ReplyQuote'
import { ReactionRow } from './ReactionRow'
import { ReactionTray } from './ReactionTray'
import { MessageMenu } from './MessageMenu'

type Props = {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
  primaryColor?: string
  myUserId?: string
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
  onReply?: (message: ChatMessage) => void
  onEdit?: (message: ChatMessage) => void
  onDelete?: (message: ChatMessage) => void
  onOpenPoll?: (message: ChatMessage) => void
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
  myUserId,
  onReact,
  onUnreact,
  onReply,
  onEdit,
  onDelete,
  onOpenPoll,
}: Props) {
  const c = useClubColors()
  const resolvedPrimary = primaryColor ?? c.primary
  const isAnnouncement = message.isAnnouncement
  const isDeleted = !!message.deletedAt
  const isEdited = !!message.editedAt
  const messageType = message.messageType ?? 'TEXT'

  const [menuOpen, setMenuOpen] = useState(false)
  const [trayOpen, setTrayOpen] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const translation = message.translation ?? null
  const displayContent =
    translation && !showOriginal ? translation.content : message.content
  const showTranslationFooter = !!translation && messageType === 'TEXT' && !isDeleted

  const handleReactPick = (emoji: string) => {
    if (!onReact) return
    const mine = (message.reactions ?? []).find(
      (r) => r.emoji === emoji && myUserId && r.userIds.includes(myUserId),
    )
    if (mine && onUnreact) onUnreact(message.id, emoji)
    else onReact(message.id, emoji)
  }

  const handleToggleExisting = (emoji: string, mine: boolean) => {
    if (mine && onUnreact) onUnreact(message.id, emoji)
    else if (!mine && onReact) onReact(message.id, emoji)
  }

  const handleCopy = async () => {
    if (message.content) {
      await Share.share({ message: message.content })
    }
  }

  // System messages render centered without bubbles
  if (messageType === 'SYSTEM') {
    return (
      <View style={styles.systemRow}>
        <View style={[styles.systemPill, { backgroundColor: c.surfaceSunken }]}>
          <Text variant="caption2" color="secondary">
            {message.content}
          </Text>
        </View>
      </View>
    )
  }

  if (isAnnouncement && messageType === 'TEXT') {
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
    <>
      <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
        <Pressable
          onLongPress={() => setMenuOpen(true)}
          delayLongPress={250}
          onPress={
            (messageType === 'POLL' || messageType === 'RSVP_POLL') && onOpenPoll
              ? () => onOpenPoll(message)
              : undefined
          }
          accessibilityRole="text"
          accessibilityHint="Long press for options"
          style={[
            styles.bubble,
            isOwn
              ? [styles.bubbleOwn, { backgroundColor: resolvedPrimary }]
              : [
                  styles.bubbleOther,
                  {
                    backgroundColor: c.chatBubbleOther ?? c.surfaceSunken,
                    borderColor: c.borderSubtle,
                  },
                ],
          ]}
        >
          {showSender && !isOwn && messageType !== 'LINEUP' && (
            <Text
              variant="caption1"
              weight="medium"
              style={[styles.sender, { color: resolvedPrimary }]}
            >
              {message.senderName}
            </Text>
          )}

          {message.replyTo && !isDeleted ? (
            <ReplyQuote
              senderName={message.replyTo.senderName}
              contentPreview={message.replyTo.contentPreview}
              accent={isOwn ? c.surface : resolvedPrimary}
              inverse={isOwn}
            />
          ) : null}

          {isDeleted ? (
            <Text
              variant="body"
              style={{
                color: isOwn ? 'rgba(255,255,255,0.7)' : c.textTertiary,
                fontStyle: 'italic',
              }}
            >
              Message deleted
            </Text>
          ) : messageType === 'IMAGE' && message.attachmentUrl ? (
            <Pressable
              onPress={() => Linking.openURL(message.attachmentUrl!)}
              accessibilityRole="image"
              accessibilityLabel="Open image"
            >
              <Image
                source={{ uri: message.attachmentUrl }}
                style={styles.image}
                resizeMode="cover"
              />
              {message.content ? (
                <Text
                  variant="body"
                  style={{
                    color: isOwn ? c.textInverse : c.textPrimary,
                    marginTop: 6,
                  }}
                >
                  {message.content}
                </Text>
              ) : null}
            </Pressable>
          ) : messageType === 'VOICE' ? (
            <View style={styles.voiceRow}>
              <Icon
                name="play.fill"
                size={20}
                color={isOwn ? c.textInverse : c.textPrimary}
              />
              <View
                style={[
                  styles.waveform,
                  {
                    backgroundColor: isOwn
                      ? 'rgba(255,255,255,0.32)'
                      : c.borderDefault,
                  },
                ]}
              />
              <Text
                variant="caption2"
                tabular
                style={{
                  color: isOwn ? 'rgba(255,255,255,0.85)' : c.textSecondary,
                }}
              >
                {voiceDurationLabel(message.attachmentMeta)}
              </Text>
            </View>
          ) : messageType === 'POLL' || messageType === 'RSVP_POLL' ? (
            <View>
              <Text
                variant="body"
                weight="semibold"
                style={{
                  color: isOwn ? c.textInverse : c.textPrimary,
                }}
              >
                {messageType === 'RSVP_POLL'
                  ? `📋 ${message.content}`
                  : `📊 ${message.content}`}
              </Text>
              <Text
                variant="caption2"
                style={{
                  color: isOwn ? 'rgba(255,255,255,0.78)' : c.textSecondary,
                  marginTop: 4,
                }}
              >
                Tap to vote
              </Text>
            </View>
          ) : messageType === 'LINEUP' ? (
            <View style={styles.lineupBlock}>
              <Text
                variant="caption2"
                tracking="wide"
                weight="semibold"
                style={{
                  color: isOwn ? 'rgba(255,255,255,0.85)' : resolvedPrimary,
                }}
              >
                LINEUP
                {message.attachmentMeta &&
                typeof (message.attachmentMeta as any).formation === 'string'
                  ? ` · ${(message.attachmentMeta as any).formation}`
                  : ''}
              </Text>
              <Text
                variant="body"
                weight="semibold"
                style={{
                  color: isOwn ? c.textInverse : c.textPrimary,
                  marginTop: 4,
                }}
              >
                {message.content}
              </Text>
            </View>
          ) : (
            <Text
              variant="body"
              style={{ color: isOwn ? c.textInverse : c.textPrimary }}
            >
              {displayContent}
            </Text>
          )}

          {showTranslationFooter ? (
            <Pressable
              onPress={() => setShowOriginal((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                showOriginal ? 'Show translation' : 'Show original'
              }
              hitSlop={6}
              style={{ marginTop: 4 }}
            >
              <Text
                variant="caption2"
                style={{
                  color: isOwn ? 'rgba(255,255,255,0.7)' : c.textTertiary,
                  fontStyle: 'italic',
                }}
              >
                {showOriginal
                  ? `· Original (${translation!.sourceLanguage.toUpperCase()})`
                  : `· Übersetzt aus ${translation!.sourceLanguage.toUpperCase()}`}
              </Text>
            </Pressable>
          ) : null}

          {message.reactions && message.reactions.length > 0 ? (
            <ReactionRow
              reactions={message.reactions}
              myUserId={myUserId ?? ''}
              onToggle={handleToggleExisting}
              inverse={isOwn}
            />
          ) : null}

          <View style={styles.metaRow}>
            {isEdited && !isDeleted ? (
              <Text
                variant="caption2"
                style={{
                  color: isOwn ? 'rgba(255,255,255,0.6)' : c.textTertiary,
                }}
              >
                edited ·{' '}
              </Text>
            ) : null}
            <Text
              variant="caption2"
              style={{
                color: isOwn ? 'rgba(255,255,255,0.7)' : c.textTertiary,
              }}
            >
              {formatTimestamp(message.createdAt)}
            </Text>
            {isOwn && !isDeleted ? (
              <Text
                variant="caption2"
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  marginLeft: 4,
                }}
              >
                {message.readCount && message.readCount > 0 ? '✓✓' : '✓'}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </View>

      <MessageMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onReact={() => setTrayOpen(true)}
        onReply={() => onReply?.(message)}
        onCopy={handleCopy}
        onEdit={
          isOwn && messageType === 'TEXT' && !isDeleted && onEdit
            ? () => onEdit(message)
            : undefined
        }
        onDelete={isOwn && !isDeleted && onDelete ? () => onDelete(message) : undefined}
      />

      <ReactionTray
        visible={trayOpen}
        onPick={handleReactPick}
        onClose={() => setTrayOpen(false)}
      />
    </>
  )
})

function voiceDurationLabel(meta: { durationMs?: number } | null | undefined): string {
  if (!meta) return '0:00'
  const ms = meta.durationMs
  if (!ms || !Number.isFinite(ms)) return '0:00'
  const sec = Math.round(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING_XS,
    alignSelf: 'flex-end',
  },
  time: {
    marginTop: SPACING_XS,
    alignSelf: 'flex-end',
  },
  systemRow: {
    paddingVertical: SPACING_XS,
    alignItems: 'center',
  },
  systemPill: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: 4,
    borderRadius: RADIUS_FULL,
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
  image: {
    width: 240,
    height: 180,
    borderRadius: 12,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    minWidth: 180,
  },
  waveform: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  lineupBlock: {
    minWidth: 220,
  },
})