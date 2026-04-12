import { type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { space, fontSize, radius, fonts,
  hairline } from '../theme/tokens'

type ModalHeaderProps = {
  title?: string
  onClose?: () => void
  mode?: 'close' | 'back'
  rightAction?: ReactNode
}

export function ModalHeader({
  title,
  onClose,
  mode = 'close',
  rightAction,
}: ModalHeaderProps) {
  const c = useClubColors()
  const handleClose = onClose ?? (() => router.back())

  return (
    <View style={[styles.header, { backgroundColor: c.background, borderBottomColor: c.border }]}>
      <Pressable
        style={[styles.closeButton, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={handleClose}
        accessibilityLabel={mode === 'back' ? 'Go back' : 'Close'}
        accessibilityRole="button"
      >
        <Icon
          name={mode === 'back' ? 'chevron.left' : 'xmark'}
          size="lg"
          color={c.textPrimary}
        />
      </Pressable>
      {title ? (
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.titleSpacer} />
      )}
      {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: hairline,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    textAlign: 'left',
  },
  titleSpacer: {
    flex: 1,
  },
  rightAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
