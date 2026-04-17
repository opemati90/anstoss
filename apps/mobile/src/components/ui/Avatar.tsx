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
  size?: AvatarSize
  src?: string | null
  fallbackText?: string
  style?: ViewStyle
}

export function Avatar({ size = 'md', src, fallbackText, style }: AvatarProps) {
  const c = useClubColors()
  const dim = SIZES[size]
  const initials = (fallbackText || '?').trim().slice(0, 2).toUpperCase()

  const containerStyle: ViewStyle = {
    width: dim,
    height: dim,
    borderRadius: dim / 2,
    backgroundColor: c.primary,
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
      <Text variant={VARIANT_BY_SIZE[size]} color="inverse" weight="bold">
        {initials}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  image: { resizeMode: 'cover' },
})
