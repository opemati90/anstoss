import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, RefreshControl, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Redirect } from 'expo-router'
import type { ComplianceItem } from '@anstoss/shared'
import { MembershipRole, TeamGroupType, complianceStatus } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { Skeleton } from '../src/components/Skeleton'
import {
  Avatar,
  Button,
  ListRow,
  Screen,
  SectionGroup,
  StatusPill,
  Text,
} from '../src/components/ui'
import { formatShortDate } from '../src/components/admin/adminFormat'
import {
  adminActionErrorKey,
  complianceReminderLabelKey,
  complianceReminderState,
  shouldReloadAfterError,
  type ComplianceReminderState,
} from '../src/components/admin/adminActions'
import { space } from '../src/theme/tokens'
import { COMPLIANCE_FEATURE_ENABLED } from '../src/launchFeatures'

type Coach = { userId: string; name: string; avatarUrl: string | null }
type TeamGroup = {
  id: string
  displayName: string
  type: string
  teams: Array<{
    id: string
    displayName: string
    coachAssignments?: { headCoach: Coach | null; assistants: Coach[] } | null
  }>
}

type FzStatus = 'MISSING' | 'EXPIRED' | 'EXPIRING' | 'VALID'

export type SafeguardingRow = {
  userId: string
  name: string
  avatarUrl: string | null
  teamNames: string[]
  youthStaff: boolean
  status: FzStatus
  expiresAt: string | null
}

const STATUS_ORDER: Record<FzStatus, number> = { EXPIRED: 0, MISSING: 1, EXPIRING: 2, VALID: 3 }

/** Youth staff (coaches of YOUTH/MINI teams) merged with Führungszeugnis records. */
export function buildSafeguardingRows(groups: TeamGroup[], records: ComplianceItem[]): SafeguardingRow[] {
  const rows = new Map<string, SafeguardingRow>()
  for (const group of groups) {
    const youth = group.type === TeamGroupType.YOUTH || group.type === TeamGroupType.MINI
    if (!youth) continue
    for (const team of group.teams ?? []) {
      const coaches = [
        ...(team.coachAssignments?.headCoach ? [team.coachAssignments.headCoach] : []),
        ...(team.coachAssignments?.assistants ?? []),
      ]
      for (const coach of coaches) {
        const row = rows.get(coach.userId) ?? {
          userId: coach.userId,
          name: coach.name,
          avatarUrl: coach.avatarUrl,
          teamNames: [],
          youthStaff: true,
          status: 'MISSING' as FzStatus,
          expiresAt: null,
        }
        if (!row.teamNames.includes(team.displayName)) row.teamNames.push(team.displayName)
        rows.set(coach.userId, row)
      }
    }
  }
  for (const record of records) {
    if (record.kind !== 'FUEHRUNGSZEUGNIS') continue
    // Shared with the API so the "läuft ab" window can't drift (L6).
    const status: FzStatus = complianceStatus(record.expiresAt)
    const existing = rows.get(record.memberUserId)
    rows.set(record.memberUserId, {
      userId: record.memberUserId,
      name: existing?.name ?? record.memberName,
      avatarUrl: existing?.avatarUrl ?? null,
      teamNames: existing?.teamNames ?? [],
      youthStaff: existing?.youthStaff ?? false,
      status,
      expiresAt: record.expiresAt,
    })
  }
  return [...rows.values()].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  )
}

/**
 * Führungszeugnisse — who works with children and whether their extended
 * certificate of conduct is on file. Missing or expiring ones come first,
 * each with "Erinnern" and "Vorgelegt".
 */
