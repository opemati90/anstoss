import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { useClubColors } from '../context/ClubThemeContext'

/**
 * The club colour the onboarding heroes sit on (welcome, language preview)
 * and the text colour on it. `heroBg` is the raw club / pitch-green colour in
 * both modes (unlike `primary`, which dark mode brightens).
 */
export function useOnboardingHero(): { bg: string; fg: string } {
  const c = useClubColors()
  return { bg: c.heroBg, fg: c.onHeroBg }
}

/**
 * The faint pitch markings behind the welcome claim: touchline, halfway line,
 * centre circle and both penalty boxes. Decorative only.
 */
export function PitchLines({ size = 560, color }: { size?: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pitch, { width: size, height: size }]}
    >
      <Svg width={size} height={size} viewBox="0 0 560 560" fill="none">
        <Rect x={1} y={1} width={558} height={558} stroke={color} strokeOpacity={0.09} strokeWidth={1.5} />
        <Path d="M0 280h560" stroke={color} strokeOpacity={0.09} strokeWidth={1.5} />
        <Circle cx={280} cy={280} r={110} stroke={color} strokeOpacity={0.09} strokeWidth={1.5} />
        <Circle cx={280} cy={280} r={3} fill={color} fillOpacity={0.3} />
        <Rect x={170} y={1} width={220} height={90} stroke={color} strokeOpacity={0.09} strokeWidth={1.5} />
        <Rect x={170} y={469} width={220} height={90} stroke={color} strokeOpacity={0.09} strokeWidth={1.5} />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  pitch: { position: 'absolute', top: -40, left: -85 },
})
