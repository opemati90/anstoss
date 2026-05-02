import { useEffect, useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { OtpCellInput } from '../../src/components/wizard/OtpCellInput'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, space } from '../../src/theme/tokens'
import { api } from '../../src/api/client'

type PendingClaim = {
  slotId: string
  fullName: string
  position: string | null
  jerseyNumber: number | null
  team: { id: string; name: string }
  club: { id: string; name: string; primaryColor: string | null; badgeUrl: string | null }
}

const RESEND_COOLDOWN_S = 30

export default function Code() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { verifyPhoneOtp, startPhoneOtp, finalizeSession } = useOnboardingAuth()
  const { state, reset } = useOnboardingFlow()
  const params = useLocalSearchParams<{ mode?: string }>()
  const mode = params.mode === 'signin' ? 'signin' : 'signup'
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await verifyPhoneOtp(code)
      if (mode === 'signin') {
        await finalizeSession()
        reset()
        router.replace('/')
        return
      }
      // Branch: if the phone matches a roster slot pre-created by an admin,
      // skip name/dob/role and go straight to claim confirmation. The Clerk
      // session isn't yet active here, so 401 means "no claims, continue".
      // Auth-expiry alert is globally suspended for the auth stack.
      let claims: PendingClaim[] = []
      try {
        claims = (await api<PendingClaim[]>('/onboarding/pending-claims')) ?? []
      } catch {
        claims = []
      }
      if (claims.length > 0) {
        router.push('/(auth)/auto-claim')
        return
      }
      router.push('/(auth)/name')
    } catch {
      setError(t('onboarding.code.wrong'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !state.phone) return
    await startPhoneOtp(state.phone, mode)
    setCooldown(RESEND_COOLDOWN_S)
  }

  return (
    <WizardStep
      stepLabel={t('onboarding.stepOf', { defaultValue: 'Step {{n}} of {{total}}', n: 2, total: 6 })}
      title={t('onboarding.code.title')}
      hint={t('onboarding.code.hint', { phone: state.phone ?? '' })}
      ctaLabel={t('onboarding.code.cta')}
      onCta={handleSubmit}
      ctaDisabled={submitting || code.length < 6}
      ctaLoading={submitting}
      progress={2 / 6}
    >
      <OtpCellInput
        value={code}
        onChange={(v) => {
          setCode(v)
          setError(null)
        }}
      />
      {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
      <Pressable
        accessibilityRole="button"
        onPress={handleResend}
        disabled={cooldown > 0}
        style={styles.resend}
      >
        <Text
          style={[
            styles.resendText,
            { color: cooldown > 0 ? colors.textSecondary : colors.primary },
          ]}
        >
          {cooldown > 0
            ? t('onboarding.code.resendIn', { seconds: cooldown })
            : t('onboarding.code.resend')}
        </Text>
      </Pressable>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  error: { marginTop: space.md, textAlign: 'center', fontFamily: fonts.body, fontSize: fontSize.sm },
  resend: { marginTop: space.lg, alignItems: 'center' },
  resendText: { fontFamily: fonts.body, fontSize: fontSize.sm, fontWeight: '600' },
})
