import React from 'react'
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  elevation,
  hairline,
  space,
  CARD_PADDING,
  RADIUS_CARD,
  SPACING_SM,
  SPACING_XL,
} from '../../theme/tokens'

type CardPadding = keyof typeof space | 'none' | 'compact' | 'card' | 'hero'

/**
 * Surface variants:
 *   - plain     → flat card with hairline border (no shadow)
 *   - grouped   → iOS-grouped-inset list wrapper (used by SectionGroup)
 *   - elevated  → shadowed card
 *   - hero      → deeper shadow + larger radius for hero blocks
 */
type CardVariant = 'plain' | 'elevated' | 'hero' | 'group'
type CardSurface = 'plain' | 'grouped' | 'elevated' | 'hero'

export interface CardProps extends ViewProps {
  elevated?: boolean
  padding?: CardPadding
  style?: StyleProp<ViewStyle>
  variant?: CardVariant
  surface?: CardSurface
  borderless?: boolean
}

export function Card({
  children,
  elevated,
  padding = 'card',
  style,
  variant,
  surface,
  borderless,
  ...rest
}: CardProps) {
  const c = useClubColors()
  const paddingValue = resolvePadding(padding)
  const resolved = resolveSurface(surface, variant, elevated)

  const isElevated = resolved === 'elevated' || resolved === 'hero'

  const surfaceStyles: ViewStyle = {
    backgroundColor: c.surface,
    borderColor: c.borderDefault,
    borderWidth: borderless || isElevated ? 0 : hairline,
    borderRadius: resolved === 'hero' ? SPACING_XL : RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: resolved === 'grouped' ? 'hidden' : undefined,
    padding: paddingValue,
    ...(resolved === 'elevated' ? elevation.card : null),
    ...(resolved === 'hero' ? elevation.hero : null),
  }

  return (
    <View {...rest} style={[styles.base, surfaceStyles, style]}>
      {children}
    </View>
  )
}

function resolveSurface(
  surface: CardSurface | undefined,
  variant: CardVariant | undefined,
  elevated: boolean | undefined,
): CardSurface {
  if (surface) return surface
  if (variant === 'hero') return 'hero'
  if (variant === 'elevated' || elevated) return 'elevated'
  if (variant === 'group') return 'grouped'
  return 'plain'
}

function resolvePadding(padding: CardPadding) {
  if (padding === 'none') return 0
  if (padding === 'compact') return CARD_PADDING - SPACING_SM / 2
  if (padding === 'card') return CARD_PADDING
  if (padding === 'hero') return CARD_PADDING + 4
  return space[padding]
}

const styles = StyleSheet.create({
  base: {},
})
