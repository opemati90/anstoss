import { SPACING_XS } from '../../src/theme/spacing';
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { TEAM_CODE_LENGTH, TeamCodeInput } from '../../src/components/wizard/TeamCodeInput'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api, ApiError } from '../../src/api/client'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

type TeamLookup = {
  id: string
  clubId: string
  name: string
  club: { id: string; name: string }
}

export default function TeamCode() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, update } = useOnboardingFlow()
  const [code, setCode] = useState('')
  const [team, setTeam] = useState<TeamLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (code.length !== TEAM_CODE_LENGTH) {
      setTeam(null)
      setError(null)
      return
    }
    let cancelled = false
    async function lookup() {
      setLoading(true)
      setError(null)
      try {
        const r = await api<TeamLookup>(`/teams/by-code/${code}`)
        if (!cancelled) setTeam(r)
      } catch (e) {
        if (cancelled) return
        if (__DEV__) {
          setTeam({
            id: `dev-team-${code}`,
            clubId: `dev-club-${code}`,
            name: `Dev team (${code})`,
            club: { id: `dev-club-${code}`, name: 'Dev FC' },
          })
          return
        }
        if (e instanceof ApiError && e.status === 404) {
          setError(t('onboarding.teamCode.invalid'))
        } else {
          setError(t('onboarding.teamCode.invalid'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    lookup()
    return () => {
      cancelled = true
    }
  }, [code])

  function handleConfirm() {
    if (!team) return
    update({ teamId: team.id, clubId: team.clubId, clubName: team.club.name })
    // Coaches don't claim a player slot — their role is implied by the wizard
    // branch and finalised server-side. Players and parents pick from the
    // pre-built roster (their own name / their kid's).
    if (state.role === RegistrationRole.COACH) {
      router.push('/(auth)/done')
      return
    }
    router.push('/(auth)/roster-claim')
  }

  return (
    <WizardStep
      title={t('onboarding.teamCode.title')}
      hint={t('onboarding.teamCode.hint')}
      ctaLabel={team ? t('onboarding.rosterClaim.cta') : t('onboarding.teamCode.cta')}
      onCta={handleConfirm}
      ctaDisabled={!team || loading}
    >
      <TeamCodeInput value={code} onChange={setCode} />
      {error ? (
        <Text style={[styles.msg, { color: colors.error }]}>{error}</Text>
      ) : null}
      {team ? (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.club, { color: colors.textPrimary }]}>{team.club.name}</Text>
          <Text style={[styles.team, { color: colors.textSecondary }]}>{team.name}</Text>
        </View>
      ) : null}
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  msg: {
    textAlign: 'center',
    marginTop: space.lg,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  card: {
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  club: { fontFamily: fonts.heading, fontSize: fontSize.lg, fontWeight: '700' },
  team: { fontFamily: fonts.body, fontSize: fontSize.md, marginTop: SPACING_XS },
})
