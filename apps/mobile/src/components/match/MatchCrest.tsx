import { Image, StyleSheet, View } from 'react-native'
import Svg, { Path, Text as SvgText } from 'react-native-svg'
import { useClubColors } from '../../context/ClubThemeContext'
import { useMatchTokens } from '../../theme/matchTokens'
import { fonts, RADIUS_SM } from '../../theme/tokens'

export type MatchCrestProps = {
  name: string
  badgeUrl?: string | null
  /** Rendered width; the shield keeps a 40:44 aspect. */
  size?: number
  /** Club colour for the shield (design 15 opponent); white initials on it. */
  color?: string | null
}

/**
 * Club crest on a match hero. Shows the fussball.de badge when there is one;
 * otherwise the redesign's white shield with the club's initials (the
 * design's `Wappen` placeholder) so a missing logo never leaves a hole.
 */
export function MatchCrest({ name, badgeUrl, size = 44, color }: MatchCrestProps) {
  const c = useClubColors()
  const tokens = useMatchTokens()
  const height = Math.round((size * 44) / 40)

  if (badgeUrl) {
    return (
      <Image
        source={{ uri: badgeUrl }}
        style={[styles.badge, { width: size, height }]}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={name}
      />
    )
  }

  const initials = crestInitials(name)
  return (
    <View accessibilityRole="image" accessibilityLabel={name}>
      <Svg width={size} height={height} viewBox="0 0 40 44">
        <Path
          d="M20 1.5 37.5 7.5v12.5c0 10.5-7.5 18.5-17.5 22.5C10 38.5 2.5 30.5 2.5 20V7.5z"
          fill={color || tokens.statusInverseBg}
        />
        <Path
          d="M20 5 34 9.8v10.2c0 8.6-6 15.2-14 18.6C12 35.2 6 28.6 6 20V9.8z"
          fill="none"
          stroke={c.accent}
          strokeOpacity={0.55}
          strokeWidth={1}
        />
        <SvgText
          x={20}
          y={25.5}
          textAnchor="middle"
          fontFamily={fonts.display}
          fontWeight="700"
          fontSize={12.5}
          fill={color ? c.onHeroBg : tokens.statusInverseText}
        >
          {initials}
        </SvgText>
      </Svg>
    </View>
  )
}

/** "SV Spreewiese 1921" → "SVS"; single words → first three letters. */
export function crestInitials(name: string): string {
  const words = name
    .replace(/[0-9]+/g, '')
    .split(/[\s-]+/)
    .filter(Boolean)
  if (words.length <= 1) return (words[0] ?? name).slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

const styles = StyleSheet.create({
  badge: { borderRadius: RADIUS_SM },
})
