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
  hairline,
  SPACING_SM,
  BUTTON_HEIGHT_SM,
  BUTTON_HEIGHT_MD,
  BUTTON_PADDING_HORIZONTAL,
  RADIUS_BUTTON,
  FONT_SIZE_BODY,
  FONT_SIZE_BODY_SMALL,
  FONT_FAMILY_BOLD,
} from '../../theme/tokens'

/**
 * Button variants:
 *   filled      — solid club tint, inverse label, shadowed (hero CTAs)
 *   tinted      — 10% tint background, tint label (secondary CTAs)
 *   plain       — no background, tint label (tertiary CTAs)
 *   bordered    — surface bg, hairline border, primary label (cards)
 *   destructive — solid error red, inverse label
 *
 * Legacy aliases (kept so existing call sites keep compiling):
 *   primary   → filled
 *   secondary → bordered
 *   ghost     → plain
 */
export type ButtonVariant =
  | 'filled'
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
const HEIGHTS: Record<ButtonSize, number> = {
  sm: BUTTON_HEIGHT_SM,
  md: BUTTON_HEIGHT_MD,
  lg: BUTTON_HEIGHT_MD + 8,
}
const H_PADDING: Record<ButtonSize, number> = {
  sm: BUTTON_PADDING_HORIZONTAL - 4,
  md: BUTTON_PADDING_HORIZONTAL,
  lg: BUTTON_PADDING_HORIZONTAL + 4,
}
const FONT_SIZES: Record<ButtonSize, number> = {
  sm: FONT_SIZE_BODY_SMALL,
  md: FONT_SIZE_BODY,
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

  const handlePressIn = () => {
    if (reduceMotion) return
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 80,
      useNativeDriver: true,
    }).start()
  }
  const handlePressOut = () => {
    if (reduceMotion) return
    Animated.timing(scale, {
      toValue: 1,
      duration: 140,
      useNativeDriver: true,
    }).start()
  }
  const handlePress = () => {
    if (isDisabled) return
    fireHaptic(hapticTone)
    onPress?.()
  }

  const containerStyle: ViewStyle = {
    height: HEIGHTS[size],
    paddingHorizontal: H_PADDING[size],
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderWidth: palette.borderWidth,
    borderRadius: RADIUS_BUTTON,
    borderCurve: 'continuous',
    opacity: isDisabled ? 0.5 : 1,
    alignSelf: fullWidth ? 'stretch' : 'auto',
    ...(effectiveVariant === 'filled' || effectiveVariant === 'destructive'
      ? elevation.card
      : null),
  }

  const textStyle: TextStyle = {
    color: palette.fg,
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
        style={[styles.base, containerStyle]}
        {...a11y}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <View style={styles.inner}>
            {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
            <Text style={textStyle} numberOfLines={1}>
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
        bg: c.primary,
        fg: c.textInverse,
        border: c.primary,
        borderWidth: 0,
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
        bg: c.surface,
        fg: c.textPrimary,
        border: c.borderStrong,
        borderWidth: hairline,
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
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
