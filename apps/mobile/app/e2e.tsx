import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  activateE2EScenario,
  clearE2ESession,
  isE2ESupported,
  type E2EScenarioName,
} from '../src/e2e/session'
import { clearSessionToken } from '../src/auth/sessionToken'
import { useAuth } from '../src/context/AuthContext'
import { APP_LANGUAGES, setAppLanguage, type AppLanguage } from '../src/i18n'
import { space, fontSize, fontWeight, fonts, lineHeight } from '../src/theme/tokens'
import { darkTheme, lightTheme } from '../src/theme/colors'

type E2ELaunchScenario = E2EScenarioName

const SUPPORTED_SCENARIOS: readonly E2ELaunchScenario[] = [
  'signed-out',
  'player',
  'parent',
  'coach',
  'club-admin',
  'free-agent',
  'signup-player',
  'signup-parent',
  'signup-coach',
  'signup-club-admin',
  'signup-free-agent',
]

function isSupportedScenario(value: string | undefined): value is E2ELaunchScenario {
  return SUPPORTED_SCENARIOS.includes(value as E2ELaunchScenario)
}

export default function E2EBootstrapScreen() {
  const params = useLocalSearchParams<{ scenario?: string | string[]; language?: string | string[] }>()
  const scenario = Array.isArray(params.scenario) ? params.scenario[0] : params.scenario
  const requestedLanguage = Array.isArray(params.language) ? params.language[0] : params.language
  const language: AppLanguage = APP_LANGUAGES.includes(requestedLanguage as AppLanguage)
    ? (requestedLanguage as AppLanguage)
    : 'en'
  const palette = useColorScheme() === 'dark' ? darkTheme : lightTheme
  const { refreshUser } = useAuth()

  useEffect(() => {
    if (!isE2ESupported()) {
      router.replace('/')
      return
    }

    const nextScenario = isSupportedScenario(scenario) ? scenario : 'signed-out'

    void (async () => {
      await setAppLanguage(language)

      if (nextScenario === 'signed-out') {
        await clearSessionToken().catch(() => {})
        await clearE2ESession()
        if (router.canDismiss()) router.dismissAll()
        router.replace('/(auth)/welcome')
        return
      }

      await activateE2EScenario(nextScenario)
      await refreshUser()
      // Switching persona must not leave the previous persona's modals on the
      // stack, or the new home renders as a sheet on top of them.
      if (router.canDismiss()) router.dismissAll()
      router.replace('/')
    })()
  }, [language, refreshUser, scenario])

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <ActivityIndicator size="large" color={palette.textPrimary} />
      <Text style={[styles.title, { color: palette.textPrimary }]}>Preparing E2E scenario...</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>
        Loading a deterministic app state for simulator checks.
      </Text>
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
