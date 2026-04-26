import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '../../src/components/ui'
import { KenBurnsImage } from '../../src/components/wizard/KenBurnsImage'
import { hexToRgba } from '../../src/theme/club-theme'
import { SCRIM_BASE, TEXT_WHITE } from '../../src/theme/colors'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'
import type { AppLanguage } from '../../src/i18n'

const OVERLAY_TOP = hexToRgba(SCRIM_BASE, 0.18)
const OVERLAY_BOTTOM = hexToRgba(SCRIM_BASE, 0.7)
const PILL_BG = hexToRgba(TEXT_WHITE, 0.16)
const TAGLINE_COLOR = hexToRgba(TEXT_WHITE, 0.85)

const LANGS: ReadonlyArray<{ code: AppLanguage; label: string }> = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
]

export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const active = (i18n.language?.slice(0, 2) as AppLanguage) ?? 'de'

  return (
    <View style={styles.root}>
      <KenBurnsImage source={require('../../assets/welcome-stadium.jpg')} durationMs={14000} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: OVERLAY_TOP }]} />
      <View style={[styles.overlayBottom, { backgroundColor: OVERLAY_BOTTOM }]} />

      <View style={[styles.langWrap, { top: insets.top + space.sm }]}>
        <View style={[styles.pill, { backgroundColor: PILL_BG }]}>
          {LANGS.map((l) => {
            const isActive = l.code === active
            return (
              <Pressable
                key={l.code}
                accessibilityRole="button"
                accessibilityLabel={`Set language ${l.label}`}
                onPress={() => i18n.changeLanguage(l.code)}
                style={[styles.pillBtn, isActive && styles.pillBtnActive]}
              >
                <Text style={[styles.pillText, isActive ? styles.pillTextActive : styles.pillTextInactive]}>{l.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        <Text style={styles.brand}>Anstoss</Text>
        <Text style={styles.tagline}>{t('onboarding.welcome.tagline')}</Text>
        <View style={styles.ctas}>
          <Button
            label={t('onboarding.welcome.primary')}
            onPress={() => router.push('/(auth)/phone')}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/(auth)/phone', params: { mode: 'signin' } })}
            hitSlop={12}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>{t('onboarding.welcome.secondary')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCRIM_BASE },
  overlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  langWrap: { position: 'absolute', right: space.lg, zIndex: 2 },
  pill: { flexDirection: 'row', borderRadius: radius.full, padding: 3 },
  pillBtn: {
    paddingHorizontal: space.md,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtnActive: { backgroundColor: TEXT_WHITE },
  pillText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: TEXT_WHITE,
    letterSpacing: 0.6,
  },
  pillTextActive: { color: SCRIM_BASE },
  pillTextInactive: {},
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg },
  brand: {
    fontFamily: fonts.heading,
    fontSize: fontSize['3xl'],
    lineHeight: fontSize['3xl'] * 1.25,
    fontWeight: '800',
    color: TEXT_WHITE,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: TAGLINE_COLOR,
    marginTop: space.sm,
    marginBottom: space.lg,
  },
  ctas: { gap: space.sm },
  secondary: { alignSelf: 'center', paddingVertical: space.sm },
  secondaryText: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: TEXT_WHITE,
    textDecorationLine: 'underline',
  },
})
