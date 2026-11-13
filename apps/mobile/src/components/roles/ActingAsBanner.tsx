import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import { Text } from '../ui'
import { endActingSession, loadActingSession } from '../../features/acting/api'
import {
  endPreview,
  minutesLeft,
  setActingSession,
  useViewAs,
} from '../../features/acting/store'
import { RADIUS_FULL, SPACING_LG, SPACING_SM, SPACING_XL, SPACING_XS } from '../../theme/tokens'

/** Board 31 measures (ActingAs.dc.html). */
const DOT_SIZE = 8
const ROW_GAP = 10
const PILL_HEIGHT = 40
const PILL_PAD_X = 14
const TICK_MS = 15_000

/**
 * Vorschau und Vertretung (board 31): the ink bar under the status bar while
 * a stand-in session ("Du handelst als Trainer · A-Jugend", minutes left,
 * "wird protokolliert") or a read-only preview runs, with a lime "Beenden".
 * Renders nothing otherwise. Syncs the session from GET /me/acting-session
 * and clears it locally at expiry.
 */
export function ActingAsBanner() {
  const { t } = useTranslation()
  const c = useClubColors()
  const isDark = useIsDark()
  const insets = useSafeAreaInsets()
  const { user, activeClub } = useAuth()
  const { preview, acting } = useViewAs()
  const [now, setNow] = useState(() => Date.now())
  const clubId = activeClub?.club.id ?? null

  useEffect(() => {
    if (!user?.id || !clubId) return
    void loadActingSession().catch(() => undefined)
  }, [clubId, user?.id])

  useEffect(() => {
    if (!acting) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [acting])

  const left = acting ? minutesLeft(acting.expiresAt, now) : 0
  useEffect(() => {
    if (acting && left === 0) setActingSession(null)
  }, [acting, left])

  const showPreview = Boolean(preview)
  if (!showPreview && !(acting && left > 0)) return null

  const roleLabel = preview?.mode === 'PARENT' ? t('acting.roleParent') : t('acting.rolePlayer')
  const title = preview
    ? t('acting.bannerPreview', { role: roleLabel, team: preview.team.name })
    : t('acting.bannerActing', { team: acting?.teamName ?? '' })
  const meta = preview ? t('acting.bannerPreviewMeta') : t('acting.bannerActingMeta', { count: left })
  const endLabel = preview ? t('acting.endPreviewA11y') : t('acting.endActingA11y')

  const bg = isDark ? c.surfaceRaised : c.ink
  const fg = isDark ? c.textPrimary : c.onInk
  const muted = isDark ? c.textSecondary : c.onHeroMuted

  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      testID="acting-as-banner"
      style={[styles.bar, { backgroundColor: bg, paddingTop: insets.top + SPACING_XS }]}
    >
      <View style={[styles.dot, { backgroundColor: c.accent }]} />
      <View style={styles.text}>
        <Text variant="footnote" weight="bold" style={{ color: fg }} numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption1" weight="regular" style={{ color: muted }} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Pressable
        onPress={() => (preview ? endPreview() : void endActingSession())}
        accessibilityRole="button"
        accessibilityLabel={endLabel}
        testID="acting-as-end"
        hitSlop={SPACING_XS}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: c.accent },
          pressed && styles.pressed,
        ]}
      >
        <Text variant="footnote" weight="bold" style={{ color: c.onAccent }}>
          {t('acting.end')}
        </Text>
      </Pressable>
    </View>
  )
}

/** Whether the banner is showing (the tab layout then trims the top inset below it). */
export function useActingAsBannerVisible(): boolean {
  const { activeClub } = useAuth()
  const { preview, acting } = useViewAs()
  if (!activeClub) return false
  return Boolean(preview) || Boolean(acting && minutesLeft(acting.expiresAt) > 0)
}

/** Top gap the screens keep below the banner instead of the full safe-area inset. */
export const ACTING_BANNER_CONTENT_INSET = SPACING_SM

/**
 * Wraps the tab content: while the banner covers the status bar, screens
 * below it get a small top inset instead of the full safe-area inset.
 */
export function ActingInsetsBoundary({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const visible = useActingAsBannerVisible()
  if (!visible || !SafeAreaInsetsContext) return <>{children}</>
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, top: ACTING_BANNER_CONTENT_INSET }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingLeft: SPACING_XL,
    paddingRight: SPACING_LG,
    paddingBottom: ROW_GAP,
  },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: RADIUS_FULL },
  text: { flex: 1, minWidth: 0 },
  pill: {
    height: PILL_HEIGHT,
    paddingHorizontal: PILL_PAD_X,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
})

