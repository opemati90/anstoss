import { type ReactNode, useContext } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { neutralColors, space, fontSize, radius, fonts } from '../theme/tokens'

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
  const insets = useContext(SafeAreaInsetsContext) ?? {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }
  const handleClose = onClose ?? (() => router.back())

  return (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        accessibilityLabel={mode === 'back' ? 'Go back' : 'Close'}
        accessibilityRole="button"
      >
        <Ionicons
          name={mode === 'back' ? 'chevron-back' : 'close'}
          size={24}
          color={neutralColors.textPrimary}
        />
      </TouchableOpacity>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}
      {rightAction ?? <View style={styles.rightSpacer} />}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: neutralColors.background,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    textAlign: 'center',
    marginHorizontal: space.sm,
  },
  spacer: {
    flex: 1,
  },
  rightSpacer: {
    width: 44,
  },
})
