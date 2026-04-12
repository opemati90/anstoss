import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { space } from '../theme/tokens'
import { Button } from './ui/Button'
import { Icon, type IconName } from './ui/Icon'
import { Text } from './ui/Text'

/**
 * Apple-HIG illustrated empty state. Renders a large (72pt) tinted
 * icon, a title, description copy, and an optional primary CTA.
 *
 * Backward-compatible with the original `icon` prop (accepts any icon
 * name — maps through the shared Icon component so both SF-Symbol-style
 * names and raw Ionicon glyph names still work during the revamp).
 */
export interface EmptyStateProps {
  icon: IconName
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  /**
   * Override the tint of the icon. Defaults to the club primary.
   */
  tint?: string
  /**
   * Compact variant — smaller icon, tighter vertical rhythm. Use when
   * the empty state is nested inside a card or section instead of a
   * full screen body.
   */
  compact?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  tint,
  compact,
  style,
  testID,
}: EmptyStateProps) {
  const c = useClubColors()
  const iconColor = tint ?? c.clubPrimary
  const iconSize = compact ? 48 : 72

  return (
    <View
      style={[styles.container, compact && styles.containerCompact, style]}
      testID={testID}
    >
      <View
        style={[
          styles.iconTile,
          {
            width: iconSize + 16,
            height: iconSize + 16,
            backgroundColor: hexWithAlpha(iconColor, 0.1),
          },
        ]}
      >
        <Icon name={icon} size={iconSize} color={iconColor} />
      </View>
      <Text
        variant={compact ? 'title3' : 'title2'}
        color="primary"
        align="center"
        style={styles.title}
      >
        {title}
      </Text>
      <Text
        variant="subheadline"
        color="secondary"
        align="center"
        style={styles.description}
      >
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="filled"
          size={compact ? 'sm' : 'md'}
          style={styles.action}
        />
      ) : null}
    </View>
  )
}

function hexWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba') || color.startsWith('rgb')) return color
  if (!color.startsWith('#')) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
    gap: space.sm,
  },
  containerCompact: {
    paddingVertical: space.lg,
    gap: space.xs,
  },
  iconTile: {
    borderRadius: 24,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: {
    marginTop: space.xs,
  },
  description: {
    maxWidth: 320,
    marginTop: 2,
  },
  action: {
    marginTop: space.md,
    minWidth: 180,
  },
})
