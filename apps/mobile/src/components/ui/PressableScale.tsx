import React, { useRef } from 'react'
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Haptics } from '../../utils/haptics'
import type { HapticTone } from '../../theme/tokens'

/**
 * Tap-feedback primitive — wraps any touchable element with a 0.97 scale
 * pulse on press-in plus an optional haptic. Use this for every custom
 * pressable element that is not already a Button (e.g. cards, list rows,
 * RSVP tiles, avatars that open sheets).
 *
 * Props mirror React Native `Pressable` so it is a drop-in replacement.
 */
export interface PressableScaleProps extends PressableProps {
  /**
   * Haptic to fire on press. Set to `null` to disable. Defaults to `tap`.
   */
  haptic?: HapticTone | null
  /**
   * Press-in scale target. Defaults to 0.97 — matches iOS native feel.
   */
  scaleTo?: number
  /**
   * Press-in animation duration in ms. Defaults to 90.
   */
  scaleDuration?: number
  /**
   * Optional style applied to the Animated wrapper (not the Pressable).
   */
  wrapperStyle?: StyleProp<ViewStyle>
}

function fireHaptic(tone: HapticTone) {
  switch (tone) {
    case 'selection':
      Haptics.select()
      return
    case 'tapLight':
      Haptics.tap()
      return
    case 'tapMedium':
      Haptics.tapMedium()
      return
    case 'tapHeavy':
      Haptics.tapHeavy()
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

export function PressableScale({
  haptic = 'tapLight',
  scaleTo = 0.97,
  scaleDuration = 90,
  wrapperStyle,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion()
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!reduceMotion) {
      Animated.timing(scale, {
        toValue: scaleTo,
        duration: scaleDuration,
        useNativeDriver: true,
      }).start()
    }
    onPressIn?.(e)
  }

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!reduceMotion) {
      Animated.timing(scale, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }).start()
    }
    onPressOut?.(e)
  }

  const handlePress = (e: GestureResponderEvent) => {
    if (disabled) return
    if (haptic) fireHaptic(haptic)
    onPress?.(e)
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, wrapperStyle]}>
      <Pressable
        accessibilityRole="button"
        {...rest}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        {children as React.ReactNode}
      </Pressable>
    </Animated.View>
  )
}
