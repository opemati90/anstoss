import { useEffect, useRef, useState } from 'react'
import { LAUNCH_FEATURES } from '@anstoss/shared'
import { AdultLaunchScreen } from '../../src/onboarding/AdultLaunchScreen'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ApiError, api } from '../../src/api/client'
import { HANDOFF_CODE_LENGTH, normalizeParentHandoffCode } from '../../src/auth/parentHandoffCode'
import { Text } from '../../src/components/ui'
import { normalizeTeamCode, TEAM_CODE_LENGTH } from '../../src/components/wizard/TeamCodeInput'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride } from '../../src/context/ClubThemeContext'
import { DateOfBirthInput, validateDob, type DobParts } from '../../src/onboarding/DateOfBirthInput'
import { apiErrorCode } from '../../src/onboarding/errors'
import { clearOnboardingIntent } from '../../src/onboarding/intent'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { onboardingProgress } from '../../src/onboarding/steps'
import { ChoiceRow, ClubCrest, OnboardingScreen, OnboardingTextField } from '../../src/onboarding/ui'
import { goBackOrReplace } from '../../src/utils/navigation'
import { space } from '../../src/theme/tokens'

/** Guardians act for a child: 18+, from the date of birth on the account. */
export const GUARDIAN_MIN_AGE = 18

type TeamPreview = {
  team: { id: string; clubId: string; name: string; displayName: string | null }
  club: { id: string; name: string; badgeUrl: string | null; primaryColor: string | null }
  rosterSlots: Array<{
    id: string
    fullName: string
    position: string | null
    jerseyNumber: number | null
  }>
}

type HandoffPreview = {
  childFirstName: string
  childDateOfBirth: string
  /** Set when the child followed an invite: the team code is then optional. */
  team?: TeamPreview | null
}

/**
 * "Kind hinzufügen": the parent enters the setup code from the email about
 * their child. Reached from welcome and Verein finden ("Einrichtungscode
 * eingeben", no club needed) and from the parent's home. When the child came
 * through an invite the team is already known and the parent only picks the
 * child's spot; otherwise they add the team code from the coach.
 */
export default function ParentHandoff() {
  const router = useRouter()
  const { signOut } = useAuth()
  return LAUNCH_FEATURES.youthParticipation ? <EnabledParentHandoff /> : <AdultLaunchScreen onDone={() => {
    void signOut().then(() => router.replace('/(auth)/welcome')).catch(() => undefined)
  }} />
}