export default function ComplianceScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

  const [rows, setRows] = useState<SafeguardingRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [reminded, setReminded] = useState<Record<string, ComplianceReminderState>>({})

  const load = useCallback(async () => {
    if (!COMPLIANCE_FEATURE_ENABLED || !clubId) return
    try {
      const [groups, records] = await Promise.all([
        api<TeamGroup[]>(`/clubs/${clubId}/team-groups`),
        api<ComplianceItem[]>(`/clubs/${clubId}/compliance?kind=FUEHRUNGSZEUGNIS`),
      ])
      setRows(
        buildSafeguardingRows(Array.isArray(groups) ? groups : [], Array.isArray(records) ? records : []),
      )
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [clubId])

  useEffect(() => {
    setStatus('loading')
    void load()
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const act = async (
    key: string,
    request: () => Promise<unknown>,
  ): Promise<{ ok: true; value: unknown } | { ok: false }> => {
    setBusy(key)
    try {
      return { ok: true, value: await request() }
    } catch (error) {
      // M3: translated message per status, never raw server text.
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        t(adminActionErrorKey(error)),
      )
      if (shouldReloadAfterError(error)) void load()
      return { ok: false }
    } finally {
      setBusy(null)
    }
  }

  const markPresented = async (row: SafeguardingRow) => {
    const result = await act(`fz:${row.userId}`, () =>
      api(`/clubs/${clubId}/compliance`, {
        method: 'POST',
        body: {
          memberUserId: row.userId,
          kind: 'FUEHRUNGSZEUGNIS',
          issuedAt: new Date().toISOString(),
        },
      }),
    )
    if (result.ok) await load()
  }

  const remind = async (row: SafeguardingRow) => {
    const result = await act(`remind:${row.userId}`, () =>
      api(`/clubs/${clubId}/compliance/remind`, {
        method: 'POST',
        body: { memberUserId: row.userId, kind: 'FUEHRUNGSZEUGNIS' },
      }),
    )
    if (!result.ok) return
    // M1: 24h cooldown per person and document; say so instead of pretending.
    const state = complianceReminderState(result.value)
    if (state === 'failed') {
      Alert.alert(t('common.errorTitle'), t('aufgaben.actionError'))
      return
    }
    setReminded((current) => ({ ...current, [row.userId]: state }))
  }

  const confirmRenewal = (row: SafeguardingRow) =>
    Alert.alert(
      t('verein.fz.renewTitle', { name: row.name }),
      t('verein.fz.renewBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('aufgaben.fzPresented'), onPress: () => void markPresented(row) },
      ],
    )

  const open = useMemo(() => rows.filter((row) => row.status !== 'VALID'), [rows])
  const valid = useMemo(() => rows.filter((row) => row.status === 'VALID'), [rows])

  const header = <ModalHeader title={t('verein.fz.title')} mode="back" />

  if (!COMPLIANCE_FEATURE_ENABLED) {
    return <Redirect href="/(tabs)/verein" />
  }

  if (!isAdmin || !clubId) {
    return (
      <Screen header={header} padded={false}>
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen
      header={header}
      scroll
      padded={false}
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {status === 'loading' ? (
        <View style={styles.skeleton} testID="compliance-loading">
          <Skeleton shape="line" width="80%" height={14} />
          <Skeleton shape="card" height={128} />
          <Skeleton shape="card" height={180} />
        </View>
      ) : status === 'error' ? (
        <ErrorState
          message={t('verein.fz.loadError')}
          onRetry={() => {
            setStatus('loading')
            void load()
          }}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="checkmark.shield"
          title={t('verein.fz.emptyTitle')}
          description={t('verein.fz.emptyBody')}
        />
      ) : (
        <>
          <Text variant="subheadline" color="secondary" style={styles.intro}>
            {t('verein.fz.intro')}
          </Text>

          {open.length > 0 ? (
            <SectionGroup header={`${t('verein.fz.actionNeeded')} · ${open.length}`}>
              {open.map((row) => {
                const reminderState = reminded[row.userId]
                const wasReminded = reminderState !== undefined
                return (
                  <View key={row.userId} style={styles.taskRow}>
                    <View style={styles.taskHead}>
                      <Avatar size="md" src={row.avatarUrl} fallbackText={row.name} />
                      <View style={styles.taskText}>
                        <Text variant="body" weight="semibold" color="primary" numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text variant="footnote" color="secondary" numberOfLines={2}>
                          {[row.teamNames.join(', '), statusLine(row, t)].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <StatusPill
                        label={t(`verein.fz.status.${row.status}`)}
                        tone={row.status === 'EXPIRING' ? 'warning' : 'error'}
                      />
                    </View>
                    <View style={styles.taskActions}>
                      <Button
                        label={t(complianceReminderLabelKey(reminderState))}
                        variant="plain"
                        size="sm"
                        loading={busy === `remind:${row.userId}`}
                        disabled={busy !== null || wasReminded}
                        onPress={() => void remind(row)}
                        accessibilityLabel={`${t('aufgaben.remind')}: ${row.name}`}
                      />
                      <Button
                        label={t('aufgaben.fzPresented')}
                        variant="filled"
                        size="sm"
                        loading={busy === `fz:${row.userId}`}
                        disabled={busy !== null}
                        onPress={() => void markPresented(row)}
                        accessibilityLabel={`${t('aufgaben.fzPresented')}: ${row.name}`}
                      />
                    </View>
                  </View>
                )
              })}
            </SectionGroup>
          ) : null}

          {valid.length > 0 ? (
            <SectionGroup header={`${t('verein.fz.onFile')} · ${valid.length}`} footer={t('verein.fz.onFileHint')}>
              {valid.map((row) => (
                <ListRow
                  key={row.userId}
                  left={<Avatar size="md" src={row.avatarUrl} fallbackText={row.name} />}
                  title={row.name}
                  subtitle={[row.teamNames.join(', '), statusLine(row, t)].filter(Boolean).join(' · ')}
                  subtitleNumberOfLines={2}
                  showChevron
                  onPress={() => confirmRenewal(row)}
                />
              ))}
            </SectionGroup>
          ) : null}
        </>
      )}
    </Screen>
  )
}

function statusLine(row: SafeguardingRow, t: (key: string, options?: Record<string, unknown>) => string) {
  if (row.status === 'MISSING') return t('verein.fz.missing')
  if (row.status === 'EXPIRED') return t('verein.fz.expiredOn', { date: formatShortDate(row.expiresAt) })
  if (row.status === 'EXPIRING') return t('verein.fz.expiresOn', { date: formatShortDate(row.expiresAt) })
  return row.expiresAt ? t('verein.fz.validUntil', { date: formatShortDate(row.expiresAt) }) : t('verein.fz.valid')
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  intro: { paddingHorizontal: space.xs },
  skeleton: { gap: space.md },
  taskRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    gap: space.sm,
  },
  taskHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  taskText: { flex: 1, minWidth: 0, gap: space['2xs'] },
  taskActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.sm },
})
