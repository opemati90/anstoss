/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, Icon, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, fontSize, hairline, radius, space } from '../../theme/tokens'

/** WhatsApp-style quick-react bar shown above the action list. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

type Action = {
  key: string
  label: string
  icon: IconName
  destructive?: boolean
  onPress: () => void
}

export type MessageMenuProps = {
  visible: boolean
  onClose: () => void
  /** Quick-react from the emoji bar. Toggles off if already reacted. */
  onReactEmoji: (emoji: string) => void
  /** Set of emojis the current user has already reacted with (for the
   * filled/active pill state in the quick-react bar). */
  myReactions?: ReadonlySet<string>
  onReply: () => void
  onCopy: () => void
  onEdit?: () => void
  onDelete?: () => void
  onPin?: () => void
  /** Apple Guideline 1.2 — present on every message NOT authored by
   * the current user. Tap surfaces a reason picker that POSTs to
   * /messages/:id/report. */
  onReport?: () => void
  /** Apple Guideline 1.2 — present on every message NOT authored by
   * the current user. Hides the user's messages from this user's
   * chat history + DM list. */
  onBlock?: () => void
  isPinned?: boolean
}

export function MessageMenu({
  visible,
  onClose,
  onReactEmoji,
  myReactions,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onPin,
  onReport,
  onBlock,
  isPinned,
}: MessageMenuProps) {
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  const actions: Action[] = [
    {
      key: 'reply',
      label: t('chat.menuReply'),
      icon: 'arrowshape.turn.up.left',
      onPress: () => {
        onClose()
        onReply()
      },
    },
    {
      key: 'copy',
      label: t('chat.menuCopy'),
      icon: 'doc.on.doc',
      onPress: () => {
        onClose()
        onCopy()
      },
    },
  ]
  if (onPin) {
    actions.push({
      key: 'pin',
      label: isPinned ? t('chat.menuUnpin') : t('chat.menuPin'),
      icon: 'pin',
      onPress: () => {
        onClose()
        onPin()
      },
    })
  }
  if (onEdit) {
    actions.push({
      key: 'edit',
      label: t('chat.menuEdit'),
      icon: 'pencil',
      onPress: () => {
        onClose()
        onEdit()
      },
    })
  }
  if (onDelete) {
    actions.push({
      key: 'delete',
      label: t('chat.menuDelete'),
      icon: 'trash',
      destructive: true,
      onPress: () => {
        onClose()
        onDelete()
      },
    })
  }
  if (onReport) {
    actions.push({
      key: 'report',
      label: t('chat.menuReport'),
      icon: 'flag',
      destructive: true,
      onPress: () => {
        onClose()
        onReport()
      },
    })
  }
  if (onBlock) {
    actions.push({
      key: 'block',
      label: t('chat.menuBlock'),
      icon: 'hand.raised',
      destructive: true,
      onPress: () => {
        onClose()
        onBlock()
      },
    })
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('chat.menuClose')}
      />
      <View
        pointerEvents="box-none"
        style={[
          styles.sheetWrap,
          { paddingBottom: insets.bottom + space.md },
        ]}
      >
        {/* WhatsApp-style quick-react emoji bar */}
        <View
          style={[
            styles.reactBar,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {QUICK_REACTIONS.map((emoji) => {
            const mine = myReactions?.has(emoji) ?? false
            return (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={t('chat.reactWith', { emoji })}
                onPress={() => {
                  onClose()
                  onReactEmoji(emoji)
                }}
                style={({ pressed }) => [
                  styles.reactBtn,
                  mine && { backgroundColor: c.primary50 },
                  pressed && { backgroundColor: c.surfaceSunken },
                ]}
                hitSlop={4}
              >
                <Text style={styles.reactEmoji}>{emoji}</Text>
              </Pressable>
            )
          })}
        </View>

        <View
          style={[
            styles.sheet,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {actions.map((action, idx) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.row,
                idx > 0 && {
                  borderTopColor: c.borderSubtle,
                  borderTopWidth: hairline,
                },
                pressed && { backgroundColor: c.surfaceSunken },
              ]}
            >
              <Icon
                name={action.icon}
                size={20}
                color={action.destructive ? c.error : c.textPrimary}
              />
              <Text
                style={[
                  styles.label,
                  { color: action.destructive ? c.error : c.textPrimary },
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,17,22,0.32)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  reactBar: {
    flexDirection: 'row',
    alignSelf: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: hairline,
    gap: space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  reactBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  reactEmoji: {
    fontSize: fontSize['2xl'],
    // Emoji glyphs render taller than the text line box; without an explicit
    // generous lineHeight (and centered vertical alignment) iOS clips the top
    // of the glyph. ~1.4x + center keeps them whole.
    lineHeight: Math.round(fontSize['2xl'] * 1.4),
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.md,
    minHeight: 52,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: fontSize.md,
  },
})
