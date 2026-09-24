import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, StyleSheet, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ApiError, api } from '../../src/api/client'
import { Button, Icon, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride, useClubColors } from '../../src/context/ClubThemeContext'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { JOIN_REJECTION_SEEN_PREFIX } from '../../src/onboarding/storageKeys'
import { setWelcomeNotice } from '../../src/onboarding/welcomeNotice'
import { ClubCrest, HeaderTextButton, OnboardingScreen } from '../../src/onboarding/ui'
import { hairline, radius, space } from '../../src/theme/tokens'

type ActiveJoinRequest = {
  request: {
    id: string
    clubId: string
    status: string
    club?: { id: string; name: string; badgeUrl: string | null; primaryColor: string | null } | null
  } | null
  /** M2: what the club decided once nothing is pending any more. */
  lastDecision?: Decision | null
}

export type Decision = {
  id: string
  clubId: string | null
  status: 'APPROVED' | 'REJECTED'
  reason: string | null
  club?: { id: string; name: string; badgeUrl: string | null; primaryColor: string | null } | null
}

type LoadResult = { pending: true } | { pending: false; decision: Decision | null }

type Claim = {
  id: string
  status: 'SUBMITTED' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED'
  reviewNote?: string | null
  club?: { id: string; name: string; badgeUrl: string | null } | null
  directoryEntry?: { name: string; badgeUrl?: string | null } | null
}

export type PendingRequest =
  | {
      kind: 'join'
      id: string
      clubId: string
      clubName: string
      badgeUrl: string | null
      primaryColor: string | null
    }
  | { kind: 'staff'; id: string; clubId: string | null; clubName: string; badgeUrl: string | null }

const POLL_MS = 30_000

/**
 * "Anfrage gesendet" — the waiting screen after Verein finden, for join
 * requests (player, parent) and coach requests. Shows the club, what happens
 * next, and lets the user remind the club or withdraw. Polls and re-checks on
 * foreground; as soon as the club decides, index.tsx takes over.
 */
