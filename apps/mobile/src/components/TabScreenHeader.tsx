import React from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import {
  fontSize,
  fonts,
  radius,
  space,
  lineHeight,
  hairline,
} from '../theme/tokens'

type TabScreenHeaderProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  actionLabel?: string
  onActionPress?: () => void
  actionColor?: string
  actionIcon?: string
  actionAccessibilityLabel?: string
  compact?: boolean
}

export function TabScreenHeader({
  title,
  subtitle,
  eyebrow,
  actionLabel,
  onActionPress,
  actionColor,
  actionIcon,
  actionAccessibilityLabel,
  compact = false,
}: TabScreenHeaderProps) {
  const c = useClubColors()
  const resolvedActionColor = actionColor ?? c.textPrimary
  const hasAction = onActionPress && (actionLabel || actionIcon)

  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: c.textTertiary }]}>{eyebrow}</Text> : null}
        <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: c.textSecondary }]}>{subtitle}</Text> : null}
      </View>

      {hasAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel ?? title}
          onPress={onActionPress}
          style={[
            styles.action,
            { borderColor: resolvedActionColor, backgroundColor: c.surface },
            actionLabel == null && styles.iconAction,
          ]}
        >
          {actionIcon ? (
            <Icon name={actionIcon} size="md" color={resolvedActionColor} />
          ) : null}
          {actionLabel ? (
            <Text style={[styles.actionLabel, { color: resolvedActionColor }]}>
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
    marginBottom: space.md,
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
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.xl,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: hairline,
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
    fontFamily: fonts.label,
  },
})
