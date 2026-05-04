import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

type PendingClaim = {
  slotId: string
  fullName: string
  position: string | null
  jerseyNumber: number | null
  team: { id: string; name: string }
  club: { id: string; name: string; primaryColor: string | null; badgeUrl: string | null }
}

export default function AutoClaim() {
  const router = useRouter()
  const { t } = useTranslation()
  const c = useClubColors()
  const { finalizeSession } = useOnboardingAuth()
  const { reset } = useOnboardingFlow()
  const [claims, setClaims] = useState<PendingClaim[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api<PendingClaim[]>('/onboarding/pending-claims')
      .then((data) => setClaims(data ?? []))
      .catch(() => setClaims([]))
  }, [])

  async function confirmAll() {
    if (submitting || claims.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      for (const claim of claims) {
        await api(`/onboarding/claim/${claim.slotId}`, { method: 'POST' })
      }
      await finalizeSession()
      reset()
      router.replace('/')
    } catch {
      setError(
        t('onboarding.autoClaim.error', {
          defaultValue: 'Could not finish setup. Please try again.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  function rejectAndContinue() {
    router.push('/(auth)/about')
  }

  if (claims.length === 0) return null

  const primary = claims[0]
  const firstName = primary.fullName.split(/\s+/)[0]
  const positionLabel = primary.position
    ? t(`position.${primary.position}`, { defaultValue: primary.position })
    : null

  return (
    <WizardStep
      title={t('onboarding.autoClaim.title', {
        defaultValue: 'Hi {{name}}!',
        name: firstName,
      })}
      hint={t('onboarding.autoClaim.hint', {
        defaultValue:
          'Your coach has set you up. Confirm this is you to finish — no more questions.',
      })}
      ctaLabel={t('onboarding.autoClaim.confirm', { defaultValue: 'Yes, that’s me' })}
      onCta={confirmAll}
      ctaLoading={submitting}
      ctaDisabled={submitting}
    >
      <View style={[styles.card, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
        <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.eyebrow}>
          {primary.club.name.toUpperCase()}
        </Text>
        <Text variant="title2" weight="bold" color="primary" numberOfLines={2}>
          {primary.fullName}
        </Text>
        <View style={styles.metaRow}>
          <Text variant="footnote" color="secondary">
            {primary.team.name}
          </Text>
          {positionLabel ? (
            <>
              <Text variant="footnote" color="tertiary">
                {' · '}
              </Text>
              <Text variant="footnote" color="secondary">
                {positionLabel}
              </Text>
            </>
          ) : null}
          {primary.jerseyNumber != null ? (
            <>
              <Text variant="footnote" color="tertiary">
                {' · '}
              </Text>
              <Text variant="footnote" color="secondary">
                {t('onboarding.autoClaim.jersey', {
                  defaultValue: '#{{n}}',
                  n: primary.jerseyNumber,
                })}
              </Text>
            </>
          ) : null}
        </View>
        {claims.length > 1 ? (
          <Text variant="footnote" color="tertiary" style={styles.extra}>
            {t('onboarding.autoClaim.more', {
              defaultValue: '+{{n}} more team(s) waiting for you.',
              n: claims.length - 1,
            })}
          </Text>
        ) : null}
      </View>

      {error ? (
        <Text variant="footnote" style={[styles.error, { color: c.error }]}>
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={rejectAndContinue}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.autoClaim.notMe', { defaultValue: 'That’s not me' })}
        style={styles.notMe}
        hitSlop={12}
      >
        <Text style={[styles.notMeText, { color: c.textSecondary }]}>
          {t('onboarding.autoClaim.notMe', { defaultValue: 'That’s not me' })}
        </Text>
      </Pressable>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.xs,
  },
  eyebrow: { letterSpacing: 1.4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: space['2xs'],
  },
  extra: { marginTop: space.sm },
  error: {
    marginTop: space.md,
    textAlign: 'center',
  },
  notMe: {
    marginTop: space.lg,
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  notMeText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
})
