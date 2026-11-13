import { useRef, useState } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { Button, Icon, Text } from '../../src/components/ui'
import { PolicyOverlay } from '../../src/components/wizard/PolicyOverlay'
import type { PolicyKind } from '../../src/content/policies'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { APP_LANGUAGES, getAppLanguage, setAppLanguage, type AppLanguage } from '../../src/i18n'
import { OnboardingTextField, useKeyboardInset } from '../../src/onboarding/ui'
import { PitchLines, useOnboardingHero } from '../../src/onboarding/WelcomeHero'
import type { OnboardingIntent } from '../../src/onboarding/intent'
import { sendCodeErrorKey } from '../../src/onboarding/errors'
import { hexToRgba } from '../../src/theme/club-theme'
import {
  FONT_SIZE_HERO_LARGE,
  RADIUS_FULL,
  RADIUS_XL,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
  SCREEN_PADDING,
  hairline,
  radius,
  space,
} from '../../src/theme/tokens'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  tr: 'Türkçe',
}

const LANGUAGE_ENGLISH: Record<AppLanguage, string> = {
  de: 'German',
  en: 'English',
  fr: 'French',
  it: 'Italian',
  pt: 'Portuguese',
  tr: 'Turkish',
}

/**
 * Screen 1 for everyone: the first impression and the email field in one.
 * New and returning users type the same thing; the code screen follows.
 *
 * 2026-11 redesign: full-screen club-green hero with the pitch markings, the
 * "Anstoss" brand row, the Barlow claim and the lime primary action. The
 * design's three entry buttons (beitreten / anlegen / anmelden) collapse into
 * the app's one email-first entry: every path starts with the same code.
 */
