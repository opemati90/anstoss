import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  activateE2EScenario,
  clearE2ESession,
  isE2ESupported,
} from '../src/e2e/session'
import { setAppLanguage } from '../src/i18n'
import { neutralColors, space, fontSize, fontWeight } from '../src/theme/tokens'

type E2ELaunchScenario =
  | 'signed-out'
  | 'player'
  | 'parent'
  | 'coach'
  | 'club-admin'
  | 'free-agent'

function isSupportedScenario(value: string | undefined): value is E2ELaunchScenario {
  return (
    value === 'signed-out' ||
    value === 'player' ||
    value === 'parent' ||
    value === 'coach' ||
    value === 'club-admin' ||
    value === 'free-agent'
  )
}

export default function E2EBootstrapScreen() {
  const params = useLocalSearchParams<{ scenario?: string | string[] }>()
  const scenario = Array.isArray(params.scenario) ? params.scenario[0] : params.scenario

  useEffect(() => {
    if (!isE2ESupported()) {
      router.replace('/')
      return
    }

    const nextScenario = isSupportedScenario(scenario) ? scenario : 'signed-out'

    void (async () => {
      await setAppLanguage('en')

      if (nextScenario === 'signed-out') {
        await clearE2ESession()
        router.replace('/(auth)/sign-in')
        return
      }

      await activateE2EScenario(nextScenario)
      router.replace('/')
    })()
  }, [scenario])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={neutralColors.textPrimary} />
      <Text style={styles.title}>Preparing E2E scenario...</Text>
      <Text style={styles.body}>Loading a deterministic app state for simulator checks.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    backgroundColor: neutralColors.background,
    gap: space.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
})
