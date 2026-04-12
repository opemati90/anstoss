import React from 'react'
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { card, elevation, hairline, space } from '../../theme/tokens'

type CardPadding = keyof typeof space | 'none' | 'compact' | 'card' | 'hero'
/**
 * `variant` is the legacy prop name. Prefer `surface` on new code:
 *   - plain     → flat card with hairline border (no shadow)
 *   - grouped   → iOS-grouped-inset list wrapper (used by SectionGroup)
 *   - elevated  → double-shadow card (Apple Fitness stat cards)
 *   - hero      → hero stat/event block with deeper shadow + larger radius
 */
type CardVariant = 'plain' | 'elevated' | 'hero' | 'group'
type CardSurface = 'plain' | 'grouped' | 'elevated' | 'hero'

export interface CardProps extends ViewProps {
  elevated?: boolean
  padding?: CardPadding
  style?: StyleProp<ViewStyle>
  variant?: CardVariant
  surface?: CardSurface
  /**
   * When true, the card renders with no internal border. Useful when the
   * card is already inside another grouped container.
   */
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

  const surfaceStyles: ViewStyle = {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: borderless || resolved === 'elevated' || resolved === 'hero' ? 0 : hairline,
    borderRadius: resolved === 'hero' ? card.heroRadius : card.radius,
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
  if (padding === 'compact') return card.paddingCompact
  if (padding === 'card') return card.padding
  if (padding === 'hero') return card.paddingHero
  return space[padding]
}

const styles = StyleSheet.create({
  base: {},
})
