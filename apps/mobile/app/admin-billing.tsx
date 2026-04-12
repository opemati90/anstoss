import { useCallback, useState } from 'react'
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
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
import { api } from '../src/api/client'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import { AdminStatsSkeleton } from '../src/components/Skeleton'
import { Button, Card, Icon, Screen, Text } from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import {
  card,
  fontSize,
  fonts,
  hairline,
  lineHeight,
  radius,
  semanticColors,
  space,
} from '../src/theme/tokens'

export default function AdminBillingScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const locale = getAppLocale(getAppLanguage())
  const hasBillingAccess =
    Boolean(activeClub?.permissions?.BILLING) ||
    activeClub?.role === MembershipRole.OWNER ||
    activeClub?.role === MembershipRole.ADMIN

  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [contributions, setContributions] = useState<ContributionOverview | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMember, setSelectedMember] =
    useState<ContributionMemberRecord | null>(null)

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

  const updateContributionSettings = async (
    next: Partial<ContributionOverview['settings']>,
  ) => {
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
              next.autoRemindersEnabled ??
              contributions.settings.autoRemindersEnabled,
            defaultCurrency:
              next.defaultCurrency ?? contributions.settings.defaultCurrency,
          },
        },
      )

      setContributions((current) =>
        current
          ? {
              ...current,
              settings,
            }
          : current,
      )
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
      <Screen header={<ModalHeader title={t('adminBilling.title')} mode="back" />} padded={false}>
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('adminBilling.title')} mode="back" />} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Card elevated style={styles.heroCard}>
          <Text style={[styles.heroEyebrow, { color: c.textTertiary }]} numberOfLines={1}>
            {t('contributions.sectionTitle')}
          </Text>
          <Text style={[styles.heroTitle, { color: c.textPrimary }]} numberOfLines={2}>
            {t('contributions.heroTitle')}
          </Text>
          <Text style={[styles.heroBody, { color: c.textSecondary }]} numberOfLines={3}>
            {t('contributions.heroBody')}
          </Text>
        </Card>

        {error ? (
          <ErrorState message={error} onRetry={fetchScreenData} />
        ) : loading ? (
          <AdminStatsSkeleton />
        ) : contributions ? (
          <>
            <Card style={styles.settingsCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderCopy}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]} numberOfLines={2}>
                    {t('contributions.settingsTitle')}
                  </Text>
                  <Text style={[styles.sectionBody, { color: c.textSecondary }]} numberOfLines={3}>
                    {t('contributions.settingsBody')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.stateBadge,
                    {
                      backgroundColor: contributions.settings.enabled
                        ? `${c.clubPrimary}14`
                        : `${c.borderStrong}30`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.stateBadgeText,
                      {
                        color: contributions.settings.enabled
                          ? c.clubPrimary
                          : c.textSecondary,
                      },
                    ]}
                  >
                    {contributions.settings.enabled
                      ? t('contributions.enabled')
                      : t('contributions.disabled')}
                  </Text>
                </View>
              </View>

              <View style={styles.inlineActions}>
                <Button
                  label={
                    contributions.settings.enabled
                      ? t('contributions.disableTracking')
                      : t('contributions.enableTracking')
                  }
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    updateContributionSettings({
                      enabled: !contributions.settings.enabled,
                    })
                  }
                  disabled={savingSettings}
                />
                <Button
                  label={
                    contributions.settings.autoRemindersEnabled
                      ? t('contributions.autoRemindersOn')
                      : t('contributions.autoRemindersOff')
                  }
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    updateContributionSettings({
                      autoRemindersEnabled:
                        !contributions.settings.autoRemindersEnabled,
                    })
                  }
                  disabled={savingSettings || !contributions.settings.enabled}
                />
              </View>
            </Card>

            <View style={styles.summaryGrid}>
              <FinanceStatCard
                label={t('contributions.summaryAssigned')}
                value={String(contributions.summary.assignedMembers)}
                accent={c.clubPrimary}
              />
              <FinanceStatCard
                label={t('contributions.summaryPaid')}
                value={String(contributions.summary.paidMembers)}
                accent={semanticColors.success}
              />
              <FinanceStatCard
                label={t('contributions.summaryOverdue')}
                value={String(contributions.summary.overdueMembers)}
                accent={semanticColors.warning}
              />
              <FinanceStatCard
                label={t('contributions.summaryOutstanding')}
                value={String(contributions.summary.outstandingMembers)}
                accent={c.textPrimary}
              />
            </View>

            <Card style={styles.moneyStrip}>
              <View style={styles.moneyItem}>
                <Text style={[styles.moneyLabel, { color: c.textSecondary }]}>
                  {t('contributions.summaryCollected')}
                </Text>
                <Text style={[styles.moneyValue, { color: c.textPrimary }]}>
                  {formatCurrency(
                    contributions.summary.collectedAmount,
                    contributions.settings.defaultCurrency,
                    locale,
                  )}
                </Text>
              </View>
              <View style={styles.moneyItem}>
                <Text style={[styles.moneyLabel, { color: c.textSecondary }]}>
                  {t('contributions.summaryExpected')}
                </Text>
                <Text style={[styles.moneyValue, { color: c.textPrimary }]}>
                  {formatCurrency(
                    contributions.summary.expectedAmount,
                    contributions.settings.defaultCurrency,
                    locale,
                  )}
                </Text>
              </View>
            </Card>

            <View style={styles.inlineSectionHeader}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                {t('contributions.plansTitle')}
              </Text>
              <Button
                label={t('contributions.addPlan')}
                variant="ghost"
                size="sm"
                onPress={() => router.push('/admin-contribution-plan')}
              />
            </View>

            {contributions.plans.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
                  {t('contributions.emptyPlansTitle')}
                </Text>
                <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
                  {t('contributions.emptyPlansBody')}
                </Text>
              </Card>
            ) : (
              contributions.plans.map((plan) => (
                <ContributionPlanCard
                  key={plan.id}
                  plan={plan}
                  locale={locale}
                  onEdit={() =>
                    router.push({
                      pathname: '/admin-contribution-plan',
                      params: { planId: plan.id },
                    })
                  }
                />
              ))
            )}

            <View style={styles.inlineSectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                  {t('contributions.membersTitle')}
                </Text>
                <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
                  {t('contributions.membersBody')}
                </Text>
              </View>
              <Button
                label={t('contributions.sendOverdueReminders')}
                variant="secondary"
                size="sm"
                onPress={() => handleSendReminders()}
                disabled={
                  actionLoading || contributions.summary.overdueMembers === 0
                }
              />
            </View>

            {contributions.members.filter((member) => member.planId).length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
                  {t('contributions.emptyMembersTitle')}
                </Text>
                <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
                  {t('contributions.emptyMembersBody')}
                </Text>
              </Card>
            ) : (
              <Card style={styles.memberCard}>
                {contributions.members
                  .filter((member) => member.planId)
                  .map((member, index, items) => (
                    <ContributionMemberRow
                      key={`${member.memberUserId}:${member.planId}`}
                      member={member}
                      locale={locale}
                      isLast={index === items.length - 1}
                      onPress={() => setSelectedMember(member)}
                    />
                  ))}
              </Card>
            )}

            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
              {t('adminBilling.platformBillingTitle')}
            </Text>
            <PlatformBillingCard billing={billing} locale={locale} />
          </>
        ) : null}
      </ScrollView>

      <ContributionMemberActionSheet
        member={selectedMember}
        visible={!!selectedMember}
        loading={actionLoading}
        onClose={() => setSelectedMember(null)}
        onSendReminder={() =>
          selectedMember
            ? handleSendReminders([selectedMember.memberUserId])
            : Promise.resolve()
        }
        onStatusChange={handleStatusUpdate}
      />
    </Screen>
  )
}

function FinanceStatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  const c = useClubColors()

  return (
    <Card style={styles.financeCard}>
      <Text style={[styles.financeValue, { color: accent }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.financeLabel, { color: c.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
    </Card>
  )
}

function ContributionPlanCard({
  plan,
  locale,
  onEdit,
}: {
  plan: ContributionPlan
  locale: string
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  return (
    <Card style={styles.planCard}>
      <View style={styles.planCardHeader}>
        <View style={styles.planCardCopy}>
          <Text style={[styles.planName, { color: c.textPrimary }]} numberOfLines={1}>{plan.name}</Text>
          <Text style={[styles.planMeta, { color: c.textSecondary }]} numberOfLines={2}>
            {formatCurrency(plan.amount, plan.currency, locale)} ·{' '}
            {t(`contributions.cadence.${plan.cadence}`)} ·{' '}
            {t(`contributions.targetRole.${plan.targetRole}`)}
          </Text>
        </View>
        <Button label={t('contributions.editPlan')} variant="ghost" size="sm" onPress={onEdit} />
      </View>

      {plan.description ? (
        <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
          {plan.description}
        </Text>
      ) : null}

      <View style={styles.planFactsRow}>
        <View style={styles.planFact}>
          <Text style={[styles.planFactLabel, { color: c.textSecondary }]}>
            {t('contributions.dueLabel')}
          </Text>
          <Text style={[styles.planFactValue, { color: c.textPrimary }]}>
            {getPlanDueSummary(plan, t)}
          </Text>
        </View>
        <View style={styles.planFact}>
          <Text style={[styles.planFactLabel, { color: c.textSecondary }]}>
            {t('contributions.assignedLabel')}
          </Text>
          <Text style={[styles.planFactValue, { color: c.textPrimary }]}>
            {plan.assignedMemberCount}
          </Text>
        </View>
        <View style={styles.planFact}>
          <Text style={[styles.planFactLabel, { color: c.textSecondary }]}>
            {t('contributions.remindersLabel')}
          </Text>
          <Text style={[styles.planFactValue, { color: c.textPrimary }]}>
            {getReminderSummary(plan)}
          </Text>
        </View>
      </View>
    </Card>
  )
}

function ContributionMemberRow({
  member,
  locale,
  isLast,
  onPress,
}: {
  member: ContributionMemberRecord
  locale: string
  isLast: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const statusTone = getStatusTone(member.status, c.clubPrimary)

  return (
    <View
      style={[
        styles.memberRow,
        !isLast && { borderBottomWidth: hairline, borderBottomColor: c.border },
      ]}
    >
      <View style={styles.memberCopy}>
        <Text style={[styles.memberName, { color: c.textPrimary }]} numberOfLines={1}>{member.name}</Text>
        <Text style={[styles.memberMeta, { color: c.textSecondary }]} numberOfLines={1}>
          {member.planName} · {member.amount != null && member.currency
            ? formatCurrency(member.amount, member.currency, locale)
            : '—'}
        </Text>
        <Text style={[styles.memberMeta, { color: c.textSecondary }]} numberOfLines={1}>
          {member.dueDate
            ? t('contributions.memberDueDate', {
                date: formatDate(member.dueDate, locale),
              })
            : t('contributions.memberNoDueDate')}
        </Text>
      </View>

      <View style={styles.memberActions}>
        <View style={[styles.statusPill, { backgroundColor: `${statusTone}16` }]}>
          <Text style={[styles.statusPillText, { color: statusTone }]}>
            {member.status ? t(`contributions.status.${member.status}`) : '—'}
          </Text>
        </View>
        <Button
          label={t('contributions.manageMember')}
          variant="ghost"
          size="sm"
          onPress={onPress}
        />
      </View>
    </View>
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
  onStatusChange: (
    status: 'PAID' | 'PENDING' | 'PARTIAL' | 'WAIVED' | 'EXEMPT',
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (!member) {
    return null
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBackdrop} />
        <View style={[styles.actionSheet, { backgroundColor: c.background }]}>
          <View style={styles.actionSheetHeader}>
            <View>
              <Text style={[styles.actionSheetTitle, { color: c.textPrimary }]}>
                {t('contributions.memberActionTitle', { name: member.name })}
              </Text>
              <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
                {member.planName}
              </Text>
            </View>
            <Button label={t('common.close')} variant="ghost" size="sm" onPress={onClose} />
          </View>

          <View style={styles.actionButtonGrid}>
            <Button label={t('contributions.markPaid')} size="sm" onPress={() => onStatusChange('PAID')} disabled={loading} />
            <Button label={t('contributions.markPending')} variant="secondary" size="sm" onPress={() => onStatusChange('PENDING')} disabled={loading} />
            <Button label={t('contributions.markPartial')} variant="secondary" size="sm" onPress={() => onStatusChange('PARTIAL')} disabled={loading} />
            <Button label={t('contributions.markWaived')} variant="secondary" size="sm" onPress={() => onStatusChange('WAIVED')} disabled={loading} />
            <Button label={t('contributions.markExempt')} variant="secondary" size="sm" onPress={() => onStatusChange('EXEMPT')} disabled={loading} />
            <Button label={t('contributions.sendReminder')} variant="ghost" size="sm" onPress={() => void onSendReminder()} disabled={loading || !member.planId} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

function PlatformBillingCard({
  billing,
  locale,
}: {
  billing: BillingStatus | null
  locale: string
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (!billing) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
          {t('adminBilling.unavailable')}
        </Text>
      </Card>
    )
  }

  const stripeConnected = billing.connectStatus === 'active'
  const statusColor =
    billing.subscriptionStatus === 'active'
      ? semanticColors.success
      : billing.subscriptionStatus === 'past_due'
        ? semanticColors.warning
        : c.textSecondary

  return (
    <>
      <Card style={styles.planCard}>
        <View style={styles.planCardHeader}>
          <View style={styles.planCardCopy}>
            <Text style={[styles.planName, { color: c.textPrimary }]}>
              {billing.plan === 'FOUNDATION'
                ? t('adminBilling.freePlan')
                : t('adminBilling.proPlan')}
            </Text>
            {billing.currentPeriodEnd ? (
              <Text style={[styles.planMeta, { color: c.textSecondary }]}>
                {t('adminBilling.periodEnd', {
                  date: formatDate(billing.currentPeriodEnd, locale),
                })}
              </Text>
            ) : null}
          </View>
          <View style={[styles.stateBadge, { backgroundColor: `${statusColor}18` }]}>
            <Text style={[styles.stateBadgeText, { color: statusColor }]}>
              {t(`adminBilling.status.${billing.subscriptionStatus}`)}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.planCard}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
          {t('adminBilling.paymentSetup')}
        </Text>
        <View style={styles.connectRow}>
          <Icon
            name={stripeConnected ? 'checkmark.circle.fill' : 'exclamationmark.circle'}
            size="md"
            color={stripeConnected ? semanticColors.success : semanticColors.warning}
          />
          <Text style={[styles.sectionBody, { color: c.textPrimary }]}>
            {stripeConnected
              ? t('adminBilling.stripeConnected')
              : t('adminBilling.stripeNotConnected')}
          </Text>
        </View>
        {!stripeConnected ? (
          <Button
            label={t('adminBilling.setupStripe')}
            variant="filled"
            size="md"
            onPress={() => router.push('/stripe-connect')}
            fullWidth
          />
        ) : null}
      </Card>
    </>
  )
}

function getReminderSummary(plan: ContributionPlan) {
  const before = plan.reminderPolicy.daysBefore.map((value) => `-${value}`).join(', ')
  const after = plan.reminderPolicy.daysAfter.map((value) => `+${value}`).join(', ')

  if (!before && !after) {
    return '—'
  }

  return [before, after].filter(Boolean).join(' / ')
}

function getPlanDueSummary(
  plan: ContributionPlan,
  t: (key: string) => string,
) {
  if (plan.cadence === 'YEARLY') {
    return `${plan.dueDay}.${String(plan.dueMonth ?? 1).padStart(2, '0')}`
  }

  return `${t('contributions.monthlyShort')} ${plan.dueDay}`
}

function getStatusTone(status: ContributionMemberRecord['status'], clubPrimary: string) {
  switch (status) {
    case 'PAID':
      return semanticColors.success
    case 'OVERDUE':
      return semanticColors.warning
    case 'PARTIAL':
      return semanticColors.info
    case 'WAIVED':
      return clubPrimary
    case 'EXEMPT':
      return '#6B6B66'
    default:
      return '#1A1A18'
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

const styles = StyleSheet.create({
  content: {
    paddingBottom: space.xl,
  },
  heroCard: {
    marginHorizontal: space.md,
    marginTop: space.md,
    gap: space.xs,
    borderRadius: card.heroRadius,
  },
  heroEyebrow: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.lg,
    letterSpacing: -0.15,
  },
  heroBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  settingsCard: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    gap: space.md,
    borderRadius: card.radius,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: space.xs,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  stateBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  stateBadgeText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.md,
    marginTop: space.sm,
  },
  financeCard: {
    width: '48%',
    minHeight: 92,
    justifyContent: 'space-between',
    borderRadius: card.radius,
  },
  financeValue: {
    fontSize: fontSize.xl,
    fontFamily: fonts.data,
  },
  financeLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  moneyStrip: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    borderRadius: card.radius,
  },
  moneyItem: {
    flex: 1,
    gap: space.xs,
  },
  moneyLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  moneyValue: {
    fontSize: fontSize.md,
    fontFamily: fonts.data,
  },
  inlineSectionHeader: {
    marginTop: space.lg,
    marginBottom: space.sm,
    marginHorizontal: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  emptyCard: {
    marginHorizontal: space.md,
    gap: space.xs,
    borderRadius: card.radius,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  planCard: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    gap: space.md,
    borderRadius: card.radius,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
  planCardCopy: {
    flex: 1,
    gap: space.xs,
  },
  planName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  planMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  planFactsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  planFact: {
    flex: 1,
    gap: space.xs,
  },
  planFactLabel: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  planFactValue: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
  },
  memberCard: {
    marginHorizontal: space.md,
    paddingVertical: 0,
    borderRadius: card.radius,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  memberCopy: {
    flex: 1,
    gap: space.xs,
  },
  memberName: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  memberMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  memberActions: {
    alignItems: 'flex-end',
    gap: space.sm,
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  statusPillText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  actionSheet: {
    borderTopLeftRadius: card.heroRadius,
    borderTopRightRadius: card.heroRadius,
    paddingHorizontal: card.paddingHero,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
  },
  actionSheetTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.md,
  },
  actionButtonGrid: {
    gap: space.sm,
  },
})
