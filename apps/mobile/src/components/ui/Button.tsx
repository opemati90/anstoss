import React, { useRef } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  AccessibilityProps,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ClubTheme } from '../../theme/club-theme'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Haptics } from '../../utils/haptics'
import {
  elevation,
  spring,
  SPACING_SM,
  BUTTON_HEIGHT_SM,
  BUTTON_HEIGHT_MD,
  BUTTON_HEIGHT_LG,
  BUTTON_PADDING_HORIZONTAL,
  RADIUS_BUTTON,
  FONT_SIZE_BODY,
  FONT_SIZE_BODY_SMALL,
  FONT_SIZE_CAPTION,
  FONT_FAMILY_BOLD,
} from '../../theme/tokens'

/**
 * Button variants (2026-11 redesign: 56pt pills, ink as the main action):
 *   filled      — solid ink, inverse label (the screen's main action)
 *   accent      — lime signal fill, ink label (the one action on a
 *                 club-coloured hero or dark surface)
 *   onHero      — transparent with a light outline, for a second action on a
 *                 club-coloured surface
 *   tinted      — 10% club tint background, tint label
 *   plain       — no background, club-tint label (tertiary CTAs)
 *   bordered    — transparent, 1pt outline, ink label (secondary CTAs)
 *   destructive — solid error red, inverse label
 *
 * Legacy aliases (kept so existing call sites keep compiling):
 *   primary   → filled
 *   secondary → bordered
 *   ghost     → plain
 */
export type ButtonVariant =
  | 'filled'
  | 'accent'
  | 'onHero'
  | 'tinted'
  | 'plain'
  | 'bordered'
  | 'destructive'
  // legacy names — do not use in new code
  | 'primary'
  | 'secondary'
  | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends AccessibilityProps {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  hapticTone?: 'selection' | 'tap' | 'tapMedium' | 'success' | 'warning' | 'error'
  style?: ViewStyle
  testID?: string
}

// Renuir-derived pill dimensions. `lg` adds ~8pt over md to retain the three-
// step spec; `md` is the canonical Renuir button height (46).
// sm is the compact inline pill (36pt visual, hit area padded to 44);
// lg is the full-width 56pt screen action.
const HEIGHTS: Record<ButtonSize, number> = {
  sm: BUTTON_HEIGHT_SM - 4,
  md: BUTTON_HEIGHT_MD,
  lg: BUTTON_HEIGHT_LG,
}
const H_PADDING: Record<ButtonSize, number> = {
  sm: BUTTON_PADDING_HORIZONTAL - 2,
  md: BUTTON_PADDING_HORIZONTAL + 4,
  lg: BUTTON_PADDING_HORIZONTAL + 8,
}
const FONT_SIZES: Record<ButtonSize, number> = {
  sm: FONT_SIZE_CAPTION,
  md: FONT_SIZE_BODY_SMALL,
  lg: FONT_SIZE_BODY,
}

