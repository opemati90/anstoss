import React from 'react'
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, lineHeight, space } from '../../theme/tokens'

export interface SectionHeaderProps {
  title: string
  actionLabel?: string
  onActionPress?: () => void
  style?: StyleProp<ViewStyle>
}

export function SectionHeader({ title, actionLabel, onActionPress, style }: SectionHeaderProps) {
  const c = useClubColors()
  return (
    <View style={[styles.row, style]}>
      <Text
        style={{
          color: c.textSecondary,
          fontFamily: fonts.label,
          fontSize: fontSize.sm,
          lineHeight: lineHeight.sm,
          letterSpacing: 0.2,
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {actionLabel ? (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <Text
            style={{
              color: c.clubPrimary,
              fontFamily: fonts.label,
              fontSize: fontSize.sm,
              lineHeight: lineHeight.sm,
            }}
            numberOfLines={1}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
})
