import React from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  CARD_PADDING,
  elevation,
  RADIUS_CARD,
  RADIUS_MD,
  SPACING_SM,
  SPACING_XS,
} from '../../theme/tokens'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export interface StatCardProps {
  icon?: IconName
  label: string
  value: string | number
  trend?: string
  trendPositive?: boolean
  tint?: string
  hero?: boolean
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function StatCard({
  icon,
  label,
  value,
  trend,
  trendPositive = true,
  tint,
  hero,
  onPress,
  style,
  testID,
}: StatCardProps) {
  const c = useClubColors()
  const accent = tint ?? c.primary
  const Content = (
    <View style={[styles.container, style]}>
      {icon ? (
        <View
          style={[
            styles.iconTile,
            {
              backgroundColor: hexWithAlpha(accent, 0.12),
              borderCurve: 'continuous',
            },
          ]}
        >
          <Icon name={icon} size={hero ? 'xl' : 'lg'} color={accent} />
        </View>
      ) : null}
      <Text
        variant={hero ? 'dataLarge' : 'data'}
        color="primary"
        tabular
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text variant="caption1" color="secondary" numberOfLines={1}>
        {label}
      </Text>
      {trend ? (
        <Text
          variant="subheadline"
          color={trendPositive ? 'success' : 'error'}
        >
          {trend}
        </Text>
      ) : null}
    </View>
  )

  const wrapperStyle: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: hero ? CARD_PADDING + 4 : CARD_PADDING - 2,
    gap: SPACING_SM,
    ...elevation.card,
  }

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [wrapperStyle, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
      >
        {Content}
      </Pressable>
    )
  }

  return (
    <View style={wrapperStyle} testID={testID}>
      {Content}
    </View>
  )
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export interface StatGridProps {
  children: React.ReactNode
  columns?: 2 | 3
}

export function StatGrid({ children, columns = 3 }: StatGridProps) {
  const childArray = React.Children.toArray(children)
  const basis = columns === 2 ? '48%' : '31.5%'
  return (
    <View style={gridStyles.row}>
      {childArray.map((child, idx) => (
        <View
          key={idx}
          style={[gridStyles.cell, { flexBasis: basis }]}
        >
          {child}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING_XS,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: RADIUS_MD - 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING_XS,
  },
})

const gridStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: SPACING_SM,
  },
  cell: {
    flexGrow: 1,
    flexShrink: 1,
  },
})