function EnabledParentHandoff() {
  const router = useRouter()
  const { t } = useTranslation()
  // The lookups below run on code changes only, not on a new `t` identity.
  const tRef = useRef(t)
  tRef.current = t
  const { user, memberships, refreshUser } = useAuth()
  const onExpired = useSessionExpiryHandler()
  const isMember = memberships.length > 0
  const [setupCode, setSetupCode] = useState('')
  const [teamCode, setTeamCode] = useState('')
  const [child, setChild] = useState<HandoffPreview | null>(null)
  const [codeTeam, setCodeTeam] = useState<TeamPreview | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [dob, setDob] = useState<DobParts>({ day: '', month: '', year: '' })
  const [codeError, setCodeError] = useState<string | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<'code' | 'team' | null>(null)
  const [busy, setBusy] = useState(false)

  // A legacy account without a DOB gives it here; everyone else gave it on
  // "Wie heißt du?".
  const needsParentDob = !user?.dateOfBirth
  const dobCheck = validateDob(dob)
  const parentTooYoung =
    (needsParentDob && dobCheck.status === 'valid' && dobCheck.age < GUARDIAN_MIN_AGE) ||
    (!needsParentDob && !!user?.dateOfBirth && ageFromIso(user.dateOfBirth) < GUARDIAN_MIN_AGE)

  const knownTeam = child?.team ?? null
  const team = codeTeam ?? knownTeam

  useEffect(() => {
    setChild(null)
    setCodeError(null)
    setSlotId(null)
    if (setupCode.length !== HANDOFF_CODE_LENGTH) return
    let alive = true
    setLoading('code')
    api<HandoffPreview>(`/parent-handoff/${setupCode}`)
      .then((res) => {
        if (!alive) return
        setChild(res)
        if (res.team?.rosterSlots.length === 1) setSlotId(res.team.rosterSlots[0].id)
      })
      .catch((err) => {
        if (!alive || onExpired(err)) return
        setCodeError(
          err instanceof ApiError && err.status === 409
            ? tRef.current('onboardingFlow.parentHandoff.codeUsed')
            : err instanceof ApiError && err.status === 403
              ? tRef.current('onboardingFlow.parentHandoff.codeOtherEmail')
              : tRef.current('onboardingFlow.parentHandoff.codeInvalid'),
        )
      })
      .finally(() => {
        if (alive) setLoading(null)
      })
    return () => {
      alive = false
    }
  }, [onExpired, setupCode])

  useEffect(() => {
    setCodeTeam(null)
    setTeamError(null)
    if (!child || teamCode.length !== TEAM_CODE_LENGTH) return
    let alive = true
    setLoading('team')
    setSlotId(null)
    api<TeamPreview>(`/parent-handoff/${setupCode}/team/${teamCode}`)
      .then((res) => {
        if (!alive) return
        setCodeTeam(res)
        if (res.rosterSlots.length === 1) setSlotId(res.rosterSlots[0].id)
      })
      .catch((err) => {
        if (alive && !onExpired(err)) {
          setTeamError(tRef.current('onboardingFlow.parentHandoff.teamInvalid'))
        }
      })
      .finally(() => {
        if (alive) setLoading(null)
      })
    return () => {
      alive = false
    }
  }, [child, onExpired, setupCode, teamCode])

  const ready =
    !!child &&
    !!team &&
    !!slotId &&
    (!needsParentDob || dobCheck.status === 'valid') &&
    !parentTooYoung &&
    !busy

  function back() {
    if (!isMember) void clearOnboardingIntent()
    goBackOrReplace(router, isMember ? '/(tabs)' : '/(auth)/club-search')
  }

  async function submit() {
    if (!ready || !team) return
    setBusy(true)
    setError(null)
    try {
      if (needsParentDob && dobCheck.status === 'valid') {
        await api('/me', { method: 'PATCH', body: { dateOfBirth: dobCheck.iso } })
      }
      await api('/parent-handoff/redeem', {
        method: 'POST',
        body: {
          code: setupCode,
          ...(codeTeam ? { teamJoinCode: teamCode } : {}),
          rosterSlotId: slotId,
        },
      })
      await clearOnboardingIntent()
      await refreshUser(undefined, { preferredClubId: team.club.id, throwOnError: true }).catch(
        () => undefined,
      )
      router.replace('/')
    } catch (err) {
      if (onExpired(err)) return
      const code = apiErrorCode(err)
      setError(
        code === 'GUARDIAN_UNDER_18'
          ? t('onboardingFlow.parentHandoff.parentTooYoung')
          : code === 'TEAM_CODE_REQUIRED'
            ? t('onboardingFlow.parentHandoff.teamCodeRequired')
            : err instanceof ApiError && err.status === 409
              ? t('onboardingFlow.parentHandoff.slotTaken')
              : err instanceof ApiError && err.status !== 0
                ? t('onboardingFlow.parentHandoff.redeemFailed')
                : t('onboardingFlow.common.networkError'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClubThemeOverride club={team?.club ?? null}>
      <OnboardingScreen
        title={t('onboardingFlow.parentHandoff.title')}
        subtitle={t('onboardingFlow.parentHandoff.subtitle')}
        progress={isMember ? null : onboardingProgress('guardian', 'parentHandoff')}
        onBack={back}
        primary={{
          label: t('onboardingFlow.parentHandoff.cta'),
          onPress: () => void submit(),
          disabled: !ready,
          loading: busy,
          testID: 'parent-handoff-submit',
        }}
        footerNote={
          error || parentTooYoung ? (
            <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
              {error ?? t('onboardingFlow.parentHandoff.parentTooYoung')}
            </Text>
          ) : undefined
        }
        testID="parent-handoff"
      >
        <OnboardingTextField
          label={t('onboardingFlow.parentHandoff.setupCodeLabel')}
          value={setupCode}
          onChangeText={(raw) => setSetupCode(normalizeParentHandoffCode(raw))}
          placeholder="AB23CD45"
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          error={codeError}
          hint={t('onboardingFlow.parentHandoff.setupCodeHint')}
          testID="parent-handoff-setup-code"
        />
        {loading === 'code' ? <ActivityIndicator /> : null}
        {child ? (
          <Text variant="body" weight="semibold">
            {t('onboardingFlow.parentHandoff.childFound', { name: child.childFirstName })}
          </Text>
        ) : null}

        {child ? (
          <OnboardingTextField
            label={
              knownTeam
                ? t('onboardingFlow.parentHandoff.teamCodeOptionalLabel')
                : t('onboardingFlow.parentHandoff.teamCodeLabel')
            }
            value={teamCode}
            onChangeText={(raw) => setTeamCode(normalizeTeamCode(raw))}
            placeholder="SVAB2345HX"
            autoCapitalize="characters"
            autoCorrect={false}
            error={teamError}
            hint={
              knownTeam
                ? t('onboardingFlow.parentHandoff.teamCodeOptionalHint', {
                    team: knownTeam.team.displayName || knownTeam.team.name,
                  })
                : t('onboardingFlow.parentHandoff.teamCodeHint')
            }
            testID="parent-handoff-team-code"
          />
        ) : null}
        {loading === 'team' ? <ActivityIndicator /> : null}

        {child && team ? (
          <View style={styles.group}>
            <View style={styles.teamRow}>
              <ClubCrest club={team.club} size={40} />
              <View style={styles.teamCopy}>
                <Text variant="headline" weight="semibold">
                  {team.club.name}
                </Text>
                <Text variant="footnote" color="secondary">
                  {team.team.displayName || team.team.name}
                </Text>
              </View>
            </View>
            <Text variant="subheadline" weight="semibold" color="secondary">
              {t('onboardingFlow.parentHandoff.slotQuestion')}
            </Text>
            {team.rosterSlots.length === 0 ? (
              <Text variant="footnote" color="secondary">
                {t('onboardingFlow.parentHandoff.noSlots')}
              </Text>
            ) : (
              team.rosterSlots.map((slot) => (
                <ChoiceRow
                  key={slot.id}
                  title={slot.fullName}
                  body={
                    [slot.position, slot.jerseyNumber ? `#${slot.jerseyNumber}` : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  selected={slotId === slot.id}
                  onPress={() => setSlotId(slot.id)}
                  testID={`parent-handoff-slot-${slot.id}`}
                />
              ))
            )}
          </View>
        ) : null}

        {team && needsParentDob ? (
          <DateOfBirthInput
            value={dob}
            onChange={setDob}
            error={
              dobCheck.status === 'invalid' || dobCheck.status === 'future'
                ? t('onboardingFlow.dob.invalid')
                : null
            }
            hint={t('onboardingFlow.parentHandoff.parentDobHint')}
          />
        ) : null}
      </OnboardingScreen>
    </ClubThemeOverride>
  )
}

function ageFromIso(iso: string): number {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - date.getFullYear()
  const m = now.getMonth() - date.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age -= 1
  return age
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  teamCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
})
