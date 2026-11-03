import { useState } from 'react'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { AdultLaunchScreen } from '../../src/onboarding/AdultLaunchScreen'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { DateOfBirthInput, validateDob, type DobParts } from '../../src/onboarding/DateOfBirthInput'
import { apiErrorCode } from '../../src/onboarding/errors'
import { useOnboardingIntent } from '../../src/onboarding/intent'
import { needsDateOfBirth, needsDisplayName } from '../../src/onboarding/routing'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { onboardingProgress, pathForIntent } from '../../src/onboarding/steps'
import { HeaderTextButton, OnboardingScreen, OnboardingTextField } from '../../src/onboarding/ui'
import { GuardianHandoffScreen, Under13Screen } from '../../src/onboarding/UnderageScreens'

const MIN_DIRECT_ACCOUNT_AGE = 13
const MIN_AGE = 16

type Stage =
  | { kind: 'form' }
  | { kind: 'adult-launch' }
  | { kind: 'under13' }
  | { kind: 'handoff'; dob: string }

/**
 * "Wie heißt du?" — screen 3 for everyone who signs up: the name and the date
 * of birth, together, asked once. The birth date decides the path on the spot
 * (same rules as the invite screen and the server):
 *  - under 13: no own account; a parent adds the child;
 *  - 13-15: a parent's email, the parent sets the child up;
 *  - 16+: on to Verein finden, the free-agent profile or "Kind hinzufügen".
 */
export default function NameScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { user, refreshUser, signOut } = useAuth()
  const intent = useOnboardingIntent()
  const onExpired = useSessionExpiryHandler()
  const askDob = needsDateOfBirth(user)
  const [name, setName] = useState(() => (user && !needsDisplayName(user) ? user.name : ''))
  const [dob, setDob] = useState<DobParts>({ day: '', month: '', year: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: 'form' })

  const trimmed = name.trim().replace(/\s+/g, ' ')
  const dobCheck = validateDob(dob)
  const nameValid = trimmed.length >= 2
  const valid = nameValid && (!askDob || dobCheck.status === 'valid')

  function finishSignedOut() {
    void signOut().catch(() => undefined)
    router.replace('/(auth)/welcome')
  }

  async function submit() {
    if (!valid || saving) return
    if (!LAUNCH_FEATURES.youthParticipation && askDob && dobCheck.status === 'valid' && dobCheck.age < LAUNCH_FEATURES.minimumAccountAge) {
      setStage({ kind: 'adult-launch' })
      return
    }
    // 13-15: straight to the parent handoff, nothing is stored on this account.
    if (
      askDob &&
      dobCheck.status === 'valid' &&
      dobCheck.age >= MIN_DIRECT_ACCOUNT_AGE &&
      dobCheck.age < MIN_AGE
    ) {
      setStage({ kind: 'handoff', dob: dobCheck.iso })
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Under 13 still goes to the server: it removes the account and blocks
      // the address, then answers UNDER_13.
      await api('/me', {
        method: 'PATCH',
        body: {
          name: trimmed,
          ...(askDob && dobCheck.status === 'valid' ? { dateOfBirth: dobCheck.iso } : {}),
        },
      })
      await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
      // index.tsx knows the next screen (Verein finden, the free-agent
      // profile or "Kind hinzufügen", from the intent picked on welcome).
      router.replace('/')
    } catch (err) {
      const code = apiErrorCode(err)
      if (!LAUNCH_FEATURES.youthParticipation && (code === 'LAUNCH_ADULT_ONLY' || code === 'UNDER_13' || code === 'UNDER_16_HANDOFF')) setStage({ kind: 'adult-launch' })
      else if (code === 'UNDER_13') setStage({ kind: 'under13' })
      else if (code === 'UNDER_16_HANDOFF' && dobCheck.status === 'valid') {
        setStage({ kind: 'handoff', dob: dobCheck.iso })
      } else if (!onExpired(err)) setError(t('onboardingFlow.common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (stage.kind === 'under13') return <Under13Screen onDone={finishSignedOut} />
  if (stage.kind === 'adult-launch') return <AdultLaunchScreen onDone={finishSignedOut} onBack={() => setStage({ kind: 'form' })} />
  if (stage.kind === 'handoff') {
    return (
      <GuardianHandoffScreen
        childName={trimmed}
        childDateOfBirth={stage.dob}
        childEmail={user?.email}
        onBack={() => setStage({ kind: 'form' })}
        onFinished={finishSignedOut}
      />
    )
  }

  const dobError =
    askDob && dobCheck.status === 'invalid'
      ? t('onboardingFlow.dob.invalid')
      : askDob && dobCheck.status === 'future'
        ? t('onboardingFlow.dob.future')
        : null

  return (
    <OnboardingScreen
      title={t('onboardingFlow.name.title')}
      subtitle={askDob ? t('onboardingFlow.name.subtitleWithDob') : t('onboardingFlow.name.subtitle')}
      progress={onboardingProgress(pathForIntent(intent), 'profile')}
      onBack={null}
      headerRight={
        <HeaderTextButton label={t('onboardingFlow.common.signOut')} onPress={finishSignedOut} />
      }
      primary={{
        label: t('onboardingFlow.common.continue'),
        onPress: () => void submit(),
        disabled: !valid,
        loading: saving,
        testID: 'name-continue',
      }}
      testID="onboarding-name"
    >
      <OnboardingTextField
        label={t('onboardingFlow.name.label')}
        value={name}
        onChangeText={(next) => {
          setName(next)
          if (error) setError(null)
        }}
        placeholder={t('onboardingFlow.name.placeholder')}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        autoCorrect={false}
        autoFocus
        maxLength={80}
        returnKeyType={askDob ? 'next' : 'done'}
        onSubmitEditing={askDob ? undefined : () => void submit()}
        error={error}
        testID="name-input"
      />
      {askDob ? (
        <DateOfBirthInput
          value={dob}
          onChange={(next) => {
            setDob(next)
            if (error) setError(null)
          }}
          error={dobError}
          hint={t('onboardingFlow.dob.hint')}
        />
      ) : null}
    </OnboardingScreen>
  )
}
