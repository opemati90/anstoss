import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { TEAM_CODE_LENGTH, TeamCodeInput } from '../../src/components/wizard/TeamCodeInput'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { fontSize, fontWeight, fonts, radius, space } from '../../src/theme/tokens'

type TeamLookup = {
  teamId: string
  clubId: string
  teamName: string
  clubName: string
}

// GET /teams/by-code/:code returns a NESTED shape — { team, club } — not flat.
type TeamByCodeResponse = {
  team: { id: string; name: string; displayName: string | null; clubId: string }
  club: { id: string; name: string }
}

export default function TeamCode() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, update, markStep } = useOnboardingFlow()
  const [code, setCode] = useState('')
  const [team, setTeam] = useState<TeamLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => markStep('/(auth)/team-code'), [markStep])

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
      setTeam(null)
      try {
        const r = await api<TeamByCodeResponse>(`/teams/by-code/${code}`)
        if (!cancelled) {
          setTeam({
            teamId: r.team.id,
            clubId: r.team.clubId,
            teamName: r.team.displayName || r.team.name,
            clubName: r.club.name,
          })
        }
      } catch {
        if (cancelled) return
        setError(t('onboarding.teamCode.invalid', { defaultValue: 'No team uses that code.' }))
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
    update({
      teamId: team.teamId,
      clubId: team.clubId,
      clubName: team.clubName,
      teamJoinCode: code.trim().toUpperCase(),
    })
    // Shared team codes create an approval request; they never grant roster
    // access. Identity-bound invitations activate members separately.
    router.push('/(auth)/done')
  }

  return (
    <WizardStep
      title={t('onboarding.teamCode.title', { defaultValue: 'Enter your team code' })}
      hint={t('onboarding.teamCode.hint', { defaultValue: 'Ask your admin or coach.' })}
      ctaLabel={
        team
          ? t('onboarding.rosterClaim.cta', { defaultValue: 'Confirm team' })
          : t('onboarding.teamCode.cta', { defaultValue: 'Find team' })
      }
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
          <Text style={[styles.club, { color: colors.textPrimary }]}>{team.clubName}</Text>
          <Text style={[styles.team, { color: colors.textSecondary }]}>{team.teamName}</Text>
        </View>
      ) : null}

      {/* Players without a coach-issued code can search for the club and
          send a join request. Hidden for coaches (they always have a code
          via roster-build) to keep their flow uncluttered. */}
      {state.role !== RegistrationRole.COACH ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/(auth)/club-search')}
          style={styles.searchLink}
          hitSlop={8}
        >
          <Text style={[styles.searchLinkText, { color: colors.primary }]}>
            {t('onboarding.teamCode.searchLink', {
              defaultValue: "Don't have a code? Find your club",
            })}
          </Text>
        </Pressable>
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
  club: { fontFamily: fonts.heading, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  team: { fontFamily: fonts.body, fontSize: fontSize.md, marginTop: space.xs },
  searchLink: {
    alignSelf: 'center',
    marginTop: space.xl,
    paddingVertical: space.sm,
  },
  searchLinkText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textDecorationLine: 'underline',
  },
})
