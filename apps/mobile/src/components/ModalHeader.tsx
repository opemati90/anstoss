import { type ReactNode } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_FULL,
  SPACING_MD,
  SPACING_SM,
} from '../theme/tokens'

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
    <View
      style={[
        styles.header,
        { backgroundColor: c.background, borderBottomColor: c.borderSubtle },
      ]}
    >
      <Pressable
        style={[
          styles.closeButton,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
        ]}
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
        <Text
          variant="title3"
          color="primary"
          numberOfLines={1}
          style={styles.title}
        >
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
    gap: SPACING_SM,
    paddingHorizontal: SPACING_MD,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_SM,
    borderBottomWidth: hairline,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_FULL,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
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
