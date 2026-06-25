import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { DEFAULT_PRIMARY, SURFACE_SUNKEN } from '../../theme/colors'

export interface SoftIconProps {
  name: IconName
  /** Glyph and wash color. Defaults to the club primary. */
  color?: string
  /** Outer square size. Defaults to 32pt. */
  size?: number
}

export function SoftIcon({ name, color, size = 32 }: SoftIconProps) {
  const c = useClubColors()
  const fallbackTint =
    typeof c.primary === 'string' && c.primary.length > 0 ? c.primary : DEFAULT_PRIMARY
  const fallbackWash =
    typeof c.surfaceSunken === 'string' && c.surfaceSunken.length > 0
      ? c.surfaceSunken
      : SURFACE_SUNKEN
  const tint = typeof color === 'string' && color.length > 0 ? color : fallbackTint
  // Guard against any non-hex value reaching hexToRgba.
  const wash = tint.startsWith('#') ? hexToRgba(tint, 0.12) : fallbackWash
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
