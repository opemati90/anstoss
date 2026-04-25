import { StyleSheet, View } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { radius, space } from '../theme/tokens'

export type RegisterProgressBarProps = {
  step: 1 | 2 | 3
}

export function RegisterProgressBar({ step }: RegisterProgressBarProps) {
  const c = useClubColors()
  const ratio = step / 3

  return (
    <View style={[styles.track, { backgroundColor: c.surfaceSunken }]}>
      <View
        style={[
          styles.fill,
          { width: `${ratio * 100}%`, backgroundColor: c.primary },
        ]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 3, now: step }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: radius.sm,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.sm,
  },
})

