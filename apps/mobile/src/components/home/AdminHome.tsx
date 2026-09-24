import { useCallback, useEffect, useState } from 'react'
import { Alert, Share, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type {
  AdminInbox,
  AdminInboxJoinRequest,
  AdminInboxSafeguardingItem,
} from '@anstoss/shared'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { Avatar, Button, Icon, ListRow, SectionGroup, SoftIcon, Text } from '../ui'
import { Skeleton } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import { RADIUS_CARD, space } from '../../theme/tokens'
import { useAdminInbox } from '../admin/useAdminInbox'
import { useOpenReportsSummary } from '../admin/useModerationReports'
import { COMPLIANCE_FEATURE_ENABLED } from '../../launchFeatures'
import {
  adminActionErrorKey,
  complianceReminderLabelKey,
  complianceReminderState,
  duesReminderOutcome,
  shouldReloadAfterError,
  type ComplianceReminderState,
  type DuesReminderOutcome,
} from '../admin/adminActions'
import {
  clubCountsLabel,
  daysFromNow,
  formatEventWhen,
  formatMoney,
  formatShortDate,
} from '../admin/adminFormat'

type NextEvent = {
  id: string
  title: string
  date: string
  location: string | null
  cancelledAt?: string | null
}

export type AdminHomeProps = {
  clubId: string
  teamId?: string | null
  onRefreshStateChange?: (handle: { refresh: () => void; refreshing: boolean }) => void
}

/**
 * Admin home = "Aufgaben". An inbox of what the club needs from the admin
 * right now: every row is a live count from GET /admin-inbox with exactly
 * one primary action, and an empty inbox is a calm "Alles erledigt".
 */
export function AdminHome({ clubId, onRefreshStateChange }: AdminHomeProps) {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const { inbox, status, refreshing, reload, refresh: refreshInbox } = useAdminInbox(clubId)
  const reports = useOpenReportsSummary(clubId)
  const reloadReports = reports.reload
  const refresh = useCallback(async () => {
    await Promise.all([refreshInbox(), reloadReports()])
  }, [refreshInbox, reloadReports])
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [duesReminder, setDuesReminder] = useState<DuesReminderOutcome | null>(null)
  const [remindedFz, setRemindedFz] = useState<Record<string, ComplianceReminderState>>({})

  useEffect(() => {
    onRefreshStateChange?.({ refresh: () => void refresh(), refreshing })
  }, [onRefreshStateChange, refresh, refreshing])

  useEffect(() => {
    let cancelled = false
    api<NextEvent[]>(`/clubs/${clubId}/events?scope=upcoming&limit=3`)
      .then((events) => {
        if (cancelled) return
        const list = Array.isArray(events) ? events : []
        setNextEvent(list.find((event) => !event.cancelledAt) ?? null)
      })
      .catch(() => {
        if (!cancelled) setNextEvent(null)
      })
    return () => {
      cancelled = true
    }
  }, [clubId])

  // M3: failures show a translated message for the status, never the raw
  // server text; a 409/404 means the inbox is stale, so it always reloads.
  const runAction = useCallback(
    async <T,>(key: string, action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
      setBusyKey(key)
      try {
        const value = await action()
        await reload()
        return { ok: true, value }
      } catch (error) {
        Alert.alert(
          t('common.errorTitle', { defaultValue: 'Something went wrong' }),
          t(adminActionErrorKey(error)),
        )
        if (shouldReloadAfterError(error)) void reload()
        return { ok: false }
      } finally {
        setBusyKey(null)
      }
    },
    [reload, t],
  )

  const decideJoinRequest = (request: AdminInboxJoinRequest, decision: 'approve' | 'reject') => {
    const perform = () =>
      void runAction(`join:${request.id}`, () =>
        api(`/clubs/${clubId}/join-requests/${request.id}/${decision}`, {
          method: 'POST',
          body: { revision: request.revision },
        }),
      )
    if (decision === 'approve') {
      perform()
      return
    }
    Alert.alert(
      t('pendingRequests.rejectConfirmTitle'),
      t('pendingRequests.rejectConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('pendingRequests.reject'), style: 'destructive', onPress: perform },
      ],
    )
  }

  // L4: the button shows what the server did ("3 erinnert" / "heute bereits erinnert").
  const remindDues = async () => {
    const result = await runAction('dues', () =>
      api(`/clubs/${clubId}/contributions/reminders/send`, {
        method: 'POST',
        body: { onlyOverdue: true },
      }),
    )
    if (result.ok) setDuesReminder(duesReminderOutcome(result.value))
  }

  const markFzPresented = (item: AdminInboxSafeguardingItem) =>
    void runAction(`fz:${item.memberUserId}`, () =>
      api(`/clubs/${clubId}/compliance`, {
        method: 'POST',
        body: {
          memberUserId: item.memberUserId,
          kind: 'FUEHRUNGSZEUGNIS',
          issuedAt: new Date().toISOString(),
        },
      }),
    )

  // M1: the server allows one reminder per person and document per 24 hours.
  const remindFz = async (item: AdminInboxSafeguardingItem) => {
    const result = await runAction(`fz-remind:${item.memberUserId}`, () =>
      api(`/clubs/${clubId}/compliance/remind`, {
        method: 'POST',
        body: { memberUserId: item.memberUserId, kind: 'FUEHRUNGSZEUGNIS' },
      }),
    )
    if (!result.ok) return
    const state = complianceReminderState(result.value)
    if (state === 'failed') {
      Alert.alert(t('common.errorTitle'), t('aufgaben.actionError'))
      return
    }
    setRemindedFz((current) => ({ ...current, [item.memberUserId]: state }))
  }

  const shareInviteLink = () => {
    const slug = activeClub?.club.slug
    if (!slug) return
    const url = `https://anstoss.io/join/${slug}`
    void Share.share({
      message: t('adminDashboard.shareJoinMessage', { clubName: activeClub?.club.name, url }),
      url,
    }).catch(() => undefined)
  }

  if (status === 'loading') return <AdminHomeSkeleton />

  if (status === 'error' || !inbox) {
    return (
      <View style={styles.root}>
        <ErrorState
          message={t('aufgaben.loadError')}
          hint={t('aufgaben.loadErrorHint')}
          onRetry={() => void reload()}
        />
      </View>
    )
  }

  // L7: the headline counts exactly the groups rendered below, so it can
  // never disagree with the list. Safeguarding only counts while the
  // compliance feature is live (the group is hidden otherwise), and chat
  // reports come from their own endpoint rather than the inbox total.
  const openTotal =
    inbox.joinRequests.count +
    inbox.staffAccessRequests.count +
    inbox.overdueDues.count +
    inbox.teamsWithoutHeadCoach.count +
    (COMPLIANCE_FEATURE_ENABLED ? inbox.safeguarding.count : 0) +
    inbox.unfilledOffices.count +
    reports.count

  return (
    <View style={styles.root} testID="admin-home-inbox">
      <View style={styles.headline}>
        <Text variant="title1" weight="bold" color="primary" tabular>
          {openTotal > 0 ? t('aufgaben.openCount', { count: openTotal }) : t('aufgaben.allDoneTitle')}
        </Text>
        <Text variant="subheadline" color="secondary">
          {clubCountsLabel(t, inbox.memberCount, inbox.teamCount)}
        </Text>
      </View>

      {openTotal === 0 ? <AllDone /> : null}

      {reports.count > 0 ? <ReportsGroup count={reports.count} overdue={reports.overdue} /> : null}

      <TaskGroups
        inbox={inbox}
        busyKey={busyKey}
        duesReminder={duesReminder}
        remindedFz={remindedFz}
        onDecideJoin={decideJoinRequest}
        onRemindDues={() => void remindDues()}
        onMarkFz={markFzPresented}
        onRemindFz={(item) => void remindFz(item)}
      />

      <SectionGroup header={t('aufgaben.footerHeader')}>
        {nextEvent ? (
          <ListRow
            left={<SoftIcon name="calendar" />}
            title={nextEvent.title}
            subtitle={[formatEventWhen(nextEvent.date), nextEvent.location]
              .filter(Boolean)
              .join(' · ')}
            showChevron
            accessibilityLabel={`${t('aufgaben.nextEvent')}: ${nextEvent.title}`}
            onPress={() =>
              router.push({ pathname: '/event-detail', params: { eventId: nextEvent.id } } as never)
            }
          />
        ) : (
          <ListRow
            left={<SoftIcon name="calendar" />}
            title={t('aufgaben.noNextEvent')}
            subtitle={t('aufgaben.noNextEventHint')}
            showChevron
            onPress={() => router.push('/create-event' as never)}
          />
        )}
        <ListRow
          left={<SoftIcon name="square.and.arrow.up" />}
          title={t('aufgaben.shareInvite')}
          subtitle={t('aufgaben.shareInviteHint')}
          showChevron
          onPress={shareInviteLink}
        />
      </SectionGroup>
    </View>
  )
}

function TaskGroups({
  inbox,
  busyKey,
  duesReminder,
  remindedFz,
  onDecideJoin,
  onRemindDues,
  onMarkFz,
  onRemindFz,
}: {
  inbox: AdminInbox
  busyKey: string | null
  duesReminder: DuesReminderOutcome | null
  remindedFz: Record<string, ComplianceReminderState>
  onDecideJoin: (request: AdminInboxJoinRequest, decision: 'approve' | 'reject') => void
  onRemindDues: () => void
  onMarkFz: (item: AdminInboxSafeguardingItem) => void
  onRemindFz: (item: AdminInboxSafeguardingItem) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const busy = busyKey !== null

  return (
    <>
      {inbox.joinRequests.count > 0 ? (
        <SectionGroup header={groupHeader(t('aufgaben.joinRequests'), inbox.joinRequests.count)}>
          {inbox.joinRequests.items.map((request) => (
            <View key={request.id} style={styles.taskRow}>
              <View style={styles.taskHead}>
                <Avatar size="md" src={request.user.avatarUrl} fallbackText={request.user.name} />
                <View style={styles.taskText}>
                  <Text variant="body" weight="semibold" color="primary" numberOfLines={1}>
                    {request.user.name}
                  </Text>
                  <Text variant="footnote" color="secondary" numberOfLines={2}>
                    {[
                      t(`teamRoles.${request.role}`, { defaultValue: request.role }),
                      relativeDay(request.createdAt, t),
                      request.message ? `„${request.message}“` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
              <View style={styles.taskActions}>
                <Button
                  label={t('pendingRequests.reject')}
                  variant="plain"
                  size="sm"
                  disabled={busy}
                  onPress={() => onDecideJoin(request, 'reject')}
                  accessibilityLabel={`${t('pendingRequests.reject')}: ${request.user.name}`}
                />
                <Button
                  label={t('pendingRequests.approve')}
                  variant="filled"
                  size="sm"
                  loading={busyKey === `join:${request.id}`}
                  disabled={busy}
                  onPress={() => onDecideJoin(request, 'approve')}
                  accessibilityLabel={`${t('pendingRequests.approve')}: ${request.user.name}`}
                />
              </View>
            </View>
          ))}
          {inbox.joinRequests.count > inbox.joinRequests.items.length ? (
            <SeeAllRow
              count={inbox.joinRequests.count}
              onPress={() => router.push('/pending-requests' as never)}
            />
          ) : null}
        </SectionGroup>
      ) : null}

      {inbox.staffAccessRequests.count > 0 ? (
        <SectionGroup
          header={groupHeader(t('aufgaben.staffRequests'), inbox.staffAccessRequests.count)}
        >
          {inbox.staffAccessRequests.items.map((request) => (
            <ListRow
              key={request.id}
              left={
                <Avatar size="md" src={request.claimant.avatarUrl} fallbackText={request.claimant.name} />
              }
              title={request.claimant.name}
              subtitle={t('aufgaben.staffRequestSubtitle', {
                role: t(`verein.roleLabel.${request.desiredRole}`, {
                  defaultValue: request.desiredRole,
                }),
              })}
              right={<ActionLabel label={t('aufgaben.review')} />}
              onPress={() => router.push('/club-staff' as never)}
            />
          ))}
        </SectionGroup>
      ) : null}

      {inbox.overdueDues.count > 0 ? (
        <SectionGroup header={groupHeader(t('aufgaben.dues'), inbox.overdueDues.count)}>
          <View style={styles.taskRow}>
            <View style={styles.taskHead}>
              <SoftIcon name="banknote" color={c.warning} />
              <View style={styles.taskText}>
                <Text variant="body" weight="semibold" color="primary">
                  {t('aufgaben.duesTitle', { count: inbox.overdueDues.count })}
                </Text>
                <Text variant="footnote" color="secondary" numberOfLines={2} tabular>
                  {[
                    t('aufgaben.duesAmount', {
                      amount: formatMoney(inbox.overdueDues.amount, inbox.overdueDues.currency),
                    }),
                    inbox.overdueDues.items.map((item) => item.name).join(', '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <View style={styles.taskActions}>
              <Button
                label={t('aufgaben.openBilling')}
                variant="plain"
                size="sm"
                disabled={busy}
                onPress={() => router.push('/admin-billing' as never)}
              />
              <Button
                label={duesReminderLabel(duesReminder, t)}
                variant={duesReminder ? 'tinted' : 'filled'}
                size="sm"
                loading={busyKey === 'dues'}
                disabled={busy || duesReminder !== null}
                onPress={onRemindDues}
                accessibilityLabel={
                  duesReminder ? duesReminderLabel(duesReminder, t) : t('aufgaben.remindAllOverdue')
                }
              />
            </View>
            {duesReminder?.kind === 'nobody' ? (
              <Text variant="footnote" color="secondary">
                {t('aufgaben.nobodyToRemind')}
              </Text>
            ) : null}
          </View>
        </SectionGroup>
      ) : null}

      {inbox.teamsWithoutHeadCoach.count > 0 ? (
        <SectionGroup
          header={groupHeader(t('aufgaben.teamsWithoutCoach'), inbox.teamsWithoutHeadCoach.count)}
        >
          {inbox.teamsWithoutHeadCoach.items.map((team) => (
            <ListRow
              key={team.teamId}
              left={<SoftIcon name="person.2.fill" color={c.warning} />}
              title={team.teamName}
              subtitle={[team.groupName, t('verein.teams.noCoach')].filter(Boolean).join(' · ')}
              right={<ActionLabel label={t('aufgaben.assignCoach')} />}
              accessibilityLabel={`${t('aufgaben.assignCoach')}: ${team.teamName}`}
              onPress={() =>
                router.push({ pathname: '/team-management', params: { teamId: team.teamId } } as never)
              }
            />
          ))}
          {inbox.teamsWithoutHeadCoach.count > inbox.teamsWithoutHeadCoach.items.length ? (
            <SeeAllRow
              count={inbox.teamsWithoutHeadCoach.count}
              onPress={() => router.push('/team-management' as never)}
            />
          ) : null}
        </SectionGroup>
      ) : null}

      {COMPLIANCE_FEATURE_ENABLED && inbox.safeguarding.count > 0 ? (
        <SectionGroup
          header={groupHeader(t('aufgaben.safeguarding'), inbox.safeguarding.count)}
          footer={t('aufgaben.safeguardingFooter')}
        >
          {inbox.safeguarding.items.map((item) => {
            const reminderState = remindedFz[item.memberUserId]
            const reminded = reminderState !== undefined
            return (
              <View key={item.memberUserId} style={styles.taskRow}>
                <View style={styles.taskHead}>
                  <Avatar size="md" fallbackText={item.name} />
                  <View style={styles.taskText}>
                    <Text variant="body" weight="semibold" color="primary" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="footnote" color="secondary" numberOfLines={2}>
                      {[item.teamNames.join(', '), safeguardingStatus(item, t)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={styles.taskActions}>
                  <Button
                    label={t(complianceReminderLabelKey(reminderState))}
                    variant="plain"
                    size="sm"
                    loading={busyKey === `fz-remind:${item.memberUserId}`}
                    disabled={busy || reminded}
                    onPress={() => onRemindFz(item)}
                    accessibilityLabel={`${t('aufgaben.remind')}: ${item.name}`}
                  />
                  <Button
                    label={t('aufgaben.fzPresented')}
                    variant="filled"
                    size="sm"
                    loading={busyKey === `fz:${item.memberUserId}`}
                    disabled={busy}
                    onPress={() => onMarkFz(item)}
                    accessibilityLabel={`${t('aufgaben.fzPresented')}: ${item.name}`}
                  />
                </View>
              </View>
            )
          })}
          {inbox.safeguarding.count > inbox.safeguarding.items.length ? (
            <SeeAllRow
              count={inbox.safeguarding.count}
              onPress={() => router.push('/compliance' as never)}
            />
          ) : null}
        </SectionGroup>
      ) : null}

      {inbox.unfilledOffices.count > 0 ? (
        <SectionGroup header={groupHeader(t('aufgaben.offices'), inbox.unfilledOffices.count)}>
          {inbox.unfilledOffices.items.map((item) => (
            <ListRow
              key={item.office}
              left={<SoftIcon name="person.badge.key" color={c.warning} />}
              title={t('aufgaben.officeUnfilled', {
                office: t(`verein.office.${item.office}`),
              })}
              subtitle={t('aufgaben.officeUnfilledHint')}
              right={<ActionLabel label={t('aufgaben.fill')} />}
              onPress={() => router.push('/club-staff' as never)}
            />
          ))}
        </SectionGroup>
      ) : null}
    </>
  )
}

/** Chat reports (App Store 1.2 / Play UGC): red when one is past the 24h target. */
function ReportsGroup({ count, overdue }: { count: number; overdue: number }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <SectionGroup header={groupHeader(t('aufgaben.reports'), count)}>
      <ListRow
        left={<SoftIcon name="flag.fill" color={overdue > 0 ? c.error : c.warning} />}
        title={t('aufgaben.reportsTitle', { count })}
        subtitle={
          overdue > 0 ? t('aufgaben.reportsOverdue', { count: overdue }) : t('aufgaben.reportsHint')
        }
        right={<ActionLabel label={t('aufgaben.review')} />}
        accessibilityLabel={`${t('aufgaben.reportsTitle', { count })}${
          overdue > 0 ? `, ${t('aufgaben.reportsOverdue', { count: overdue })}` : ''
        }`}
        onPress={() => router.push('/admin-reports' as never)}
        testID="admin-home-reports"
      />
    </SectionGroup>
  )
}

function duesReminderLabel(
  outcome: DuesReminderOutcome | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!outcome) return t('aufgaben.remind')
  if (outcome.kind === 'sent') return t('aufgaben.remindedCount', { count: outcome.count })
  if (outcome.kind === 'alreadyToday') return t('aufgaben.remindedToday')
  return t('aufgaben.remind')
}

function groupHeader(title: string, count: number) {
  return `${title} · ${count}`
}

function relativeDay(iso: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const days = daysFromNow(iso)
  if (days === null) return null
  const ago = Math.abs(days)
  if (ago === 0) return t('aufgaben.today')
  return t('aufgaben.daysAgo', { count: ago })
}

function safeguardingStatus(
  item: AdminInboxSafeguardingItem,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (item.status === 'MISSING') return t('verein.fz.missing')
  if (item.status === 'EXPIRED') return t('verein.fz.expiredOn', { date: formatShortDate(item.expiresAt) })
  return t('verein.fz.expiresOn', { date: formatShortDate(item.expiresAt) })
}

function ActionLabel({ label }: { label: string }) {
  return (
    <View style={styles.actionLabel}>
      <Text variant="subheadline" weight="semibold" color="tint">
        {label}
      </Text>
      <Icon name="chevron.right" size="sm" color="tertiary" />
    </View>
  )
}

function SeeAllRow({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useTranslation()
  return (
    <ListRow
      compact
      title={t('aufgaben.seeAll', { count })}
      showChevron
      onPress={onPress}
    />
  )
}

function AllDone() {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View
      style={[styles.allDone, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
      accessibilityRole="summary"
    >
      <SoftIcon name="checkmark.seal.fill" size={48} color={c.success} />
      <View style={styles.allDoneText}>
        <Text variant="headline" color="primary" align="center">
          {t('aufgaben.allDoneHeadline')}
        </Text>
        <Text variant="subheadline" color="secondary" align="center">
          {t('aufgaben.allDoneBody')}
        </Text>
      </View>
    </View>
  )
}

function AdminHomeSkeleton() {
  return (
    <View style={styles.root} testID="admin-home-skeleton">
      <View style={styles.headline}>
        <Skeleton shape="line" width="60%" height={30} />
        <Skeleton shape="line" width="45%" height={14} />
      </View>
      <Skeleton shape="card" height={132} />
      <Skeleton shape="card" height={88} />
      <Skeleton shape="card" height={120} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  headline: { gap: space.xs },
  taskRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    gap: space.sm,
  },
  taskHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  taskText: { flex: 1, minWidth: 0, gap: space['2xs'] },
  taskActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  actionLabel: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  allDone: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  allDoneText: { gap: space.xs, alignItems: 'center' },
})
