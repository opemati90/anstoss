import React from 'react'
import { Image, Text, View, ViewStyle } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts } from '../../theme/tokens'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<AvatarSize, number> = { sm: 24, md: 40, lg: 64, xl: 96 }
const FONT_SIZES: Record<AvatarSize, number> = { sm: 10, md: 14, lg: 22, xl: 32 }

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
    backgroundColor: c.clubPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }

  if (src) {
    return (
      <View style={[containerStyle, style]}>
        <Image source={{ uri: src }} style={{ width: dim, height: dim }} />
      </View>
    )
  }

  return (
    <View style={[containerStyle, style]} accessibilityRole="image">
      <Text
        style={{
          color: c.textInverse,
          fontFamily: fonts.label,
          fontSize: FONT_SIZES[size],
        }}
      >
        {initials}
      </Text>
    </View>
  )
}
