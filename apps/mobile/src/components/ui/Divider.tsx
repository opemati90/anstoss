import React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { space,
  hairline } from '../../theme/tokens'

export interface DividerProps {
  spacing?: keyof typeof space | 'none'
  style?: ViewStyle
}

export function Divider({ spacing = 'none', style }: DividerProps) {
  const c = useClubColors()
  const margin = spacing === 'none' ? 0 : space[spacing]
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: c.border, marginVertical: margin },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  base: {
    height: hairline,
    width: '100%',
  },
})
