import { SPACING_XXS } from '../../theme/spacing'
import React, { memo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, Image, Linking } from 'react-native'
import { Share } from 'react-native'
import {
  fonts,
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  RADIUS_MD,
  RADIUS_SM,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../theme/tokens'
import { hexToRgba } from '../../theme/club-theme'
import { TEXT_WHITE } from '../../theme/colors'

/**
 * On-primary text/fill alphas for own-message bubbles. The bubble background
 * is the club primary, so text-on-tint needs white at calibrated opacities
 * rather than ad-hoc rgba() literals scattered through the JSX.
 */
const ON_PRIMARY = TEXT_WHITE
const onPrimaryMuted = hexToRgba(TEXT_WHITE, 0.7) // secondary text on tint (timestamps, footers)
const onPrimarySubtle = hexToRgba(TEXT_WHITE, 0.32) // dividers / waveform tracks on tint
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { useAuth } from '../../context/AuthContext'
import type { ChatMessage } from '../../hooks/useChat'
import { useSignedMediaUrl } from '../../hooks/useSignedMediaUrl'
import { Icon } from '../ui'
import { Text } from '../ui/Text'
import { ReplyQuote } from './ReplyQuote'
import { ReactionRow } from './ReactionRow'
import { MessageMenu } from './MessageMenu'
import { VoiceMessagePlayer } from './VoiceMessagePlayer'

/** WhatsApp double-tap quick-react emoji. */
const QUICK_REACT_DEFAULT = '❤️'
const DOUBLE_TAP_MS = 280

type Props = {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
  /**
   * When true, force-enable the moderation delete action regardless of the
   * viewer's own role. Defaults to a self-computed coach/admin check against
   * the message's team (mirrors the API: sender OR team coach can delete).
   */
  canModerate?: boolean
  primaryColor?: string
  myUserId?: string
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
  onReply?: (message: ChatMessage) => void
  onEdit?: (message: ChatMessage) => void
  onDelete?: (message: ChatMessage) => void
  onReport?: (message: ChatMessage) => void
  onBlock?: (message: ChatMessage) => void
  onOpenPoll?: (message: ChatMessage) => void
}

function formatTimestamp(iso: string, t: TFunction, language: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return t('chat.timeNow')
  if (diffMin < 60) return t('chat.timeMinutes', { count: diffMin })

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return t('chat.timeHours', { count: diffHours })

  return date.toLocaleDateString(language, {
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
  canModerate,
  primaryColor,
  myUserId,
  onReact,
  onUnreact,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onBlock,
  onOpenPoll,
}: Props) {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const { activeClub, teamMembers } = useAuth()
  const resolvedPrimary = primaryColor ?? c.primary

  // Mirror the API delete rule (chat.service deleteMessage): the sender, a
  // team coach (HEAD_COACH / ASSISTANT_COACH TeamAccess on this message's
  // team), or a club ADMIN/OWNER may delete. Coaches/admins moderate others.
  const isClubModerator =
    activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const isTeamCoach = teamMembers.some(
    (tm) =>
      tm.team.id === message.teamId &&
      (tm.status == null || tm.status === 'ACTIVE') &&
      (tm.role === 'HEAD_COACH' || tm.role === 'ASSISTANT_COACH'),
  )
  const viewerCanModerate = canModerate ?? (isClubModerator || isTeamCoach)
  const isAnnouncement = message.isAnnouncement
  const isDeleted = !!message.deletedAt
  const isEdited = !!message.editedAt
  const messageType = message.messageType ?? 'TEXT'

  const [menuOpen, setMenuOpen] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const lastTapRef = useRef(0)
  const translation = message.translation ?? null

  // Rotate the chat-media URL via a signed-GET endpoint so the stored
  // attachmentUrl (which may be public depending on bucket policy)
  // never has to be the canonical read path. Falls back to the stored
  // URL when R2 isn't configured or the key doesn't match (e.g. a
  // legacy upload before the rotation flow shipped).
  const mediaSrc = useSignedMediaUrl(message.id, message.attachmentUrl)
  const displayContent =
    translation && !showOriginal ? translation.content : message.content
  const showTranslationFooter = !!translation && messageType === 'TEXT' && !isDeleted

  // Emojis the current user has already reacted with — drives the
  // toggle behaviour (tap an active emoji to remove it) and the
  // filled pill state in the quick-react bar.
  const myReactions = new Set(
    (message.reactions ?? [])
      .filter((r) => myUserId && r.userIds.includes(myUserId))
      .map((r) => r.emoji),
  )

  const handleReactPick = (emoji: string) => {
    if (!onReact) return
    if (myReactions.has(emoji) && onUnreact) onUnreact(message.id, emoji)
    else onReact(message.id, emoji)
  }

  const handleToggleExisting = (emoji: string, mine: boolean) => {
    if (mine && onUnreact) onUnreact(message.id, emoji)
    else if (!mine && onReact) onReact(message.id, emoji)
  }

  // WhatsApp-style: double-tap a bubble quick-reacts with a default
  // emoji (toggling). A single tap still routes to its normal handler
  // (poll open) once the double-tap window lapses.
  const handleBubblePress = () => {
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      if (!isDeleted) handleReactPick(QUICK_REACT_DEFAULT)
      return
    }
    lastTapRef.current = now
    if (
      (messageType === 'POLL' || messageType === 'RSVP_POLL') &&
      onOpenPoll
    ) {
      onOpenPoll(message)
    }
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
          <Text variant="caption2" color="tertiary" tabular style={styles.time}>
            {formatTimestamp(message.createdAt, t, i18n.language)}
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
          onPress={handleBubblePress}
          accessibilityRole="text"
          accessibilityHint={t('chat.bubbleHint')}
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
                color: isOwn ? onPrimaryMuted : c.textTertiary,
                fontStyle: 'italic',
              }}
            >
              {t('chat.messageDeleted')}
            </Text>
          ) : messageType === 'IMAGE' && mediaSrc ? (
            <Pressable
              onPress={() => Linking.openURL(mediaSrc)}
              accessibilityRole="image"
              accessibilityLabel="Open image"
            >
              <Image
                source={{ uri: mediaSrc }}
                style={styles.image}
                resizeMode="cover"
              />
              {message.content ? (
                <Text
                  variant="body"
                  style={{
                    color: isOwn ? c.textInverse : c.textPrimary,
                    marginTop: SPACING_XS,
                  }}
                >
                  {message.content}
                </Text>
              ) : null}
            </Pressable>
          ) : messageType === 'VOICE' ? (
            <VoiceMessagePlayer
              url={message.attachmentUrl ?? ''}
              durationLabel={voiceDurationLabel(message.attachmentMeta)}
              iconColor={isOwn ? c.textInverse : c.textPrimary}
              waveformColor={isOwn ? onPrimarySubtle : c.borderDefault}
              durationColor={isOwn ? onPrimaryMuted : c.textSecondary}
            />
          ) : messageType === 'POLL' || messageType === 'RSVP_POLL' ? (
            <View>
              <View style={styles.pollHeader}>
                <Icon
                  name={messageType === 'RSVP_POLL' ? 'list.bullet.clipboard' : 'chart.bar'}
                  size={15}
                  color={isOwn ? ON_PRIMARY : resolvedPrimary}
                />
                <Text
                  variant="body"
                  weight="semibold"
                  style={{ color: isOwn ? c.textInverse : c.textPrimary, flex: 1 }}
                >
                  {message.content}
                </Text>
              </View>
              <Text
                variant="caption2"
                style={{
                  color: isOwn ? onPrimaryMuted : c.textSecondary,
                  marginTop: SPACING_XXS,
                }}
              >
                {t('chat.tapToVote')}
              </Text>
            </View>
          ) : messageType === 'LINEUP' ? (
            <View style={styles.lineupBlock}>
              <View style={styles.pollHeader}>
                <Icon
                  name="figure.soccer"
                  size={13}
                  color={isOwn ? ON_PRIMARY : resolvedPrimary}
                />
                <Text
                  variant="caption2"
                  tracking="wide"
                  weight="semibold"
                  style={{ color: isOwn ? onPrimaryMuted : resolvedPrimary }}
                >
                  {t('chat.lineup')}
                {message.attachmentMeta &&
                typeof (message.attachmentMeta as any).formation === 'string'
                  ? ` · ${(message.attachmentMeta as any).formation}`
                  : ''}
                </Text>
              </View>
              <Text
                variant="body"
                weight="semibold"
                style={{
                  color: isOwn ? c.textInverse : c.textPrimary,
                  marginTop: SPACING_XXS,
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
              style={{ marginTop: SPACING_XXS }}
            >
              <Text
                variant="caption2"
                style={{
                  color: isOwn ? onPrimaryMuted : c.textTertiary,
                  fontStyle: 'italic',
                }}
              >
                {showOriginal
                  ? t('chat.showOriginal', { lang: translation!.sourceLanguage.toUpperCase() })
                  : t('chat.translatedFrom', { lang: translation!.sourceLanguage.toUpperCase() })}
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
                  color: isOwn ? onPrimaryMuted : c.textTertiary,
                }}
              >
                {t('chat.edited')}{' '}
              </Text>
            ) : null}
            <Text
              variant="caption2"
              tabular
              style={{
                fontFamily: fonts.data,
                color: isOwn ? onPrimaryMuted : c.textTertiary,
              }}
            >
              {formatTimestamp(message.createdAt, t, i18n.language)}
            </Text>
            {isOwn && !isDeleted ? (
              <View style={styles.ticks}>
                <Icon name="checkmark" size={11} color={onPrimaryMuted} />
                {message.readCount && message.readCount > 0 ? (
                  <Icon
                    name="checkmark"
                    size={11}
                    color={onPrimaryMuted}
                    style={styles.tickOverlap}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      <MessageMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onReactEmoji={handleReactPick}
        myReactions={myReactions}
        onReply={() => onReply?.(message)}
        onCopy={handleCopy}
        onEdit={
          isOwn && messageType === 'TEXT' && !isDeleted && onEdit
            ? () => onEdit(message)
            : undefined
        }
        onDelete={
          (isOwn || viewerCanModerate) && !isDeleted && onDelete
            ? () => onDelete(message)
            : undefined
        }
        onReport={!isOwn && !isDeleted && onReport ? () => onReport(message) : undefined}
        onBlock={!isOwn && !isDeleted && onBlock ? () => onBlock(message) : undefined}
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
    gap: SPACING_XXS,
    marginTop: SPACING_XS,
    alignSelf: 'flex-end',
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
  },
  ticks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING_XXS,
  },
  tickOverlap: {
    marginLeft: -6,
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
    paddingVertical: SPACING_XS,
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
    borderRadius: RADIUS_MD,
  },
  lineupBlock: {
    minWidth: 220,
  },
})