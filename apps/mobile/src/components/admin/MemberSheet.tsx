import { useCallback, useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AdminMemberSummary, ComplianceKind } from '@anstoss/shared'
import { api, ApiError } from '../../api/client'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'
import {
  Avatar,
  BottomSheet,
  Button,
  ListRow,
  SectionGroup,
  StatusPill,
  type StatusPillTone,
  Text,
} from '../ui'
import { Skeleton } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import { space } from '../../theme/tokens'
import { formatMoney, formatShortDate } from './adminFormat'
import { COMPLIANCE_FEATURE_ENABLED } from '../../launchFeatures'

export type MemberSheetProps = {
  clubId: string
  userId: string | null
  visible: boolean
  onClose: () => void
  /** Called after a change so the list can refresh its counts. */
  onChanged?: () => void
  /** Destructive "remove from club" action; hidden when omitted. */
  onRemove?: (summary: AdminMemberSummary) => void
}

/**
 * Member detail for admins: role, team, Beitragsstatus, SEPA-Mandat,
 * DSGVO-Einwilligung and (for youth staff) Führungszeugnis — each with the
 * one action an admin actually takes from here.
 */
export function MemberSheet({ clubId, userId, visible, onClose, onChanged, onRemove }: MemberSheetProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsetsSafe()
  const [summary, setSummary] = useState<AdminMemberSummary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busy, setBusy] = useState<ComplianceKind | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setStatus('loading')
    try {
      const data = await api<AdminMemberSummary>(`/clubs/${clubId}/members/${userId}/admin-summary`)
      if (!data || typeof data !== 'object' || !('userId' in data)) {
        setStatus('error')
        return
      }
      setSummary(data)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [clubId, userId])

  useEffect(() => {
    if (visible && userId) void load()
    if (!visible) setSummary(null)
  }, [load, userId, visible])

  const recordDocument = async (kind: ComplianceKind) => {
    if (!COMPLIANCE_FEATURE_ENABLED) return
    if (!summary) return
    setBusy(kind)
    try {
      await api(`/clubs/${clubId}/compliance`, {
        method: 'POST',
        body: { memberUserId: summary.userId, kind, issuedAt: new Date().toISOString() },
      })
      await load()
      onChanged?.()
    } catch (error) {
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        error instanceof ApiError && error.message ? error.message : t('aufgaben.actionError'),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={85}
      paddingBottom={space.lg + insets.bottom}
    >
      {status === 'loading' ? (
        <View style={styles.body} testID="member-sheet-loading">
          <View style={styles.identity}>
            <Skeleton shape="circle" width={64} height={64} />
            <View style={styles.identityText}>
              <Skeleton shape="line" width="60%" height={20} />
              <Skeleton shape="line" width="40%" height={14} />
            </View>
          </View>
          <Skeleton shape="card" height={120} />
          <Skeleton shape="card" height={160} />
        </View>
      ) : status === 'error' || !summary ? (
        <View style={styles.body}>
          <ErrorState message={t('verein.memberSheet.loadError')} onRetry={() => void load()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.identity}>
            <Avatar size="lg" src={summary.avatarUrl} fallbackText={summary.name} />
            <View style={styles.identityText}>
              <Text variant="title3" weight="bold" color="primary" numberOfLines={2}>
                {summary.name}
              </Text>
              {summary.email ? (
                <Text variant="footnote" color="secondary" numberOfLines={1}>
                  {summary.email}
                </Text>
              ) : null}
            </View>
          </View>

          <SectionGroup header={t('verein.memberSheet.membership')}>
            <ListRow
              title={t('verein.memberSheet.role')}
              right={
                <Text variant="body" color="secondary" numberOfLines={1}>
                  {[
                    t(`verein.memberRole.${summary.role}`, { defaultValue: summary.role }),
                    ...summary.operationalRoles
                      .filter((role) => role === 'TREASURER' || role === 'SECRETARY')
                      .map((role) => t(`verein.office.${role}`)),
                  ].join(' · ')}
                </Text>
              }
            />
            <ListRow
              title={t('verein.memberSheet.team')}
              subtitle={
                summary.teams.length > 0
                  ? summary.teams
                      .map(
                        (team) =>
                          `${team.teamName} (${t(`teamRoles.${team.role}`, { defaultValue: team.role })})`,
                      )
                      .join(', ')
                  : t('verein.memberSheet.noTeam')
              }
              subtitleNumberOfLines={3}
            />
            <ListRow
              title={t('verein.memberSheet.status')}
              right={
                <StatusPill
                  label={
                    summary.isYouth
                      ? t('verein.members.filter.youth')
                      : summary.teams.length > 0 || summary.role !== 'PLAYER'
                        ? t('verein.members.filter.active')
                        : t('verein.members.filter.passive')
                  }
                  tone="neutral"
                />
              }
            />
          </SectionGroup>

          <SectionGroup header={t('verein.memberSheet.financeAndData')}>
            <ListRow
              title={t('verein.memberSheet.dues')}
              subtitle={
                summary.contribution
                  ? [
                      summary.contribution.planName,
                      formatMoney(summary.contribution.amount, summary.contribution.currency),
                      summary.contribution.dueDate
                        ? t('verein.memberSheet.dueOn', {
                            date: formatShortDate(summary.contribution.dueDate),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : t('verein.memberSheet.noPlan')
              }
              right={
                summary.contribution ? (
                  <StatusPill
                    label={t(`contributions.status.${summary.contribution.status}`)}
                    tone={duesTone(summary.contribution.status)}
                  />
                ) : undefined
              }
            />
            {COMPLIANCE_FEATURE_ENABLED ? <DocumentRow
              title={t('verein.memberSheet.sepa')}
              issuedAt={summary.sepaMandate?.issuedAt ?? null}
              present={Boolean(summary.sepaMandate)}
              missingLabel={t('verein.memberSheet.sepaMissing')}
              actionLabel={t('verein.memberSheet.markReceived')}
              busy={busy === 'SEPA_MANDATE'}
              onRecord={() => void recordDocument('SEPA_MANDATE')}
            /> : null}
            {COMPLIANCE_FEATURE_ENABLED ? <DocumentRow
              title={t('verein.memberSheet.gdpr')}
              issuedAt={summary.dataConsent?.issuedAt ?? null}
              present={Boolean(summary.dataConsent)}
              missingLabel={t('verein.memberSheet.gdprMissing')}
              actionLabel={t('verein.memberSheet.markReceived')}
              busy={busy === 'DATA_CONSENT'}
              onRecord={() => void recordDocument('DATA_CONSENT')}
            /> : null}
            {COMPLIANCE_FEATURE_ENABLED && summary.safeguarding ? (
              <DocumentRow
                title={t('verein.memberSheet.fz')}
                issuedAt={null}
                present={summary.safeguarding.status === 'VALID' || summary.safeguarding.status === 'EXPIRING'}
                presentLabel={
                  summary.safeguarding.expiresAt
                    ? t('verein.fz.validUntil', { date: formatShortDate(summary.safeguarding.expiresAt) })
                    : undefined
                }
                missingLabel={
                  summary.safeguarding.status === 'EXPIRED'
                    ? t('verein.fz.expiredOn', { date: formatShortDate(summary.safeguarding.expiresAt) })
                    : t('verein.fz.missing')
                }
                warn={summary.safeguarding.status !== 'VALID'}
                actionLabel={t('aufgaben.fzPresented')}
                busy={busy === 'FUEHRUNGSZEUGNIS'}
                onRecord={() => void recordDocument('FUEHRUNGSZEUGNIS')}
              />
            ) : null}
          </SectionGroup>

          {onRemove && summary.role !== 'OWNER' ? (
            <SectionGroup>
              <ListRow
                title={t('verein.memberSheet.remove')}
                destructive
                onPress={() => onRemove(summary)}
              />
            </SectionGroup>
          ) : null}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

function DocumentRow({
  title,
  issuedAt,
  present,
  presentLabel,
  missingLabel,
  actionLabel,
  busy,
  warn,
  onRecord,
}: {
  title: string
  issuedAt: string | null
  present: boolean
  presentLabel?: string
  missingLabel: string
  actionLabel: string
  busy: boolean
  warn?: boolean
  onRecord: () => void
}) {
  const { t } = useTranslation()
  const subtitle = present
    ? presentLabel ??
      (issuedAt
        ? t('verein.memberSheet.receivedOn', { date: formatShortDate(issuedAt) })
        : t('verein.memberSheet.received'))
    : missingLabel
  return (
    <View style={styles.documentRow}>
      <View style={styles.documentText}>
        <Text variant="body" color="primary">
          {title}
        </Text>
        <Text variant="footnote" color={present && !warn ? 'secondary' : 'warning'}>
          {subtitle}
        </Text>
      </View>
      {!present || warn ? (
        <Button
          label={actionLabel}
          variant="tinted"
          size="sm"
          loading={busy}
          disabled={busy}
          onPress={onRecord}
          accessibilityLabel={`${title}: ${actionLabel}`}
        />
      ) : null}
    </View>
  )
}

function duesTone(status: string): StatusPillTone {
  if (status === 'PAID') return 'success'
  if (status === 'OVERDUE') return 'error'
  if (status === 'PARTIAL' || status === 'PENDING') return 'warning'
  return 'neutral'
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  identityText: { flex: 1, minWidth: 0, gap: space['2xs'] },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  documentText: { flex: 1, minWidth: 0, gap: space['2xs'] },
})
