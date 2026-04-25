import React from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Text } from './Text'
import { SPACING_LG, SPACING_MD, SPACING_SM } from '../../theme/tokens'

export interface SectionHeaderProps {
  title: string
  actionLabel?: string
  onActionPress?: () => void
  style?: StyleProp<ViewStyle>
}

export function SectionHeader({ title, actionLabel, onActionPress, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text variant="caption1" color="secondary" tracking="wide" numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      {actionLabel ? (
        <Pressable
          onPress={onActionPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text variant="subheadline" color="tint" numberOfLines={1}>
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
    paddingHorizontal: SPACING_MD,
    paddingTop: SPACING_LG,
    paddingBottom: SPACING_SM,
  },
})
