import { useRef, useState } from 'react'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
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
import { OnboardingTextField, useKeyboardInset, useKeyboardVisible } from '../../src/onboarding/ui'
import type { OnboardingIntent } from '../../src/onboarding/intent'
import { sendCodeErrorKey } from '../../src/onboarding/errors'
import { fontSize, hairline, radius, space } from '../../src/theme/tokens'
import { OPTIONAL_CLUB_FEATURES } from '../../src/launchFeatures'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  tr: 'Türkçe',
}

/**
 * Screen 1 for everyone: the first impression and the email field in one.
 * New and returning users type the same thing; the code screen follows.
 */
export default function Welcome() {
  const router = useRouter()
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const { height, fontScale } = useWindowDimensions()
  const keyboardInset = useKeyboardInset()
  const keyboardUp = useKeyboardVisible()
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

  // The photo stays as a slim band on tall phones while typing and gives its
  // space to the form on small ones (iPhone SE, compact Android).
  const heroHeight = keyboardUp ? 0 : Math.min(Math.round(height * 0.23), 196)

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ScrollView
        key={`welcome-font-scale-${fontScale.toFixed(2)}`}
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + space.sm, paddingBottom: keyboardUp ? keyboardInset + space.md : insets.bottom + space.md }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View
          testID="welcome-language-container"
          style={styles.topBar}
        >
            <View style={styles.brand}>
              <Image source={require('../../assets/icon.png')} style={styles.brandIcon} accessible={false} />
              {fontScale < 1.5 ? (
                <Text variant="headline" weight="semibold" numberOfLines={1}>Anstoss</Text>
              ) : null}
            </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboardingFlow.welcome.languageA11y', {
              language: LANGUAGE_LABELS[getAppLanguage()],
            })}
            onPress={() => setLanguageOpen(true)}
            android_ripple={{ color: c.borderDefault, borderless: false }}
            style={[styles.languagePill, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
          >
            <Icon name="globe" size={16} color={c.textPrimary} />
            <Text variant="footnote" weight="semibold">
              {LANGUAGE_LABELS[getAppLanguage()]}
            </Text>
          </Pressable>
        </View>

        {heroHeight > 0 ? (
          <View style={styles.heroFrame}>
            <Image
              testID="welcome-hero"
              source={require('../../assets/welcome-stadium.jpg')}
              style={[styles.hero, { height: heroHeight }]}
              resizeMode="cover"
              accessible={false}
            />
          </View>
        ) : null}

        <View
          testID="welcome-content"
          style={[
            styles.content,
            { paddingTop: heroHeight > 0 ? space.xl : space.md },
          ]}
        >
          <View style={[styles.signInCard, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
          <View style={styles.introduction} testID="welcome-introduction">
            <Text variant="title2" accessibilityRole="header">
              {t('onboardingFlow.welcome.signInTitle')}
            </Text>
            <Text variant="subheadline" color="secondary">
              {t('onboardingFlow.welcome.signInSubtitle')}
            </Text>
          </View>
          {sessionExpired ? (
            <View
              style={[styles.notice, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
              accessibilityLiveRegion="polite"
              testID="welcome-session-expired"
            >
              <Icon name="clock.fill" size={18} color={c.textSecondary} />
              <Text variant="footnote" color="secondary" style={styles.freeAgentText}>
                {t('onboardingFlow.welcome.sessionExpired')}
              </Text>
            </View>
          ) : null}
          <View style={styles.form} testID="welcome-form">
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
              style={styles.emailInput}
              testID="welcome-email"
            />
            <Button
              label={t('onboardingFlow.common.continue')}
              onPress={() => void send()}
              disabled={!valid}
              loading={sending}
              size="lg"
              fullWidth
              testID="welcome-continue"
            />
          </View>
          </View>
          {!inviteCode && OPTIONAL_CLUB_FEATURES.marketplace ? (
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
              android_ripple={{ color: c.borderDefault }}
              style={styles.freeAgent}
              testID="welcome-free-agent"
            >
              <Icon name="magnifyingglass" size={18} color={c.primary} />
              <Text variant="subheadline" weight="semibold" color="tint" style={styles.freeAgentText}>
                {t('onboardingFlow.welcome.freeAgentLink')}
              </Text>
            </Pressable>
          ) : null}
          {!inviteCode && LAUNCH_FEATURES.youthParticipation ? (
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
              android_ripple={{ color: c.borderDefault }}
              style={styles.freeAgent}
              testID="welcome-setup-code"
            >
              <Icon name="figure.and.child.holdinghands" size={18} color={c.primary} />
              <Text variant="subheadline" weight="semibold" color="tint" style={styles.freeAgentText}>
                {t('onboardingFlow.welcome.setupCodeLink')}
              </Text>
            </Pressable>
          ) : null}
        <View style={styles.footer} testID="welcome-legal">
        <Text variant="caption1" color="secondary">
          {t('onboardingFlow.welcome.consentIntro')}
        </Text>
        <View style={styles.links}>
          <Pressable
            accessibilityRole="link"
            onPress={() => setPolicy('terms')}
            hitSlop={4}
            style={styles.link}
          >
            <Text variant="caption1" weight="semibold" color="tint">
              {t('onboardingFlow.welcome.termsLink')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => setPolicy('privacy')}
            hitSlop={4}
            style={styles.link}
          >
            <Text variant="caption1" weight="semibold" color="tint">
              {t('onboardingFlow.welcome.privacyPolicyLink')}
            </Text>
          </Pressable>
        </View>
        </View>
        </View>
      </ScrollView>

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
            { backgroundColor: c.surface, paddingBottom: insets.bottom + space.md },
          ]}
        >
          <Text variant="title3" style={styles.sheetTitle}>
            {t('onboardingFlow.welcome.languageTitle')}
          </Text>
          {APP_LANGUAGES.map((code) => {
            const active = code === getAppLanguage()
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
                style={[styles.sheetRow, { borderBottomColor: c.borderSubtle }]}
              >
                <Text variant="body" weight={active ? 'semibold' : 'regular'}>
                  {LANGUAGE_LABELS[code]}
                </Text>
                {active ? <Icon name="checkmark" size={20} color={c.primary} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Modal>

      <PolicyOverlay visible={policy !== null} kind={policy ?? 'terms'} onClose={() => setPolicy(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  heroFrame: { marginHorizontal: space.md, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  hero: { width: '100%' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  brandIcon: { width: 40, height: 40, borderRadius: radius.md, borderCurve: 'continuous' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  languagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.md,
  },
  signInCard: {
    padding: space.lg,
    gap: space.lg,
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  introduction: { gap: space.xs },
  form: { gap: space.md },
  emailInput: { fontSize: fontSize.md },
  footer: {
    gap: 0,
    paddingHorizontal: space.sm,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    columnGap: space.md,
  },
  link: { minHeight: 44, justifyContent: 'center', paddingRight: space.sm },
  freeAgent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    marginTop: space.xs,
  },
  freeAgentText: { flexShrink: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    marginTop: space.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.lg,
    paddingHorizontal: space.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderCurve: 'continuous',
  },
  sheetTitle: { marginBottom: space.sm },
  sheetRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: hairline,
  },
})
