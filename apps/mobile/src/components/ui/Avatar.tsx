import React from 'react'
import { Image, StyleSheet, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { Text } from './Text'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<AvatarSize, number> = { sm: 24, md: 40, lg: 64, xl: 96 }

const VARIANT_BY_SIZE: Record<AvatarSize, 'caption2' | 'caption1' | 'title3' | 'title2'> = {
  sm: 'caption2',
  md: 'caption1',
  lg: 'title3',
  xl: 'title2',
}

export interface AvatarProps {
  /** Named size or an explicit diameter in points. */
  size?: AvatarSize | number
  src?: string | null
  fallbackText?: string
  style?: ViewStyle
  /** 'neutral' renders initials on a warm grey instead of the club colour
   * (lists of people, where the accent would be spent on every row). */
  tone?: 'club' | 'neutral'
}

/**
 * One initials rule for the whole app: first letter of the first word plus
 * first letter of the last word ("Tim Weber" -> "TW", "Madonna" -> "M").
 */
export function getInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase() || '?'
}

export function Avatar({ size = 'md', src, fallbackText, style, tone = 'club' }: AvatarProps) {
  const c = useClubColors()
  const dim = typeof size === 'number' ? size : SIZES[size]
  const textVariant =
    typeof size === 'number'
      ? size >= 80
        ? 'title2'
        : size >= 56
          ? 'title3'
          : size >= 36
            ? 'callout'
            : 'caption2'
      : VARIANT_BY_SIZE[size]
  const initials = getInitials(fallbackText)

  const containerStyle: ViewStyle = {
    width: dim,
    height: dim,
    borderRadius: dim / 2,
    backgroundColor: tone === 'neutral' ? c.surfaceSunken : c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }

  if (src) {
    return (
      <View style={[containerStyle, style]}>
        <Image
          source={{ uri: src }}
          style={[styles.image, { width: dim, height: dim }]}
        />
      </View>
    )
  }

  return (
    <View style={[containerStyle, style]} accessibilityRole="image">
      <Text
        variant={textVariant}
        color={tone === 'neutral' ? 'secondary' : 'inverse'}
        weight="bold"
        allowFontScaling={false}
      >
        {initials}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  image: { resizeMode: 'cover' },
})
