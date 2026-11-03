import React, { memo, useRef, useState } from 'react'
import { Image, Linking, Pressable, Share, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import type { ChatMessage } from '../../hooks/useChat'
import { useSignedChatMediaUrl } from '../../hooks/useSignedChatMediaUrl'
import { hexToRgba } from '../../theme/club-theme'
import { CHAT_MEDIA_SCRIM, CHAT_ON_MEDIA } from '../../theme/chat'
import { hairline, radius, space } from '../../theme/tokens'
import * as Haptics from '../../utils/haptics'
import { Avatar, Icon } from '../ui'
import { Text } from '../ui/Text'
import { ReplyQuote } from './ReplyQuote'
import { ReactionRow } from './ReactionRow'
import { MessageMenu } from './MessageMenu'
import { VoiceMessagePlayer } from './VoiceMessagePlayer'
import { EventCardMessage } from './EventCardMessage'
import { PollCardMessage } from './PollCardMessage'
import { LineupCardMessage } from './LineupCardMessage'
import { clockTime, fileSizeLabel, senderColor } from './chatGrouping'
import type { ViewerMedia } from './MediaViewer'

/** Double-tap quick reaction. */
export const QUICK_REACT_DEFAULT = '👍'
const DOUBLE_TAP_MS = 280
const SWIPE_TRIGGER = 56
const SWIPE_MAX = 72
const BUBBLE_RADIUS = 18
const JOINED_RADIUS = 4
const AVATAR_SIZE = 28

export type ReadState = 'pending' | 'sent' | 'read' | null

type Props = {
  message: ChatMessage
  isOwn: boolean
  /** Channels are group chats: names on first bubble, avatar on last. */
  isGroupChat?: boolean
  firstInGroup?: boolean
  lastInGroup?: boolean
  showSender: boolean
  showAvatar?: boolean
  readState?: ReadState
  /** Delete other people's messages (channel coaches / club admins). */
  canModerate?: boolean
  canPin?: boolean
  myUserId?: string
  /** Needed by event cards to read and write the reader's RSVP. */
  clubId?: string
  /** DM attachments sign through their conversation. */
  dmMedia?: { clubId: string; conversationId: string } | null
  highlighted?: boolean
  /** Fade/slide in (new live messages only). */
  animateIn?: boolean
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
  onReply?: (message: ChatMessage) => void
  onEdit?: (message: ChatMessage) => void
  onDelete?: (message: ChatMessage) => void
  onReport?: (message: ChatMessage) => void
  onBlock?: (message: ChatMessage) => void
  onPin?: (message: ChatMessage) => void
  onOpenMedia?: (media: ViewerMedia) => void
  onJumpTo?: (messageId: string) => void
  /** Legacy prop kept for call-site compatibility. */
  primaryColor?: string
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  isGroupChat = false,
  firstInGroup = true,
  lastInGroup = true,
  showSender,
  showAvatar = false,
  readState = null,
  canModerate = false,
  canPin = false,
  myUserId,
  clubId,
  dmMedia = null,
  highlighted = false,
  animateIn = false,
  onReact,
  onUnreact,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onBlock,
  onPin,
  onOpenMedia,
  onJumpTo,
}: Props) {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const isDark = useIsDark()
  const reduceMotion = useReducedMotion()
  const { width: windowWidth } = useWindowDimensions()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const lastTapRef = useRef(0)

  const isDeleted = !!message.deletedAt
  const isEdited = !!message.editedAt
  const messageType = message.messageType ?? 'TEXT'
  const translation = message.translation ?? null
  const displayContent = translation && !showOriginal ? translation.content : message.content
  const showTranslationFooter = !!translation && messageType === 'TEXT' && !isDeleted
  const mediaSrc = useSignedChatMediaUrl(message.id, message.attachmentUrl, dmMedia)

  const onBubble = isOwn ? c.onPrimary : c.textPrimary
  const onBubbleMuted = isOwn ? hexToRgba(c.onPrimary, 0.72) : c.textTertiary
  const bubbleBg = isOwn ? c.primary : (c.chatBubbleOther ?? c.surfaceSunken)
  const maxBubbleWidth = Math.min(420, windowWidth * (isGroupChat && !isOwn ? 0.72 : 0.8))

  const myReactions = new Set(
    (message.reactions ?? [])
      .filter((r) => myUserId && r.userIds.includes(myUserId))
      .map((r) => r.emoji),
  )
  const handleReactPick = (emoji: string) => {
    if (!onReact) return
    Haptics.select()
    if (myReactions.has(emoji) && onUnreact) onUnreact(message.id, emoji)
    else onReact(message.id, emoji)
  }
  const handleToggleExisting = (emoji: string, mine: boolean) => {
    Haptics.select()
    if (mine && onUnreact) onUnreact(message.id, emoji)
    else if (!mine && onReact) onReact(message.id, emoji)
  }
  const handleBubblePress = () => {
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      if (!isDeleted && onReact) handleReactPick(QUICK_REACT_DEFAULT)
      return
    }
    lastTapRef.current = now
  }

  // No clipboard module ships in this build (expo-clipboard would be a new
  // native dependency); the system share sheet offers "Kopieren" itself.
  const handleCopy = async () => {
    if (!displayContent) return
    await Share.share({ message: displayContent }).catch(() => undefined)
  }

  // ── Swipe right to reply ────────────────────────────────────────────
  const translateX = useSharedValue(0)
  const triggerReply = () => {
    Haptics.tap()
    onReply?.(message)
  }
  const swipe = Gesture.Pan()
    .enabled(!!onReply && !isDeleted && messageType !== 'SYSTEM')
    .activeOffsetX(12)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      translateX.value = Math.max(0, Math.min(SWIPE_MAX, e.translationX))
    })
    .onEnd(() => {
      if (translateX.value >= SWIPE_TRIGGER) runOnJS(triggerReply)()
      translateX.value = withTiming(0, { duration: 160 })
    })
  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))
  const replyHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0, 1]),
    transform: [{ scale: interpolate(translateX.value, [0, SWIPE_TRIGGER], [0.6, 1]) }],
  }))

  const entering =
    animateIn && !reduceMotion ? FadeInDown.duration(180).easing(Easing.out(Easing.quad)) : undefined

  const menu = (
    <MessageMenu
      visible={menuOpen}
      onClose={() => setMenuOpen(false)}
      onReactEmoji={onReact && !isDeleted ? handleReactPick : undefined}
      myReactions={myReactions}
      onReply={onReply && !isDeleted ? () => onReply(message) : undefined}
      onCopy={() => void handleCopy()}
      copyLabel={t('chatThread.menu.share')}
      onEdit={isOwn && messageType === 'TEXT' && !isDeleted && onEdit ? () => onEdit(message) : undefined}
      onDelete={(isOwn || canModerate) && !isDeleted && onDelete ? () => onDelete(message) : undefined}
      onPin={canPin && !isDeleted && onPin ? () => onPin(message) : undefined}
      isPinned={message.isPinned}
      onReport={!isOwn && !isDeleted && message.senderId && onReport ? () => onReport(message) : undefined}
      onBlock={!isOwn && !isDeleted && message.senderId && onBlock ? () => onBlock(message) : undefined}
    />
  )

  const openMenu = () => {
    Haptics.tap()
    setMenuOpen(true)
  }

  // ── System notices: centred pill, no gestures ───────────────────────
  if (messageType === 'SYSTEM') {
    return (
      <View style={styles.systemRow}>
        <View style={[styles.systemPill, { backgroundColor: c.surfaceSunken }]}>
          <Text variant="caption1" color="secondary" style={styles.center}>
            {message.content}
          </Text>
        </View>
      </View>
    )
  }

  const replyHint = (
    <Animated.View style={[styles.replyHint, replyHintStyle]} pointerEvents="none">
      <View style={[styles.replyHintCircle, { backgroundColor: c.surfaceSunken }]}>
        <Icon name="arrowshape.turn.up.left" size={16} color={c.textSecondary} />
      </View>
    </Animated.View>
  )

  // ── Full-width cards ─────────────────────────────────────────────────
  const card =
    isDeleted
      ? null
      : messageType === 'RSVP_POLL' && clubId
        ? (
            <EventCardMessage
              message={message}
              clubId={clubId}
              locale={i18n.language}
              primaryColor={c.primary}
              onLongPress={openMenu}
            />
          )
        : messageType === 'POLL'
          ? <PollCardMessage message={message} onLongPress={openMenu} />
          : messageType === 'LINEUP'
            ? <LineupCardMessage message={message} locale={i18n.language} onLongPress={openMenu} />
            : message.isAnnouncement && messageType === 'TEXT'
              ? (
                  <AnnouncementCard
                    message={message}
                    content={displayContent}
                    locale={i18n.language}
                    myUserId={myUserId ?? ''}
                    onLongPress={openMenu}
                    onToggleReaction={handleToggleExisting}
                  />
                )
              : null

  if (card) {
    return (
      <Animated.View entering={entering} style={[styles.cardRow, highlighted && { backgroundColor: c.primary50 }]}>
        {replyHint}
        <GestureDetector gesture={swipe}>
          <Animated.View style={swipeStyle}>{card}</Animated.View>
        </GestureDetector>
        {menu}
      </Animated.View>
    )
  }

  // ── Bubble ───────────────────────────────────────────────────────────
  const joinedTop = !firstInGroup
  const joinedBottom = !lastInGroup
  const corners = isOwn
    ? {
        borderTopRightRadius: joinedTop ? JOINED_RADIUS : BUBBLE_RADIUS,
        borderBottomRightRadius: joinedBottom ? JOINED_RADIUS : BUBBLE_RADIUS,
      }
    : {
        borderTopLeftRadius: joinedTop ? JOINED_RADIUS : BUBBLE_RADIUS,
        borderBottomLeftRadius: joinedBottom ? JOINED_RADIUS : BUBBLE_RADIUS,
      }

  const time = clockTime(message.createdAt, i18n.language)
  const ticks =
    isOwn && !isDeleted && readState ? (
      readState === 'pending' ? (
        <Icon name="time" size={12} color={onBubbleMuted} />
      ) : (
        <View style={styles.ticks}>
          <Icon name="checkmark" size={13} color={onBubbleMuted} />
          {readState === 'read' ? (
            <Icon name="checkmark" size={13} color={onBubbleMuted} style={styles.tickOverlap} />
          ) : null}
        </View>
      )
    ) : null
  const readLabel =
    isOwn && readState ? t(`chatThread.read.${readState}`) : ''
  const meta = (
    <View style={styles.meta}>
      {isEdited && !isDeleted ? (
        <Text variant="caption1" style={{ color: onBubbleMuted }}>
          {t('chatThread.edited')}
        </Text>
      ) : null}
      <Text variant="caption1" tabular style={[styles.metaTime, { color: onBubbleMuted }]}>
        {time}
      </Text>
      {ticks}
    </View>
  )
  const isMedia = !isDeleted && (messageType === 'IMAGE' || messageType === 'VIDEO')
  const meta_ = message.attachmentMeta ?? null
  const mediaWidth = Math.min(260, maxBubbleWidth - space.sm)
  const aspect =
    meta_?.width && meta_?.height && meta_.height > 0
      ? Math.max(0.6, Math.min(1.8, meta_.width / meta_.height))
      : messageType === 'VIDEO'
        ? 16 / 9
        : 4 / 3

  const senderName = message.senderName ?? t('chatHub.unknownPerson')

  const body = isDeleted ? (
    <Text variant="body" style={[styles.italic, { color: onBubbleMuted }]}>
      {t('chat.messageDeleted')}
    </Text>
  ) : messageType === 'IMAGE' ? (
    <MediaImage
      url={mediaSrc}
      width={mediaWidth}
      aspect={aspect}
      onPress={() =>
        mediaSrc &&
        onOpenMedia?.({
          kind: 'image',
          url: mediaSrc,
          caption: message.content || null,
          width: meta_?.width,
          height: meta_?.height,
        })
      }
      label={message.content || t('chatThread.media.photo')}
    />
  ) : messageType === 'VIDEO' ? (
    <Pressable
      onPress={() => mediaSrc && onOpenMedia?.({ kind: 'video', url: mediaSrc, caption: message.content || null })}
      accessibilityRole="button"
      accessibilityLabel={t('chatThread.media.playVideo')}
      style={[styles.media, { width: mediaWidth, height: mediaWidth / aspect, backgroundColor: c.surfaceSunken }]}
    >
      <View style={[styles.playBadge, { backgroundColor: hexToRgba(CHAT_MEDIA_SCRIM, 0.45) }]}>
        <Icon name="play.fill" size={24} color={CHAT_ON_MEDIA} />
      </View>
    </Pressable>
  ) : messageType === 'FILE' ? (
    <FileCard
      name={meta_?.fileName ?? t('chatThread.media.file')}
      mime={meta_?.mimeType ?? null}
      size={fileSizeLabel(meta_?.sizeBytes, i18n.language)}
      isOwn={isOwn}
      onPress={() => mediaSrc && void Linking.openURL(mediaSrc)}
    />
  ) : messageType === 'VOICE' ? (
    <VoiceMessagePlayer
      url={mediaSrc ?? ''}
      seed={message.id}
      durationMs={meta_?.durationMs ?? null}
      peaks={meta_?.waveform ?? null}
      iconColor={onBubble}
      activeColor={onBubble}
      waveformColor={isOwn ? hexToRgba(c.onPrimary, 0.35) : c.borderDefault}
      durationColor={onBubbleMuted}
    />
  ) : (
    <Text variant="body" style={{ color: onBubble }} selectable={false}>
      {displayContent}
    </Text>
  )

  const captionText =
    !isDeleted && (messageType === 'IMAGE' || messageType === 'VIDEO' || messageType === 'FILE') && message.content
      ? message.content
      : null

  const a11yLabel = [
    isGroupChat && !isOwn ? senderName : null,
    isDeleted ? t('chat.messageDeleted') : displayContent || t(`chatThread.media.a11y.${messageType}`, { defaultValue: '' }),
    time,
    readLabel,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Animated.View
      entering={entering}
      style={[
        styles.row,
        { paddingTop: firstInGroup ? space.sm : space['2xs'] },
        highlighted && { backgroundColor: c.primary50 },
      ]}
    >
      {replyHint}
      <GestureDetector gesture={swipe}>
        <Animated.View style={[styles.rowInner, isOwn ? styles.rowOwn : styles.rowOther, swipeStyle]}>
          {isGroupChat && !isOwn ? (
            <View style={styles.avatarSlot}>
              {showAvatar ? (
                <Avatar size={AVATAR_SIZE} src={message.senderAvatar ?? undefined} fallbackText={senderName} tone="neutral" />
              ) : null}
            </View>
          ) : null}
          <Pressable
            onLongPress={openMenu}
            delayLongPress={250}
            onPress={handleBubblePress}
            accessibilityRole="text"
            accessibilityLabel={a11yLabel}
            accessibilityHint={t('chat.bubbleHint')}
            accessibilityActions={[
              { name: 'longpress', label: t('chatThread.menu.open') },
              ...(onReply && !isDeleted ? [{ name: 'reply', label: t('chat.menuReply') }] : []),
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'longpress') openMenu()
              if (event.nativeEvent.actionName === 'reply') onReply?.(message)
            }}
            testID={`chat-bubble-${message.id}`}
            style={[
              styles.bubble,
              { maxWidth: maxBubbleWidth, backgroundColor: bubbleBg },
              corners,
              isMedia && styles.bubbleMedia,
            ]}
          >
            {showSender && !isOwn ? (
              <Text
                variant="caption1"
                weight="semibold"
                numberOfLines={1}
                style={[styles.sender, ...(isMedia ? [styles.mediaInset] : []), { color: senderColor(message.senderId, isDark) }]}
              >
                {senderName}
              </Text>
            ) : null}

            {message.replyTo && !isDeleted ? (
              <View style={isMedia ? styles.mediaInset : undefined}>
                <ReplyQuote
                  senderName={message.replyTo.senderName || t('chatHub.unknownPerson')}
                  contentPreview={message.replyTo.contentPreview}
                  accent={isOwn ? c.onPrimary : c.primary}
                  inverse={isOwn}
                  onPress={onJumpTo ? () => onJumpTo(message.replyTo!.id) : undefined}
                />
              </View>
            ) : null}

            {body}

            {captionText ? (
              <Text variant="body" style={[styles.caption, { color: onBubble }]}>
                {captionText}
              </Text>
            ) : null}

            {showTranslationFooter ? (
              <Pressable
                onPress={() => setShowOriginal((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showOriginal ? t('chatThread.showTranslation') : t('chatThread.showOriginal')}
                hitSlop={6}
                style={styles.translation}
              >
                <Text variant="caption1" style={[styles.italic, { color: onBubbleMuted }]}>
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

            <View
              style={[
                styles.metaDock,
                (messageType === 'IMAGE' || messageType === 'VIDEO') && !captionText && styles.metaOnMedia,
                (messageType === 'IMAGE' || messageType === 'VIDEO') &&
                  !captionText && { backgroundColor: hexToRgba(CHAT_MEDIA_SCRIM, 0.4) },
              ]}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              {(messageType === 'IMAGE' || messageType === 'VIDEO') && !captionText ? (
                <View style={styles.meta}>
                  <Text variant="caption1" tabular style={[styles.metaTime, styles.onMediaText]}>
                    {time}
                  </Text>
                  {isOwn && readState ? (
                    <Icon name={readState === 'pending' ? 'time' : 'checkmark'} size={12} color={CHAT_ON_MEDIA} />
                  ) : null}
                </View>
              ) : (
                meta
              )}
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
      {menu}
    </Animated.View>
  )
})

function MediaImage({
  url,
  width,
  aspect,
  onPress,
  label,
}: {
  url: string | null
  width: number
  aspect: number
  onPress: () => void
  label: string
}) {
  const c = useClubColors()
  const [loaded, setLoaded] = useState(false)
  const height = width / aspect
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      style={[styles.media, { width, height, backgroundColor: c.surfaceSunken }]}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoadEnd={() => setLoaded(true)}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {!loaded ? (
        <View style={styles.mediaPlaceholder} pointerEvents="none">
          <Icon name="photo.fill" size={24} color={c.textTertiary} />
        </View>
      ) : null}
    </Pressable>
  )
}

