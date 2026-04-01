import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { neutralColors, space, fontSize, fontWeight, radius, fonts, lineHeight } from '../theme/tokens'
import { useClubColors } from '../context/ClubThemeContext'

type Props = {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  const theme = useClubColors()

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={36} color={theme.clubPrimary} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.clubPrimary }]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
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
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  description: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  actionButton: {
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textInverse,
  },
})
