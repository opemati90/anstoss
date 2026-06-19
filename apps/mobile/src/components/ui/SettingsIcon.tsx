/* eslint-disable no-restricted-syntax -- Defines the iOS Settings-style palette token surface for this primitive. */
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, type IconName } from './Icon'

/**
 * iOS Settings-style icon: a small rounded-square in a tint color with
 * a glyph rendered in white on top. Mirrors the leading slot of every
 * row in Settings.app — the most recognizable iOS configuration motif.
 *
 * Use as the `left` slot of a ListRow inside a SectionGroup.
 */
export interface SettingsIconProps {
  name: IconName
  tint: string
  /** Outer square size. Defaults to 30pt — matches iOS Settings rows. */
  size?: number
}

export function SettingsIcon({ name, tint, size = 30 }: SettingsIconProps) {
  return (
    <View
      style={[
        styles.square,
        {
          width: size,
          height: size,
          backgroundColor: tint,
          borderRadius: Math.round(size * 0.22),
        },
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.62)} color="#FFFFFF" />
    </View>
  )
}

/** iOS Settings palette — solid tints, used on the leading icon square. */
export const SettingsIconTint = {
  blue: '#007AFF',
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  purple: '#AF52DE',
  pink: '#FF2D55',
  yellow: '#FFCC00',
  teal: '#5AC8FA',
  indigo: '#5856D6',
  gray: '#8E8E93',
} as const

const styles = StyleSheet.create({
  square: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