export function Button({
  label,
  onPress,
  variant = 'filled',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  leftIcon,
  rightIcon,
  hapticTone = 'tap',
  style,
  testID,
  ...a11y
}: ButtonProps) {
  const c = useClubColors()
  const reduceMotion = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current
  const isDisabled = !!(disabled || loading)

  const effectiveVariant = normalizeVariant(variant)
  const palette = resolvePalette(effectiveVariant, c)

  // Primary-CTA motion spec (§6.3): 100ms scale pulse 0.95 → 1.0 + haptic.
  const handlePressIn = () => {
    if (reduceMotion) return
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 100,
      useNativeDriver: true,
    }).start()
  }
  const handlePressOut = () => {
    if (reduceMotion) return
    // Spring release for a physical settle, consistent with PressableScale.
    Animated.spring(scale, {
      toValue: 1,
      ...spring.press,
      useNativeDriver: true,
    }).start()
  }
  const handlePress = () => {
    if (isDisabled) return
    fireHaptic(hapticTone)
    onPress?.()
  }

  // A filled button at 50% opacity over the warm off-white background renders
  // as a solid mid-grey slab — it reads "broken", not "not yet". A disabled
  // action should recede into the surface instead: sunken fill, tertiary
  // label, no border. `loading` is excluded: a button mid-request keeps its
  // filled identity so the spinner stays legible and the CTA doesn't flinch.
  const isWaitingOnInput = !!disabled && !loading
  const mutedFill =
    effectiveVariant === 'filled' ||
    effectiveVariant === 'accent' ||
    effectiveVariant === 'destructive'

  // minHeight, not height: at large Dynamic Type / Android font scale the
  // label wraps to a second line and the pill grows instead of clipping.
  const containerStyle: ViewStyle = {
    minHeight: HEIGHTS[size],
    paddingVertical: size === 'sm' ? 4 : 10,
    paddingHorizontal: H_PADDING[size],
    backgroundColor:
      isWaitingOnInput && mutedFill ? c.surfaceSunken : palette.bg,
    borderColor: isWaitingOnInput && !mutedFill ? c.borderSubtle : palette.border,
    borderWidth: palette.borderWidth,
    borderRadius: RADIUS_BUTTON,
    borderCurve: 'continuous',
    opacity: isWaitingOnInput && !mutedFill ? 0.6 : 1,
    alignSelf: fullWidth ? 'stretch' : 'auto',
    ...(effectiveVariant === 'filled' || effectiveVariant === 'destructive'
      ? elevation.card
      : null),
  }

  const textStyle: TextStyle = {
    color: isWaitingOnInput && mutedFill ? c.textTertiary : palette.fg,
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: FONT_SIZES[size],
    letterSpacing: 0.2,
  }

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        testID={testID}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        hitSlop={size === 'sm' ? 4 : undefined}
        style={[styles.base, containerStyle]}
        {...a11y}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <View style={styles.inner}>
            {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
            <Text
              style={[textStyle, styles.label]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.6}
            >
              {label}
            </Text>
            {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  )
}

function normalizeVariant(variant: ButtonVariant): ButtonVariant {
  if (variant === 'primary') return 'filled'
  if (variant === 'secondary') return 'bordered'
  if (variant === 'ghost') return 'plain'
  return variant
}

function fireHaptic(tone: Required<ButtonProps>['hapticTone']) {
  switch (tone) {
    case 'selection':
      Haptics.select()
      return
    case 'tap':
      Haptics.tap()
      return
    case 'tapMedium':
      Haptics.tapMedium()
      return
    case 'success':
      Haptics.success()
      return
    case 'warning':
      Haptics.warn()
      return
    case 'error':
      Haptics.fail()
      return
  }
}

interface Palette {
  bg: string
  fg: string
  border: string
  borderWidth: number
}

function resolvePalette(variant: ButtonVariant, c: ClubTheme): Palette {
  switch (variant) {
    case 'filled':
      return {
        bg: c.ink,
        fg: c.onInk,
        border: c.ink,
        borderWidth: 0,
      }
    case 'accent':
      return {
        bg: c.accent,
        fg: c.onAccent,
        border: c.accent,
        borderWidth: 0,
      }
    case 'onHero':
      return {
        bg: 'transparent',
        fg: '#FFFFFF',
        border: 'rgba(255, 255, 255, 0.32)',
        borderWidth: 1,
      }
    case 'tinted':
      return {
        bg: c.primary50,
        fg: c.primary,
        border: 'transparent',
        borderWidth: 0,
      }
    case 'plain':
      return {
        bg: 'transparent',
        fg: c.primary,
        border: 'transparent',
        borderWidth: 0,
      }
    case 'bordered':
      return {
        bg: 'transparent',
        fg: c.textPrimary,
        border: c.borderStrong,
        borderWidth: 1,
      }
    case 'destructive':
      return {
        bg: c.error,
        fg: c.textInverse,
        border: c.error,
        borderWidth: 0,
      }
    case 'primary':
      return resolvePalette('filled', c)
    case 'secondary':
      return resolvePalette('bordered', c)
    case 'ghost':
      return resolvePalette('plain', c)
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    maxWidth: '100%',
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
