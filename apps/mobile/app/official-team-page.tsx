import { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { WebView } from 'react-native-webview'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { Banner, Button, Screen } from '../src/components/ui'
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

export function parseOfficialWidget(value: { widgetId?: unknown; widgetType?: unknown }) {
  const rawId = Array.isArray(value.widgetId) ? value.widgetId[0] : value.widgetId
  const rawType = Array.isArray(value.widgetType) ? value.widgetType[0] : value.widgetType
  if (
    typeof rawId !== 'string' ||
    typeof rawType !== 'string' ||
    !/^[A-Za-z0-9-]{8,80}$/.test(rawId) ||
    !/^[a-z][a-z0-9_-]{1,39}$/.test(rawType)
  ) {
    return null
  }
  return { id: rawId, type: rawType }
}

function officialWidgetHtml(widget: { id: string; type: string }) {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://www.fussball.de; connect-src https://www.fussball.de https://*.fussball.de; img-src https://www.fussball.de https://*.fussball.de data:; style-src https://www.fussball.de https://*.fussball.de 'unsafe-inline'; font-src https://www.fussball.de https://*.fussball.de data:; frame-src https://www.fussball.de https://*.fussball.de" />
    <style>html,body{margin:0;padding:0;background:#fff;min-height:100%}.widget-shell{padding:12px;overflow-x:auto}</style>
    <script src="https://www.fussball.de/widgets.js"></script>
  </head>
  <body><main class="widget-shell"><div class="fussballde_widget" data-id="${widget.id}" data-type="${widget.type}"></div></main></body>
</html>`
}

export function shouldAllowOfficialWidgetNavigation(url: string) {
  if (url === 'about:blank' || url === 'https://www.fussball.de/') return true
  return parseOfficialPage(url) !== null
}

export default function OfficialTeamPageScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const params = useLocalSearchParams<{
    url?: string
    title?: string
    widgetId?: string
    widgetType?: string
  }>()
  const url = useMemo(() => parseOfficialPage(params.url), [params.url])
  const widget = useMemo(() => parseOfficialWidget(params), [params.widgetId, params.widgetType])
  const widgetHtml = useMemo(() => (widget ? officialWidgetHtml(widget) : null), [widget])
  const hasSource = Boolean(url || widgetHtml)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

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
      {!hasSource || failed ? (
        <View style={styles.state}>
          <Banner
            tone="error"
            title={t('common.loadError')}
            description={t('fussball.officialPageError', {
              defaultValue: 'This official team page could not be displayed securely.',
            })}
          />
          {hasSource ? (
            <Button
              label={t('common.tryAgain', { defaultValue: 'Try again' })}
              variant="filled"
              fullWidth
              onPress={() => {
                setFailed(false)
                setReloadKey((value) => value + 1)
              }}
            />
          ) : null}
          {url ? (
            <Button
              label={t('fussball.openExternal', { defaultValue: 'Open in browser' })}
              variant="bordered"
              fullWidth
              onPress={() => void Linking.openURL(url)}
            />
          ) : null}
          <Button
            label={t('fussball.createFixtureManually', {
              defaultValue: 'Create fixture manually',
            })}
            variant="secondary"
            fullWidth
            onPress={() => router.push('/create-event')}
          />
        </View>
      ) : (
        <WebView
          key={reloadKey}
          source={
            widgetHtml
              ? { html: widgetHtml, baseUrl: 'https://www.fussball.de/' }
              : { uri: url as string }
          }
          style={{ backgroundColor: c.background }}
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={(request) => {
            if (widgetHtml) {
              const allowed = shouldAllowOfficialWidgetNavigation(request.url)
              if (!allowed) setFailed(true)
              return allowed
            }
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
    gap: space.sm,
  },
})
