import React from 'react'
import { Pressable, StyleSheet, View, ViewStyle, AccessibilityProps } from 'react-native'
import { RADIUS_FULL } from '../../theme/tokens'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'

export interface IconButtonProps extends AccessibilityProps {
  /**
   * plain    — bare 44pt hit area (default; toolbars, inline actions)
   * outlined — 44pt white circle with a 1pt ring (screen headers: back, bell)
   * onHero   — translucent white circle for club-coloured surfaces
   */
  variant?: 'plain' | 'outlined' | 'onHero'
  onPress?: () => void
  children: React.ReactNode
  disabled?: boolean
  style?: ViewStyle
  testID?: string
  /**
   * Required. An icon-only control is invisible to screen readers without a
   * label, so the type makes it mandatory — TypeScript flags any usage that
   * forgets it. This is the enforcement point for the audit's "icon buttons
   * need accessibilityLabel" rule; migrate raw icon `Pressable`s to this.
   */
  accessibilityLabel: string
}

export function IconButton({
  variant = 'plain',
  onPress,
  children,
  disabled,
  style,
  testID,
  ...a11y
}: IconButtonProps) {
  const c = useClubColors()
  const surface: ViewStyle | null =
    variant === 'outlined'
      ? { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderDefault }
      : variant === 'onHero'
        ? { backgroundColor: hexToRgba(c.onHeroBg, 0.12) }
        : null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        surface,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
        style,
      ]}
      {...a11y}
    >
      <View style={styles.inner}>{children}</View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
