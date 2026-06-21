import { SPACING_XS } from '../../src/theme/spacing';
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
import { api, ApiError } from '../../src/api/client'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

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
        const r = await api<TeamByCodeResponse>(`/teams/by-code/${code}`)
        if (!cancelled) {
          setTeam({
            teamId: r.team.id,
            clubId: r.team.clubId,
            teamName: r.team.displayName || r.team.name,
            clubName: r.club.name,
          })
        }
      } catch (e) {
        if (cancelled) return
        if (__DEV__) {
          setTeam({
            teamId: `dev-team-${code}`,
            clubId: `dev-club-${code}`,
            teamName: `Dev team (${code})`,
            clubName: 'Dev FC',
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
    update({
      teamId: team.teamId,
      clubId: team.clubId,
      clubName: team.clubName,
      teamJoinCode: code.trim().toUpperCase(),
    })
    // Coaches don't claim a player slot — role is finalised server-side.
    // Parents skip claim too — the parent → child linking flow isn't
    // built yet, and showing a "coming soon" placeholder mid-wizard
    // tanks first-impression. Coach-side adds the kid post-onboarding.
    if (
      state.role === RegistrationRole.COACH ||
      state.role === RegistrationRole.PARENT
    ) {
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
  club: { fontFamily: fonts.heading, fontSize: fontSize.lg, fontWeight: '700' },
  team: { fontFamily: fonts.body, fontSize: fontSize.md, marginTop: SPACING_XS },
  searchLink: {
    alignSelf: 'center',
    marginTop: space.xl,
    paddingVertical: space.sm,
  },
  searchLinkText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})