export default function RequestPendingScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  // Polling depends on the data, not on a new `t` identity.
  const tRef = useRef(t)
  tRef.current = t
  const c = useClubColors()
  const { user, pendingJoinRequest, pendingClubClaim, refreshUser, signOut } = useAuth()
  const { reset: resetDraft } = useOnboardingFlow()
  const onExpired = useSessionExpiryHandler()
  const [rejected, setRejected] = useState<Decision | null>(null)
  const [request, setRequest] = useState<PendingRequest | null>(null)
  const requestRef = useRef<PendingRequest | null>(null)
  requestRef.current = request
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'secondary' } | null>(null)
  const [busy, setBusy] = useState<'remind' | 'check' | 'withdraw' | null>(null)
  const leavingRef = useRef(false)

  const leave = useCallback(async () => {
    if (leavingRef.current) return
    leavingRef.current = true
    await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
    router.replace('/')
  }, [refreshUser, router])

  /** Whether something is still pending, and if not what was decided. */
  const load = useCallback(async (): Promise<LoadResult> => {
    if (pendingJoinRequest || !pendingClubClaim) {
      const res = await api<ActiveJoinRequest>('/me/join-requests/active')
      const row = res?.request
      if (row && row.status === 'PENDING') {
        setRequest({
          kind: 'join',
          id: row.id,
          clubId: row.clubId,
          clubName: row.club?.name ?? '',
          badgeUrl: row.club?.badgeUrl ?? null,
          primaryColor: row.club?.primaryColor ?? null,
        })
        return { pending: true }
      }
      if (!pendingClubClaim) return { pending: false, decision: res?.lastDecision ?? null }
    }
    const claims = await api<Claim[]>('/club-claims/mine')
    const claim =
      (pendingClubClaim ? claims.find((item) => item.id === (pendingClubClaim as { id: string }).id) : null) ??
      claims.find((item) => item.status === 'SUBMITTED' || item.status === 'NEEDS_INFO')
    if (claim && (claim.status === 'SUBMITTED' || claim.status === 'NEEDS_INFO')) {
      setRequest({
        kind: 'staff',
        id: claim.id,
        clubId: claim.club?.id ?? null,
        clubName: claim.club?.name ?? claim.directoryEntry?.name ?? '',
        badgeUrl: claim.club?.badgeUrl ?? claim.directoryEntry?.badgeUrl ?? null,
      })
      return { pending: true }
    }
    // The coach's staff request was decided: approved, or declined with a note.
    const known = requestRef.current
    const decided = known ? claims.find((item) => item.id === known.id) : null
    if (decided && (decided.status === 'APPROVED' || decided.status === 'REJECTED')) {
      return {
        pending: false,
        decision: {
          id: decided.id,
          clubId: decided.club?.id ?? null,
          status: decided.status,
          reason: decided.reviewNote ?? null,
          club: decided.club ? { ...decided.club, primaryColor: null } : null,
        },
      }
    }
    return { pending: false, decision: null }
  }, [pendingClubClaim, pendingJoinRequest])

  const refresh = useCallback(
    async (manual = false) => {
      try {
        const result = await load()
        setState('ready')
        if (!result.pending) {
          const decision = result.decision
          // M2: a "no" is said clearly, with the club's reason, and never
          // turns into a "Willkommen" on home.
          if (decision?.status === 'REJECTED') {
            setRejected({
              ...decision,
              club: decision.club ?? (requestRef.current
                ? { id: requestRef.current.clubId ?? '', name: requestRef.current.clubName, badgeUrl: requestRef.current.badgeUrl, primaryColor: null }
                : null),
            })
            return
          }
          // A yes: home greets the new member once.
          const clubId = decision?.clubId ?? null
          if (decision?.status === 'APPROVED' && clubId && user?.id) {
            await setWelcomeNotice(user.id, {
              clubId,
              clubName: decision.club?.name ?? requestRef.current?.clubName ?? '',
            })
          }
          await leave()
          return
        }
        if (manual) {
          setNotice({ text: tRef.current('onboardingFlow.pending.stillPending'), tone: 'secondary' })
        }
      } catch (err) {
        if (onExpired(err)) return
        setState((current) => (current === 'ready' ? current : 'error'))
        if (manual) {
          setNotice({ text: tRef.current('onboardingFlow.common.networkError'), tone: 'secondary' })
        }
      }
    },
    [leave, load, onExpired, user?.id],
  )

  useEffect(() => {
    if (rejected) return
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh()
    })
    return () => {
      clearInterval(id)
      sub.remove()
    }
  }, [refresh, rejected])

  async function remind() {
    if (!request || request.kind !== 'join' || busy) return
    setBusy('remind')
    setNotice(null)
    try {
      await api(`/clubs/${request.clubId}/join-requests/${request.id}/remind`, { method: 'POST' })
      setNotice({ text: t('onboardingFlow.pending.reminded'), tone: 'success' })
    } catch (err) {
      if (onExpired(err)) return
      setNotice({
        text:
          err instanceof ApiError && (err.status === 400 || err.status === 429)
            ? t('onboardingFlow.pending.remindCooldown')
            : t('onboardingFlow.common.networkError'),
        tone: 'secondary',
      })
    } finally {
      setBusy(null)
    }
  }

  async function check() {
    if (busy) return
    setBusy('check')
    setNotice(null)
    await refresh(true)
    setBusy(null)
  }

  function withdraw() {
    if (!request || busy) return
    Alert.alert(t('onboardingFlow.pending.withdrawTitle'), t('onboardingFlow.pending.withdrawBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('onboardingFlow.pending.withdrawConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy('withdraw')
            try {
              if (request.kind === 'join') {
                await api(`/clubs/${request.clubId}/join-requests/${request.id}/withdraw`, {
                  method: 'POST',
                })
              } else {
                await api(`/club-claims/${encodeURIComponent(request.id)}/withdraw`, {
                  method: 'POST',
                })
              }
              requestRef.current = null
              setRequest(null)
              // M6: no half-filled club draft resurfaces after a withdrawal.
              resetDraft()
              await leave()
            } catch (err) {
              if (onExpired(err)) return
              setNotice({ text: t('onboardingFlow.pending.withdrawFailed'), tone: 'secondary' })
            } finally {
              setBusy(null)
            }
          })()
        },
      },
    ])
  }

  function handleSignOut() {
    void signOut()
    router.replace('/(auth)/welcome')
  }

  if (rejected) {
    const clubName = rejected.club?.name ?? ''
    return (
      <ClubThemeOverride club={rejected.club ? { primaryColor: rejected.club.primaryColor } : null}>
        <OnboardingScreen
          title={t('onboardingFlow.pending.rejectedTitle', { club: clubName })}
          subtitle={t('onboardingFlow.pending.rejectedBody')}
          onBack={null}
          headerRight={<HeaderTextButton label={t('onboardingFlow.common.signOut')} onPress={handleSignOut} />}
          lead={
            rejected.club ? (
              <ClubCrest club={{ name: clubName || '?', badgeUrl: rejected.club.badgeUrl, primaryColor: rejected.club.primaryColor }} size={64} />
            ) : null
          }
          primary={{
            label: t('onboardingFlow.pending.rejectedCta'),
            onPress: () => {
              void AsyncStorage.setItem(`${JOIN_REJECTION_SEEN_PREFIX}${rejected.id}`, '1').catch(() => undefined)
              void leave()
            },
            testID: 'pending-rejected-continue',
          }}
          testID="request-rejected"
        >
          {rejected.reason ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
              <Text variant="footnote" color="secondary">
                {t('onboardingFlow.pending.rejectedReasonLabel')}
              </Text>
              <Text variant="body" testID="pending-rejected-reason">
                {rejected.reason}
              </Text>
            </View>
          ) : null}
          <Text variant="subheadline" color="secondary">
            {t('onboardingFlow.pending.rejectedNext')}
          </Text>
        </OnboardingScreen>
      </ClubThemeOverride>
    )
  }

  const clubName = request?.clubName || ''
  const lead = request ? (
    <View style={styles.leadRow}>
      <ClubCrest
        club={{
          name: clubName || '?',
          badgeUrl: request.badgeUrl,
          primaryColor: request.kind === 'join' ? request.primaryColor : null,
        }}
        size={64}
      />
      <View style={[styles.statusPill, { backgroundColor: c.primary50 }]}>
        <Icon name="clock.fill" size={14} color={c.primary} />
        <Text variant="caption1" weight="semibold" color="tint">
          {t('onboardingFlow.pending.status')}
        </Text>
      </View>
    </View>
  ) : null

  const body =
    state === 'loading' ? (
      <View style={styles.skeleton} accessibilityElementsHidden>
        {[0, 1].map((row) => (
          <View key={row} style={[styles.skeletonLine, { backgroundColor: c.surfaceSunken }]} />
        ))}
      </View>
    ) : state === 'error' ? (
      <View style={styles.errorBlock}>
        <Text variant="body" weight="semibold">
          {t('onboardingFlow.pending.loadError')}
        </Text>
        <Button
          label={t('onboardingFlow.common.retry')}
          variant="bordered"
          size="sm"
          onPress={() => {
            setState('loading')
            void refresh()
          }}
        />
      </View>
    ) : (
      <>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
          <Text variant="headline" weight="semibold">
            {t('onboardingFlow.pending.nextTitle')}
          </Text>
          <Step icon="bell.fill" text={t('onboardingFlow.pending.next1')} />
          <Step icon="calendar.fill" text={t('onboardingFlow.pending.next2')} />
        </View>
        {notice ? (
          <Text
            variant="footnote"
            color={notice.tone === 'success' ? 'success' : 'secondary'}
            accessibilityLiveRegion="polite"
          >
            {notice.text}
          </Text>
        ) : null}
        {request?.kind === 'join' ? (
          <Button
            label={t('onboardingFlow.pending.remind')}
            variant="bordered"
            onPress={() => void remind()}
            loading={busy === 'remind'}
            fullWidth
            testID="pending-remind"
          />
        ) : null}
        <Button
          label={t('onboardingFlow.pending.withdraw')}
          variant="plain"
          onPress={withdraw}
          loading={busy === 'withdraw'}
          fullWidth
          testID="pending-withdraw"
        />
      </>
    )

  return (
    <ClubThemeOverride club={request?.kind === 'join' ? { primaryColor: request.primaryColor } : null}>
      <OnboardingScreen
        title={t('onboardingFlow.pending.title')}
        subtitle={
          !clubName
            ? t('onboardingFlow.pending.bodyNoClub')
            : request?.kind === 'staff'
              ? t('onboardingFlow.pending.bodyCoach', { club: clubName })
              : t('onboardingFlow.pending.body', { club: clubName })
        }
        onBack={null}
        headerRight={<HeaderTextButton label={t('onboardingFlow.common.signOut')} onPress={handleSignOut} />}
        lead={lead}
        primary={{
          label: t('onboardingFlow.pending.check'),
          onPress: () => void check(),
          loading: busy === 'check',
          disabled: state === 'loading',
          testID: 'pending-check',
        }}
        testID="request-pending"
      >
        {body}
      </OnboardingScreen>
    </ClubThemeOverride>
  )
}

function Step({ icon, text }: { icon: string; text: string }) {
  const c = useClubColors()
  return (
    <View style={styles.step}>
      <Icon name={icon} size={18} color={c.textSecondary} />
      <Text variant="subheadline" color="secondary" style={styles.stepText}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
  },
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  step: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  stepText: { flex: 1, minWidth: 0 },
  skeleton: { gap: space.sm },
  skeletonLine: { height: 64, borderRadius: radius.lg },
  errorBlock: { gap: space.sm, alignItems: 'flex-start' },
})
