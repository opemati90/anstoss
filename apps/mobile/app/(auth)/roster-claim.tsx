import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { RosterRow } from '../../src/components/wizard/RosterRow'
import { EmptyState } from '../../src/components/EmptyState'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api, ApiError } from '../../src/api/client'
import { fontSize, fonts, space } from '../../src/theme/tokens'

type Slot = {
  id: string
  fullName: string
  position?: string
  claimedByUserId: string | null
}

export default function RosterClaim() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state } = useOnboardingFlow()
  const [slots, setSlots] = useState<Slot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!state.clubId || !state.teamId) return
    try {
      const r = await api<Slot[]>(`/clubs/${state.clubId}/teams/${state.teamId}/roster-slots`)
      setSlots(r)
    } catch (_e) {
      // Surface an empty list — the screen will show its empty/error state.
      // Mock player data has been removed; never ship fake names to users.
      setSlots([])
    }
  }, [state.clubId, state.teamId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function claim(slotId: string) {
    if (!state.clubId || !state.teamId || busy) return
    setBusy(true)
    setError(null)
    try {
      await api(
        `/clubs/${state.clubId}/teams/${state.teamId}/roster-slots/${slotId}/claim`,
        { method: 'POST' },
      )
      router.push('/(auth)/done')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(t('onboarding.rosterClaim.alreadyClaimed'))
        await refresh()
      } else {
        setError(t('onboarding.rosterClaim.alreadyClaimed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const title =
    state.role === 'COACH'
      ? t('onboarding.rosterClaim.titleCoach')
      : state.role === 'PARENT'
        ? t('onboarding.rosterClaim.titleParent')
        : t('onboarding.rosterClaim.titlePlayer')

  if (state.role === 'PARENT') {
    return (
      <WizardStep
        title={title}
        ctaLabel={t('onboarding.rosterClaim.parentSkip')}
        onCta={() => router.push('/(auth)/done')}
      >
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {t('onboarding.rosterClaim.parentNote')}
        </Text>
      </WizardStep>
    )
  }

  // Coach hasn't pre-built the roster yet — surface a clear next step
  // (skip to Done, the player can join once the coach adds them) instead
  // of a blank screen.
  if (slots.length === 0) {
    return (
      <WizardStep
        title={title}
        ctaLabel={t('onboarding.rosterClaim.skipCta', { defaultValue: 'Continue' })}
        onCta={() => router.push('/(auth)/done')}
      >
        <View style={styles.empty}>
          <EmptyState
            icon="person.2.fill"
            title={t('onboarding.rosterClaim.emptyTitle', {
              defaultValue: 'Your coach hasn’t added you yet',
            })}
            description={t('onboarding.rosterClaim.emptyBody', {
              defaultValue:
                'No worries — finish setup and your coach will add you to the squad. You’ll get a notification when they do.',
            })}
          />
        </View>
      </WizardStep>
    )
  }

  return (
    <WizardStep title={title}>
      {error ? (
        <Text style={[styles.err, { color: colors.error }]}>{error}</Text>
      ) : null}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View>
          {slots.map((s) => (
            <RosterRow
              key={s.id}
              name={s.fullName}
              position={s.position}
              claimed={!!s.claimedByUserId}
              onPress={() => claim(s.id)}
            />
          ))}
        </View>
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  err: {
    textAlign: 'center',
    marginBottom: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  empty: {
    paddingTop: space.xl,
  },
  note: {
    textAlign: 'center',
    marginTop: space.lg,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
})
