import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { PublicInvitePayload } from '@anstoss/shared'
import { ApiError, api } from '../../src/api/client'
import { clearPendingInvite, setPendingInvite } from '../../src/auth/pendingInvite'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride, useClubColors } from '../../src/context/ClubThemeContext'
import {
  ageOn,
  DateOfBirthInput,
  validateDob,
  type DobParts,
} from '../../src/onboarding/DateOfBirthInput'
import { apiErrorCode, inviteRedeemError, sendCodeErrorKey } from '../../src/onboarding/errors'
import { needsDateOfBirth, needsDisplayName } from '../../src/onboarding/routing'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { onboardingProgress } from '../../src/onboarding/steps'
import { ClubCrest, OnboardingScreen, OnboardingTextField } from '../../src/onboarding/ui'
import { GuardianHandoffScreen, Under13Screen } from '../../src/onboarding/UnderageScreens'
import { setWelcomeNotice } from '../../src/onboarding/welcomeNotice'
import { radius, space } from '../../src/theme/tokens'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type PublicClub = {
  id: string
  name: string
  slug: string
  badgeUrl: string | null
  primaryColor: string | null
  memberCount?: number
  teamCount?: number
}

type RedeemResult = { status?: string } | undefined

const ROLE_KEYS: Record<PublicInvitePayload['role'], string> = {
  PLAYER: 'onboardingFlow.roles.player',
  PARENT: 'onboardingFlow.roles.parent',
  HEAD_COACH: 'onboardingFlow.roles.headCoach',
  ASSISTANT_COACH: 'onboardingFlow.roles.assistantCoach',
}

/**
 * Invite link, both halves of it:
 *  - signed out: screen 1 of 3, whose invitation this is, with the email;
 *  - signed in: screen 3 of 3, "Beitreten", one tap.
 */
