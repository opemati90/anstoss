import { useEffect, useRef, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { PublicInvitePayload } from '@anstoss/shared'
import { api } from '../../src/api/client'
import { setPendingInvite } from '../../src/auth/pendingInvite'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { OtpCellInput } from '../../src/components/wizard/OtpCellInput'
import { Button, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride } from '../../src/context/ClubThemeContext'
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
  const { t } = useTranslation()
  const params = useLocalSearchParams<{
    email?: string
    sent?: string
    inviteCode?: string
    intent?: string
  }>()
  const initialEmail = first(params.email) ?? ''
  const inviteCode = first(params.inviteCode)
  const intent = parseOnboardingIntent(first(params.intent))
  const cameFromWelcome = first(params.sent) === '1' && !!initialEmail
  const { startOtp, verifyOtp } = useOnboardingAuth()
  const { refreshUser } = useAuth()

  const [stage, setStage] = useState<'email' | 'code'>(cameFromWelcome ? 'code' : 'email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(cameFromWelcome ? RESEND_COOLDOWN_S : 0)
  const [refocusKey, setRefocusKey] = useState(0)
  const [invite, setInvite] = useState<PublicInvitePayload | null>(null)
  const verifyingRef = useRef(false)
  const emailRef = useRef<TextInput>(null)

  const normalizedEmail = email.trim().toLowerCase()
  const emailValid = EMAIL_RE.test(normalizedEmail)

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
    if (!emailValid || busy) return
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
      setBusy(false)
    }
  }

  async function verify(submitted: string = code) {
    if (submitted.length < CODE_LENGTH || verifyingRef.current) return
    verifyingRef.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (intent) await setOnboardingIntent(intent)
      await verifyOtp(submitted, normalizedEmail)
      // Load /me before leaving so index.tsx routes on the real account
      // instead of flashing the signed-out welcome for a frame.
      await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
      router.replace('/')
    } catch (err) {
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
    if (cooldown > 0 || busy) return
    setError(null)
    try {
      await startOtp(normalizedEmail, 'signin', 'email')
      setCooldown(RESEND_COOLDOWN_S)
      setCode('')
      setNotice(t('onboardingFlow.code.resent'))
      setRefocusKey((k) => k + 1)
    } catch (err) {
      setError(t(sendCodeErrorKey(err)))
    }
  }

  function changeEmail() {
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

  const content =
    stage === 'email' ? (
      <OnboardingScreen
        title={t('onboardingFlow.code.emailTitle')}
        subtitle={
          invite
            ? t('onboardingFlow.code.inviteEmailSubtitle', { club: invite.club.name })
            : t('onboardingFlow.code.emailSubtitle')
        }
        progress={progress}
        onBack={back}
        lead={lead}
        primary={{
          label: t('onboardingFlow.code.sendCta'),
          onPress: () => void sendCode(),
          disabled: !emailValid,
          loading: busy,
          testID: 'sign-in-send',
        }}
        testID="sign-in-email"
      >
        <OnboardingTextField
          ref={emailRef}
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
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => void sendCode()}
          error={error}
          testID="sign-in-email-input"
        />
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
        secondary={{
          label: t('onboardingFlow.code.changeEmail'),
          onPress: changeEmail,
          testID: 'sign-in-change-email',
        }}
        testID="sign-in-code"
      >
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
        <Button
          label={
            cooldown > 0
              ? t('onboardingFlow.code.resendIn', { seconds: cooldown })
              : t('onboardingFlow.code.resend')
          }
          variant="plain"
          size="sm"
          disabled={cooldown > 0}
          onPress={() => void resend()}
          testID="sign-in-resend"
        />
        <Text variant="footnote" color="tertiary" align="center">
          {t('onboardingFlow.code.spamHint')}
        </Text>
      </OnboardingScreen>
    )

  return <ClubThemeOverride club={invite?.club ?? null}>{content}</ClubThemeOverride>
}

const styles = StyleSheet.create({
  inviteLead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  inviteCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
})
