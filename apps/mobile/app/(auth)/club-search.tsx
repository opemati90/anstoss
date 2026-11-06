import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubSearchResponse, ClubSearchResult, PublicInvitePayload } from '@anstoss/shared'
import { FreeAgentVisibility, LAUNCH_FEATURES } from '@anstoss/shared'
import { api } from '../../src/api/client'
import { Button, FilterChipRow, Icon, SegmentedControl, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride, useClubColors } from '../../src/context/ClubThemeContext'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { POSITIONS, positionLabel } from '../../src/features/wechsel/format'
import { ageOn } from '../../src/onboarding/DateOfBirthInput'
import { clearPendingInvite } from '../../src/auth/pendingInvite'
import { apiErrorCode, inviteRedeemError } from '../../src/onboarding/errors'
import { setWelcomeNotice } from '../../src/onboarding/welcomeNotice'
import { clearOnboardingIntent } from '../../src/onboarding/intent'
import {
  joinErrorKey,
  submitJoin,
  type CoachTeamRole,
  type JoinRole,
} from '../../src/onboarding/joinClub'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { JOIN_REJECTION_SEEN_PREFIX } from '../../src/onboarding/storageKeys'
import { onboardingProgress } from '../../src/onboarding/steps'
import {
  ChoiceRow,
  ClubCrest,
  HeaderTextButton,
  OnboardingScreen,
  OnboardingTextField,
} from '../../src/onboarding/ui'
import { goBackOrReplace } from '../../src/utils/navigation'
import { hairline, radius, space } from '../../src/theme/tokens'
import { RADIUS_INPUT } from '../../src/theme/spacing'
import { OPTIONAL_CLUB_FEATURES } from '../../src/launchFeatures'

const TEAM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{6,32}$/
const DEBOUNCE_MS = 300

/** A squad suffix belongs to a team, not necessarily to the club's name. */
export function clubNameWithoutTeamSuffix(value: string): string | null {
  const shortened = value.trim().replace(/\s+(?:i{1,3}|iv|v|[2-5])\.?$/i, '').trim()
  return shortened.length >= 2 && shortened !== value.trim() ? shortened : null
}

const INVITE_ROLE_KEYS: Record<PublicInvitePayload['role'], string> = {
  PLAYER: 'onboardingFlow.roles.player',
  PARENT: 'onboardingFlow.roles.parent',
  HEAD_COACH: 'onboardingFlow.roles.headCoach',
  ASSISTANT_COACH: 'onboardingFlow.roles.assistantCoach',
}

/** What the search box contains, besides a club name. */
export function classifySearchInput(raw: string): {
  teamCode: string | null
  inviteCode: string | null
} {
  const compact = raw.trim().replace(/[\s-]/g, '')
  const upper = compact.toUpperCase()
  if (TEAM_CODE_RE.test(upper)) return { teamCode: upper, inviteCode: null }
  if (!/\s/.test(raw.trim()) && INVITE_CODE_RE.test(compact) && /\d/.test(compact)) {
    return { teamCode: null, inviteCode: compact }
  }
  return { teamCode: null, inviteCode: null }
}

type TeamByCode = {
  team: { id: string; name: string; displayName: string | null; clubId: string }
  club: { id: string; name: string; badgeUrl?: string | null; primaryColor?: string | null }
}

export type SelectedClub = {
  /** Row identity (search result id, or `code:<teamCode>`). */
  key: string
  clubId: string
  name: string
  slug?: string | null
  city?: string | null
  badgeUrl?: string | null
  primaryColor?: string | null
  teamId?: string | null
  teamName?: string | null
  joinCode?: string | null
}

type ClubTeam = { id: string; displayName: string }

type LastDecision = {
  id: string
  status: 'APPROVED' | 'REJECTED'
  reason: string | null
  club: { name: string } | null
}

