import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import {
  RADIUS_FULL,
  SPACING_SM,
  SPACING_XS,
  hairline,
} from '../../theme/tokens'

export type StatusPillTone = 'neutral' | 'success' | 'warning' | 'error' | 'info'

export interface StatusPillProps {
  label: string
  tone?: StatusPillTone
  icon?: IconName
  style?: ViewStyle
}

export function StatusPill({ label, tone = 'neutral', icon, style }: StatusPillProps) {
  const c = useClubColors()

  const { bg, border, fg } = (() => {
    switch (tone) {
      case 'success':
        return { bg: c.successBg, border: c.success, fg: c.success }
      case 'warning':
        return { bg: c.warningBg, border: c.warning, fg: c.warning }
      case 'error':
        return { bg: c.errorBg, border: c.error, fg: c.error }
      case 'info':
        return { bg: c.infoBg, border: c.info, fg: c.info }
      case 'neutral':
      default:
        return {
          bg: c.surfaceSunken,
          border: c.borderDefault,
          fg: c.textSecondary,
        }
    }
  })()

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: bg, borderColor: border },
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size="sm" color={fg} style={{ marginRight: SPACING_XS }} />
      ) : null}
      <Text variant="caption1" color={fg}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING_SM + SPACING_XS,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_FULL,
    borderWidth: hairline,
  },
})
