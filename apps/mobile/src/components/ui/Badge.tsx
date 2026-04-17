import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { RADIUS_FULL, SPACING_SM, SPACING_XS } from '../../theme/tokens'
import { Text } from './Text'

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
        return { bg: c.successBg, fg: c.success }
      case 'warning':
        return { bg: c.warningBg, fg: c.warning }
      case 'error':
        return { bg: c.errorBg, fg: c.error }
      case 'info':
        return { bg: c.infoBg, fg: c.info }
      case 'club':
        return { bg: c.primary50, fg: c.primary }
      case 'neutral':
      default:
        return { bg: c.surfaceSunken, fg: c.textSecondary }
    }
  })()

  return (
    <View style={[styles.base, { backgroundColor: bg }, style]}>
      <Text variant="caption1" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING_SM + SPACING_XS,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_FULL,
  },
})
