/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { TrialInviteStatus, type TrialInvite } from '@anstoss/shared'
import { Screen, Button, Icon, Text } from '../../../src/components/ui'
import { EmptyState } from '../../../src/components/EmptyState'
import { LoadingBoundary } from '../../../src/components/LoadingBoundary'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import {
  TAB_BAR_CLEARANCE,
  fontSize,
  fonts,
  hairline,
  radius,
  space,
} from '../../../src/theme/tokens'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'

type InviteLoadState = 'loading' | 'ready' | 'error'

type InviteNextAction =
  | { kind: 'pending'; invite: TrialInvite }
  | { kind: 'accepted'; invite: TrialInvite }
  | { kind: 'empty' }

const TRIAL_STATUS_I18N_KEYS = [
  'freeAgent.trialStatus.PENDING',
  'freeAgent.trialStatus.ACCEPTED',
  'freeAgent.trialStatus.DECLINED',
  'freeAgent.trialStatus.EXPIRED',
  'freeAgent.trialStatus.REVOKED',
] as const

const DAY_MS = 24 * 60 * 60 * 1000

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body).split(',').map((p) => p.trim()).slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function timeValue(iso: string | null | undefined, fallback: number) {
  const value = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isFinite(value) ? value : fallback
}

export function sortTrialInvites(invites: TrialInvite[]): TrialInvite[] {
  const pending = invites
    .filter((invite) => invite.status === TrialInviteStatus.PENDING)
    .sort(
      (a, b) =>
        timeValue(a.expiresAt, Number.MAX_SAFE_INTEGER) -
          timeValue(b.expiresAt, Number.MAX_SAFE_INTEGER) ||
        timeValue(a.createdAt, 0) - timeValue(b.createdAt, 0),
    )
  const past = invites
    .filter((invite) => invite.status !== TrialInviteStatus.PENDING)
    .sort(
      (a, b) =>
        timeValue(b.respondedAt ?? b.createdAt, 0) -
        timeValue(a.respondedAt ?? a.createdAt, 0),
    )
  return [...pending, ...past]
}

export function getInviteNextAction(invites: TrialInvite[]): InviteNextAction {
  void TRIAL_STATUS_I18N_KEYS
  const ordered = sortTrialInvites(invites)
  const pending = ordered.find(
    (invite) => invite.status === TrialInviteStatus.PENDING,
  )
  if (pending) return { kind: 'pending', invite: pending }

  const accepted = ordered.find(
    (invite) => invite.status === TrialInviteStatus.ACCEPTED,
  )
  if (accepted) return { kind: 'accepted', invite: accepted }

  return { kind: 'empty' }
}

function daysUntil(iso: string, nowMs: number): number {
  const target = timeValue(iso, nowMs)
  return Math.max(0, Math.ceil((target - nowMs) / DAY_MS))
}

function formatInviteDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export default function InvitesTab() {
  const { t } = useTranslation()
  const { refreshUser } = useAuth()
  const c = useClubColors()
  const [invites, setInvites] = useState<TrialInvite[]>([])
  const [loadState, setLoadState] = useState<InviteLoadState>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [decisionId, setDecisionId] = useState<string | null>(null)
  const hasLoaded = useRef(false)
  const mutationSeq = useRef(0)
  const decisionIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    const startedMutationSeq = mutationSeq.current
    if (!hasLoaded.current) setLoadState('loading')
    try {
      const list = await api<TrialInvite[]>('/me/trial-invites')
      if (
        startedMutationSeq !== mutationSeq.current ||
        decisionIdRef.current
      ) {
        return
      }
      setInvites(list || [])
      setLoadState('ready')
      hasLoaded.current = true
    } catch (err) {
      if (startedMutationSeq !== mutationSeq.current) return
      if (hasLoaded.current) {
        Alert.alert(
          t('common.error'),
          err instanceof Error ? err.message : t('invites.loadErrorBody'),
        )
      } else {
        setLoadState('error')
      }
    } finally {
      setRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const onRefresh = () => {
    setRefreshing(true)
    void load()
  }

  const decide = async (
    inviteId: string,
    status: TrialInviteStatus.ACCEPTED | TrialInviteStatus.DECLINED,
  ) => {
    if (decisionIdRef.current) return
    decisionIdRef.current = inviteId
    mutationSeq.current += 1
    setDecisionId(inviteId)
    try {
      const updated = await api<TrialInvite>(`/trial-invites/${inviteId}`, {
        method: 'PATCH',
        body: { status },
      })
      setInvites((cur) =>
        cur.map((inv) => (inv.id === inviteId ? updated : inv)),
      )
      await refreshUser()
    } catch (err) {
      Alert.alert(
        t('common.error'),
        err instanceof Error
          ? err.message
          : t('freeAgent.trialDecisionError', {
              defaultValue: 'Could not update the trial invite.',
            }),
      )
    } finally {
      if (decisionIdRef.current === inviteId) {
        mutationSeq.current += 1
        decisionIdRef.current = null
        setDecisionId(null)
      }
    }
  }

  const pending = useMemo(
    () => invites.filter((i) => i.status === TrialInviteStatus.PENDING),
    [invites],
  )
  const orderedInvites = useMemo(() => sortTrialInvites(invites), [invites])
  const nextAction = useMemo(
    () => (loadState === 'ready' ? getInviteNextAction(invites) : null),
    [invites, loadState],
  )
  const nextActionInviteId =
    nextAction?.kind === 'pending' ? nextAction.invite.id : null
  const loading = loadState === 'loading'
  const loadError = loadState === 'error'

  const openProfile = useCallback(
    () => router.push('/free-agent/profile' as never),
    [],
  )

  return (
    <Screen padded={false}>
      <View style={[styles.hero, { backgroundColor: c.background }]}>
        <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary">
          {t('invites.eyebrow', { defaultValue: 'TRIALS · WAITING ON YOU' }).toUpperCase()}
        </Text>
        <Text variant="title2" weight="bold" color="primary" style={styles.heroTitle}>
          {pending.length === 0
            ? t('invites.heroEmpty', { defaultValue: 'No pending invites' })
            : pending.length === 1
              ? t('invites.heroOne', { defaultValue: '1 club waiting' })
              : t('invites.heroMany', {
                  defaultValue: '{{count}} clubs waiting',
                  count: pending.length,
                })}
        </Text>
        <Text variant="footnote" color="secondary" style={styles.heroSub}>
          {t('invites.heroSub', {
            defaultValue:
              'Accept to start training with the club. Declines are private.',
          })}
        </Text>
      </View>

      <LoadingBoundary
        isLoading={loading}
        skeleton={
          <View style={styles.nextActionWrap}>
            <InviteNextActionLoadingPanel />
          </View>
        }
      >
        {loadError ? (
          <View style={styles.nextActionWrap}>
            <InviteLoadErrorPanel onRetry={load} />
          </View>
        ) : (
          <>
            {nextAction ? (
              <View style={styles.nextActionWrap}>
                <InviteNextActionPanel
                  action={nextAction}
                  decisionId={decisionId}
                  onAccept={(invite) =>
                    void decide(invite.id, TrialInviteStatus.ACCEPTED)
                  }
                  onDecline={(invite) =>
                    void decide(invite.id, TrialInviteStatus.DECLINED)
                  }
                  onOpenProfile={openProfile}
                />
              </View>
            ) : null}

            {invites.length === 0 ? (
              <ScrollView
                contentContainerStyle={[
                  styles.emptyScroll,
                  { paddingBottom: TAB_BAR_CLEARANCE + space.lg },
                ]}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
              >
                <View style={styles.emptyWrap}>
                  <EmptyState
                    icon="envelope"
                    title={t('invites.emptyTitle', { defaultValue: 'No invites yet' })}
                    description={t('invites.emptyBody', {
                      defaultValue:
                        'Clubs scouting your position will reach out here. Make sure your profile is public.',
                    })}
                  />
                </View>
              </ScrollView>
            ) : (
              <FlatList
                data={orderedInvites}
                keyExtractor={(i) => i.id}
                contentContainerStyle={[
                  styles.list,
                  { paddingBottom: TAB_BAR_CLEARANCE + space.lg },
                ]}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
                renderItem={({ item }) => (
                  <InviteCard
                    invite={item}
                    isDeciding={decisionId === item.id}
                    isAnyDecisionPending={!!decisionId}
                    isNextActionInvite={nextActionInviteId === item.id}
                    onAccept={() => void decide(item.id, TrialInviteStatus.ACCEPTED)}
                    onDecline={() => void decide(item.id, TrialInviteStatus.DECLINED)}
                  />
                )}
              />
            )}
          </>
        )}
      </LoadingBoundary>
    </Screen>
  )
}

function InviteNextActionLoadingPanel() {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('invites.loadingA11y')}
      style={[
        styles.nextActionPanel,
        { borderColor: c.borderDefault, backgroundColor: c.surface },
      ]}
    >
      <View style={styles.nextActionHead}>
        <View
          style={[
            styles.nextActionIcon,
            { backgroundColor: c.surfaceSunken ?? c.background },
          ]}
        >
          <Icon name="clock" size={18} color="tertiary" />
        </View>
        <View style={styles.nextActionCopy}>
          <Text style={[styles.nextActionEyebrow, { color: c.textTertiary }]}>
            {t('invites.nextActionEyebrow')}
          </Text>
          <Text variant="headline" weight="semibold" color="primary">
            {t('invites.loadingTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('invites.loadingBody')}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <View
          style={[
            styles.loadingButton,
            { backgroundColor: c.surfaceSunken ?? c.borderDefault },
          ]}
        />
        <View
          style={[styles.loadingButton, { backgroundColor: c.borderDefault }]}
        />
      </View>
    </View>
  )
}

function InviteLoadErrorPanel({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${t('invites.loadErrorTitle')}. ${t('invites.loadErrorBody')}`}
      style={[
        styles.nextActionPanel,
        { borderColor: c.borderDefault, backgroundColor: c.surface },
      ]}
    >
      <View style={styles.nextActionHead}>
        <View
          style={[
            styles.nextActionIcon,
            { backgroundColor: withAlpha(c.warning, 0.12) },
          ]}
        >
          <Icon name="exclamationmark.triangle.fill" size={18} color={c.warning} />
        </View>
        <View style={styles.nextActionCopy}>
          <Text style={[styles.nextActionEyebrow, { color: c.textTertiary }]}>
            {t('invites.nextActionEyebrow')}
          </Text>
          <Text variant="headline" weight="semibold" color="primary">
            {t('invites.loadErrorTitle')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('invites.loadErrorBody')}
          </Text>
        </View>
      </View>
      <Button
        label={t('invites.retryLoadCta')}
        onPress={() => void onRetry()}
        variant="filled"
        fullWidth
        accessibilityLabel={t('invites.retryLoadA11y')}
      />
    </View>
  )
}

function InviteNextActionPanel({
  action,
  decisionId,
  onAccept,
  onDecline,
  onOpenProfile,
}: {
  action: InviteNextAction
  decisionId: string | null
  onAccept: (invite: TrialInvite) => void
  onDecline: (invite: TrialInvite) => void
  onOpenProfile: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  if (action.kind === 'empty') {
    return (
      <View
        style={[
          styles.nextActionPanel,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
        ]}
      >
        <View style={styles.nextActionHead}>
          <View
            style={[
              styles.nextActionIcon,
              { backgroundColor: withAlpha(c.primary, 0.12) },
            ]}
          >
            <Icon name="person.circle" size={18} color={c.primary} />
          </View>
          <View style={styles.nextActionCopy}>
            <Text style={[styles.nextActionEyebrow, { color: c.textTertiary }]}>
              {t('invites.nextActionEyebrow')}
            </Text>
            <Text variant="headline" weight="semibold" color="primary">
              {t('invites.emptyActionTitle')}
            </Text>
            <Text variant="footnote" color="secondary">
              {t('invites.emptyActionBody')}
            </Text>
          </View>
        </View>
        <Button
          label={t('invites.openProfileCta')}
          onPress={onOpenProfile}
          variant="filled"
          fullWidth
          accessibilityLabel={t('invites.openProfileA11y')}
        />
      </View>
    )
  }

  const invite = action.invite
  const clubName = invite.club?.name ?? t('invites.clubFallback')
  const teamName = invite.team?.displayName ?? t('invites.teamFallback')
  const isDecisionPending = decisionId !== null
  const isThisInviteDeciding = decisionId === invite.id

  if (action.kind === 'accepted') {
    return (
      <View
        style={[
          styles.nextActionPanel,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
        ]}
      >
        <View style={styles.nextActionHead}>
          <View
            style={[
              styles.nextActionIcon,
              { backgroundColor: withAlpha(c.success, 0.12) },
            ]}
          >
            <Icon name="checkmark.circle.fill" size={18} color={c.success} />
          </View>
          <View style={styles.nextActionCopy}>
            <Text style={[styles.nextActionEyebrow, { color: c.textTertiary }]}>
              {t('invites.acceptedEyebrow')}
            </Text>
            <Text variant="headline" weight="semibold" color="primary">
              {t('invites.acceptedTitle', { club: clubName })}
            </Text>
            <Text variant="footnote" color="secondary">
              {t('invites.acceptedBody', { team: teamName })}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View
      style={[
        styles.nextActionPanel,
        { borderColor: c.borderDefault, backgroundColor: c.surface },
      ]}
    >
      <View style={styles.nextActionHead}>
        <View
          style={[
            styles.nextActionIcon,
            { backgroundColor: withAlpha(c.primary, 0.12) },
          ]}
        >
          <Icon name="envelope.fill" size={18} color={c.primary} />
        </View>
        <View style={styles.nextActionCopy}>
          <Text style={[styles.nextActionEyebrow, { color: c.textTertiary }]}>
            {t('invites.nextActionEyebrow')}
          </Text>
          <Text variant="headline" weight="semibold" color="primary">
            {t('invites.pendingActionTitle', { club: clubName })}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('invites.pendingActionBody', {
              team: teamName,
              date: formatInviteDate(invite.expiresAt, locale),
              days: daysUntil(invite.expiresAt, Date.now()),
            })}
          </Text>
        </View>
      </View>

      {invite.message ? (
        <Text
          variant="footnote"
          color="primary"
          style={styles.nextActionMessage}
          numberOfLines={3}
        >
          {invite.message}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            label={t('freeAgent.decline')}
            variant="bordered"
            size="md"
            fullWidth
            onPress={() => onDecline(invite)}
            disabled={isDecisionPending}
            accessibilityLabel={t('invites.declineA11y', { club: clubName })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('freeAgent.accept')}
            variant="filled"
            size="md"
            fullWidth
            onPress={() => onAccept(invite)}
            disabled={isDecisionPending}
            loading={isThisInviteDeciding}
            accessibilityLabel={t('invites.acceptA11y', { club: clubName })}
          />
        </View>
      </View>
    </View>
  )
}

function InviteCard({
  invite,
  isDeciding,
  isAnyDecisionPending,
  isNextActionInvite,
  onAccept,
  onDecline,
}: {
  invite: TrialInvite
  isDeciding: boolean
  isAnyDecisionPending: boolean
  isNextActionInvite: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const isPending = invite.status === TrialInviteStatus.PENDING
  const clubName = invite.club?.name ?? t('invites.clubFallback')

  const statusColor =
    invite.status === TrialInviteStatus.ACCEPTED
      ? c.success
      : invite.status === TrialInviteStatus.DECLINED
        ? c.error
        : invite.status === TrialInviteStatus.EXPIRED
          ? c.textSecondary
          : c.primary

  return (
    <View
      style={[
        styles.card,
        { borderColor: c.borderDefault, backgroundColor: c.surface },
        isPending && { borderColor: c.primary, borderWidth: 1.5 },
      ]}
    >
      <View style={styles.cardHead}>
        <View
          style={[
            styles.crest,
            {
              backgroundColor: invite.club?.primaryColor || c.primary,
            },
          ]}
        >
          <Text style={[styles.crestLetter]}>
            {(invite.club?.name ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardCopy}>
          <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
            {invite.club?.name ?? ''}
          </Text>
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {invite.team?.displayName ?? ''}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { borderColor: `${statusColor}33`, backgroundColor: `${statusColor}10` },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>
            {t(`freeAgent.trialStatus.${invite.status}`)}
          </Text>
        </View>
      </View>

      {invite.message ? (
        <Text variant="footnote" color="primary" style={styles.message} numberOfLines={4}>
          {invite.message}
        </Text>
      ) : null}

      {invite.sender?.name ? (
        <View style={styles.senderRow}>
          <Icon name="person.circle" size={14} color={c.textTertiary} />
          <Text variant="caption1" color="tertiary" numberOfLines={1}>
            {invite.sender.name}
          </Text>
          <View style={[styles.dot, { backgroundColor: c.textTertiary }]} />
          <Text variant="caption1" color="tertiary">
            {t('invites.expires', {
              defaultValue: 'Expires {{date}}',
              date: formatInviteDate(invite.expiresAt, locale),
            })}
          </Text>
        </View>
      ) : null}

      {isPending && !isNextActionInvite ? (
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('freeAgent.decline', { defaultValue: 'Decline' })}
              variant="secondary"
              size="md"
              fullWidth
              onPress={onDecline}
              disabled={isAnyDecisionPending}
              accessibilityLabel={t('invites.declineA11y', { club: clubName })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('freeAgent.accept', { defaultValue: 'Accept' })}
              variant="filled"
              size="md"
              fullWidth
              onPress={onAccept}
              disabled={isAnyDecisionPending}
              loading={isDeciding}
              accessibilityLabel={t('invites.acceptA11y', { club: clubName })}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 4,
  },
  heroTitle: { letterSpacing: -0.4 },
  heroSub: { marginTop: 4 },
  nextActionWrap: {
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  nextActionPanel: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  nextActionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  nextActionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionCopy: {
    flex: 1,
    gap: 2,
  },
  nextActionEyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  nextActionMessage: {
    lineHeight: 20,
  },
  loadingButton: {
    flex: 1,
    height: 46,
    borderRadius: radius.full,
  },
  list: {
    paddingHorizontal: space.md,
  },
  emptyScroll: {
    flexGrow: 1,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingTop: space['2xl'],
  },
  card: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  crest: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestLetter: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  statusPill: {
    minHeight: 26,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontFamily: fonts.label,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  message: {
    lineHeight: 20,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
})
