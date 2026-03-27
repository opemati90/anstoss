import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { neutralColors, space, fontSize, fontWeight } from '../theme/tokens'

type ModalHeaderProps = {
  title?: string
  onClose?: () => void
}

export function ModalHeader({ title, onClose }: ModalHeaderProps) {
  const handleClose = onClose ?? (() => router.back())

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleClose}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={24} color={neutralColors.textPrimary} />
      </TouchableOpacity>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}
      <View style={styles.rightSpacer} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: neutralColors.background,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    textAlign: 'center',
    marginHorizontal: space.sm,
  },
  spacer: {
    flex: 1,
  },
  rightSpacer: {
    width: 36,
  },
})
