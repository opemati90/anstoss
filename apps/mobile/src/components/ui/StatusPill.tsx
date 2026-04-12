import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon, type IconName } from './Icon'
import { fontSize, fonts, radius, space,
  hairline } from '../../theme/tokens'

export type StatusPillTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

export interface StatusPillProps {
  label: string
  tone?: StatusPillTone
  icon?: IconName
  style?: ViewStyle
}

export function StatusPill({ label, tone = 'neutral', icon, style }: StatusPillProps) {
  const c = useClubColors()

  const color = (() => {
    switch (tone) {
      case 'success': return c.success
      case 'warning': return c.warning
      case 'error': return c.error
      case 'info': return c.info
      default: return c.textSecondary
    }
  })()

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: hexAlpha(color, 0.12), borderColor: hexAlpha(color, 0.35) },
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size="sm" color={color} style={{ marginRight: space.xs }} />
      ) : null}
      <Text
        style={{
          color,
          fontFamily: fonts.label,
          fontSize: fontSize.xs,
          letterSpacing: 0.2,
        }}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
})
