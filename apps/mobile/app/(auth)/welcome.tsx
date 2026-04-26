import { useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../../src/components/ui'
import { KenBurnsImage } from '../../src/components/wizard/KenBurnsImage'
import { hexToRgba } from '../../src/theme/club-theme'
import { SCRIM_BASE, TEXT_PRIMARY, TEXT_WHITE } from '../../src/theme/colors'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'
import { APP_LANGUAGES, type AppLanguage } from '../../src/i18n'

const SCRIM_FULL = hexToRgba(SCRIM_BASE, 0.5)
const PILL_BG = hexToRgba(TEXT_WHITE, 0.14)
const PILL_BORDER = hexToRgba(TEXT_WHITE, 0.22)
const SHEET_BG = hexToRgba(SCRIM_BASE, 0.96)
const SHEET_DIVIDER = hexToRgba(TEXT_WHITE, 0.08)
const BACKDROP = hexToRgba(SCRIM_BASE, 0.4)

export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const active = (i18n.language?.slice(0, 2) as AppLanguage) ?? 'de'

  function handlePickLanguage(code: AppLanguage) {
    i18n.changeLanguage(code)
    setPickerOpen(false)
  }

  return (
    <View style={styles.root}>
      <KenBurnsImage source={require('../../assets/welcome-stadium.jpg')} durationMs={16000} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM_FULL }]} />

      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <Image source={require('../../assets/icon.png')} style={styles.logoMark} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.welcome.languageA11y')}
          onPress={() => setPickerOpen(true)}
          style={[styles.langPill, { backgroundColor: PILL_BG, borderColor: PILL_BORDER }]}
          hitSlop={8}
        >
          <Icon name="globe" size={16} color={TEXT_WHITE} />
          <Text style={styles.langText}>{t('onboarding.welcome.languageLabel')}</Text>
        </Pressable>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        <Text style={styles.headline}>{t('onboarding.welcome.headline')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.welcome.primary')}
          onPress={() => router.push('/(auth)/phone')}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Text style={styles.primaryText}>{t('onboarding.welcome.primary')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.welcome.secondary')}
          onPress={() => router.push({ pathname: '/(auth)/phone', params: { mode: 'signin' } })}
          hitSlop={12}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{t('onboarding.welcome.secondary')}</Text>
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP }]}
          onPress={() => setPickerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close language picker"
        >
          <View />
        </Pressable>
        <View style={[styles.sheet, { backgroundColor: SHEET_BG, paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.sheetTitle}>{t('onboarding.welcome.languageA11y')}</Text>
          {APP_LANGUAGES.map((code) => {
            const isActive = code === active
            return (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityLabel={`Set language ${code}`}
                onPress={() => handlePickLanguage(code)}
                style={[styles.sheetRow, { borderBottomColor: SHEET_DIVIDER }]}
              >
                <Text style={styles.sheetRowLabel}>{labelFor(code)}</Text>
                {isActive ? <Icon name="checkmark" size={20} color={TEXT_WHITE} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Modal>
    </View>
  )
}

function labelFor(code: AppLanguage): string {
  switch (code) {
    case 'de':
      return 'Deutsch'
    case 'en':
      return 'English'
    case 'fr':
      return 'Français'
    case 'pt':
      return 'Português'
    case 'it':
      return 'Italiano'
    case 'tr':
      return 'Türkçe'
    case 'ar':
      return 'العربية'
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCRIM_BASE },
  topBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  langText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: TEXT_WHITE,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
  },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: TEXT_WHITE,
    letterSpacing: 1.2,
    marginBottom: space.xl,
  },
  primaryBtn: {
    height: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TEXT_WHITE,
    marginBottom: space.md,
  },
  primaryBtnPressed: { opacity: 0.85 },
  primaryText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    letterSpacing: 0.2,
  },
  secondary: { alignSelf: 'center', paddingVertical: space.sm },
  secondaryText: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: TEXT_WHITE,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  sheetTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: TEXT_WHITE,
    marginBottom: space.md,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRowLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: TEXT_WHITE,
  },
})
