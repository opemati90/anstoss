import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  fontSize,
  fontWeight,
  neutralColors,
  radius,
  space,
} from '../theme/tokens'

type TabScreenHeaderProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  actionLabel?: string
  onActionPress?: () => void
  actionColor?: string
}

export function TabScreenHeader({
  title,
  subtitle,
  eyebrow,
  actionLabel,
  onActionPress,
  actionColor = neutralColors.textPrimary,
}: TabScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          style={[styles.action, { borderColor: actionColor }]}
        >
          <Text style={[styles.actionLabel, { color: actionColor }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.lg,
  },
  copy: {
    flex: 1,
    gap: space.xs,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    lineHeight: 20,
  },
  action: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
})
