import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api/client'
import { Text } from '../components/ui'
import { apiErrorCode } from './errors'
import { OnboardingScreen, OnboardingTextField } from './ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type HandoffResult = { sent: boolean; code: string | null }

/**
 * Under 16 (13-15), on every path (name screen, invite): the child can't hold
 * the account. One field for a parent's email; the server emails the parent
 * a setup code, removes this account and blocks the address for 30 days.
 * From an invite, the invite code travels along so the parent only picks the
 * child's spot in that team.
 */
export function GuardianHandoffScreen({
  childName,
  childDateOfBirth,
  childEmail,
  inviteCode,
  onBack,
  onFinished,
}: {
  childName: string
  /** YYYY-MM-DD */
  childDateOfBirth: string
  childEmail?: string | null
  inviteCode?: string | null
  onBack: () => void
  /** Called on "Fertig": the account is gone, sign out and go to welcome. */
  onFinished: () => void
}) {
  const { t } = useTranslation()
  const [guardianEmail, setGuardianEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<HandoffResult | null>(null)
  const normalized = guardianEmail.trim().toLowerCase()
  const ownEmail = !!childEmail && normalized === childEmail.trim().toLowerCase()
  const valid = EMAIL_RE.test(normalized) && !ownEmail

  async function send() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await api<HandoffResult>('/me/parent-handoff', {
        method: 'POST',
        body: {
          childFirstName: childName.trim().split(/\s+/)[0] || '-',
          childDateOfBirth: new Date(`${childDateOfBirth}T00:00:00.000Z`).toISOString(),
          guardianEmail: normalized,
          ...(inviteCode ? { inviteCode } : {}),
        },
      })
      setResult(res ?? { sent: true, code: null })
    } catch (err) {
      setError(
        apiErrorCode(err) === 'GUARDIAN_IS_CHILD'
          ? t('onboardingFlow.under16.guardianIsChild')
          : err instanceof ApiError && err.status !== 0
            ? t('onboardingFlow.under16.sendFailed')
            : t('onboardingFlow.common.networkError'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const delivered = result.sent !== false
    return (
      <OnboardingScreen
        title={delivered ? t('onboardingFlow.under16.sentTitle') : t('onboardingFlow.under16.codeTitle')}
        subtitle={delivered ? t('onboardingFlow.under16.sentBody') : t('onboardingFlow.under16.codeBody')}
        onBack={null}
        primary={{ label: t('onboardingFlow.common.done'), onPress: onFinished, testID: 'handoff-done' }}
        testID="handoff-sent"
      >
        {!delivered && result.code ? (
          <Text variant="dataLarge" align="center" tabular selectable testID="handoff-code">
            {result.code}
          </Text>
        ) : null}
      </OnboardingScreen>
    )
  }

  return (
    <OnboardingScreen
      title={t('onboardingFlow.under16.title')}
      subtitle={t('onboardingFlow.under16.body')}
      onBack={onBack}
      primary={{
        label: t('onboardingFlow.under16.cta'),
        onPress: () => void send(),
        disabled: !valid,
        loading: busy,
        testID: 'handoff-send',
      }}
      footerNote={
        <Text variant="caption1" color="tertiary" align="center">
          {t('onboardingFlow.under16.footnote')}
        </Text>
      }
      testID="handoff-form"
    >
      <OnboardingTextField
        label={t('onboardingFlow.under16.guardianLabel')}
        value={guardianEmail}
        onChangeText={(next) => {
          setGuardianEmail(next)
          if (error) setError(null)
        }}
        placeholder={t('onboardingFlow.welcome.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        spellCheck={false}
        autoFocus
        returnKeyType="send"
        onSubmitEditing={() => void send()}
        error={ownEmail ? t('onboardingFlow.under16.guardianIsChild') : error}
        testID="handoff-guardian-email"
      />
    </OnboardingScreen>
  )
}

/** Under 13, on every path: no own account; a parent adds the child. */
export function Under13Screen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <OnboardingScreen
      title={t('onboardingFlow.age.under13Title')}
      subtitle={t('onboardingFlow.age.under13Body')}
      onBack={null}
      primary={{ label: t('onboardingFlow.common.done'), onPress: onDone, testID: 'under13-done' }}
      testID="under13"
    />
  )
}
