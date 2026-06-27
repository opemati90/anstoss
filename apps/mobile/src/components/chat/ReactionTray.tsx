/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, radius, space } from '../../theme/tokens'

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export type ReactionTrayProps = {
  visible: boolean
  onPick: (emoji: string) => void
  onClose: () => void
}

export function ReactionTray({ visible, onPick, onClose }: ReactionTrayProps) {
  const c = useClubColors()
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close reactions" />
      <View style={styles.center} pointerEvents="box-none">
        <View
          style={[
            styles.tray,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {REACTIONS.map((emoji) => (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              accessibilityLabel={`React ${emoji}`}
              onPress={() => {
                onPick(emoji)
                onClose()
              }}
              style={({ pressed }) => [
                styles.btn,
                pressed && { backgroundColor: c.surfaceSunken },
              ]}
              hitSlop={6}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,17,22,0.32)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  tray: {
    flexDirection: 'row',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    gap: space.xs,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  btn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  emoji: {
    fontSize: fontSize['2xl'],
  },
})
