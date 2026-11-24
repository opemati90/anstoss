import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { OAuthProvider, PublicInvitePayload } from '@anstoss/shared'
import { api } from '../../src/api/client'
import { setPendingInvite } from '../../src/auth/pendingInvite'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { OtpCellInput } from '../../src/components/wizard/OtpCellInput'
import { Button, Text } from '../../src/components/ui'
import { PolicyOverlay } from '../../src/components/wizard/PolicyOverlay'
import type { PolicyKind } from '../../src/content/policies'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride, useClubColors } from '../../src/context/ClubThemeContext'
import {
  completeOAuthLink,
  getOAuthAvailability,
  OAuthCancelledError,
  OAuthNotAvailableYetError,
  resendOAuthLink,
  signInWithOAuth,
} from '../../src/auth/oauth'
import { AppleSignInButton } from '../../src/auth/AppleSignInButton'
import { GoogleSignInButton } from '../../src/auth/GoogleSignInButton'
import { socialLoginCopy } from '../../src/i18n/socialLogin'
import { mustRestartOAuthLink } from '../../src/auth/oauthLinkRecovery'
import { sendCodeErrorKey, verifyCodeError } from '../../src/onboarding/errors'
import { parseOnboardingIntent, setOnboardingIntent } from '../../src/onboarding/intent'
import { onboardingProgress, pathForIntent } from '../../src/onboarding/steps'
import { ClubCrest, OnboardingScreen, OnboardingTextField } from '../../src/onboarding/ui'
import { goBackOrReplace } from '../../src/utils/navigation'
import { space } from '../../src/theme/tokens'

const RESEND_COOLDOWN_S = 30
const CODE_LENGTH = 6
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Email + one-time code on one screen.
 *  - From welcome the code is already on its way (`sent=1`): the screen opens
 *    on the code cells.
 *  - From an invite link the email field comes first, under the club's crest.
 * After a valid code the account is live; `router.replace('/')` hands the
 * user to index.tsx, which knows the next step. Nothing in the auth group is
 * left behind, so back can never return here.
 */
