import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'club'

export interface BadgeProps {
  label: string
  variant?: BadgeVariant
  style?: ViewStyle
}

export function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  const c = useClubColors()

  const { bg, fg } = (() => {
    switch (variant) {
      case 'success':
        return { bg: hexAlpha(c.success, 0.12), fg: c.success }
      case 'warning':
        return { bg: hexAlpha(c.warning, 0.12), fg: c.warning }
      case 'error':
        return { bg: hexAlpha(c.error, 0.12), fg: c.error }
      case 'info':
        return { bg: hexAlpha(c.info, 0.12), fg: c.info }
      case 'club':
        return { bg: c.clubPrimaryLight, fg: c.clubPrimary }
      case 'neutral':
      default:
        return { bg: c.border, fg: c.textSecondary }
    }
  })()

  return (
    <View style={[styles.base, { backgroundColor: bg }, style]}>
      <Text
        style={{
          color: fg,
          fontFamily: fonts.label,
          fontSize: fontSize.xs,
          letterSpacing: 0.2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

function hexAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
})
