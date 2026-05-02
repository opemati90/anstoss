/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, Icon, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, fontSize, hairline, radius, space } from '../../theme/tokens'

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
  onReact: () => void
  onReply: () => void
  onCopy: () => void
  onEdit?: () => void
  onDelete?: () => void
  onPin?: () => void
  isPinned?: boolean
}

export function MessageMenu({
  visible,
  onClose,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onPin,
  isPinned,
}: MessageMenuProps) {
  const c = useClubColors()
  const insets = useSafeAreaInsets()

  const actions: Action[] = [
    {
      key: 'react',
      label: 'React',
      icon: 'face.smiling',
      onPress: () => {
        onClose()
        onReact()
      },
    },
    {
      key: 'reply',
      label: 'Reply',
      icon: 'arrowshape.turn.up.left',
      onPress: () => {
        onClose()
        onReply()
      },
    },
    {
      key: 'copy',
      label: 'Copy',
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
      label: isPinned ? 'Unpin' : 'Pin',
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
      label: 'Edit',
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
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: () => {
        onClose()
        onDelete()
      },
    })
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close menu"
      />
      <View
        pointerEvents="box-none"
        style={[
          styles.sheetWrap,
          { paddingBottom: insets.bottom + space.md },
        ]}
      >
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