export default function SignIn() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const socialCopy = socialLoginCopy(i18n.language)
  const params = useLocalSearchParams<{
    email?: string
    sent?: string
    inviteCode?: string
    intent?: string
    mode?: string
  }>()
  const initialEmail = first(params.email) ?? ''
  const inviteCode = first(params.inviteCode)
  const intent = parseOnboardingIntent(first(params.intent))
  const cameFromWelcome = first(params.sent) === '1' && !!initialEmail
  // "Schon dabei? Anmelden" on welcome: a returning member.
  const returning = first(params.mode) === 'signin'
  const { startOtp, verifyOtp } = useOnboardingAuth()
  const { refreshUser } = useAuth()

  const [stage, setStage] = useState<'email' | 'code' | 'restart'>(
    cameFromWelcome ? 'code' : 'email',
  )
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(cameFromWelcome ? RESEND_COOLDOWN_S : 0)
  const [refocusKey, setRefocusKey] = useState(0)
  const [invite, setInvite] = useState<PublicInvitePayload | null>(null)
  const [policy, setPolicy] = useState<PolicyKind | null>(null)
  const [oauthNote, setOauthNote] = useState<string | null>(null)
  const [providers, setProviders] = useState({ google: false, apple: false })
  const [linkTicket, setLinkTicket] = useState<string | null>(null)
  const verifyingRef = useRef(false)
  const emailRef = useRef<TextInput>(null)

  const normalizedEmail = email.trim().toLowerCase()
  const emailValid = EMAIL_RE.test(normalizedEmail)

  useEffect(() => {
    let alive = true
    void getOAuthAvailability().then((value) => {
      if (alive) setProviders(value)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  // Invite context: show whose invitation this is, in the club's colour.
  useEffect(() => {
    if (!inviteCode) return
    let alive = true
    void setPendingInvite(inviteCode)
    api<PublicInvitePayload>(`/public/invites/${encodeURIComponent(inviteCode)}`)
      .then((payload) => {
        if (alive) setInvite(payload)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [inviteCode])

  async function sendCode() {
    if (!emailValid || busy || verifyingRef.current || stage !== 'email') return
    verifyingRef.current = true
    setBusy(true)
    setError(null)
    try {
      await startOtp(normalizedEmail, 'signin', 'email')
      setStage('code')
      setCode('')
      setCooldown(RESEND_COOLDOWN_S)
    } catch (err) {
      setError(t(sendCodeErrorKey(err)))
    } finally {
      verifyingRef.current = false
      setBusy(false)
    }
  }

  async function oauth(provider: OAuthProvider) {
    if (busy || verifyingRef.current) return
    verifyingRef.current = true
    setBusy(true)
    setOauthNote(null)
    try {
      if (intent) await setOnboardingIntent(intent)
      const result = await signInWithOAuth(provider)
      if (result.kind === 'link_required') {
        setLinkTicket(result.ticket)
        setEmail(result.email)
        setCode('')
        setError(null)
        setStage('code')
        setCooldown(RESEND_COOLDOWN_S)
        return
      }
      await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
      router.replace('/')
    } catch (err) {
      if (err instanceof OAuthCancelledError) return
      if (err instanceof OAuthNotAvailableYetError) {
        setOauthNote(socialCopy.unavailable)
        return
      }
      setOauthNote(socialCopy.failed)
    } finally {
      verifyingRef.current = false
      setBusy(false)
    }
  }

  async function verify(submitted: string = code) {
    if (stage !== 'code' || submitted.length < CODE_LENGTH || verifyingRef.current) return
    verifyingRef.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (intent) await setOnboardingIntent(intent)
      if (linkTicket) await completeOAuthLink(linkTicket, submitted)
      else await verifyOtp(submitted, normalizedEmail)
      // Load /me before leaving so index.tsx routes on the real account
      // instead of flashing the signed-out welcome for a frame.
      await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
      router.replace('/')
    } catch (err) {
      if (linkTicket && mustRestartOAuthLink(err)) {
        requireFreshSignIn()
        return
      }
      // Wrong code: clear the cells and put the caret back, so the next try
      // is just typing again.
      // M1: wrong code, burned code (ask for a new one now), hourly cap (the
      // real wait), rate limit and no connection each say what to do.
      const copy = verifyCodeError(err)
      setCode('')
      setError(t(copy.key, copy.values))
      if (copy.resendNow) setCooldown(0)
      setRefocusKey((k) => k + 1)
    } finally {
      verifyingRef.current = false
      setBusy(false)
    }
  }

  async function resend() {
    if (stage !== 'code' || cooldown > 0 || busy || verifyingRef.current) return
    verifyingRef.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (linkTicket) await resendOAuthLink(linkTicket)
      else await startOtp(normalizedEmail, 'signin', 'email')
      setCooldown(RESEND_COOLDOWN_S)
      setCode('')
      setNotice(t('onboardingFlow.code.resent'))
      setRefocusKey((k) => k + 1)
    } catch (err) {
      if (linkTicket && mustRestartOAuthLink(err)) {
        requireFreshSignIn()
        return
      }
      setError(t(sendCodeErrorKey(err)))
    } finally {
      verifyingRef.current = false
      setBusy(false)
    }
  }

  function requireFreshSignIn() {
    setLinkTicket(null)
    setCode('')
    setCooldown(0)
    setError(null)
    setNotice(null)
    setStage('restart')
  }

  function restartSignIn() {
    if (verifyingRef.current) return
    setLinkTicket(null)
    setCode('')
    setError(null)
    setNotice(null)
    setOauthNote(null)
    setCooldown(0)
    setStage('email')
  }

  function changeEmail() {
    if (verifyingRef.current) return
    setLinkTicket(null)
    if (cameFromWelcome) {
      goBackOrReplace(router, inviteCode ? `/join/${inviteCode}` : '/(auth)/welcome')
      return
    }
    setStage('email')
    setCode('')
    setError(null)
    setNotice(null)
    setTimeout(() => emailRef.current?.focus(), 50)
  }

  function back() {
    if (verifyingRef.current) return
    if (stage === 'restart') {
      restartSignIn()
      return
    }
    if (stage === 'code') {
      changeEmail()
      return
    }
    goBackOrReplace(router, inviteCode ? `/join/${inviteCode}` : '/(auth)/welcome')
  }

  // Progress follows the traced path (steps.ts): the email step belongs to
  // screen 1 (welcome or the invite), the code is always screen 2.
  const progress = inviteCode
    ? onboardingProgress('invite', stage === 'email' ? 'invitePreview' : 'code')
    : onboardingProgress(pathForIntent(intent), stage === 'email' ? 'welcome' : 'code')

  const lead = invite ? (
    <View style={styles.inviteLead}>
      <ClubCrest club={invite.club} size={48} />
      <View style={styles.inviteCopy}>
        <Text variant="footnote" color="secondary">
          {t('onboardingFlow.code.invitedBy')}
        </Text>
        <Text variant="headline" weight="semibold" numberOfLines={2}>
          {invite.club.name}
        </Text>
      </View>
    </View>
  ) : null

  const legal = (
    <Text variant="caption1" weight="regular" color="secondary" align="center" style={styles.legal}>
      {t('onboardingFlow.code.legalPrefix')}
      <Text
        variant="caption1"
        weight="bold"
        color="secondary"
        accessibilityRole="link"
        onPress={() => setPolicy('terms')}
      >
        {t('onboardingFlow.code.legalTerms')}
      </Text>
      {t('onboardingFlow.code.legalAnd')}
      <Text
        variant="caption1"
        weight="bold"
        color="secondary"
        accessibilityRole="link"
        onPress={() => setPolicy('privacy')}
      >
        {t('onboardingFlow.code.legalPrivacy')}
      </Text>
      {t('onboardingFlow.code.legalSuffix')}
    </Text>
  )

  const content =
    stage === 'restart' ? (
      <OnboardingScreen
        title={socialCopy.restartTitle}
        subtitle={socialCopy.restartBody}
        onBack={back}
        lead={lead}
        progress={null}
        primary={{
          label: socialCopy.restartCta,
          onPress: restartSignIn,
          testID: 'sign-in-restart',
        }}
        testID="sign-in-recovery"
      />
    ) : stage === 'email' ? (
      <OnboardingScreen
        title={
          returning && !invite
            ? t('onboardingFlow.code.signInTitle')
            : t('onboardingFlow.code.emailTitle')
        }
        subtitle={
          invite
            ? t('onboardingFlow.code.inviteEmailSubtitle', { club: invite.club.name })
            : returning
              ? t('onboardingFlow.code.signInSubtitle')
              : t('onboardingFlow.code.emailSubtitle')
        }
        progress={inviteCode ? progress : null}
        onBack={back}
        lead={lead}
        pageFooter={legal}
        testID="sign-in-email"
      >
        <OnboardingTextField
          ref={emailRef}
          label={t('onboardingFlow.code.emailLabel')}
          required
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
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => void sendCode()}
          error={error}
          testID="sign-in-email-input"
        />
        <Button
          label={t('onboardingFlow.code.sendCta')}
          onPress={() => void sendCode()}
          disabled={!emailValid}
          loading={busy}
          size="auth"
          fullWidth
          style={styles.sendButton}
          testID="sign-in-send"
        />
        {!inviteCode && (providers.apple || providers.google) ? (
          <>
            <OrDivider label={t('onboardingFlow.code.or')} />
            <View style={styles.providers}>
              {providers.apple ? (
                <AppleSignInButton onPress={() => void oauth('apple')} disabled={busy} />
              ) : null}
              {providers.google ? (
                <GoogleSignInButton
                  label={t('onboardingFlow.code.google')}
                  onPress={() => void oauth('google')}
                  disabled={busy}
                />
              ) : null}
              {oauthNote ? (
                <Text
                  variant="footnote"
                  color="secondary"
                  align="center"
                  accessibilityLiveRegion="polite"
                  testID="sign-in-oauth-soon"
                >
                  {oauthNote}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
      </OnboardingScreen>
    ) : (
      <OnboardingScreen
        title={t('onboardingFlow.code.title')}
        subtitle={t('onboardingFlow.code.subtitle', { email: normalizedEmail })}
        progress={progress}
        onBack={back}
        lead={lead}
        primary={{
          label: t('onboardingFlow.code.verifyCta'),
          onPress: () => void verify(),
          disabled: code.length < CODE_LENGTH,
          loading: busy,
          testID: 'sign-in-verify',
        }}
        testID="sign-in-code"
      >
        {linkTicket ? (
          <Text variant="footnote" color="secondary">
            {socialCopy.link}
          </Text>
        ) : null}
        <OtpCellInput
          value={code}
          onChange={(next) => {
            setCode(next)
            if (error) setError(null)
          }}
          onComplete={(full) => void verify(full)}
          hasError={!!error}
          refocusKey={refocusKey}
          accessibilityLabel={t('onboardingFlow.code.otpA11y')}
        />
        {error ? (
          <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : notice ? (
          <Text variant="footnote" color="success" align="center" accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
        <View style={styles.codeActions}>
          <Pressable
            onPress={changeEmail}
            disabled={busy}
            accessibilityState={{ disabled: busy }}
            accessibilityRole="button"
            accessibilityLabel={t('onboardingFlow.code.changeEmail')}
            hitSlop={4}
            style={styles.codeAction}
            testID="sign-in-change-email"
          >
            <Text variant="subheadline" weight="semibold" color="tint">
              {t('onboardingFlow.code.changeEmail')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void resend()}
            disabled={cooldown > 0 || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: cooldown > 0 || busy }}
            hitSlop={4}
            style={styles.codeAction}
            testID="sign-in-resend"
          >
            <Text
              variant="subheadline"
              weight={cooldown > 0 ? 'regular' : 'semibold'}
              color={cooldown > 0 ? 'secondary' : 'tint'}
              tabular
            >
              {cooldown > 0
                ? t('onboardingFlow.code.resendIn', { seconds: cooldown })
                : t('onboardingFlow.code.resend')}
            </Text>
          </Pressable>
        </View>
        <Text variant="caption1" color="secondary">
          {t('onboardingFlow.code.spamHint')}
        </Text>
      </OnboardingScreen>
    )

  return (
    <ClubThemeOverride club={invite?.club ?? null}>
      {content}
      <PolicyOverlay
        visible={policy !== null}
        kind={policy ?? 'terms'}
        onClose={() => setPolicy(null)}
      />
    </ClubThemeOverride>
  )
}

/** "oder" between the email and the provider buttons. */
function OrDivider({ label }: { label: string }) {
  const c = useClubColors()
  return (
    <View
      style={styles.or}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.orLine, { backgroundColor: c.borderDefault }]} />
      <Text variant="footnote" color="secondary">
        {label}
      </Text>
      <View style={[styles.orLine, { backgroundColor: c.borderDefault }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  or: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4, marginTop: space.md - 2 },
  orLine: { flex: 1, height: 1 },
  providers: { gap: space.sm + 2, marginTop: space.md - 2 },
  inviteLead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  inviteCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: space.md,
  },
  codeAction: { minHeight: 44, justifyContent: 'center' },
  // Design: 28 between field, button and the rest (the body gap is 14).
  sendButton: { marginTop: space.md - 2 },
  legal: { lineHeight: 18 },
})