/**
 * Verein finden — screen 4 and the last question before "Anfrage gesendet".
 * One field takes a club name, a place, or the team code from the coach.
 * Tapping a club opens it in place: "Wie bist du dabei?" as three chips
 * (Spieler, Elternteil, Trainer) and the send button, all on this screen.
 * A club that is not on Anstoss yet goes straight to "Verein einrichten";
 * a player without a club lists themselves right here.
 */
export default function ClubSearchScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { user, memberships, ageGate, refreshUser, signOut } = useAuth()
  const { reset: resetDraft } = useOnboardingFlow()
  const onExpired = useSessionExpiryHandler()
  const isMember = memberships.length > 0

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubSearchResult[]>([])
  const [suggestedQuery, setSuggestedQuery] = useState<string | null>(null)
  const [teamMatch, setTeamMatch] = useState<TeamByCode | null>(null)
  const [inviteMatch, setInviteMatch] = useState<PublicInvitePayload | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [retryKey, setRetryKey] = useState(0)
  const requestId = useRef(0)

  const [selection, setSelection] = useState<SelectedClub | null>(null)
  const [role, setRole] = useState<JoinRole | null>(null)
  const [coachRole, setCoachRole] = useState<CoachTeamRole>('ASSISTANT_COACH')
  const [teamId, setTeamId] = useState<string | null>(null)
  const [teams, setTeams] = useState<ClubTeam[] | null>(null)
  const [teamsFailed, setTeamsFailed] = useState(false)
  const [teamsRetry, setTeamsRetry] = useState(0)
  const [freeAgentOpen, setFreeAgentOpen] = useState(false)
  const [inviteSelected, setInviteSelected] = useState(false)
  const [position, setPosition] = useState<string | null>(null)
  const [postalCode, setPostalCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejection, setRejection] = useState<LastDecision | null>(null)

  const trimmed = query.trim()
  const { teamCode, inviteCode } = useMemo(() => classifySearchInput(query), [query])
  const searchable = trimmed.length >= 2
  const needsTeam = !!selection && (role === 'COACH' || role === 'PLAYER') && !selection.teamId

  // Members opening "Verein finden" from home never carry a sign-up intent.
  useEffect(() => {
    if (isMember) void clearOnboardingIntent()
  }, [isMember])

  // M2: a declined request is said once, with the club's reason.
  useEffect(() => {
    if (isMember) return
    let alive = true
    api<{ request: unknown; lastDecision?: LastDecision | null }>('/me/join-requests/active')
      .then(async (res) => {
        const decision = res?.lastDecision
        if (!alive || !decision || decision.status !== 'REJECTED') return
        const seen = await AsyncStorage.getItem(`${JOIN_REJECTION_SEEN_PREFIX}${decision.id}`).catch(
          () => null,
        )
        if (alive && !seen) setRejection(decision)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [isMember])

  useEffect(() => {
    const id = ++requestId.current
    if (!searchable) {
      setResults([])
      setSuggestedQuery(null)
      setTeamMatch(null)
      setInviteMatch(null)
      setStatus('idle')
      return
    }
    setStatus('loading')
    setSuggestedQuery(null)
    const handle = setTimeout(async () => {
      const searchCall = api<ClubSearchResponse>(
        `/clubs/search?q=${encodeURIComponent(trimmed)}&limit=20`,
      )
      const teamCall = teamCode
        ? api<TeamByCode>(`/teams/by-code/${teamCode}`).catch(() => null)
        : Promise.resolve(null)
      const inviteCall = inviteCode
        ? api<PublicInvitePayload>(`/public/invites/${encodeURIComponent(inviteCode)}`).catch(
            () => null,
          )
        : Promise.resolve(null)
      const [search, team, invite] = await Promise.allSettled([searchCall, teamCall, inviteCall])
      if (id !== requestId.current) return
      const teamValue = team.status === 'fulfilled' ? team.value : null
      const inviteValue =
        invite.status === 'fulfilled' && invite.value && invite.value.club ? invite.value : null
      setTeamMatch(teamValue)
      setInviteMatch(inviteValue)
      if (search.status === 'fulfilled') {
        let clubs = search.value?.results ?? []
        const fallback = !teamCode && !inviteCode && clubs.length === 0
          ? clubNameWithoutTeamSuffix(trimmed)
          : null
        if (fallback) {
          try {
            const retry = await api<ClubSearchResponse>(`/clubs/search?q=${encodeURIComponent(fallback)}&limit=20`)
            if (id !== requestId.current) return
            clubs = retry?.results ?? []
            if (clubs.length) setSuggestedQuery(fallback)
          } catch {
            if (id !== requestId.current) return
            setResults([])
            setStatus('error')
            return
          }
        }
        setResults(clubs)
        setStatus('done')
      } else {
        setResults([])
        // A code match is still useful even when the name search failed.
        setStatus(teamValue || inviteValue ? 'done' : 'error')
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [inviteCode, retryKey, searchable, teamCode, trimmed])

  // Coaches pick the team they coach (the club needs to know which squad).
  useEffect(() => {
    if (!needsTeam || teams || !selection?.slug) return
    let alive = true
    setTeamsFailed(false)
    api<{ teams?: ClubTeam[] }>(`/clubs/lookup?slug=${encodeURIComponent(selection.slug)}`)
      .then((res) => {
        if (alive) setTeams(res?.teams ?? [])
      })
      .catch(() => {
        if (alive) setTeamsFailed(true)
      })
    return () => {
      alive = false
    }
  }, [needsTeam, selection?.slug, teams, teamsRetry])

  const handleSignOut = useCallback(() => {
    void signOut()
    router.replace('/(auth)/welcome')
  }, [router, signOut])

  function select(next: SelectedClub | null) {
    Keyboard.dismiss()
    setInviteSelected(false)
    setSelection((current) => (current?.key === next?.key ? null : next))
    setRole(null)
    setTeamId(next?.teamId ?? null)
    setTeams(null)
    setCoachRole('ASSISTANT_COACH')
    setFreeAgentOpen(false)
    setError(null)
  }

  function openClubSetup(params: Record<string, string>) {
    // A new club always starts from a clean form (M6: no stale draft).
    resetDraft()
    router.push({ pathname: '/(auth)/club-setup', params })
  }

  // B2: joining as a parent is a guardian action (18+ on the account).
  const userAge = user?.dateOfBirth ? ageOn(new Date(user.dateOfBirth)) : null
  const parentTooYoung = role === 'PARENT' && userAge !== null && userAge < 18
  const joinReady = !!selection && !!role && (!needsTeam || !!teamId) && !parentTooYoung
  const plzValid = /^\d{5}$/.test(postalCode)
  const listingReady = freeAgentOpen && !!position && plzValid

  async function sendRequest() {
    if (!selection || !role || !joinReady || busy) return
    setBusy(true)
    setError(null)
    try {
      await submitJoin(
        role,
        {
          clubId: selection.clubId,
          teamId: teamId ?? selection.teamId ?? null,
          joinCode: selection.joinCode ?? null,
          coachRole,
        },
        user?.registrationRole,
        isMember,
      )
      await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
      router.replace('/')
    } catch (err) {
      if (!onExpired(err)) setError(t(joinErrorKey(err)))
    } finally {
      setBusy(false)
    }
  }

  /**
   * An invite code typed here joins with one tap on this screen (the name and
   * birth date are already on the account). A parent invite still asks for
   * the child's name, so it opens the invite screen.
   */
  function openInvite() {
    if (!inviteMatch || !inviteCode) return
    if (inviteMatch.role === 'PARENT' || ageGate?.isUnder16) {
      router.push(`/join/${inviteCode}`)
      return
    }
    setSelection(null)
    setRole(null)
    setFreeAgentOpen(false)
    setError(null)
    setInviteSelected((open) => !open)
  }

  async function redeemInvite() {
    if (!inviteMatch || !inviteCode || busy) return
    setBusy(true)
    setError(null)
    try {
      await api(`/invites/${encodeURIComponent(inviteCode)}/redeem`, { method: 'POST', body: {} })
      await clearPendingInvite()
      if (user?.id) {
        await setWelcomeNotice(user.id, { clubId: inviteMatch.club.id, clubName: inviteMatch.club.name })
      }
      await refreshUser(undefined, { preferredClubId: inviteMatch.club.id, throwOnError: true }).catch(
        () => undefined,
      )
      router.replace('/')
    } catch (err) {
      if (onExpired(err)) return
      const outcome = inviteRedeemError(err)
      if (outcome.kind === 'alreadyMember') {
        await refreshUser(undefined, { preferredClubId: inviteMatch.club.id, throwOnError: true }).catch(
          () => undefined,
        )
        router.replace('/')
      } else if (outcome.kind === 'mismatch') {
        setError(t('onboardingFlow.invite.emailMismatchBody'))
      } else setError(t(outcome.key))
    } finally {
      setBusy(false)
    }
  }

  /** "Spieler ohne Verein", listed from this screen (free agent cap: 4). */
  async function publishListing() {
    if (!listingReady || busy) return
    setBusy(true)
    setError(null)
    try {
      await api('/me', { method: 'PATCH', body: { registrationRole: 'FREE_AGENT' } })
      await api('/me/free-agent-profile', {
        method: 'POST',
        body: {
          position,
          postalCode,
          searchRadiusKm: 25,
          isOnTransferList: true,
          visibility: FreeAgentVisibility.CLUB_ONLY,
        },
      })
      await clearOnboardingIntent()
      await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
      router.replace('/')
    } catch (err) {
      if (onExpired(err)) return
      const code = apiErrorCode(err)
      setError(
        code === 'FREE_AGENT_UNDER_16'
          ? t('onboardingFlow.club.freeAgentUnder16')
          : code === 'ROLE_LOCKED'
            ? t('onboardingFlow.club.roleLocked')
            : t('onboardingFlow.common.saveFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  const showEmpty =
    status === 'done' && results.length === 0 && !teamMatch && !inviteMatch && searchable

  const primary = inviteSelected && inviteMatch
    ? {
        label: t('onboardingFlow.invite.joinCta'),
        onPress: () => void redeemInvite(),
        loading: busy,
        testID: 'club-invite-join',
      }
    : selection
    ? {
        label: t('onboardingFlow.club.sendRequest'),
        onPress: () => void sendRequest(),
        disabled: !joinReady,
        loading: busy,
        testID: 'club-send-request',
      }
    : freeAgentOpen
      ? {
          label: t('onboardingFlow.club.freeAgentPublish'),
          onPress: () => void publishListing(),
          disabled: !listingReady,
          loading: busy,
          testID: 'club-free-agent-publish',
        }
      : undefined

  const footerNote = error || (selection && parentTooYoung) ? (
    <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
      {error ?? t('onboardingFlow.parentHandoff.parentTooYoung')}
    </Text>
  ) : selection && role ? (
    <Text variant="caption1" color="tertiary" align="center">
      {role === 'COACH' ? t('onboardingFlow.club.whatNextCoach') : t('onboardingFlow.club.whatNext')}
    </Text>
  ) : undefined

  function renderClubRow(club: SelectedClub, body: string | undefined, testID: string) {
    const open = selection?.key === club.key
    return (
      <View key={club.key} style={styles.rowGroup}>
        <ChoiceRow
          accessibilityRole="button"
          leading={<ClubCrest club={club} size={44} />}
          title={club.name}
          body={body}
          selected={open}
          trailing={
            <Icon
              name={open ? 'chevron.up' : 'chevron.down'}
              size={18}
              color="tertiary"
            />
          }
          onPress={() => select(club)}
          testID={testID}
        />
        {open ? (
          <ClubThemeOverride club={club}>
            <JoinChoice
              club={club}
              role={role}
              onRole={(next) => {
                setRole(next)
                setError(null)
              }}
              coachRole={coachRole}
              onCoachRole={setCoachRole}
              needsTeam={needsTeam}
              teams={teams}
              teamsFailed={teamsFailed}
              onRetryTeams={() => setTeamsRetry((value) => value + 1)}
              teamId={teamId}
              onTeam={setTeamId}
            />
          </ClubThemeOverride>
        ) : null}
      </View>
    )
  }

  return (
    <OnboardingScreen
      title={t('onboardingFlow.club.title')}
      subtitle={t('onboardingFlow.club.subtitle')}
      progress={isMember ? null : onboardingProgress('member', 'clubSearch')}
      onBack={isMember ? () => goBackOrReplace(router, '/(tabs)') : null}
      headerRight={
        isMember ? undefined : (
          <HeaderTextButton label={t('onboardingFlow.common.signOut')} onPress={handleSignOut} />
        )
      }
      primary={primary}
      footerNote={footerNote}
      testID="club-search"
    >
      {rejection ? (
        <RejectionNotice
          decision={rejection}
          onDismiss={() => {
            void AsyncStorage.setItem(`${JOIN_REJECTION_SEEN_PREFIX}${rejection.id}`, '1').catch(
              () => undefined,
            )
            setRejection(null)
          }}
        />
      ) : null}

      <SearchField
        value={query}
        onChangeText={(next) => {
          setQuery(next)
          if (selection || inviteSelected) select(null)
        }}
        loading={status === 'loading'}
        placeholder={t('onboardingFlow.club.searchPlaceholder')}
        label={t('onboardingFlow.club.searchLabel')}
        clearLabel={t('onboardingFlow.club.clear')}
      />

      {status === 'idle' ? (
        <View style={styles.tip}>
          <Icon name="info.circle" size={18} color="tertiary" />
          <Text variant="footnote" color="secondary" style={styles.tipText}>
            {t('onboardingFlow.club.idleHint')}
          </Text>
        </View>
      ) : null}

      {status === 'loading' ? <ResultSkeleton /> : null}

      {status === 'error' ? (
        <View style={styles.stateBlock} accessibilityLiveRegion="polite">
          <Text variant="body" weight="semibold">
            {t('onboardingFlow.club.error')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('onboardingFlow.common.networkError')}
          </Text>
          <Button
            label={t('onboardingFlow.common.retry')}
            variant="bordered"
            size="sm"
            onPress={() => setRetryKey((k) => k + 1)}
          />
        </View>
      ) : null}

      {status === 'done' && inviteMatch ? (
        <ChoiceRow
          accessibilityRole="button"
          leading={<ClubCrest club={inviteMatch.club} size={44} />}
          title={t('onboardingFlow.club.inviteMatchTitle', { club: inviteMatch.club.name })}
          body={t('onboardingFlow.invite.roleLine', {
            role: t(INVITE_ROLE_KEYS[inviteMatch.role]),
            team: inviteMatch.team.displayName,
          })}
          selected={inviteSelected}
          onPress={openInvite}
          testID="club-invite-match"
        />
      ) : null}

      {status === 'done' && teamMatch
        ? renderClubRow(
            {
              key: `code:${teamCode}`,
              clubId: teamMatch.club.id,
              name: teamMatch.club.name,
              badgeUrl: teamMatch.club.badgeUrl ?? null,
              primaryColor: teamMatch.club.primaryColor ?? null,
              teamId: teamMatch.team.id,
              teamName: teamMatch.team.displayName || teamMatch.team.name,
              joinCode: teamCode,
            },
            t('onboardingFlow.club.teamMatchBody', {
              team: teamMatch.team.displayName || teamMatch.team.name,
            }),
            'club-team-match',
          )
        : null}

      {status === 'done' && suggestedQuery ? (
        <Text variant="footnote" color="secondary" accessibilityLiveRegion="polite">
          {t('onboardingFlow.club.showingClubResults', { club: suggestedQuery })}
        </Text>
      ) : null}

      {status === 'done'
        ? results.map((club) => {
            const place = [club.city, club.association].filter(Boolean).join(' · ')
            if (!club.isActive) {
              // Not on Anstoss yet: the only thing to do is set it up.
              return (
                <ChoiceRow
                  key={club.id}
                  accessibilityRole="button"
                  leading={<ClubCrest club={club} size={44} />}
                  title={club.name}
                  body={[place, t('onboardingFlow.club.notOnAnstossSetup')].filter(Boolean).join('\n')}
                  onPress={() =>
                    openClubSetup({ directoryEntryId: club.directoryEntryId, clubName: club.name })
                  }
                  testID={`find-club-row-${club.slug}`}
                />
              )
            }
            return renderClubRow(
              {
                key: club.id,
                clubId: club.activeClubId,
                name: club.name,
                slug: club.slug,
                city: club.city,
                badgeUrl: club.badgeUrl,
                primaryColor: club.primaryColor,
              },
              [place, t('onboardingFlow.club.onAnstoss')].filter(Boolean).join('\n'),
              `find-club-row-${club.slug}`,
            )
          })
        : null}

      {showEmpty ? (
        <View style={styles.stateBlock} accessibilityLiveRegion="polite">
          <Text variant="body" weight="semibold">
            {t('onboardingFlow.club.noResults', { query: trimmed })}
          </Text>
          <Text variant="footnote" color="secondary">
            {teamCode
              ? t('onboardingFlow.club.codeNotFound')
              : t('onboardingFlow.club.noResultsHint')}
          </Text>
        </View>
      ) : null}

      <View style={styles.more}>
        <MoreLink
          icon="building.2"
          label={t('onboardingFlow.club.createClub')}
          onPress={() => openClubSetup(trimmed && !teamCode && !inviteCode
            ? { clubName: clubNameWithoutTeamSuffix(trimmed) ?? trimmed }
            : {})}
          testID="club-create-link"
        />
        {!isMember && OPTIONAL_CLUB_FEATURES.marketplace ? (
          <MoreLink
            icon="magnifyingglass"
            label={t('onboardingFlow.club.freeAgent')}
            expanded={freeAgentOpen}
            onPress={() => {
              setSelection(null)
              setRole(null)
              setInviteSelected(false)
              setError(null)
              setFreeAgentOpen((open) => !open)
            }}
            testID="club-free-agent-link"
          />
        ) : null}
        {freeAgentOpen && !isMember && OPTIONAL_CLUB_FEATURES.marketplace ? (
          <FreeAgentQuickListing
            position={position}
            onPosition={setPosition}
            postalCode={postalCode}
            onPostalCode={setPostalCode}
          />
        ) : null}
        {LAUNCH_FEATURES.youthParticipation ? <MoreLink
          icon="figure.and.child.holdinghands"
          label={t('onboardingFlow.club.setupCode')}
          onPress={() => router.push('/(auth)/parent-handoff')}
          testID="club-setup-code-link"
        /> : null}
      </View>
    </OnboardingScreen>
  )
}

/** Inline "Wie bist du dabei?" under the club row. */
function JoinChoice({
  club,
  role,
  onRole,
  coachRole,
  onCoachRole,
  needsTeam,
  teams,
  teamsFailed,
  onRetryTeams,
  teamId,
  onTeam,
}: {
  club: SelectedClub
  role: JoinRole | null
  onRole: (role: JoinRole) => void
  coachRole: CoachTeamRole
  onCoachRole: (role: CoachTeamRole) => void
  needsTeam: boolean
  teams: ClubTeam[] | null
  teamsFailed: boolean
  onRetryTeams: () => void
  teamId: string | null
  onTeam: (id: string) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View
      style={[styles.choiceCard, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
      testID="club-join-question"
    >
      <Text variant="subheadline" weight="semibold" color="secondary">
        {club.teamName
          ? t('onboardingFlow.club.roleQuestionTeam', { team: club.teamName })
          : t('onboardingFlow.club.roleQuestionShort')}
      </Text>
      <FilterChipRow<JoinRole>
        wrap
        singleSelect
        selected={role}
        onToggle={onRole}
        chips={[
          { key: 'PLAYER', label: t('onboardingFlow.club.rolePlayerShort'), icon: 'football.fill', testID: 'club-role-player' },
          ...(LAUNCH_FEATURES.youthParticipation ? [{ key: 'PARENT' as const, label: t('onboardingFlow.club.roleParentShort'), icon: 'figure.and.child.holdinghands' as const, testID: 'club-role-parent' }] : []),
          { key: 'COACH', label: t('onboardingFlow.club.roleCoachShort'), icon: 'list.clipboard.fill', testID: 'club-role-coach' },
        ]}
      />
      {role === 'COACH' ? (
        <View style={styles.group}>
          <Text variant="footnote" color="secondary">
            {t('onboardingFlow.club.coachRoleQuestion')}
          </Text>
          <SegmentedControl<CoachTeamRole>
            segments={[
              { key: 'ASSISTANT_COACH', label: t('onboardingFlow.roles.assistantCoach'), testID: 'club-coach-assistant' },
              { key: 'HEAD_COACH', label: t('onboardingFlow.roles.headCoach'), testID: 'club-coach-head' },
            ]}
            value={coachRole}
            onChange={onCoachRole}
          />
        </View>
      ) : null}
      {needsTeam ? (
        <View style={styles.group}>
          <Text variant="footnote" color="secondary">
            {t(role === 'COACH' ? 'onboardingFlow.club.teamQuestion' : 'onboardingFlow.club.pickTeam')}
          </Text>
          {teams === null && !teamsFailed ? <ActivityIndicator color={c.textTertiary} /> : null}
          {teamsFailed ? (
            <Button
              label={t('onboardingFlow.common.retry')}
              variant="bordered"
              size="sm"
              onPress={onRetryTeams}
            />
          ) : null}
          {teams && teams.length === 0 ? (
            <Text variant="footnote" color="secondary">
              {t('onboardingFlow.club.noTeams')}
            </Text>
          ) : null}
          {teams && teams.length > 0 ? (
            <FilterChipRow<string>
              wrap
              singleSelect
              selected={teamId}
              onToggle={onTeam}
              chips={teams.map((team) => ({
                key: team.id,
                label: team.displayName,
                testID: `club-team-${team.id}`,
              }))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function FreeAgentQuickListing({
  position,
  onPosition,
  postalCode,
  onPostalCode,
}: {
  position: string | null
  onPosition: (position: string) => void
  postalCode: string
  onPostalCode: (next: string) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const plzInvalid = postalCode.length > 0 && !/^\d{5}$/.test(postalCode)
  return (
    <View
      style={[styles.choiceCard, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
      testID="club-free-agent-form"
    >
      <Text variant="footnote" color="secondary">
        {t('onboardingFlow.club.freeAgentBody')}
      </Text>
      <Text variant="subheadline" weight="semibold" color="secondary">
        {t('spielerprofil.fieldPosition')}
      </Text>
      <FilterChipRow<string>
        wrap
        singleSelect
        selected={position}
        onToggle={onPosition}
        chips={POSITIONS.map((key) => ({
          key,
          label: positionLabel(t, key) ?? key,
          testID: `club-free-agent-position-${key}`,
        }))}
      />
      <OnboardingTextField
        label={t('spielerprofil.fieldPostalCode')}
        value={postalCode}
        onChangeText={(value) => onPostalCode(value.replace(/\D/g, '').slice(0, 5))}
        keyboardType="number-pad"
        autoComplete="postal-code"
        maxLength={5}
        error={plzInvalid ? t('spielerprofil.postalCodeInvalid') : null}
        hint={t('onboardingFlow.club.freeAgentHint')}
        testID="club-free-agent-plz"
      />
    </View>
  )
}

function RejectionNotice({ decision, onDismiss }: { decision: LastDecision; onDismiss: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View
      style={[styles.choiceCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
      accessibilityLiveRegion="polite"
      testID="club-rejection-notice"
    >
      <Text variant="headline" weight="semibold">
        {t('onboardingFlow.pending.rejectedTitle', { club: decision.club?.name ?? '' })}
      </Text>
      {decision.reason ? (
        <View style={[styles.reason, { borderLeftColor: c.borderStrong }]}>
          <Text variant="footnote" color="secondary">
            {t('onboardingFlow.pending.rejectedReasonLabel')}
          </Text>
          <Text variant="body">{decision.reason}</Text>
        </View>
      ) : null}
      <Text variant="footnote" color="secondary">
        {t('onboardingFlow.pending.rejectedNext')}
      </Text>
      <Button
        label={t('onboardingFlow.pending.rejectedDismiss')}
        variant="bordered"
        size="sm"
        onPress={onDismiss}
        testID="club-rejection-dismiss"
      />
    </View>
  )
}

function MoreLink({
  icon,
  label,
  onPress,
  expanded,
  testID,
}: {
  icon: string
  label: string
  onPress: () => void
  expanded?: boolean
  testID?: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      android_ripple={{ color: c.borderDefault }}
      style={styles.moreLink}
      testID={testID}
    >
      <Icon name={icon} size={18} color={c.primary} />
      <Text variant="subheadline" weight="semibold" color="tint" style={styles.moreText}>
        {label}
      </Text>
    </Pressable>
  )
}

function SearchField({
  value,
  onChangeText,
  loading,
  placeholder,
  label,
  clearLabel,
}: {
  value: string
  onChangeText: (next: string) => void
  loading: boolean
  placeholder: string
  label: string
  clearLabel: string
}) {
  const c = useClubColors()
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  return (
    <View
      style={[
        styles.search,
        {
          backgroundColor: c.surface,
          borderColor: focused ? c.primary : c.borderDefault,
          borderWidth: focused ? 2 : hairline * 2,
        },
      ]}
    >
      <Icon name="magnifyingglass" size={20} color={c.textTertiary} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        selectionColor={c.primary}
        accessibilityLabel={label}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="off"
        autoFocus
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.searchInput, { color: c.textPrimary }]}
        testID="find-club-search"
      />
      {loading ? <ActivityIndicator size="small" color={c.textTertiary} /> : null}
      {!loading && value.length > 0 ? (
        <Pressable
          onPress={() => {
            onChangeText('')
            inputRef.current?.focus()
          }}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={12}
          style={styles.clear}
        >
          <Icon name="xmark.circle.fill" size={20} color={c.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  )
}

function ResultSkeleton() {
  const c = useClubColors()
  return (
    <View style={styles.skeletonList} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((row) => (
        <View
          key={row}
          style={[styles.skeletonRow, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
        >
          <View style={[styles.skeletonCrest, { backgroundColor: c.surfaceSunken }]} />
          <View style={styles.skeletonLines}>
            <View style={[styles.skeletonLine, { width: '70%', backgroundColor: c.surfaceSunken }]} />
            <View style={[styles.skeletonLine, { width: '45%', backgroundColor: c.surfaceSunken }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: space.sm,
    fontSize: 18,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  tip: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  tipText: { flex: 1, minWidth: 0 },
  stateBlock: { gap: space.sm, alignItems: 'flex-start', paddingVertical: space.sm },
  skeletonList: { gap: space.sm },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  skeletonCrest: { width: 44, height: 44, borderRadius: RADIUS_INPUT, borderCurve: 'continuous' },
  skeletonLines: { flex: 1, gap: space.sm },
  skeletonLine: { height: 12, borderRadius: radius.sm },
  rowGroup: { gap: space.sm },
  choiceCard: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  group: { gap: space.sm },
  reason: { borderLeftWidth: 2, paddingLeft: space.sm, gap: space['2xs'] },
  more: { marginTop: space.md, gap: space.xs },
  moreLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  moreText: { flex: 1, minWidth: 0 },
})