function FileCard({
  name,
  mime,
  size,
  isOwn,
  onPress,
}: {
  name: string
  mime: string | null
  size: string | null
  isOwn: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const kind = mime === 'application/pdf' || /\.pdf$/i.test(name) ? 'PDF' : t('chatThread.media.file')
  const fg = isOwn ? c.onPrimary : c.textPrimary
  const fgMuted = isOwn ? hexToRgba(c.onPrimary, 0.72) : c.textSecondary
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('chatThread.media.openFile', { name })}
      style={[
        styles.file,
        { backgroundColor: isOwn ? hexToRgba(c.onPrimary, 0.12) : c.surface, borderColor: isOwn ? 'transparent' : c.borderSubtle },
      ]}
    >
      <View style={[styles.fileIcon, { backgroundColor: isOwn ? hexToRgba(c.onPrimary, 0.16) : c.surfaceSunken }]}>
        <Icon name="doc.text.fill" size={20} color={fg} />
      </View>
      <View style={styles.fileText}>
        <Text variant="subheadline" weight="semibold" style={{ color: fg }} numberOfLines={2}>
          {name}
        </Text>
        <Text variant="caption1" tabular style={{ color: fgMuted }}>
          {[kind, size].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  )
}

function AnnouncementCard({
  message,
  content,
  locale,
  myUserId,
  onLongPress,
  onToggleReaction,
}: {
  message: ChatMessage
  content: string
  locale: string
  myUserId: string
  onLongPress: () => void
  onToggleReaction: (emoji: string, mine: boolean) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [headline, ...rest] = content.split(/\n+/)
  const body = rest.join('\n').trim()
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={250}
      accessibilityRole="summary"
      accessibilityHint={t('chat.bubbleHint')}
      style={[styles.announcement, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
    >
      <View style={styles.cardHead}>
        <Icon name="megaphone.fill" size={14} color={c.textSecondary} />
        <Text variant="caption1" weight="semibold" color="secondary" numberOfLines={1} style={styles.flex}>
          {message.senderName ?? ''}
        </Text>
        <Text variant="caption1" color="tertiary" tabular>
          {clockTime(message.createdAt, locale)}
        </Text>
      </View>
      <Text variant="headline" weight="semibold" color="primary">
        {headline.trim()}
      </Text>
      {body ? (
        <Text variant="body" color="primary">
          {body}
        </Text>
      ) : null}
      {message.reactions && message.reactions.length > 0 ? (
        <ReactionRow reactions={message.reactions} myUserId={myUserId} onToggle={onToggleReaction} />
      ) : null}
    </Pressable>
  )
}

export const MESSAGE_HEIGHT = 72

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.md },
  rowInner: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatarSlot: { width: AVATAR_SIZE, alignItems: 'center' },
  bubble: {
    paddingHorizontal: space.sm + space.xs,
    paddingTop: space.xs + space['2xs'],
    paddingBottom: space.xs + space['2xs'],
    borderRadius: BUBBLE_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  bubbleMedia: { paddingHorizontal: space.xs, paddingTop: space.xs, paddingBottom: space.xs },
  mediaInset: { paddingHorizontal: space.xs },
  sender: { marginBottom: space['2xs'] },
  caption: { paddingHorizontal: space.xs, paddingTop: space.xs },
  italic: { fontStyle: 'italic' },
  center: { textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  translation: { marginTop: space['2xs'] },
  metaDock: { alignSelf: 'flex-end', marginTop: space['2xs'] },
  metaOnMedia: {
    position: 'absolute', marginTop: 0,
    right: space.sm,
    bottom: space.sm,
    paddingHorizontal: space.xs + space['2xs'],
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  onMediaText: { color: CHAT_ON_MEDIA },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space['2xs'] + 1 },
  metaTime: { fontSize: 12, lineHeight: 16 },
  ticks: { flexDirection: 'row', alignItems: 'center' },
  tickOverlap: { marginLeft: -7 },
  media: {
    borderRadius: BUBBLE_RADIUS - space.xs,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPlaceholder: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playBadge: { width: 52, height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    minWidth: 200,
    marginBottom: space.md,
  },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1, minWidth: 0, gap: space['2xs'] },
  systemRow: { paddingVertical: space.xs, paddingHorizontal: space.lg, alignItems: 'center' },
  systemPill: {
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  cardRow: { paddingHorizontal: space.md, paddingTop: space.sm },
  replyHint: { position: 'absolute', left: space.sm, top: 0, bottom: 0, justifyContent: 'center' },
  replyHintCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcement: {
    width: '100%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.xs,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
})
