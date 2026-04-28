import { SPACING_XXS } from '../../theme/spacing';
import React from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon } from './Icon'
import { Text } from './Text'
import { SPACING_MD, SPACING_SM, SPACING_XS } from '../../theme/tokens'

export interface ListRowProps {
  title: string
  subtitle?: string
  left?: React.ReactNode
  right?: React.ReactNode
  onPress?: () => void
  showChevron?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  compact?: boolean
  titleNumberOfLines?: number
  subtitleNumberOfLines?: number
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  showChevron,
  disabled,
  style,
  testID,
  compact,
  titleNumberOfLines = 1,
  subtitleNumberOfLines = 2,
}: ListRowProps) {
  const c = useClubColors()
  const Content = (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.text}>
        <Text variant="body" color="primary" numberOfLines={titleNumberOfLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="footnote"
            color="secondary"
            numberOfLines={subtitleNumberOfLines}
            style={styles.subtitle}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
      {showChevron ? (
        <Icon name="chevron.right" size="md" color={c.textTertiary} />
      ) : null}
    </View>
  )

  if (!onPress) return Content

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      {Content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM + SPACING_XS,
    gap: SPACING_MD,
  },
  rowCompact: {
    minHeight: 52,
    paddingVertical: SPACING_SM,
  },
  left: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: SPACING_XXS },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
})
