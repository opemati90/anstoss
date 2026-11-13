import { memo, useCallback, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import type { InboxItem } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, SCREEN_PADDING, space } from '../../theme/tokens'
import { Icon, Text, type IconName } from '../ui'
import { ConversationAvatar } from './ConversationAvatar'
import { badgeLabel, formatInboxTime, isMuted } from './inboxModel'

// Board 15 density: 44pt avatars, 64pt rows, 20pt page gutter.
export const INBOX_AVATAR_SIZE = 44
export const INBOX_ROW_MIN_HEIGHT = 64
const ACTION_WIDTH = 80

type Props = {
  item: InboxItem
  title: string
  subtitle: string | null
  preview: string
  /** Someone is typing here right now: the preview is the typing line. */
  typing?: boolean
  crestUrl?: string | null
  onPress: (item: InboxItem) => void
  onLongPress: (item: InboxItem) => void
  onToggleMute: (item: InboxItem) => void
  onMarkRead: (item: InboxItem) => void
}

/**
 * One conversation in the inbox, WhatsApp-style: who, the last line said
 * (or "schreibt …"), when, and how many unread. Swipe left for Stumm/Laut,
 * swipe right for Gelesen; VoiceOver gets the same two as row actions.
 * Press feedback is a background highlight, never a scale.
 */
export const InboxRow = memo(function InboxRow({
  item,
  title,
  subtitle,
  preview,
  typing = false,
  crestUrl,
  onPress,
  onLongPress,
  onToggleMute,
  onMarkRead,
}: Props) {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const swipeRef = useRef<SwipeableMethods>(null)
  const muted = isMuted(item)
  const unread = item.unreadCount > 0
  const time = formatInboxTime(item.lastMessage?.createdAt ?? item.activityAt, i18n.language, t)
  const readOnly = item.type === 'CHANNEL' && !item.canWrite

  const a11yParts = [
    title,
    subtitle,
    unread ? t('chatHub.a11y.unread', { count: item.unreadCount }) : null,
    muted ? t('chatHub.a11y.muted') : null,
    preview,
    time,
  ].filter(Boolean)

  const runAndClose = useCallback((run: () => void) => {
    swipeRef.current?.close()
    run()
  }, [])

  const tick = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined)
  }, [])

  const renderMuteAction = useCallback(
    () => (
      <SwipeAction
        label={muted ? t('chatInbox.swipe.unmute') : t('chatInbox.swipe.mute')}
        icon={muted ? 'bell.fill' : 'bell.slash.fill'}
        background={c.textSecondary}
        foreground={c.background}
        onPress={() => runAndClose(() => onToggleMute(item))}
        testID={`inbox-row-${item.id}-mute`}
      />
    ),
    [c.background, c.textSecondary, item, muted, onToggleMute, runAndClose, t],
  )

  const renderReadAction = useCallback(
    () => (
      <SwipeAction
        label={t('chatInbox.swipe.read')}
        icon="checkmark.circle.fill"
        background={c.primary}
        foreground={c.textInverse}
        onPress={() => runAndClose(() => onMarkRead(item))}
        testID={`inbox-row-${item.id}-read`}
      />
    ),
    [c.primary, c.textInverse, item, onMarkRead, runAndClose, t],
  )

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.6}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      // Swipe right → Gelesen (only when there is something unread; the API
      // has no "mark unread", so the action is omitted rather than faked).
      renderLeftActions={unread ? renderReadAction : undefined}
      // Swipe left → Stumm / Laut.
      renderRightActions={renderMuteAction}
      onSwipeableWillOpen={tick}
      containerStyle={{ backgroundColor: c.background }}
    >
      <Pressable
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={a11yParts.join(', ')}
        accessibilityHint={t('chatHub.a11y.rowHint')}
        accessibilityActions={[
          { name: 'mute', label: muted ? t('chatHub.actions.unmute') : t('chatHub.actions.mute') },
          ...(unread ? [{ name: 'markRead', label: t('chatHub.actions.markRead') }] : []),
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'mute') onToggleMute(item)
          if (event.nativeEvent.actionName === 'markRead') onMarkRead(item)
        }}
        testID={`inbox-row-${item.id}`}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? c.surfaceSunken : c.background },
        ]}
      >
        <ConversationAvatar
          kind={item.kind}
          clubLevel={item.type === 'CHANNEL' && !item.teamId}
          name={title}
          avatarUrl={item.avatarUrl}
          crestUrl={crestUrl}
          size={INBOX_AVATAR_SIZE}
        />
        <View style={[styles.body, { borderBottomColor: c.borderSubtle }]}>
          <View style={styles.topLine}>
            <View style={styles.titleWrap}>
              {readOnly ? <Icon name="lock.fill" size={13} color={c.textTertiary} /> : null}
              <Text
                variant="body"
                weight="semibold"
                color="primary"
                numberOfLines={1}
                style={styles.title}
              >
                {title}
              </Text>
            </View>
            <Text
              variant="caption1"
              tabular
              color={unread && !muted ? c.textPrimary : c.textTertiary}
              weight={unread && !muted ? 'semibold' : 'regular'}
              style={styles.time}
            >
              {time}
            </Text>
          </View>
          {subtitle ? (
            <Text variant="caption1" weight="regular" color="tertiary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <View style={styles.bottomLine}>
            <Text
              variant="footnote"
              color={typing ? c.primary : unread ? 'primary' : 'secondary'}
              numberOfLines={subtitle ? 1 : 2}
              style={styles.preview}
              testID={typing ? `inbox-row-${item.id}-typing` : undefined}
            >
              {preview}
            </Text>
            <View style={styles.trailing}>
              {muted ? <Icon name="bell.slash.fill" size={14} color={c.textTertiary} /> : null}
              {unread ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: muted ? c.surfaceSunken : c.accent },
                  ]}
                >
                  <Text
                    variant="caption1"
                    weight="bold"
                    tabular
                    color={muted ? c.textSecondary : c.onAccent}
                    allowFontScaling={false}
                    style={styles.badgeText}
                  >
                    {badgeLabel(item.unreadCount)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  )
})

function SwipeAction({
  label,
  icon,
  background,
  foreground,
  onPress,
  testID,
}: {
  label: string
  icon: IconName
  background: string
  foreground: string
  onPress: () => void
  testID?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.action, { backgroundColor: background }]}
      testID={testID}
    >
      <Icon name={icon} size={22} color={foreground} />
      <Text variant="caption1" weight="semibold" color={foreground} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SCREEN_PADDING,
    gap: space.sm + space.xs,
    minHeight: INBOX_ROW_MIN_HEIGHT,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.sm + space['2xs'],
    paddingRight: SCREEN_PADDING,
    gap: space['2xs'],
    borderBottomWidth: hairline,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  title: { flexShrink: 1 },
  time: { paddingTop: space['2xs'] },
  preview: { flex: 1, minWidth: 0 },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space['2xs'],
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.xs + space['2xs'],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { lineHeight: 16 },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
})
