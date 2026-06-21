/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { SPACING_SM } from '../../src/theme/spacing'
import { useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../../src/components/ui'
import { KenBurnsImage } from '../../src/components/wizard/KenBurnsImage'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { markWelcomeSeen } from '../../src/onboarding/welcomeSeen'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { hexToRgba } from '../../src/theme/club-theme'
import { SCRIM_BASE, TEXT_WHITE } from '../../src/theme/colors'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'
import { HERO_CARD_RADIUS } from '../../src/theme/matchTokens'
import { APP_LANGUAGES, setAppLanguage, type AppLanguage } from '../../src/i18n'

const SCRIM_FULL = hexToRgba(SCRIM_BASE, 0.35)
const PILL_BG = hexToRgba(TEXT_WHITE, 0.14)
const PILL_BORDER = hexToRgba(TEXT_WHITE, 0.22)
const SHEET_BG = hexToRgba(SCRIM_BASE, 0.96)
const SHEET_DIVIDER = hexToRgba(TEXT_WHITE, 0.08)
const BACKDROP = hexToRgba(SCRIM_BASE, 0.4)

type DevFlow = {
  key: 'player' | 'coach' | 'owner' | 'parent' | 'free-agent'
  label: string
}

const DEV_FLOWS: DevFlow[] = [
  { key: 'player', label: 'Player' },
  { key: 'coach', label: 'Coach' },
  { key: 'owner', label: 'Club admin' },
  { key: 'parent', label: 'Parent' },
  { key: 'free-agent', label: 'Free agent' },
]

export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const colors = useClubColors()
  const { update } = useOnboardingFlow()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [devOpen, setDevOpen] = useState(false)
  const active = (i18n.language?.slice(0, 2) as AppLanguage) ?? 'de'

  // Cold-start resume removed earlier — it caused a visible "double slide"
  // as the welcome rendered and was immediately replaced. Persisted state
  // still keeps form values across crashes; users always see the welcome
  // moment fresh on cold start, which is the right call.

  function handlePickLanguage(code: AppLanguage) {
    // Persist the choice (AsyncStorage + server preference sync), not just a
    // transient i18n switch — otherwise the onboarding language resets.
    void setAppLanguage(code)
    setPickerOpen(false)
  }

  function handleDevPick(_flow: DevFlow) {
    update({
      phone: '+15555550100',
      firstName: 'Test',
      dateOfBirth: '1995-05-23',
      policyAccepted: true,
    })
    void markWelcomeSeen()
    setDevOpen(false)
    router.push('/(auth)/sign-in')
  }

  function handlePrimary() {
    // One auth path: the unified sign-in screen handles both new + returning
    // users (and carries its own consent line), so welcome is just the hero.
    // Mark it seen so subsequent cold launches skip straight to sign-in.
    update({ policyAccepted: true })
    void markWelcomeSeen()
    router.push('/(auth)/sign-in')
  }

  function handleSecondary() {
    void markWelcomeSeen()
    router.push('/(auth)/sign-in')
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

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
          {t('onboarding.welcome.tagline')}
        </Text>
        <Text style={[styles.headline, { color: colors.textPrimary }]}>
          {t('onboarding.welcome.headline')}
        </Text>
        <Text style={[styles.subline, { color: colors.textSecondary }]}>
          {t('onboarding.welcome.subline', {
            defaultValue:
              'Your team. Your matches. Your moments.',
          })}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.welcome.primary')}
          onPress={handlePrimary}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.textPrimary },
            pressed && styles.primaryBtnPressed,
          ]}
        >
          <Text style={[styles.primaryText, { color: colors.surface }]}>
            {t('onboarding.welcome.primary')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.welcome.secondary')}
          onPress={handleSecondary}
          hitSlop={12}
          style={styles.secondary}
        >
          <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>
            {t('onboarding.welcome.secondary')}
          </Text>
        </Pressable>
      </View>

      {__DEV__ ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dev shortcuts"
          onPress={() => setDevOpen(true)}
          style={[
            styles.devChip,
            {
              top: insets.top + space.sm,
              left: space.lg,
              backgroundColor: PILL_BG,
              borderColor: PILL_BORDER,
            },
          ]}
          hitSlop={8}
        >
          <Text style={styles.devChipText}>DEV</Text>
        </Pressable>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={devOpen}
        onRequestClose={() => setDevOpen(false)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP }]}
          onPress={() => setDevOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close dev shortcuts"
        >
          <View />
        </Pressable>
        <View
          style={[
            styles.sheet,
            { backgroundColor: SHEET_BG, paddingBottom: insets.bottom + space.lg },
          ]}
        >
          <Text style={styles.sheetTitle}>Dev shortcuts</Text>
          <Text style={styles.devSubtitle}>
            Prefills phone +15555550100, name &amp; DOB. OTP code: 424242. Pick the role on the role
            screen.
          </Text>
          {DEV_FLOWS.map((flow) => (
            <Pressable
              key={flow.key}
              accessibilityRole="button"
              accessibilityLabel={`Dev jump: ${flow.label}`}
              onPress={() => handleDevPick(flow)}
              style={[styles.sheetRow, { borderBottomColor: SHEET_DIVIDER }]}
            >
              <Text style={styles.sheetRowLabel}>{flow.label}</Text>
              <Icon name="chevron.right" size={18} color={TEXT_WHITE} />
            </Pressable>
          ))}
        </View>
      </Modal>

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
    borderRadius: SPACING_SM,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: SPACING_SM,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  langText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: TEXT_WHITE,
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    borderTopLeftRadius: HERO_CARD_RADIUS,
    borderTopRightRadius: HERO_CARD_RADIUS,
    gap: space.md,
  },
  subline: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: -space.xs,
    marginBottom: space.sm,
    opacity: 0.78,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: fontSize.xs,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: space.sm,
  },
  primaryBtn: {
    height: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: { opacity: 0.85 },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginBottom: space.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  policyText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  policyLink: { fontWeight: '700', textDecorationLine: 'underline' },
  secondary: { alignSelf: 'center', paddingVertical: space.sm },
  secondaryText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
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
  devChip: {
    position: 'absolute',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    zIndex: 3,
  },
  devChipText: {
    fontFamily: fonts.data,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: TEXT_WHITE,
  },
  devSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: TEXT_WHITE,
    opacity: 0.7,
    marginBottom: space.md,
  },
})