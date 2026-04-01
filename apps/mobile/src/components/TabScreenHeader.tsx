import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  fontSize,
  fontWeight,
  fonts,
  neutralColors,
  radius,
  space,
  lineHeight,
} from '../theme/tokens'

type TabScreenHeaderProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  actionLabel?: string
  onActionPress?: () => void
  actionColor?: string
  actionIcon?: keyof typeof Ionicons.glyphMap
  actionAccessibilityLabel?: string
  compact?: boolean
}

export function TabScreenHeader({
  title,
  subtitle,
  eyebrow,
  actionLabel,
  onActionPress,
  actionColor = neutralColors.textPrimary,
  actionIcon,
  actionAccessibilityLabel,
  compact = false,
}: TabScreenHeaderProps) {
  const hasAction = onActionPress && (actionLabel || actionIcon)

  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {hasAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel ?? title}
          onPress={onActionPress}
          style={[
            styles.action,
            { borderColor: actionColor },
            actionLabel == null && styles.iconAction,
          ]}
        >
          {actionIcon ? (
            <Ionicons name={actionIcon} size={18} color={actionColor} />
          ) : null}
          {actionLabel ? (
            <Text style={[styles.actionLabel, { color: actionColor }]}>
              {actionLabel}
            </Text>
          ) : null}
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
  headerCompact: {
    marginBottom: space.md,
  },
  copy: {
    flex: 1,
    gap: space.xs,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    lineHeight: lineHeight.sm,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  iconAction: {
    width: 44,
    paddingHorizontal: 0,
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
  },
})
