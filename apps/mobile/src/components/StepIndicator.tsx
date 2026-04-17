import { View, StyleSheet } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { SPACING_SM, SPACING_XS } from '../theme/tokens'

type StepIndicatorProps = {
  currentStep: number
  totalSteps: number
  color?: string
}

export function StepIndicator({
  currentStep,
  totalSteps,
  color,
}: StepIndicatorProps) {
  const c = useClubColors()
  const activeColor = color ?? c.primary

  return (
    <View style={styles.row}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isCompleted = step < currentStep
        const isCurrent = step === currentStep
        const isActive = isCompleted || isCurrent

        return (
          <View key={step} style={styles.segment}>
            {i > 0 && (
              <View
                style={[
                  styles.line,
                  { backgroundColor: isCompleted ? activeColor : c.borderDefault },
                ]}
              />
            )}
            <View
              style={[
                styles.dot,
                isActive
                  ? { backgroundColor: activeColor, borderColor: activeColor }
                  : { backgroundColor: 'transparent', borderColor: c.borderDefault },
              ]}
            />
          </View>
        )
      })}
    </View>
  )
}

const DOT_SIZE = 24
const LINE_HEIGHT = 2

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING_SM,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
  },
  line: {
    height: LINE_HEIGHT,
    width: 32,
    marginHorizontal: SPACING_XS,
  },
})
