import { SPACING_XXS } from '../theme/spacing';
import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import {
  RADIUS_LG,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
} from '../theme/tokens'
import { Button } from './ui/Button'
import { Icon, type IconName } from './ui/Icon'
import { Text } from './ui/Text'

export interface EmptyStateProps {
  icon: IconName
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  tint?: string
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
  const iconColor = tint ?? c.primary
  const iconSize = compact ? 36 : 52

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
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_XL,
    gap: SPACING_SM,
  },
  containerCompact: {
    paddingVertical: SPACING_LG,
    gap: SPACING_XS,
  },
  iconTile: {
    borderRadius: RADIUS_LG,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING_SM,
  },
  title: {
    marginTop: SPACING_XS,
  },
  description: {
    maxWidth: 320,
    marginTop: SPACING_XXS,
  },
  action: {
    marginTop: SPACING_MD,
    minWidth: 180,
  },
})
