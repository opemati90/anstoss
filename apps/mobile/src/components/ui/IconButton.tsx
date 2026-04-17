import React from 'react'
import { Pressable, StyleSheet, View, ViewStyle, AccessibilityProps } from 'react-native'
import { RADIUS_FULL } from '../../theme/tokens'

export interface IconButtonProps extends AccessibilityProps {
  onPress?: () => void
  children: React.ReactNode
  disabled?: boolean
  style?: ViewStyle
  testID?: string
}

export function IconButton({
  onPress,
  children,
  disabled,
  style,
  testID,
  ...a11y
}: IconButtonProps) {
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
