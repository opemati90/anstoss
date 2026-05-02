/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, space } from '../../theme/tokens'

export type ReplyQuoteProps = {
  senderName: string
  contentPreview: string
  /** Tint of the leading bar — usually club primary (own message) or
   *  surfaceSunken-derived for incoming messages */
  accent: string
  /** When passed, dimmer (used inside own bubble) */
  inverse?: boolean
  onPress?: () => void
}

export function ReplyQuote({
  senderName,
  contentPreview,
  accent,
  inverse,
  onPress,
}: ReplyQuoteProps) {
  const c = useClubColors()
  const Wrapper = onPress ? Pressable : View
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        styles.wrap,
        {
          backgroundColor: inverse ? 'rgba(255,255,255,0.14)' : c.surfaceSunken,
          borderLeftColor: accent,
        },
      ]}
    >
      <Text
        variant="caption2"
        weight="semibold"
        style={[
          styles.name,
          { color: inverse ? 'rgba(255,255,255,0.92)' : accent },
        ]}
        numberOfLines={1}
      >
        {senderName}
      </Text>
      <Text
        style={[
          styles.preview,
          { color: inverse ? 'rgba(255,255,255,0.78)' : c.textSecondary },
        ]}
        numberOfLines={2}
      >
        {contentPreview}
      </Text>
    </Wrapper>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderRadius: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: fontSize['2xs'],
    letterSpacing: 0.2,
  },
  preview: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
})