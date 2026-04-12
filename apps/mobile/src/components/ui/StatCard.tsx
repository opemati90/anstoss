import React from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { card, elevation, hairline, space } from '../../theme/tokens'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export interface StatCardProps {
  icon?: IconName
  label: string
  value: string | number
  /**
   * Optional delta (e.g. "+12%" or "-3"). Rendered with success/error color
   * based on the `trendPositive` prop.
   */
  trend?: string
  trendPositive?: boolean
  /**
   * Override the tint accent. Defaults to the club primary.
   */
  tint?: string
  /**
   * Primary hero variant uses a larger font scale for the value.
   */
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
  const accent = tint ?? c.clubPrimary
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
    borderColor: c.border,
    borderWidth: hairline,
    borderRadius: card.radius,
    borderCurve: 'continuous',
    padding: hero ? card.paddingHero : card.paddingCompact + 2,
    gap: space.sm,
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

/**
 * Quick alpha blend utility — keeps this component self-contained instead
 * of reaching into the theme helper.
 */
function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * StatGrid — helper that lays out 2-3 StatCards in an equal-width row with
 * consistent spacing. Use inside a Screen body.
 */
export interface StatGridProps {
  children: React.ReactNode
  columns?: 2 | 3
}

export function StatGrid({ children, columns = 3 }: StatGridProps) {
  const count = React.Children.count(children)
  const effectiveColumns = Math.min(count, columns)
  const childArray = React.Children.toArray(children)
  return (
    <View style={gridStyles.row}>
      {childArray.map((child, idx) => (
        <View
          key={idx}
          style={[
            gridStyles.cell,
            { flexBasis: `${100 / effectiveColumns}%` },
          ]}
        >
          {child}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
})

const gridStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: space.sm,
  },
  cell: {
    flexGrow: 1,
    flexShrink: 1,
  },
})
