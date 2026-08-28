import { useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { WebView } from 'react-native-webview'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { Banner, Screen } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space } from '../src/theme/tokens'

const OFFICIAL_HOSTS = ['fussball.de', 'dfb.de', 'fupa.net']

export function parseOfficialPage(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:' ||
      Boolean(url.username) ||
      Boolean(url.password) ||
      Boolean(url.port) ||
      url.pathname === '/' ||
      !OFFICIAL_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    ) {
      return null
    }
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export default function OfficialTeamPageScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const params = useLocalSearchParams<{ url?: string; title?: string }>()
  const url = useMemo(() => parseOfficialPage(params.url), [params.url])
  const [failed, setFailed] = useState(false)

  return (
    <Screen
      header={
        <ModalHeader
          mode="back"
          title={params.title || t('fussball.officialPage', { defaultValue: 'Official team page' })}
          fallbackHref="/fussball-link"
        />
      }
      padded={false}
      edges={['left', 'right', 'bottom']}
    >
      {!url || failed ? (
        <View style={styles.state}>
          <Banner
            tone="error"
            title={t('common.loadError')}
            description={t('fussball.officialPageError', {
              defaultValue: 'This official team page could not be displayed securely.',
            })}
          />
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
          style={{ backgroundColor: c.background }}
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={(request) => {
            const allowed = parseOfficialPage(request.url) !== null
            if (!allowed) setFailed(true)
            return allowed
          }}
          onError={() => setFailed(true)}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 400) setFailed(true)
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.loading, { backgroundColor: c.background }]}>
              <ActivityIndicator color={c.primary} />
            </View>
          )}
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          setSupportMultipleWindows={false}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: {
    padding: space.md,
  },
})
