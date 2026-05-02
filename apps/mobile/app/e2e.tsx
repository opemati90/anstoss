import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native'
import { useAuth as useClerkAuth } from '@clerk/clerk-expo'
import { router, useLocalSearchParams } from 'expo-router'
import {
  activateE2EScenario,
  clearE2ESession,
  isE2ESupported,
} from '../src/e2e/session'
import { setAppLanguage } from '../src/i18n'
import { space, fontSize, fontWeight, fonts, lineHeight } from '../src/theme/tokens'
import { darkTheme, lightTheme } from '../src/theme/colors'

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
  const { signOut: clerkSignOut } = useClerkAuth()
  const palette = useColorScheme() === 'dark' ? darkTheme : lightTheme

  useEffect(() => {
    if (!isE2ESupported()) {
      router.replace('/')
      return
    }

    const nextScenario = isSupportedScenario(scenario) ? scenario : 'signed-out'

    void (async () => {
      await setAppLanguage('en')

      if (nextScenario === 'signed-out') {
        await clerkSignOut().catch(() => {})
        await clearE2ESession()
        router.replace('/(auth)/welcome')
        return
      }

      await activateE2EScenario(nextScenario)
      router.replace('/')
    })()
  }, [clerkSignOut, scenario])

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ActivityIndicator size="large" color={palette.textPrimary} />
      <Text style={[styles.title, { color: palette.textPrimary }]}>Preparing E2E scenario...</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>Loading a deterministic app state for simulator checks.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: lineHeight.sm,
  },
})
