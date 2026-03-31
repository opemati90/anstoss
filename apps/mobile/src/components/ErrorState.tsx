import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { neutralColors, semanticColors, space, fontSize, fontWeight, radius, fonts } from '../theme/tokens'

type Props = {
  message?: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
  retryLabel = 'Try again',
}: Props) {
  return (
    <View style={styles.container}>
      <Ionicons
        name="alert-circle-outline"
        size={36}
        color={semanticColors.error}
        style={styles.icon}
      />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} accessibilityRole="button" accessibilityLabel={retryLabel}>
          <Ionicons name="refresh-outline" size={16} color={neutralColors.textPrimary} />
          <Text style={styles.retryLabel}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  icon: {
    marginBottom: space.md,
  },
  message: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  retryLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
})
