import { useCallback, useState } from 'react'
import { Alert, RefreshControl, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type {
  BillingStatus,
  ContributionMemberRecord,
  ContributionOverview,
  ContributionPlan,
} from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { api } from '../src/api/client'
import { useEntitlements } from '../src/hooks/useEntitlements'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import { AdminStatsSkeleton } from '../src/components/Skeleton'
import { PaywallSheet } from '../src/components/billing/PaywallSheet'
import {
  Avatar,
  Banner,
  BottomSheet,
  Button,
  ListRow,
  Screen,
  SectionGroup,
  SoftIcon,
  StatusPill,
  type StatusPillTone,
  Text,
} from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { card, fontSize, fonts, hairline, lineHeight, radius, space } from '../src/theme/tokens'

/**
 * Admin Billing — "Editorial Calm" doctrine.
 *
 * Framed around progress-to-collected: percent paid + collected/expected
 * in Geist Mono, one club-primary progress bar, a quiet count strip.
 * Member status uses the calm semantic StatusPill primitive; Tracking and
 * Plans use a single quiet SoftIcon treatment.
 */
export default function AdminBillingScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const entitlements = useEntitlements()
  const clubId = activeClub?.club.id
  const locale = getAppLocale(getAppLanguage())
  const hasBillingAccess =
    Boolean(activeClub?.permissions?.BILLING) ||
    activeClub?.role === MembershipRole.OWNER ||
    activeClub?.role === MembershipRole.ADMIN

  const [paywallVisible, setPaywallVisible] = useState(false)
  const requireContributionIntake = (onAllowed: () => void) => {
    if (entitlements.has('contribution_intake')) {
      onAllowed()
      return
    }
    setPaywallVisible(true)
  }

  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [contributions, setContributions] = useState<ContributionOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMember, setSelectedMember] = useState<ContributionMemberRecord | null>(null)

  const fetchScreenData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }

    try {
      const [billingData, contributionData] = await Promise.all([
        api<BillingStatus>(`/clubs/${clubId}/billing/status`),
        api<ContributionOverview>(`/clubs/${clubId}/contributions`),
      ])

      setBilling(billingData)
      setContributions(contributionData)
      setError(null)
    } catch {
      setError(t('contributions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [clubId, t])

  useFocusEffect(
    useCallback(() => {
      void fetchScreenData()
    }, [fetchScreenData]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchScreenData()
    } finally {
      setRefreshing(false)
    }
  }

  const updateContributionSettings = async (next: Partial<ContributionOverview['settings']>) => {
    if (!clubId || !contributions) {
      return
    }

    setSavingSettings(true)
    try {
      const settings = await api<ContributionOverview['settings']>(
        `/clubs/${clubId}/contributions/settings`,
        {
          method: 'PATCH',
          body: {
            enabled: next.enabled ?? contributions.settings.enabled,
            autoRemindersEnabled:
              next.autoRemindersEnabled ?? contributions.settings.autoRemindersEnabled,
            defaultCurrency: next.defaultCurrency ?? contributions.settings.defaultCurrency,
          },
        },
      )

      setContributions((current) => (current ? { ...current, settings } : current))
    } catch {
      Alert.alert(t('common.errorTitle'), t('contributions.settingsError'))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSendReminders = async (memberUserIds?: string[]) => {
    if (!clubId) {
      return
    }

    setActionLoading(true)
    try {
      const result = await api<{ requested: number; sent: number; skipped: number }>(
        `/clubs/${clubId}/contributions/reminders/send`,
        {
          method: 'POST',
          body: memberUserIds?.length
            ? { memberUserIds, onlyOverdue: false }
            : { onlyOverdue: true },
        },
      )

      Alert.alert(
        t('contributions.reminderSuccessTitle'),
        t('contributions.reminderSuccess', { count: result.sent }),
      )
      setSelectedMember(null)
      await fetchScreenData()
    } catch {
      Alert.alert(t('common.errorTitle'), t('contributions.reminderError'))
    } finally {
      setActionLoading(false)
    }
  }

  const handleStatusUpdate = async (
    status: 'PAID' | 'PENDING' | 'PARTIAL' | 'WAIVED' | 'EXEMPT',
  ) => {
    if (!clubId || !selectedMember?.planId) {
      return
    }

    setActionLoading(true)
    try {
      const nextOverview = await api<ContributionOverview>(
        `/clubs/${clubId}/contributions/members/${selectedMember.memberUserId}/status`,
        {
          method: 'PATCH',
          body: {
            planId: selectedMember.planId,
            status,
          },
        },
      )

      setContributions(nextOverview)
      setSelectedMember(null)
    } catch {
      Alert.alert(t('common.errorTitle'), t('contributions.statusUpdateError'))
    } finally {
      setActionLoading(false)
    }
  }

  if (!hasBillingAccess) {
    return (
      <Screen
        header={<ModalHeader title={t('adminBilling.title')} mode="back" />}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
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
      header={<ModalHeader title={t('adminBilling.title')} mode="back" />}
      scroll
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {error ? (
        <View style={styles.section}>
          <ErrorState message={error} onRetry={fetchScreenData} />
        </View>
      ) : loading ? (
        <View style={styles.section}>
          <AdminStatsSkeleton />
        </View>
      ) : contributions ? (
        <>
          {entitlements.data?.compliance?.status === 'OVER_QUOTA' ? (
            <Banner
              tone="warning"
              title={t('adminBilling.overQuotaTitle', {
                defaultValue: 'Plan limit action needed',
              })}
              description={t('adminBilling.overQuotaBody', {
                defaultValue:
                  'Archive {{teams}} excess team(s) and {{players}} excess player seat(s), or change plan, before {{date}}. Existing data is safe; new activations are blocked.',
                teams: entitlements.data.compliance.excessTeams,
                players: entitlements.data.compliance.excessPlayers,
                date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(entitlements.data.compliance.remediationEndsAt),
                ),
              })}
              action={{
                label: t('adminBilling.reviewPlan', { defaultValue: 'Review plan' }),
                onPress: () => router.push('/team-management'),
              }}
              style={styles.section}
            />
          ) : null}
          {/* ── Progress-to-collected hero ── */}
          <View style={styles.section}>
            <ProgressToCollected
              collected={contributions.summary.collectedAmount}
              expected={contributions.summary.expectedAmount}
              currency={contributions.settings.defaultCurrency}
              locale={locale}
              assigned={contributions.summary.assignedMembers}
              paid={contributions.summary.paidMembers}
              overdue={contributions.summary.overdueMembers}
            />
          </View>

          {/* ── Tracking + auto-reminders ── */}
          <SectionGroup
            header={t('contributions.tracking', { defaultValue: 'Tracking' })}
            footer={t('contributions.settingsBody')}
            style={styles.section}
          >
            <ListRow
              left={<SoftIcon name="gearshape.fill" />}
              title={t('contributions.trackContributions', {
                defaultValue: 'Track contributions',
              })}
              right={<OnOffValue on={contributions.settings.enabled} />}
              disabled={savingSettings}
              onPress={() =>
                updateContributionSettings({
                  enabled: !contributions.settings.enabled,
                })
              }
            />
            <ListRow
              left={<SoftIcon name="bell.fill" />}
              title={t('contributions.autoReminders', {
                defaultValue: 'Auto reminders',
              })}
              right={<OnOffValue on={contributions.settings.autoRemindersEnabled} />}
              disabled={savingSettings || !contributions.settings.enabled}
              onPress={() =>
                updateContributionSettings({
                  autoRemindersEnabled: !contributions.settings.autoRemindersEnabled,
                })
              }
            />
            <ListRow
              left={<SoftIcon name="banknote" />}
              title={t('contributions.bankSetup.rowTitle', { defaultValue: 'Bank transfer' })}
              subtitle={
                contributions.settings.bankIban
                  ? t('contributions.bankSetup.rowSubtitleSet', {
                      defaultValue: 'IBAN ending {{last4}}',
                      last4: contributions.settings.bankIban.slice(-4),
                    })
                  : t('contributions.bankSetup.rowSubtitleEmpty', {
                      defaultValue: 'Add the club IBAN members pay to',
                    })
              }
              showChevron
              onPress={() => router.push('/admin-contribution-bank')}
            />
            <ListRow
              left={<SoftIcon name="doc.text.fill" />}
              title={t('contributions.reconciliationTitle', {
                defaultValue: 'Bank reconciliation',
              })}
              subtitle={t('contributions.reconciliationSubtitle', {
                defaultValue: 'Import CSV/CAMT.053 and confirm payment matches',
              })}
              showChevron
              onPress={() => router.push('/admin-contribution-reconciliation')}
            />
          </SectionGroup>

          {/* ── Contribution plans ── */}
          <SectionGroup header={t('contributions.plansTitle')} style={styles.section}>
            <ListRow
              left={<SoftIcon name="plus.circle.fill" />}
              title={t('contributions.addPlan')}
              showChevron
              onPress={() =>
                requireContributionIntake(() => router.push('/admin-contribution-plan'))
              }
            />
            {contributions.plans.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                locale={locale}
                onPress={() =>
                  router.push({
                    pathname: '/admin-contribution-plan',
                    params: { planId: plan.id },
                  })
                }
              />
            ))}
          </SectionGroup>

          {/* ── Members enrolled ── */}
          <SectionGroup
            header={t('contributions.membersTitle')}
            footer={t('contributions.membersBody')}
            style={styles.section}
          >
            {contributions.summary.overdueMembers > 0 ? (
              <ListRow
                left={<SoftIcon name="paperplane.fill" color={c.warning} />}
                title={t('contributions.sendOverdueReminders')}
                showChevron
                disabled={actionLoading}
                onPress={() => handleSendReminders()}
              />
            ) : null}
            {contributions.members.filter((m) => m.planId).length === 0 ? (
              <ListRow
                left={<SoftIcon name="info.circle.fill" color={c.textSecondary} />}
                title={t('contributions.emptyMembersTitle')}
                subtitle={t('contributions.emptyMembersBody')}
              />
            ) : (
              contributions.members
                .filter((m) => m.planId)
                .map((member) => (
                  <MemberRow
                    key={`${member.memberUserId}:${member.planId}`}
                    member={member}
                    locale={locale}
                    onPress={() => setSelectedMember(member)}
                  />
                ))
            )}
          </SectionGroup>

          {/* ── Anstoss plan access. Club dues stay offline/bank-transfer only. ── */}
          <SectionGroup
            header={t('adminBilling.paymentSectionTitle', {
              defaultValue: 'Anstoss plan',
            })}
            style={styles.section}
          >
            <PlatformBillingRows billing={billing} />
          </SectionGroup>
        </>
      ) : null}

      <ContributionMemberActionSheet
        member={selectedMember}
        visible={!!selectedMember}
        loading={actionLoading}
        onClose={() => setSelectedMember(null)}
        onSendReminder={() =>
          selectedMember ? handleSendReminders([selectedMember.memberUserId]) : Promise.resolve()
        }
        onStatusChange={handleStatusUpdate}
      />

      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        triggerFeature="contribution_intake"
        onUpgradeStarted={() => void entitlements.refresh()}
      />
    </Screen>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/**
 * Progress-to-collected hero — the treasurer's single answer to
 * "how are we doing this period". Percent paid + collected/expected in
 * Geist Mono, a calm club-primary progress bar, and a quiet count strip
 * (assigned / paid / overdue) below.
 */
function ProgressToCollected({
  collected,
  expected,
  currency,
  locale,
  assigned,
  paid,
  overdue,
}: {
  collected: number
  expected: number
  currency: string
  locale: string
  assigned: number
  paid: number
  overdue: number
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const pct = expected > 0 ? Math.min(1, collected / expected) : 0

  return (
    <View
      style={[styles.progressCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
    >
      <Text variant="caption2" color="tertiary" style={styles.sectionEyebrow}>
        {t('contributions.thisPeriod', { defaultValue: 'THIS PERIOD' }).toUpperCase()}
      </Text>

      <View style={styles.progressHead}>
        <Text variant="data" color="primary" tabular style={styles.progressPct}>
          {Math.round(pct * 100)}%
        </Text>
        <Text variant="caption1" color="secondary">
          {t('contributions.summaryCollected')}
        </Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
        <View
          style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: c.primary }]}
        />
      </View>

      <View style={styles.progressMoneyRow}>
        <Text variant="callout" color="primary" weight="semibold" tabular numberOfLines={1}>
          {formatCurrency(collected, currency, locale)}
        </Text>
        <Text variant="caption1" color="tertiary" tabular numberOfLines={1}>
          {t('contributions.summaryExpected')} {formatCurrency(expected, currency, locale)}
        </Text>
      </View>

      <View style={[styles.progressDivider, { backgroundColor: c.borderSubtle }]} />

      <View style={styles.progressCounts}>
        <CountStat label={t('contributions.summaryAssigned')} value={assigned} />
        <CountStat label={t('contributions.summaryPaid')} value={paid} />
        <CountStat
          label={t('contributions.summaryOverdue')}
          value={overdue}
          tone={overdue > 0 ? 'warning' : undefined}
        />
      </View>
    </View>
  )
}

function CountStat({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  const c = useClubColors()
  return (
    <View style={styles.countStat}>
      <Text
        variant="title3"
        weight="semibold"
        tabular
        style={{ color: tone === 'warning' ? c.warning : c.textPrimary }}
      >
        {String(value)}
      </Text>
      <Text variant="caption2" color="secondary">
        {label}
      </Text>
    </View>
  )
}

/** iOS-native short "On" / "Off" indicator. */
function OnOffValue({ on }: { on: boolean }) {
  const c = useClubColors()
  const { t } = useTranslation()
  return (
    <Text variant="body" style={{ color: on ? c.primary : c.textTertiary }}>
      {on ? t('common.on', { defaultValue: 'On' }) : t('common.off', { defaultValue: 'Off' })}
    </Text>
  )
}

function PlanRow({
  plan,
  locale,
  onPress,
}: {
  plan: ContributionPlan
  locale: string
  onPress: () => void
}) {
  const { t } = useTranslation()
  return (
    <ListRow
      left={<SoftIcon name="creditcard.fill" />}
      title={plan.name}
      subtitle={`${formatCurrency(plan.amount, plan.currency, locale)} · ${t(`contributions.cadence.${plan.cadence}`)} · ${t(`contributions.targetRole.${plan.targetRole}`)}`}
      showChevron
      onPress={onPress}
    />
  )
}

function MemberRow({
  member,
  locale,
  onPress,
}: {
  member: ContributionMemberRecord
  locale: string
  onPress: () => void
}) {
  const { t } = useTranslation()
  const amountLabel =
    member.amount != null && member.currency
      ? formatCurrency(member.amount, member.currency, locale)
      : '-'
  const dueLabel = member.dueDate
    ? formatDate(member.dueDate, locale)
    : t('contributions.memberNoDueDate')

  return (
    <ListRow
      left={<Avatar size="sm" src={member.avatarUrl} fallbackText={member.name} />}
      title={member.name}
      subtitle={`${amountLabel} · ${dueLabel}`}
      right={
        member.status ? (
          <StatusPill
            tone={getStatusTone(member.status)}
            label={t(`contributions.status.${member.status}`)}
          />
        ) : (
          <Text variant="footnote" color="tertiary">
            -
          </Text>
        )
      }
      showChevron
      onPress={onPress}
    />
  )
}

function PlatformBillingRows({ billing }: { billing: BillingStatus | null }) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (!billing) {
    return (
      <ListRow
        left={<SoftIcon name="info.circle.fill" color={c.textSecondary} />}
        title={t('adminBilling.unavailable')}
      />
    )
  }

  return (
    <>
      <ListRow
        left={<SoftIcon name="star.fill" />}
        title={t('adminBilling.launchAccessTitle', { defaultValue: 'Launch access included' })}
        subtitle={t('adminBilling.launchAccessSubtitle', {
          defaultValue:
            'No digital subscription is sold in this store build. Club finance tools remain available during launch.',
        })}
        right={
          <Text variant="body" style={{ color: c.success }}>
            {t('adminBilling.included', { defaultValue: 'Included' })}
          </Text>
        }
      />
    </>
  )
}

function ContributionMemberActionSheet({
  member,
  visible,
  loading,
  onClose,
  onSendReminder,
  onStatusChange,
}: {
  member: ContributionMemberRecord | null
  visible: boolean
  loading: boolean
  onClose: () => void
  onSendReminder: () => Promise<void>
  onStatusChange: (status: 'PAID' | 'PENDING' | 'PARTIAL' | 'WAIVED' | 'EXEMPT') => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()

  if (!member) {
    return null
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct="auto"
      paddingBottom={space.xl + insets.bottom}
    >
      <View style={styles.actionSheetBody}>
        <Text style={[styles.actionSheetTitle, { color: c.textPrimary }]}>
          {t('contributions.memberActionTitle', { name: member.name })}
        </Text>
        <Text style={[styles.actionSheetSubtitle, { color: c.textSecondary }]}>
          {member.planName ?? ''}
        </Text>

        {/* Primary CTA */}
        <Button
          label={t('contributions.markPaid')}
          variant="filled"
          size="md"
          onPress={() => onStatusChange('PAID')}
          disabled={loading}
          fullWidth
          hapticTone="success"
        />

        {/* 2×2 secondary status grid */}
        <View style={styles.actionStatusGrid}>
          <View style={styles.actionStatusRow}>
            <View style={styles.actionStatusCell}>
              <Button
                label={t('contributions.markPending')}
                variant="tinted"
                size="sm"
                onPress={() => onStatusChange('PENDING')}
                disabled={loading}
                fullWidth
              />
            </View>
            <View style={styles.actionStatusCell}>
              <Button
                label={t('contributions.markPartial')}
                variant="tinted"
                size="sm"
                onPress={() => onStatusChange('PARTIAL')}
                disabled={loading}
                fullWidth
              />
            </View>
          </View>
          <View style={styles.actionStatusRow}>
            <View style={styles.actionStatusCell}>
              <Button
                label={t('contributions.markWaived')}
                variant="tinted"
                size="sm"
                onPress={() => onStatusChange('WAIVED')}
                disabled={loading}
                fullWidth
              />
            </View>
            <View style={styles.actionStatusCell}>
              <Button
                label={t('contributions.markExempt')}
                variant="tinted"
                size="sm"
                onPress={() => onStatusChange('EXEMPT')}
                disabled={loading}
                fullWidth
              />
            </View>
          </View>
        </View>

        {/* Ghost actions */}
        <View style={[styles.actionDivider, { backgroundColor: c.borderSubtle }]} />
        <Button
          label={t('contributions.sendReminder')}
          variant="plain"
          size="md"
          onPress={() => void onSendReminder()}
          disabled={loading || !member.planId}
          fullWidth
        />
        <Button
          label={t('common.close')}
          variant="bordered"
          size="md"
          onPress={onClose}
          fullWidth
        />
      </View>
    </BottomSheet>
  )
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function getStatusTone(status: ContributionMemberRecord['status']): StatusPillTone {
  switch (status) {
    case 'PAID':
      return 'success'
    case 'OVERDUE':
      return 'error'
    case 'PARTIAL':
      return 'warning'
    case 'PENDING':
      return 'info'
    default:
      return 'neutral'
  }
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function formatCurrency(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.lg,
  },
  section: {
    paddingHorizontal: space.md,
  },
  sectionEyebrow: {
    marginBottom: space.sm,
    letterSpacing: 1.2,
  },

  // Progress-to-collected hero
  progressCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: space.sm,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  progressPct: {
    letterSpacing: -0.5,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.full },
  progressMoneyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  progressDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space['2xs'],
  },
  progressCounts: {
    flexDirection: 'row',
    gap: space.lg,
  },
  countStat: { gap: space['2xs'] },

  actionSheetBody: {
    paddingHorizontal: card.paddingHero,
    gap: space.sm,
  },
  actionSheetTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.lg,
  },
  actionSheetSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    // color resolved inline via c.textSecondary
    marginBottom: space.md,
  },
  actionStatusGrid: {
    gap: space.xs,
  },
  actionStatusRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  actionStatusCell: {
    flex: 1,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    // backgroundColor is resolved inline via c.borderSubtle (needs theme)
  },
})
