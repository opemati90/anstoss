import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type {
  ClubSearchResponse,
  ClubSearchResult,
  PublicInvitePayload,
  PublicRosterSlot,
  PublicRosterSlotsResponse,
} from '@anstoss/shared'
import { FreeAgentVisibility } from '@anstoss/shared'
import { api } from '../../src/api/client'
import { Button, FilterChipRow, Icon, SegmentedControl, SoftIcon, Text } from '../../src/components/ui'
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
  splitJoinRoles,
  submitJoin,
  type CoachTeamRole,
  type JoinRole,
} from '../../src/onboarding/joinClub'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { JOIN_REJECTION_SEEN_PREFIX } from '../../src/onboarding/storageKeys'
import {
  ChoiceRow,
  ClubCrest,
  type CrestClub,
  HeaderTextButton,
  OnboardingScreen,
  OnboardingTextField,
} from '../../src/onboarding/ui'
import { goBackOrReplace } from '../../src/utils/navigation'
import { fonts, hairline, radius, space } from '../../src/theme/tokens'
import { INPUT_HEIGHT, RADIUS_CARD, RADIUS_INPUT, SPACING_MD, SPACING_XXS } from '../../src/theme/spacing'

const TEAM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{6,32}$/
const DEBOUNCE_MS = 300
/** Design: the Einladungscode field is 64 high (12 over a normal field). */
const CODE_FIELD_HEIGHT = 64

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

  const c = useClubColors()
  const params = useLocalSearchParams<{ code?: string }>()
  const initialCode = Array.isArray(params.code) ? params.code[0] : params.code
  const [stage, setStage] = useState<'find' | 'role'>('find')
  const [code, setCode] = useState((initialCode ?? '').toUpperCase())
  const [codeStatus, setCodeStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const codeRequestId = useRef(0)
  const [slots, setSlots] = useState<PublicRosterSlot[]>([])
  const [claimSlot, setClaimSlot] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubSearchResult[]>([])
  const [teamMatch, setTeamMatch] = useState<TeamByCode | null>(null)
  const [inviteMatch, setInviteMatch] = useState<PublicInvitePayload | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [retryKey, setRetryKey] = useState(0)
  const requestId = useRef(0)

  const [selection, setSelection] = useState<SelectedClub | null>(null)
  // Design: Spieler:in is ticked when the role question opens.
  const [roles, setRoles] = useState<JoinRole[]>(['PLAYER'])
  const [coachRole, setCoachRole] = useState<CoachTeamRole>('ASSISTANT_COACH')
  const [teamId, setTeamId] = useState<string | null>(null)
  const [teams, setTeams] = useState<ClubTeam[] | null>(null)
  const [teamsFailed, setTeamsFailed] = useState(false)
  const [freeAgentOpen, setFreeAgentOpen] = useState(false)
  const [position, setPosition] = useState<string | null>(null)
  const [postalCode, setPostalCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejection, setRejection] = useState<LastDecision | null>(null)

  const trimmed = query.trim()
  const { teamCode, inviteCode } = useMemo(() => classifySearchInput(code), [code])
  const searchable = trimmed.length >= 2
  const coachPicked = roles.includes('COACH')
  const needsTeam = !!selection && coachPicked && !selection.teamId
  const { primary: primaryRole, additional: additionalRoles } = splitJoinRoles(roles)
  const mySlot = useMemo(() => {
    const me = normalizeName(user?.name)
    return me ? slots.find((slot) => normalizeName(slot.fullName) === me) ?? null : null
  }, [slots, user?.name])

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

  // Name / place search (the second half of the screen).
  useEffect(() => {
    const id = ++requestId.current
    if (!searchable) {
      setResults([])
      setStatus('idle')
      return
    }
    setStatus('loading')
    const handle = setTimeout(async () => {
      try {
        const search = await api<ClubSearchResponse>(
          `/clubs/search?q=${encodeURIComponent(trimmed)}&limit=20`,
        )
        if (id !== requestId.current) return
        setResults(search?.results ?? [])
        setStatus('done')
      } catch {
        if (id !== requestId.current) return
        setResults([])
        setStatus('error')
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [retryKey, searchable, trimmed])

  // Einladungscode: a team code (players, coaches) or a personal invite.
  useEffect(() => {
    const id = ++codeRequestId.current
    setTeamMatch(null)
    setInviteMatch(null)
    setSlots([])
    if (!teamCode && !inviteCode) {
      setCodeStatus('idle')
      return
    }
    setCodeStatus('loading')
    const handle = setTimeout(async () => {
      const [team, invite] = await Promise.all([
        teamCode ? api<TeamByCode>(`/teams/by-code/${teamCode}`).catch(() => null) : null,
        inviteCode
          ? api<PublicInvitePayload>(`/public/invites/${encodeURIComponent(inviteCode)}`).catch(
              () => null,
            )
          : null,
      ])
      if (id !== codeRequestId.current) return
      setTeamMatch(team ?? null)
      setInviteMatch(invite && invite.club ? invite : null)
      setCodeStatus('done')
      if (team && teamCode) {
        // "Ich bin …": unclaimed roster slots (contract, BACKEND_GAPS). A
        // server without the endpoint answers 404; the row just stays away.
        const res = await api<PublicRosterSlotsResponse>(
          `/public/teams/by-code/${teamCode}/roster-slots`,
        ).catch(() => null)
        if (id === codeRequestId.current) setSlots(res?.slots ?? [])
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [inviteCode, teamCode])

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
  }, [needsTeam, selection?.slug, teams])

  const handleSignOut = useCallback(() => {
    void signOut()
    router.replace('/(auth)/welcome')
  }, [router, signOut])

  /** A club picked from the code or the search: on to "Was machst du bei …?". */
  function select(next: SelectedClub) {
    setSelection(next)
    setRoles(['PLAYER'])
    setTeamId(next.teamId ?? null)
    setTeams(null)
    setCoachRole('ASSISTANT_COACH')
    setFreeAgentOpen(false)
    setError(null)
    setStage('role')
  }

  function toggleRole(next: JoinRole) {
    setError(null)
    setRoles((current) =>
      current.includes(next) ? current.filter((r) => r !== next) : [...current, next],
    )
  }

  function openClubSetup(params: Record<string, string>) {
    // A new club always starts from a clean form (M6: no stale draft).
    resetDraft()
    router.push({ pathname: '/(auth)/club-setup', params })
  }

  // B2: joining as a parent is a guardian action (18+ on the account).
  const userAge = user?.dateOfBirth ? ageOn(new Date(user.dateOfBirth)) : null
  const parentTooYoung = roles.includes('PARENT') && userAge !== null && userAge < 18
  const joinReady =
    !!selection && !!primaryRole && (!needsTeam || !!teamId) && !parentTooYoung
  const plzValid = /^\d{5}$/.test(postalCode)
  const listingReady = freeAgentOpen && !!position && plzValid

  async function sendRequest() {
    if (!selection || !primaryRole || !joinReady || busy) return
    setBusy(true)
    setError(null)
    try {
      await submitJoin(
        primaryRole,
        {
          clubId: selection.clubId,
          teamId: teamId ?? selection.teamId ?? null,
          joinCode: selection.joinCode ?? null,
          coachRole,
          rosterSlotId: selection.joinCode && claimSlot && mySlot ? mySlot.id : null,
          additionalRoles,
        },
        user?.registrationRole,
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
    setFreeAgentOpen(false)
    setError(null)
    void redeemInvite()
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

  const showEmpty = status === 'done' && results.length === 0 && searchable
  const codeNotFound = codeStatus === 'done' && !teamMatch && !inviteMatch

  const teamMatchClub: SelectedClub | null = teamMatch
    ? {
        key: `code:${teamCode}`,
        clubId: teamMatch.club.id,
        name: teamMatch.club.name,
        badgeUrl: teamMatch.club.badgeUrl ?? null,
        primaryColor: teamMatch.club.primaryColor ?? null,
        teamId: teamMatch.team.id,
        teamName: teamMatch.team.displayName || teamMatch.team.name,
        joinCode: teamCode,
      }
    : null

  if (stage === 'role' && selection) {
    const roleFooter = error || parentTooYoung ? (
      <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
        {error ?? t('onboardingFlow.parentHandoff.parentTooYoung')}
      </Text>
    ) : undefined
    return (
      <ClubThemeOverride club={selection}>
        <OnboardingScreen
          title={t('onboardingFlow.role.title', { club: selection.name })}
          progress={JOIN_PROGRESS_ROLE}
          onBack={() => {
            setStage('find')
            setError(null)
          }}
          lead={<ClubCrest club={selection} size={48} />}
          primary={{
            label: t('onboardingFlow.role.cta'),
            onPress: () => void sendRequest(),
            disabled: !joinReady,
            loading: busy,
            testID: 'club-send-request',
          }}
          footerNote={roleFooter}
          testID="club-join-question"
        >
          <RolePicker
            roles={roles}
            onToggle={toggleRole}
            coachRole={coachRole}
            onCoachRole={setCoachRole}
            needsTeam={needsTeam}
            teams={teams}
            teamsFailed={teamsFailed}
            onRetryTeams={() => setTeams(null)}
            teamId={teamId}
            onTeam={setTeamId}
          />
        </OnboardingScreen>
      </ClubThemeOverride>
    )
  }

  const primary = freeAgentOpen
    ? {
        label: t('onboardingFlow.club.freeAgentPublish'),
        onPress: () => void publishListing(),
        disabled: !listingReady,
        loading: busy,
        testID: 'club-free-agent-publish',
      }
    : inviteMatch
      ? {
          label: t('onboardingFlow.common.continue'),
          onPress: openInvite,
          loading: busy,
          testID: 'club-invite-join',
        }
      : {
          label: t('onboardingFlow.common.continue'),
          onPress: () => {
            if (teamMatchClub) select(teamMatchClub)
          },
          disabled: !teamMatchClub,
          testID: 'club-continue',
        }

  const footerNote = error ? (
    <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : undefined

  return (
    <OnboardingScreen
      title={t('onboardingFlow.join.title')}
      subtitle={t('onboardingFlow.join.subtitle')}
      progress={JOIN_PROGRESS_FIND}
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

      <View style={styles.codeBlock}>
        <Text variant="footnote" weight="semibold">
          {t('onboardingFlow.join.codeLabel')}
        </Text>
        <CodeField
          value={code}
          onChangeText={(next) => {
            setCode(next)
            setError(null)
          }}
          label={t('onboardingFlow.join.codeLabel')}
        />
        {codeStatus === 'loading' ? (
          <ActivityIndicator color={c.textTertiary} style={styles.codeSpinner} />
        ) : null}
        {inviteMatch ? (
          <MatchRow
            club={inviteMatch.club}
            title={inviteMatch.club.name}
            body={t('onboardingFlow.invite.roleLine', {
              role: t(INVITE_ROLE_KEYS[inviteMatch.role]),
              team: inviteMatch.team.displayName,
            })}
            onPress={openInvite}
            testID="club-invite-match"
          />
        ) : null}
        {teamMatch && teamMatchClub ? (
          <MatchRow
            club={teamMatchClub}
            title={teamMatchClub.name}
            body={teamMatchClub.teamName ?? undefined}
            onPress={() => select(teamMatchClub)}
            testID="club-team-match"
          />
        ) : null}
        {teamMatch && mySlot ? (
          <SlotClaimRow
            title={
              mySlot.jerseyNumber !== null
                ? t('onboardingFlow.join.claimTitle', {
                    name: mySlot.fullName,
                    number: mySlot.jerseyNumber,
                  })
                : t('onboardingFlow.join.claimTitleNoNumber', { name: mySlot.fullName })
            }
            body={t('onboardingFlow.join.claimBody')}
            checked={claimSlot}
            onToggle={() => setClaimSlot((v) => !v)}
          />
        ) : null}
        {codeNotFound ? (
          <Text variant="footnote" color="error" accessibilityLiveRegion="polite">
            {t('onboardingFlow.club.codeNotFound')}
          </Text>
        ) : null}
      </View>

      <OrDivider label={t('onboardingFlow.code.or')} />

      <SearchField
        value={query}
        onChangeText={(next) => setQuery(next)}
        loading={status === 'loading'}
        placeholder={t('onboardingFlow.join.searchPlaceholder')}
        label={t('onboardingFlow.club.searchLabel')}
        clearLabel={t('onboardingFlow.club.clear')}
      />

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

      {status === 'done'
        ? results.map((club) => {
            const place = [club.city, club.association].filter(Boolean).join(' · ')
            if (!club.isActive) {
              // Not on Anstoss yet: the only thing to do is set it up.
              return (
                <ChoiceRow
                  key={club.id}
                  accessibilityRole="button"
                  leading={<ClubCrest club={club} size={36} />}
                  title={club.name}
                  body={[place, t('onboardingFlow.club.notOnAnstossSetup')].filter(Boolean).join('\n')}
                  onPress={() =>
                    openClubSetup({ directoryEntryId: club.directoryEntryId, clubName: club.name })
                  }
                  testID={`find-club-row-${club.slug}`}
                />
              )
            }
            return (
              <ChoiceRow
                key={club.id}
                accessibilityRole="button"
                leading={<ClubCrest club={club} size={36} />}
                title={club.name}
                body={[place, t('onboardingFlow.club.onAnstoss')].filter(Boolean).join('\n')}
                onPress={() =>
                  select({
                    key: club.id,
                    clubId: club.activeClubId,
                    name: club.name,
                    slug: club.slug,
                    city: club.city,
                    badgeUrl: club.badgeUrl,
                    primaryColor: club.primaryColor,
                  })
                }
                testID={`find-club-row-${club.slug}`}
              />
            )
          })
        : null}

      {showEmpty ? (
        <View style={styles.stateBlock} accessibilityLiveRegion="polite">
          <Text variant="body" weight="semibold">
            {t('onboardingFlow.club.noResults', { query: trimmed })}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('onboardingFlow.club.noResultsHint')}
          </Text>
        </View>
      ) : null}

      {/* Secondary ways in (not on the board): a new club, a free agent
          listing, a parent's setup code. */}
      <View style={[styles.more, { backgroundColor: c.surface }]}>
        <MoreLink
          icon="building.2"
          label={t('onboardingFlow.club.createClub')}
          onPress={() => openClubSetup(trimmed ? { clubName: trimmed } : {})}
          testID="club-create-link"
        />
        {!isMember ? (
          <MoreLink
            icon="magnifyingglass"
            label={t('onboardingFlow.club.freeAgent')}
            expanded={freeAgentOpen}
            onPress={() => {
              setSelection(null)
              setError(null)
              setFreeAgentOpen((open) => !open)
            }}
            testID="club-free-agent-link"
          />
        ) : null}
        {freeAgentOpen && !isMember ? (
          <FreeAgentQuickListing
            position={position}
            onPosition={setPosition}
            postalCode={postalCode}
            onPostalCode={setPostalCode}
          />
        ) : null}
        <MoreLink
          icon="figure.and.child.holdinghands"
          label={t('onboardingFlow.club.setupCode')}
          onPress={() => router.push('/(auth)/parent-handoff')}
          last
          testID="club-setup-code-link"
        />
      </View>
    </OnboardingScreen>
  )
}

const JOIN_PROGRESS_FIND = { current: 1, total: 2 }
const JOIN_PROGRESS_ROLE = { current: 2, total: 2 }

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** "oder" between the code and the search. */
function OrDivider({ label }: { label: string }) {
  const c = useClubColors()
  return (
    <View style={styles.or} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.orLine, { backgroundColor: c.borderDefault }]} />
      <Text variant="footnote" color="secondary">
        {label}
      </Text>
      <View style={[styles.orLine, { backgroundColor: c.borderDefault }]} />
    </View>
  )
}

/** Large Barlow code field, 2pt ink outline (design: 64 high, tracked caps). */
function CodeField({
  value,
  onChangeText,
  label,
}: {
  value: string
  onChangeText: (next: string) => void
  label: string
}) {
  const c = useClubColors()
  return (
    <TextInput
      value={value}
      onChangeText={(next) => onChangeText(next.toUpperCase())}
      accessibilityLabel={label}
      autoCapitalize="characters"
      autoCorrect={false}
      autoComplete="off"
      spellCheck={false}
      maxLength={32}
      selectionColor={c.ink}
      placeholderTextColor={c.textTertiary}
      style={[
        styles.codeInput,
        { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.ink },
      ]}
      testID="find-club-code"
    />
  )
}

/** Club found for the code: crest, name, team, check. */
function MatchRow({
  club,
  title,
  body,
  onPress,
  testID,
}: {
  club: CrestClub
  title: string
  body?: string
  onPress: () => void
  testID: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      accessibilityState={{ selected: true }}
      style={[styles.matchRow, { backgroundColor: c.surface }]}
      testID={testID}
    >
      <ClubCrest club={club} size={28} />
      <View style={styles.matchCopy}>
        <Text variant="subheadline" weight="bold" numberOfLines={1} style={styles.size14}>
          {title}
        </Text>
        {body ? (
          <Text variant="caption1" weight="regular" color="secondary" numberOfLines={1}>
            {body}
          </Text>
        ) : null}
      </View>
      <Icon name="checkmark" size={20} color={c.heroBg} />
    </Pressable>
  )
}

/** "Ich bin Kofi Osei, Nr. 9": claim the roster slot the captain created. */
function SlotClaimRow({
  title,
  body,
  checked,
  onToggle,
}: {
  title: string
  body: string
  checked: boolean
  onToggle: () => void
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${title}. ${body}`}
      style={[styles.claimRow, { backgroundColor: c.surface }]}
      testID="club-slot-claim"
    >
      <Checkbox checked={checked} size={22} radius={CHECK_RADIUS_SM} />
      <View style={styles.matchCopy}>
        <Text variant="subheadline" weight="semibold" style={styles.size14}>
          {title}
        </Text>
        <Text variant="caption1" weight="regular" color="secondary">
          {body}
        </Text>
      </View>
    </Pressable>
  )
}

const CHECK_RADIUS_SM = 5
const CHECK_RADIUS = 7

function Checkbox({ checked, size = 24, radius: r = CHECK_RADIUS }: { checked: boolean; size?: number; radius?: number }) {
  const c = useClubColors()
  return (
    <View
      style={[
        styles.check,
        { width: size, height: size, borderRadius: r },
        checked
          ? { backgroundColor: c.ink }
          : { borderWidth: 2, borderColor: c.borderControl },
      ]}
    >
      {checked ? <Icon name="checkmark" size={14} color={c.onInk} /> : null}
    </View>
  )
}

const ROLE_ROWS: { key: JoinRole; title: string; body: string; testID: string }[] = [
  { key: 'PLAYER', title: 'onboardingFlow.role.player', body: 'onboardingFlow.role.playerBody', testID: 'club-role-player' },
  { key: 'COACH', title: 'onboardingFlow.role.coach', body: 'onboardingFlow.role.coachBody', testID: 'club-role-coach' },
  { key: 'PARENT', title: 'onboardingFlow.role.parent', body: 'onboardingFlow.role.parentBody', testID: 'club-role-parent' },
  { key: 'ADMIN', title: 'onboardingFlow.role.admin', body: 'onboardingFlow.role.adminBody', testID: 'club-role-admin' },
]

/** "Was machst du bei …?": multi-select role rows, the board confirms. */
function RolePicker({
  roles,
  onToggle,
  coachRole,
  onCoachRole,
  needsTeam,
  teams,
  teamsFailed,
  onRetryTeams,
  teamId,
  onTeam,
}: {
  roles: JoinRole[]
  onToggle: (role: JoinRole) => void
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
    <View style={styles.roleBody}>
      <View style={[styles.roleGroup, { backgroundColor: c.surface }]} accessibilityLabel={t('onboardingFlow.role.groupA11y')}>
        {ROLE_ROWS.map((row, index) => {
          const checked = roles.includes(row.key)
          return (
            <Pressable
              key={row.key}
              onPress={() => onToggle(row.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${t(row.title)}. ${t(row.body)}`}
              android_ripple={{ color: c.borderDefault }}
              style={[
                styles.roleRow,
                index < ROLE_ROWS.length - 1 && {
                  borderBottomWidth: hairline,
                  borderBottomColor: c.borderSubtle,
                },
              ]}
              testID={row.testID}
            >
              <View style={styles.roleCopy}>
                <Text variant="body" weight="bold" style={styles.roleTitle}>
                  {t(row.title)}
                </Text>
                <Text variant="footnote" color="secondary">
                  {t(row.body)}
                </Text>
              </View>
              <Checkbox checked={checked} />
            </Pressable>
          )
        })}
      </View>
      {roles.includes('COACH') ? (
        <View style={[styles.choiceCard, { backgroundColor: c.surface }]}>
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
          {needsTeam ? (
            <View style={styles.group}>
              <Text variant="footnote" color="secondary">
                {t('onboardingFlow.club.teamQuestion')}
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
      ) : null}
      <Text variant="footnote" color="secondary" style={styles.roleHint}>
        {t('onboardingFlow.role.hint')}
      </Text>
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
      style={[styles.choiceCard, { backgroundColor: c.surface }]}
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
      style={[styles.choiceCard, { backgroundColor: c.surface }]}
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
  last,
  testID,
}: {
  icon: string
  label: string
  onPress: () => void
  expanded?: boolean
  /** Last row of the group: no hairline under it. */
  last?: boolean
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
      style={[
        styles.moreLink,
        !last && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle },
      ]}
      testID={testID}
    >
      <SoftIcon name={icon} />
      <Text variant="subheadline" weight="semibold" style={styles.moreText}>
        {label}
      </Text>
      <Icon
        name={expanded ? 'chevron.up' : expanded === false ? 'chevron.down' : 'chevron.right'}
        size={16}
        color={c.textSecondary}
      />
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
          borderColor: focused ? c.ink : c.borderStrong,
        },
      ]}
    >
      <Icon name="magnifyingglass" size={20} color={c.textSecondary} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        selectionColor={c.ink}
        accessibilityLabel={label}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="off"
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
    height: INPUT_HEIGHT,
    paddingHorizontal: space.md,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: INPUT_HEIGHT - 2,
    paddingVertical: 0,
    fontSize: 15,
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
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  skeletonCrest: { width: 44, height: 44, borderRadius: RADIUS_INPUT, borderCurve: 'continuous' },
  skeletonLines: { flex: 1, gap: space.sm },
  skeletonLine: { height: 12, borderRadius: radius.sm },
  rowGroup: { gap: space.sm },
  choiceCard: {
    gap: SPACING_MD,
    padding: space.md,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  group: { gap: space.sm },
  reason: { borderLeftWidth: 2, paddingLeft: space.sm, gap: space['2xs'] },
  more: {
    marginTop: space.sm,
    paddingHorizontal: space.md,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  moreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 60,
    paddingVertical: SPACING_MD,
  },
  codeBlock: { gap: SPACING_MD - 2 },
  codeSpinner: { alignSelf: 'center' },
  codeInput: {
    height: CODE_FIELD_HEIGHT,
    borderWidth: 2,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: 6,
    textAlign: 'center',
    includeFontPadding: false,
  },
  or: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  orLine: { flex: 1, height: 1 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD - 2,
    paddingVertical: SPACING_MD - 2,
    paddingHorizontal: SPACING_MD,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    minHeight: 44,
    padding: SPACING_MD,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
  },
  matchCopy: { flex: 1, minWidth: 0 },
  size14: { fontSize: 14, lineHeight: 19 },
  check: { alignItems: 'center', justifyContent: 'center' },
  roleBody: { gap: space.lg + 2 },
  roleGroup: {
    paddingHorizontal: space.md,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 68,
    paddingVertical: SPACING_MD,
  },
  roleCopy: { flex: 1, minWidth: 0, gap: SPACING_XXS + 1 },
  roleTitle: { fontSize: 16, lineHeight: 20 },
  roleHint: { lineHeight: 20 },
  moreText: { flex: 1, minWidth: 0 },
})