export default function JoinInviteScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const { code: segments } = useLocalSearchParams<{ code?: string | string[] }>()
  const rawSegments = Array.isArray(segments) ? segments : segments ? [segments] : []
  // URL: /join/{slug}/{code} or /join/{codeOrSlug}
  const inviteCode = rawSegments.length >= 2 ? rawSegments[1] : rawSegments[0]
  const { isSignedIn, isLoading } = useAuth()

  const [invite, setInvite] = useState<PublicInvitePayload | null>(null)
  const [club, setClub] = useState<PublicClub | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!inviteCode) {
      setLoadState('missing')
      return
    }
    let alive = true
    setLoadState('loading')
    ;(async () => {
      try {
        const payload = await api<PublicInvitePayload>(`/public/invites/${encodeURIComponent(inviteCode)}`)
        if (!alive) return
        setInvite(payload)
        setLoadState('ready')
      } catch (err) {
        // Share links carry a club slug instead of an invite code.
        try {
          const publicClub = await api<PublicClub>(`/public/clubs/${encodeURIComponent(inviteCode)}`)
          if (!alive) return
          setClub(publicClub)
          setLoadState('ready')
        } catch {
          if (!alive) return
          const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400)
          setLoadState(notFound ? 'missing' : 'error')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [inviteCode, reloadKey])

  const leave = useCallback(async () => {
    // Closing the invite on purpose: forget it, or index would bring it back.
    await clearPendingInvite()
    router.replace('/')
  }, [router])

  if (loadState === 'loading' || isLoading) {
    return <OnboardingScreen title={t('onboardingFlow.invite.loading')} onBack={() => void leave()} />
  }

  if (loadState === 'missing' || loadState === 'error' || (!invite && !club)) {
    return (
      <OnboardingScreen
        title={
          loadState === 'error'
            ? t('onboardingFlow.invite.loadErrorTitle')
            : t('onboardingFlow.invite.invalidTitle')
        }
        subtitle={
          loadState === 'error'
            ? t('onboardingFlow.common.networkError')
            : t('onboardingFlow.invite.invalidBody')
        }
        onBack={() => void leave()}
        primary={
          loadState === 'error'
            ? { label: t('onboardingFlow.common.retry'), onPress: () => setReloadKey((k) => k + 1) }
            : { label: t('onboardingFlow.invite.continueWithout'), onPress: () => void leave() }
        }
        secondary={
          loadState === 'error'
            ? { label: t('onboardingFlow.invite.continueWithout'), onPress: () => void leave() }
            : undefined
        }
        testID="join-invalid"
      />
    )
  }

  if (!invite && club) {
    return (
      <ClubThemeOverride club={club}>
        <OnboardingScreen
          title={club.name}
          subtitle={t('onboardingFlow.invite.clubLinkBody')}
          onBack={() => void leave()}
          lead={<ClubCrest club={club} size={72} />}
          primary={{
            label: t('onboardingFlow.invite.clubLinkCta'),
            onPress: () => {
              if (isSignedIn) router.replace(`/club/${club.slug}`)
              else router.replace('/(auth)/welcome')
            },
          }}
          testID="join-club-link"
        />
      </ClubThemeOverride>
    )
  }

  if (!invite || !inviteCode) return null

  const inactive = invite.status !== 'PENDING' && invite.status !== 'SENT'
  if (inactive) {
    const body =
      invite.status === 'ACCEPTED'
        ? t('onboardingFlow.invite.usedBody')
        : invite.status === 'EXPIRED'
          ? t('onboardingFlow.invite.expiredBody')
          : t('onboardingFlow.invite.revokedBody')
    return (
      <ClubThemeOverride club={invite.club}>
        <OnboardingScreen
          title={t('onboardingFlow.invite.inactiveTitle')}
          subtitle={body}
          onBack={() => void leave()}
          lead={<ClubCrest club={invite.club} size={64} />}
          primary={{ label: t('onboardingFlow.invite.continueWithout'), onPress: () => void leave() }}
          testID="join-inactive"
        />
      </ClubThemeOverride>
    )
  }

  return (
    <ClubThemeOverride club={invite.club}>
      {isSignedIn ? (
        <InviteConfirm invite={invite} inviteCode={inviteCode} onClose={() => void leave()} />
      ) : (
        <InvitePreview invite={invite} inviteCode={inviteCode} onClose={() => void leave()} />
      )}
    </ClubThemeOverride>
  )
}

function inviteLine(
  t: (key: string, options?: Record<string, unknown>) => string,
  invite: PublicInvitePayload,
) {
  return t('onboardingFlow.invite.roleLine', {
    role: t(ROLE_KEYS[invite.role]),
    team: invite.team.displayName,
  })
}

function InviteLead({ invite }: { invite: PublicInvitePayload }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View style={styles.lead}>
      <ClubCrest club={invite.club} size={72} />
      {invite.phase === 'TRIAL' ? (
        <View style={[styles.trialPill, { backgroundColor: c.primary50 }]}>
          <Text variant="caption1" weight="semibold" color="tint">
            {t('onboardingFlow.invite.trialPill')}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const EMAIL_RE_PREVIEW = EMAIL_RE

/**
 * Invite, signed out — screen 1 of 3: whose invitation this is, in the club
 * colour, with the email field right here. "Code senden" goes straight to
 * the code (screen 2); after it the entry router brings the user back to
 * "Beitreten" (screen 3).
 */
function InvitePreview({
  invite,
  inviteCode,
  onClose,
}: {
  invite: PublicInvitePayload
  inviteCode: string
  onClose: () => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const { startOtp } = useOnboardingAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const normalized = email.trim().toLowerCase()
  const valid = EMAIL_RE_PREVIEW.test(normalized)

  async function send() {
    if (!valid || sending) return
    setSending(true)
    setError(null)
    try {
      await setPendingInvite(inviteCode)
      await startOtp(normalized, 'signin', 'email')
      router.push({
        pathname: '/(auth)/sign-in',
        params: { email: normalized, sent: '1', inviteCode },
      })
    } catch (err) {
      setError(t(sendCodeErrorKey(err)))
    } finally {
      setSending(false)
    }
  }

  return (
    <OnboardingScreen
      title={t('onboardingFlow.invite.previewTitle', { club: invite.club.name })}
      subtitle={inviteLine(t, invite)}
      progress={onboardingProgress('invite', 'invitePreview')}
      onBack={onClose}
      lead={<InviteLead invite={invite} />}
      primary={{
        label: t('onboardingFlow.code.sendCta'),
        onPress: () => void send(),
        disabled: !valid,
        loading: sending,
        testID: 'join-accept',
      }}
      footerNote={
        <Text variant="caption1" color="tertiary" align="center">
          {t('onboardingFlow.welcome.consent')}
        </Text>
      }
      testID="join-preview"
    >
      <Text variant="subheadline" color="secondary">
        {invite.phase === 'TRIAL'
          ? t('onboardingFlow.invite.trialBody')
          : t('onboardingFlow.invite.previewBody')}
      </Text>
      <OnboardingTextField
        label={t('onboardingFlow.welcome.emailLabel')}
        value={email}
        onChangeText={(next) => {
          setEmail(next)
          if (error) setError(null)
        }}
        placeholder={t('onboardingFlow.welcome.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="go"
        onSubmitEditing={() => void send()}
        error={error}
        hint={t('onboardingFlow.welcome.hint')}
        testID="join-email"
      />
    </OnboardingScreen>
  )
}

type ConfirmStage = { kind: 'form' } | { kind: 'under13' } | { kind: 'handoff'; dob: string }

/**
 * Invite, signed in — screen 3 of 3: "Beitreten bei SV Albatros als Spieler
 * · Herren II", asking only what is still missing: the name and date of
 * birth (for everyone, as on "Wie heißt du?"), a parent's child name. Joining
 * is always one tap on "Beitreten", never automatic. The same age rules as
 * everywhere: under 13 blocked, 13-15 to the parent handoff (with this
 * invite, so the parent only picks the child's spot).
 */
function InviteConfirm({
  invite,
  inviteCode,
  onClose,
}: {
  invite: PublicInvitePayload
  inviteCode: string
  onClose: () => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const { user, ageGate, memberships, refreshUser, signOut } = useAuth()
  const onExpired = useSessionExpiryHandler()
  const inOnboarding = memberships.length === 0
  const guardianRole = invite.role === 'PARENT' || invite.kind === 'PARENT_APPROVAL'
  const askName = needsDisplayName(user)
  // Guardians need a real DOB (18+), also on legacy accounts with the old
  // 16+ declaration.
  const askDob = needsDateOfBirth(user) || (guardianRole && !user?.dateOfBirth)
  const askChild = invite.role === 'PARENT'

  const [name, setName] = useState('')
  const [dob, setDob] = useState<DobParts>({ day: '', month: '', year: '' })
  const [childName, setChildName] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mismatch, setMismatch] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<ConfirmStage>({ kind: 'form' })

  const dobCheck = validateDob(dob)
  const typedAge = askDob && dobCheck.status === 'valid' ? dobCheck.age : null
  // Legacy accounts that already hold a 13-15 DOB keep the consent flow.
  const needsGuardian =
    !askDob &&
    invite.role === 'PLAYER' &&
    invite.kind !== 'PARENT_APPROVAL' &&
    !!ageGate?.isUnder16
  const knownAge = user?.dateOfBirth ? ageOn(new Date(user.dateOfBirth)) : null
  const guardianTooYoung =
    guardianRole &&
    ((typedAge !== null && typedAge >= 16 && typedAge < 18) ||
      (knownAge !== null && knownAge < 18))

  const ready =
    (!askName || name.trim().length >= 2) &&
    (!askDob || dobCheck.status === 'valid') &&
    (!askChild || childName.trim().length >= 1) &&
    (!needsGuardian || EMAIL_RE.test(guardianEmail.trim())) &&
    !guardianTooYoung

  const displayName = askName ? name.trim().replace(/\s+/g, ' ') : (user?.name ?? '')

  function finishSignedOut() {
    void signOut().catch(() => undefined)
    router.replace('/(auth)/welcome')
  }

  async function redeem() {
    if (busy || !ready) return
    if (typedAge !== null && typedAge >= 13 && typedAge < 16) {
      setStage({ kind: 'handoff', dob: (dobCheck as { iso: string }).iso })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const patch: { name?: string; dateOfBirth?: string } = {}
      if (askName) patch.name = displayName
      if (askDob && dobCheck.status === 'valid') patch.dateOfBirth = dobCheck.iso
      if (Object.keys(patch).length > 0) {
        try {
          await api('/me', { method: 'PATCH', body: patch })
        } catch (err) {
          const code = apiErrorCode(err)
          if (code === 'UNDER_13') {
            setStage({ kind: 'under13' })
            return
          }
          if (code === 'UNDER_16_HANDOFF' && dobCheck.status === 'valid') {
            setStage({ kind: 'handoff', dob: dobCheck.iso })
            return
          }
          throw err
        }
      }
      const result = await api<RedeemResult>(`/invites/${encodeURIComponent(inviteCode)}/redeem`, {
        method: 'POST',
        body: {
          ...(needsGuardian ? { guardianEmail: guardianEmail.trim().toLowerCase() } : {}),
          ...(askChild ? { childName: childName.trim() } : {}),
        },
      })
      await clearPendingInvite()
      if (user?.id && result?.status !== 'pending_parent_approval' && result?.status !== 'PENDING') {
        await setWelcomeNotice(user.id, { clubId: invite.club.id, clubName: invite.club.name })
      }
      await refreshUser(undefined, { preferredClubId: invite.club.id, throwOnError: true }).catch(
        () => undefined,
      )
      router.replace(result?.status === 'pending_parent_approval' ? '/pending-approval' : '/')
    } catch (err) {
      if (onExpired(err)) return
      const outcome = inviteRedeemError(err)
      if (outcome.kind === 'mismatch') setMismatch(true)
      else if (outcome.kind === 'alreadyMember') {
        // Already in: open the club instead of an error.
        await clearPendingInvite()
        await refreshUser(undefined, { preferredClubId: invite.club.id, throwOnError: true }).catch(
          () => undefined,
        )
        router.replace('/')
      } else setError(t(outcome.key))
    } finally {
      setBusy(false)
    }
  }

  if (stage.kind === 'under13') return <Under13Screen onDone={finishSignedOut} />
  if (stage.kind === 'handoff') {
    return (
      <GuardianHandoffScreen
        childName={displayName}
        childDateOfBirth={stage.dob}
        childEmail={user?.email}
        inviteCode={inviteCode}
        onBack={() => setStage({ kind: 'form' })}
        onFinished={finishSignedOut}
      />
    )
  }

  if (mismatch) {
    return (
      <OnboardingScreen
        title={t('onboardingFlow.invite.emailMismatchTitle')}
        subtitle={t('onboardingFlow.invite.emailMismatchBody')}
        onBack={onClose}
        primary={{
          label: t('onboardingFlow.invite.switchAccount'),
          onPress: () => {
            void (async () => {
              // The one sign-out that keeps the invite: an explicit switch.
              await setPendingInvite(inviteCode)
              await signOut({ keepPendingInvite: true })
              router.replace(`/join/${inviteCode}`)
            })()
          },
          testID: 'join-switch-account',
        }}
        secondary={{ label: t('onboardingFlow.invite.continueWithout'), onPress: onClose }}
        testID="join-mismatch"
      />
    )
  }

  const dobError =
    askDob && dobCheck.status === 'invalid'
      ? t('onboardingFlow.dob.invalid')
      : askDob && dobCheck.status === 'future'
        ? t('onboardingFlow.dob.future')
        : guardianTooYoung
          ? t('onboardingFlow.parentHandoff.parentTooYoung')
          : null

  return (
    <OnboardingScreen
      title={t('onboardingFlow.invite.confirmTitle', { club: invite.club.name })}
      subtitle={inviteLine(t, invite)}
      progress={inOnboarding ? onboardingProgress('invite', 'inviteConfirm') : null}
      onBack={onClose}
      lead={<InviteLead invite={invite} />}
      primary={{
        label: t('onboardingFlow.invite.joinCta'),
        onPress: () => void redeem(),
        disabled: !ready,
        loading: busy,
        testID: 'join-confirm',
      }}
      footerNote={
        error || (guardianTooYoung && !askDob) ? (
          <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
            {error ?? t('onboardingFlow.parentHandoff.parentTooYoung')}
          </Text>
        ) : undefined
      }
      testID="join-confirm-screen"
    >
      {askName ? (
        <OnboardingTextField
          label={t('onboardingFlow.name.label')}
          value={name}
          onChangeText={setName}
          placeholder={t('onboardingFlow.name.placeholder')}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          autoCorrect={false}
          autoFocus
          maxLength={80}
          testID="join-name"
        />
      ) : null}
      {askDob ? (
        <DateOfBirthInput
          value={dob}
          onChange={setDob}
          error={dobError}
          hint={t('onboardingFlow.dob.hint')}
        />
      ) : null}
      {askChild ? (
        <OnboardingTextField
          label={t('onboardingFlow.invite.childNameLabel')}
          value={childName}
          onChangeText={setChildName}
          placeholder={t('onboardingFlow.invite.childNamePlaceholder')}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
          testID="join-child-name"
        />
      ) : null}
      {needsGuardian ? (
        <OnboardingTextField
          label={t('onboardingFlow.under16.guardianLabel')}
          value={guardianEmail}
          onChangeText={setGuardianEmail}
          placeholder={t('onboardingFlow.welcome.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          hint={t('onboardingFlow.invite.guardianHint')}
          testID="join-guardian-email"
        />
      ) : null}
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  lead: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  trialPill: {
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    justifyContent: 'center',
  },
})
