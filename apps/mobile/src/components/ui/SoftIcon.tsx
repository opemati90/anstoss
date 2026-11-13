import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { DEFAULT_PRIMARY, SURFACE_MUTED } from '../../theme/colors'

export interface SoftIconProps {
  name: IconName
  /**
   * Glyph and wash colour. Omit it for the default neutral well (muted
   * surface, ink glyph) that rows use; pass a colour for a tinted well.
   */
  color?: string
  /** Outer square size. Defaults to 40pt. */
  size?: number
}

export function SoftIcon({ name, color, size = 40 }: SoftIconProps) {
  const c = useClubColors()
  const hasColor = typeof color === 'string' && color.length > 0
  const neutralWash =
    typeof c.surfaceMuted === 'string' && c.surfaceMuted.length > 0 ? c.surfaceMuted : SURFACE_MUTED
  const tint = hasColor ? color : c.textPrimary || DEFAULT_PRIMARY
  // Guard against any non-hex value reaching hexToRgba.
  const wash = hasColor && tint.startsWith('#') ? hexToRgba(tint, 0.12) : neutralWash
  return (
    <View
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: wash,
        },
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.55)} color={tint} />
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
})
