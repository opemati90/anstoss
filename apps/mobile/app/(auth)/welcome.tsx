import { Pressable, StatusBar, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Icon, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { getAppLanguage, type AppLanguage } from '../../src/i18n'
import { PitchLines, useOnboardingHero } from '../../src/onboarding/WelcomeHero'
import { hexToRgba } from '../../src/theme/club-theme'
import {
  FONT_SIZE_HERO_LARGE,
  SPACING_LG,
  SPACING_XL,
  SPACING_XXL,
  RADIUS_FULL,
  RADIUS_XL,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SCREEN_PADDING,
  radius,
  space,
} from '../../src/theme/tokens'

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  tr: 'Türkçe',
}

/**
 * The entry for everyone who is signed out (design board 01 "Main"): the
 * club-green hero with the pitch markings, the "Anstoss" brand row, the
 * Barlow claim and three ways in. "Verein beitreten" and "Verein anlegen"
 * both start with the email code on the next screen (index.tsx then routes
 * to "Zu deinem Verein" or "Dein Verein"); "Anmelden" is the same code for
 * returning members. Free agents and a parent's setup code are secondary
 * rows on "Zu deinem Verein".
 */
export default function Welcome() {
  const router = useRouter()
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const { bg: hero, fg: onHero } = useOnboardingHero()
  const { isSignedIn } = useAuth()
  const params = useLocalSearchParams<{ inviteCode?: string; reason?: string }>()
  const inviteCode = Array.isArray(params.inviteCode) ? params.inviteCode[0] : params.inviteCode
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason
  // M7: sent back here because the session ran out mid-onboarding.
  const sessionExpired = reason === 'expired'

  // A signed-in user never sees the entry screen (deep link, stale stack).
  if (isSignedIn) return <Redirect href="/" />

  function toSignIn(extra: Record<string, string>) {
    router.push({
      pathname: '/(auth)/sign-in',
      params: { ...(inviteCode ? { inviteCode } : {}), ...extra },
    })
  }

  const muted = c.onHeroMuted
  const hairlineOnHero = hexToRgba(onHero, 0.3)
  const language = getAppLanguage()

  return (
    <View style={[styles.root, { backgroundColor: hero, paddingBottom: insets.bottom + BOTTOM_PAD }]}>
      <StatusBar barStyle="light-content" />
      <PitchLines color={onHero} />
      <View style={[styles.topBar, { top: insets.top + space.md }]}>
        <View style={styles.brand} accessible accessibilityRole="header">
          <View style={[styles.brandDot, { backgroundColor: c.accent }]} />
          <Text variant="display" color={onHero} style={styles.brandText}>
            {t('onboardingFlow.welcome.brand', { defaultValue: 'Anstoss' })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboardingFlow.welcome.languageA11y', {
            language: LANGUAGE_LABELS[language],
          })}
          onPress={() => router.push('/language')}
          hitSlop={4}
          style={[styles.languageChip, { borderColor: hairlineOnHero }]}
        >
          <Icon name="globe" size={16} color={onHero} />
          <Text variant="footnote" weight="semibold" color={onHero}>
            {LANGUAGE_LABELS[language]}
          </Text>
        </Pressable>
      </View>

      {sessionExpired ? (
        <View
          style={[styles.notice, { backgroundColor: hexToRgba(onHero, 0.12) }]}
          accessibilityLiveRegion="polite"
          testID="welcome-session-expired"
        >
          <Icon name="clock.fill" size={18} color={onHero} />
          <Text variant="footnote" color={onHero} style={styles.shrink}>
            {t('onboardingFlow.welcome.sessionExpired')}
          </Text>
        </View>
      ) : null}

      <View style={styles.claim}>
        <Text
          variant="display"
          color={onHero}
          style={styles.claimTitle}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.2}
        >
          {t('onboardingFlow.welcome.claim', { defaultValue: 'Your club.\nOne kickoff.' })}
        </Text>
        <Text variant="body" color={muted} style={styles.claimBody}>
          {t('onboardingFlow.welcome.claimBody', {
            defaultValue:
              'Fixtures, availability, lineups, chat and dues in one place. No more group-chat chaos.',
          })}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label={t('onboardingFlow.welcome.joinCta')}
          variant="accent"
          onPress={() => toSignIn({})}
          size="lg"
          fullWidth
          testID="welcome-join"
        />
        {!inviteCode ? (
          <Button
            label={t('onboardingFlow.welcome.createCta')}
            variant="onHero"
            onPress={() => toSignIn({ intent: 'club-setup' })}
            size="lg"
            fullWidth
            testID="welcome-create"
          />
        ) : null}
        <View style={styles.signInLine}>
          <Text variant="subheadline" weight="regular" color={muted}>
            {t('onboardingFlow.welcome.haveAccount')}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('onboardingFlow.welcome.signInLink')}
            onPress={() => toSignIn({ mode: 'signin' })}
            hitSlop={12}
            testID="welcome-sign-in"
          >
            <Text variant="subheadline" weight="bold" color={onHero} style={styles.underline}>
              {t('onboardingFlow.welcome.signInLink')}
            </Text>
          </Pressable>
        </View>
      </View>

    </View>
  )
}

/** Design: 44 under the "Anmelden" line, above the home indicator. */
const BOTTOM_PAD = SPACING_XXL + SPACING_XL
/** Design: 40 between the claim copy and the first button. */
const ACTIONS_GAP = SPACING_XXL + SPACING_LG

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: SCREEN_PADDING + 4,
  },
  topBar: {
    position: 'absolute',
    left: SCREEN_PADDING + 4,
    right: SCREEN_PADDING + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACING_SM + 2 },
  brandDot: { width: 10, height: 10, borderRadius: RADIUS_FULL },
  brandText: { fontSize: 22, lineHeight: 24, letterSpacing: 1.3 },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS + 2,
    height: 36,
    paddingHorizontal: SPACING_MD + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  claim: { gap: space.md },
  claimTitle: {
    fontSize: FONT_SIZE_HERO_LARGE,
    lineHeight: Math.round(FONT_SIZE_HERO_LARGE * 0.95),
  },
  claimBody: { maxWidth: 310, fontSize: 16, lineHeight: 25 },
  actions: { marginTop: ACTIONS_GAP, gap: SPACING_MD },
  signInLine: {
    marginTop: SPACING_SM + 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING_XS,
  },
  underline: { textDecorationLine: 'underline' },
  shrink: { flexShrink: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    marginBottom: space.lg,
    borderRadius: RADIUS_XL,
    borderCurve: 'continuous',
  },
})