export default function Welcome() {
  const router = useRouter()
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const { bg: hero, fg: onHero } = useOnboardingHero()
  const keyboardInset = useKeyboardInset()
  const { startOtp } = useOnboardingAuth()
  const { isSignedIn } = useAuth()
  const params = useLocalSearchParams<{ inviteCode?: string; reason?: string }>()
  const inviteCode = Array.isArray(params.inviteCode) ? params.inviteCode[0] : params.inviteCode
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason
  // M7: sent back here because the session ran out mid-onboarding.
  const sessionExpired = reason === 'expired'

  const inputRef = useRef<TextInput>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [policy, setPolicy] = useState<PolicyKind | null>(null)
  const trimmed = email.trim().toLowerCase()
  const valid = EMAIL_RE.test(trimmed)

  // No autofocus here: on Android (and iOS with the software keyboard) it
  // opened the keyboard over the hero on a new user's very first screen.
  // The field focuses when tapped; later onboarding steps keep autofocus.

  async function send(intent?: OnboardingIntent) {
    if (!valid || sending) return
    setSending(true)
    setError(null)
    try {
      await startOtp(trimmed, 'signin', 'email')
      router.push({
        pathname: '/(auth)/sign-in',
        params: {
          email: trimmed,
          sent: '1',
          ...(inviteCode ? { inviteCode } : {}),
          ...(intent ? { intent } : {}),
        },
      })
    } catch (err) {
      setError(t(sendCodeErrorKey(err)))
    } finally {
      setSending(false)
    }
  }

  // A signed-in user never sees the entry screen (deep link, stale stack).
  if (isSignedIn) return <Redirect href="/" />

  const keyboardUp = keyboardInset > 0
  const footerBottom = keyboardUp ? keyboardInset + space.sm : insets.bottom + space.lg
  const muted = c.onHeroMuted
  const hairlineOnHero = hexToRgba(onHero, 0.3)
  const language = getAppLanguage()

  return (
    <View style={[styles.root, { backgroundColor: hero }]}>
      <StatusBar barStyle="light-content" />
      <PitchLines color={onHero} />
      <View style={[styles.topBar, { paddingTop: insets.top + space.md }]}>
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
          onPress={() => setLanguageOpen(true)}
          hitSlop={4}
          style={[styles.languageChip, { borderColor: hairlineOnHero }]}
        >
          <Icon name="globe" size={16} color={onHero} />
          <Text variant="caption1" weight="semibold" color={onHero}>
            {LANGUAGE_LABELS[language]}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.claim}>
          {!keyboardUp ? (
            <Text
              variant="display"
              color={onHero}
              style={styles.claimTitle}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.2}
            >
              {t('onboardingFlow.welcome.claim', { defaultValue: 'Your club.\nOne kickoff.' })}
            </Text>
          ) : null}
          <Text variant="body" color={muted} style={styles.claimBody}>
            {t('onboardingFlow.welcome.claimBody', {
              defaultValue:
                'Fixtures, availability, lineups, chat and dues in one place. No more group-chat chaos.',
            })}
          </Text>
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

        <View style={[styles.fieldCard, { backgroundColor: c.surface }]}>
          <OnboardingTextField
            ref={inputRef}
            label={t('onboardingFlow.welcome.emailLabel')}
            value={email}
            onChangeText={(next) => {
              setEmail(next)
              setError(null)
            }}
            placeholder={t('onboardingFlow.welcome.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="go"
            onSubmitEditing={() => void send()}
            error={error}
            hint={t('onboardingFlow.welcome.hint')}
            testID="welcome-email"
          />
        </View>

        {!inviteCode ? (
          <View style={styles.links}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onboardingFlow.welcome.freeAgentLink')}
              onPress={() => {
                if (valid) void send('free-agent')
                else {
                  setError(t('onboardingFlow.welcome.freeAgentNeedsEmail'))
                  inputRef.current?.focus()
                }
              }}
              style={styles.link}
              testID="welcome-free-agent"
            >
              <Icon name="magnifyingglass" size={18} color={onHero} />
              <Text variant="subheadline" weight="semibold" color={onHero} style={styles.shrink}>
                {t('onboardingFlow.welcome.freeAgentLink')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('onboardingFlow.welcome.setupCodeLink')}
              onPress={() => {
                // H5: a parent with a setup code for their child goes from
                // the name straight to "Kind hinzufügen".
                if (valid) void send('parent-handoff')
                else {
                  setError(t('onboardingFlow.welcome.freeAgentNeedsEmail'))
                  inputRef.current?.focus()
                }
              }}
              style={styles.link}
              testID="welcome-setup-code"
            >
              <Icon name="figure.and.child.holdinghands" size={18} color={onHero} />
              <Text variant="subheadline" weight="semibold" color={onHero} style={styles.shrink}>
                {t('onboardingFlow.welcome.setupCodeLink')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerBottom }]}>
        <Button
          label={t('onboardingFlow.common.continue')}
          variant="accent"
          onPress={() => void send()}
          disabled={!valid}
          loading={sending}
          size="lg"
          fullWidth
          testID="welcome-continue"
        />
        <Text variant="caption1" color={muted} align="center">
          {t('onboardingFlow.welcome.consent')}
        </Text>
        <View style={styles.policyLinks}>
          <Pressable
            accessibilityRole="link"
            onPress={() => setPolicy('terms')}
            hitSlop={4}
            style={styles.policyLink}
          >
            <Text variant="caption1" weight="bold" color={onHero}>
              {t('onboardingFlow.welcome.termsLink')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => setPolicy('privacy')}
            hitSlop={4}
            style={styles.policyLink}
          >
            <Text variant="caption1" weight="bold" color={onHero}>
              {t('onboardingFlow.welcome.privacyLink')}
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={languageOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageOpen(false)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.surfaceOverlay }]}
          onPress={() => setLanguageOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.background, paddingBottom: insets.bottom + space.md },
          ]}
        >
          <Text variant="title3" accessibilityRole="header" style={styles.sheetTitle}>
            {t('onboardingFlow.welcome.languageTitle')}
          </Text>
          <View style={[styles.sheetGroup, { backgroundColor: c.surface }]} accessibilityRole="radiogroup">
            {APP_LANGUAGES.map((code, index) => {
              const active = code === language
              return (
                <Pressable
                  key={code}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={LANGUAGE_LABELS[code]}
                  android_ripple={{ color: c.borderDefault }}
                  onPress={() => {
                    void setAppLanguage(code)
                    setLanguageOpen(false)
                  }}
                  style={[
                    styles.sheetRow,
                    index < APP_LANGUAGES.length - 1 && {
                      borderBottomColor: c.borderSubtle,
                      borderBottomWidth: hairline,
                    },
                  ]}
                >
                  <Text variant="data" color="secondary" style={styles.sheetCode}>
                    {code.toUpperCase()}
                  </Text>
                  <View style={styles.sheetCopy}>
                    <Text variant="body" weight="semibold">
                      {LANGUAGE_LABELS[code]}
                    </Text>
                    <Text variant="caption1" color="secondary">
                      {LANGUAGE_ENGLISH[code]}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      active
                        ? { borderWidth: 7, borderColor: c.ink }
                        : { borderWidth: 2, borderColor: c.borderControl },
                    ]}
                  />
                </Pressable>
              )
            })}
          </View>
        </View>
      </Modal>

      <PolicyOverlay visible={policy !== null} kind={policy ?? 'terms'} onClose={() => setPolicy(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: SCREEN_PADDING + 4,
    paddingTop: space.lg,
    gap: space.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING + 4,
    zIndex: 2,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACING_SM + 2 },
  brandDot: { width: 10, height: 10, borderRadius: RADIUS_FULL },
  brandText: { fontSize: 22, lineHeight: 24, letterSpacing: 1.3 },
  languageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS + 2,
    minHeight: 44,
    paddingHorizontal: SPACING_MD + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  claim: { gap: space.md, marginBottom: space.sm },
  claimTitle: {
    fontSize: FONT_SIZE_HERO_LARGE,
    lineHeight: Math.round(FONT_SIZE_HERO_LARGE * 0.95),
  },
  claimBody: { maxWidth: 320, lineHeight: 25 },
  fieldCard: {
    padding: space.md,
    borderRadius: RADIUS_XL,
    borderCurve: 'continuous',
  },
  links: { gap: space.xs },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  shrink: { flexShrink: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: RADIUS_XL,
    borderCurve: 'continuous',
  },
  footer: {
    paddingHorizontal: SCREEN_PADDING + 4,
    paddingTop: space.md,
    gap: space.sm,
  },
  policyLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: space.md,
  },
  policyLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.lg,
    paddingHorizontal: SCREEN_PADDING,
    borderTopLeftRadius: RADIUS_XL,
    borderTopRightRadius: RADIUS_XL,
    borderCurve: 'continuous',
  },
  sheetTitle: { marginBottom: space.md },
  sheetGroup: { borderRadius: RADIUS_XL, paddingHorizontal: space.md, borderCurve: 'continuous' },
  sheetRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    paddingVertical: space.sm,
  },
  sheetCode: { width: 30, fontSize: 15, lineHeight: 18 },
  sheetCopy: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  radio: { width: 22, height: 22, borderRadius: RADIUS_FULL },
})
