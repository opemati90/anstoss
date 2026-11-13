import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from './ui'
import { useClubColors } from '../context/ClubThemeContext'
import { useOnline } from '../hooks/useOnline'
import { flushRsvpOutbox } from '../lib/rsvpOutbox'
import { RADIUS_FULL, SCREEN_PADDING, SPACING_MD, SPACING_SM } from '../theme/tokens'

/**
 * Board 29: a dark bar across the top while the device is offline —
 * "Offline. Zusagen werden gesendet, sobald du wieder online bist." — with
 * an amber dot. It also sends the queued replies the moment the connection
 * returns, so every screen gets the outbox for free.
 */
export function OfflineBanner() {
  const online = useOnline()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  useEffect(() => {
    if (online) void flushRsvpOutbox()
  }, [online])

  if (online) return null
  return (
    <View
      style={[styles.bar, { backgroundColor: c.ink, paddingTop: insets.top + SPACING_MD }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="offline-banner"
    >
      <View style={[styles.dot, { backgroundColor: c.warning }]} />
      <Text variant="footnote" weight="semibold" style={[styles.text, { color: c.onInk }]}>
        {t('states.offline.banner', {
          defaultValue: "Offline. Replies are sent as soon as you're back online.",
        })}
      </Text>
    </View>
  )
}

/** Top gap screens keep below the banner instead of the full safe-area inset. */
export const OFFLINE_BANNER_CONTENT_INSET = SPACING_SM

/** While offline, the banner owns the status-bar area; content starts below it. */
export function OfflineInsetsBoundary({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const online = useOnline()
  if (online) return <>{children}</>
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, top: OFFLINE_BANNER_CONTENT_INSET }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM + 2,
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_MD,
  },
  dot: { width: 8, height: 8, borderRadius: RADIUS_FULL },
  text: { flex: 1 },
})
