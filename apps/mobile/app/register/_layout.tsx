import { Stack, useSegments } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StyleSheet, View } from 'react-native'
import { OnboardingProvider } from '../../src/context/OnboardingContext'
import { RegisterProgressBar } from '../../src/components/RegisterProgressBar'
import { useClubColors } from '../../src/context/ClubThemeContext'

function stepForSegments(segments: string[]): 1 | 2 | 3 {
  const registerIdx = segments.lastIndexOf('register')
  const leaf = registerIdx >= 0 ? segments[registerIdx + 1] : undefined
  if (leaf === 'finalize') return 3
  if (leaf === 'club' || leaf === 'join' || leaf === 'free-agent' || leaf === 'parent') return 2
  return 1
}

export default function RegisterLayout() {
  const segments = useSegments()
  const c = useClubColors()
  const step = stepForSegments(segments)

  return (
    <OnboardingProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
        <RegisterProgressBar step={step} />
        <View style={styles.body}>
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        </View>
      </SafeAreaView>
    </OnboardingProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
})
