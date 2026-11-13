import { useCallback, useState } from 'react'
import { Alert, Pressable, RefreshControl, StyleSheet, Switch, View } from 'react-native'
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
import { ClubScreenHeader } from '../src/components/club/ClubScreenHeader'
import { DuesTag, formatDues, type DuesTagTone } from '../src/components/club/DuesTag'
import { AdminStatsSkeleton } from '../src/components/Skeleton'
import { PaywallSheet } from '../src/components/billing/PaywallSheet'
import {
  Avatar,
  Banner,
  BottomSheet,
  Button,
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  SoftIcon,
  PressableScale,
  SegmentedControl,
  Text,
} from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import {
  RADIUS_FULL,
  RADIUS_HERO,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXS,
  space,
} from '../src/theme/tokens'

/**
 * Kasse — the treasurer's view of member dues (redesign screen 19).
 *
 * An ink hero answers "how much is in, how much is open" in Barlow numbers
 * with a paid-share bar and one lime reminder action; a segmented filter
 * (Offen / Bezahlt / Alle) drives the member list, where each open row can be
 * marked paid (or a member's reported transfer confirmed) in one tap. Row
 * taps still open the full status sheet. Tracking, bank, plans and the
 * Anstoss plan follow below.
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
  const [filter, setFilter] = useState<'open' | 'paid' | 'all'>('open')
  const [reminded, setReminded] = useState(false)
  // Design 20 month chip: the period on show ("2026-11"). The API reads
  // `?period=`; older servers ignore it and return the current period.
  const [period, setPeriod] = useState(() => periodOf(new Date()))
  const [monthOpen, setMonthOpen] = useState(false)

  const fetchScreenData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }

    try {
      const [billingData, contributionData] = await Promise.all([
        // Plan status is garnish; the finance hub must load without it.
        api<BillingStatus>(`/clubs/${clubId}/billing/status`).catch(() => null),
        api<ContributionOverview>(`/clubs/${clubId}/contributions?period=${period}`),
      ])

      setBilling(billingData)
      setContributions(contributionData)
      setError(null)
    } catch {
      setError(t('contributions.loadError'))
    } finally {
      setLoading(false)
    }
  }, [clubId, period, t])

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
      if (!memberUserIds?.length) setReminded(true)
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
    target: ContributionMemberRecord | null = selectedMember,
  ) => {
    if (!clubId || !target?.planId) {
      return
    }

    setActionLoading(true)
    try {
      const nextOverview = await api<ContributionOverview>(
        `/clubs/${clubId}/contributions/members/${target.memberUserId}/status`,
        {
          method: 'PATCH',
          body: {
            planId: target.planId,
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

  const handleQuickMarkPaid = (member: ContributionMemberRecord) =>
    handleStatusUpdate('PAID', member)

  const enrolled = (contributions?.members ?? []).filter((m) => m.planId)
  const openItems = enrolled
    .filter((m) => !isSettled(m.status))
    .sort((a, b) => Number(b.status === 'OVERDUE') - Number(a.status === 'OVERDUE'))
  const settledItems = enrolled.filter((m) => isSettled(m.status))
  const visibleItems =
    filter === 'open' ? openItems : filter === 'paid' ? settledItems : [...openItems, ...settledItems]

  const header = (
    <ClubScreenHeader
      title={t('fees.title', { defaultValue: 'Dues' })}
      fallbackHref="/(tabs)"
      right={
        hasBillingAccess ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('fees.monthA11y')}, ${monthLabel(period, locale)}`}
            onPress={() => setMonthOpen(true)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.monthChip,
              { borderColor: c.borderStrong },
              pressed && styles.pressed,
            ]}
            testID="fees-month"
          >
            <Text variant="subheadline" weight="semibold" color="primary">
              {monthLabel(period, locale)}
            </Text>
            <Icon name="chevron.down" size={14} color="primary" />
          </Pressable>
        ) : undefined
      }
    />
  )

  if (!hasBillingAccess) {
    return (
      <Screen scroll contentStyle={styles.content}>
        {header}
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
      scroll
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {header}
      {error ? (
        <ErrorState message={error} onRetry={fetchScreenData} />
      ) : loading ? (
        <AdminStatsSkeleton />
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
            />
          ) : null}

          {/* ── Ink hero: collected / open, paid share, one reminder action ── */}
          <CollectedHero
            summary={contributions.summary}
            plans={contributions.plans}
            currency={contributions.settings.defaultCurrency}
            locale={locale}
            reminded={reminded}
            remindDisabled={actionLoading}
            onRemind={() => void handleSendReminders()}
          />

          <SegmentedControl
            fullWidth
            testID="fees-filter"
            segments={[
              {
                key: 'open' as const,
                label: `${t('contributions.summaryOutstanding')} · ${openItems.length}`,
              },
              {
                key: 'paid' as const,
                label: `${t('contributions.summaryPaid')} · ${settledItems.length}`,
              },
              { key: 'all' as const, label: t('eventFilter.all') },
            ]}
            value={filter}
            onChange={setFilter}
          />

          {/* ── Member list ── */}
          <SectionGroup footer={t('contributions.membersBody')}>
            {visibleItems.length === 0 ? (
              <ListRow
                left={<SoftIcon name="checkmark.circle.fill" color={c.success} />}
                title={
                  enrolled.length > 0
                    ? filter === 'open'
                      ? t('verein.finance.noOpenItems')
                      : t('fees.noneInFilter', { defaultValue: 'Nobody here yet.' })
                    : t('contributions.emptyMembersTitle')
                }
                subtitle={enrolled.length > 0 ? undefined : t('contributions.emptyMembersBody')}
              />
            ) : (
              visibleItems.map((member) => (
                <DuesMemberRow
                  key={`${member.memberUserId}:${member.planId}`}
                  member={member}
                  locale={locale}
                  disabled={actionLoading}
                  onPress={() => setSelectedMember(member)}
                  onMarkPaid={() => void handleQuickMarkPaid(member)}
                />
              ))
            )}
          </SectionGroup>

          {/* ── Bank statement matching ── */}
          <SectionGroup>
            <ListRow
              left={<SoftIcon name="doc.text" />}
              title={t('fees.reconcileTitle', { defaultValue: 'Match bank statement' })}
              subtitle={t('fees.reconcileSub', {
                defaultValue: 'CSV or CAMT from online banking',
              })}
              showChevron
              onPress={() => router.push('/admin-contribution-reconciliation')}
            />
          </SectionGroup>

          <Text variant="footnote" color="secondary">
            {t('fees.footnote', {
              defaultValue:
                'Anstoss never collects money. Members transfer straight to the club account; you only see the status here.',
            })}
          </Text>

          {/* ── Tracking + auto-reminders: real switches ── */}
          <SectionGroup
            header={t('contributions.tracking', { defaultValue: 'Tracking' })}
            footer={t('verein.finance.trackingFooter')}
          >
            <ListRow
              left={<SoftIcon name="gearshape.fill" />}
              title={t('contributions.trackContributions', {
                defaultValue: 'Track contributions',
              })}
              right={
                <Switch
                  value={contributions.settings.enabled}
                  disabled={savingSettings}
                  onValueChange={(enabled) => void updateContributionSettings({ enabled })}
                  trackColor={{ true: c.ink, false: c.borderDefault }}
                  accessibilityLabel={t('contributions.trackContributions')}
                />
              }
            />
            <ListRow
              left={<SoftIcon name="bell.fill" />}
              title={t('contributions.autoReminders', {
                defaultValue: 'Auto reminders',
              })}
              subtitle={t('verein.finance.autoRemindersHint')}
              right={
                <Switch
                  value={contributions.settings.autoRemindersEnabled}
                  disabled={savingSettings || !contributions.settings.enabled}
                  onValueChange={(autoRemindersEnabled) =>
                    void updateContributionSettings({ autoRemindersEnabled })
                  }
                  trackColor={{ true: c.ink, false: c.borderDefault }}
                  accessibilityLabel={t('contributions.autoReminders')}
                />
              }
            />
          </SectionGroup>

          {/* ── Bank: the account members pay to ── */}
          <SectionGroup header={t('verein.finance.bankSection')}>
            <ListRow
              left={<SoftIcon name="building.2" />}
              title={t('verein.finance.bank')}
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
          </SectionGroup>

          {/* ── Contribution plans ── */}
          <SectionGroup header={t('verein.finance.feeSchedule')}>
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

          {/* ── Anstoss plan access. Club dues stay offline/bank-transfer only. ── */}
          <SectionGroup header={t('verein.settings.plan')}>
            <PlatformBillingRows billing={billing} />
          </SectionGroup>
        </>
      ) : null}

      <BottomSheet visible={monthOpen} onClose={() => setMonthOpen(false)} heightPct="auto">
        <View style={styles.monthSheet}>
          <SectionGroup>
            {recentPeriods(6).map((option) => (
              <ListRow
                key={option}
                title={monthLabel(option, locale, true)}
                selected={option === period}
                right={option === period ? <Icon name="checkmark" size={18} color="primary" /> : undefined}
                onPress={() => {
                  setMonthOpen(false)
                  if (option !== period) {
                    setLoading(true)
                    setPeriod(option)
                  }
                }}
                testID={`fees-month-${option}`}
              />
            ))}
          </SectionGroup>
        </View>
      </BottomSheet>
      <ContributionMemberActionSheet
        member={selectedMember}
        visible={!!selectedMember}
        loading={actionLoading}
        onClose={() => setSelectedMember(null)}
        onSendReminder={() =>
          selectedMember ? handleSendReminders([selectedMember.memberUserId]) : Promise.resolve()
        }
        onStatusChange={(status) => handleStatusUpdate(status)}
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

/** Members whose period needs no more money. */
const SETTLED = new Set(['PAID', 'WAIVED', 'EXEMPT'])
function isSettled(status: ContributionMemberRecord['status']) {
  return Boolean(status && SETTLED.has(status))
}

/** The member told the treasurer they transferred; it awaits confirmation. */
function isReported(member: ContributionMemberRecord) {
  return (
    (member.paymentReported === true || member.note === 'PAYMENT_REPORTED_BY_MEMBER') &&
    !isSettled(member.status)
  )
}

/** Paid row meta: "Kontoauszug · 01.11.", "Bar beim Training · 03.11." … */
function paidMeta(
  t: (key: string, options?: Record<string, unknown>) => string,
  member: ContributionMemberRecord,
  locale: string,
) {
  if (!member.paidAt) return member.planName ?? ''
  const date = formatDate(member.paidAt, locale)
  if (member.confirmedVia === 'STATEMENT_IMPORT') return t('fees.viaStatement', { date })
  if (member.paymentMethod === 'CASH') return t('fees.viaCash', { date })
  if (member.paymentMethod === 'TRANSFER' || member.paymentMethod === 'SEPA') {
    return t('fees.viaTransfer', { date })
  }
  return t('fees.paidOn', { defaultValue: 'Paid {{date}}', date })
}

/** "2026-11" for a date (local calendar). */
function periodOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** This month and the `count - 1` before it, newest first. */
function recentPeriods(count: number) {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => periodOf(new Date(now.getFullYear(), now.getMonth() - i, 1)))
}

/** "November" (chip) or "November 2026" (sheet). */
function monthLabel(period: string, locale: string, withYear = false) {
  const [year, month] = period.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }).format(
    new Date(year, (month || 1) - 1, 1),
  )
}

/**
 * Ink hero — "Eingegangen" in large Barlow, "Offen" on the right, a two-part
 * bar for the paid share, the paid-of-assigned line and one lime action to
 * remind everyone overdue.
 */
function CollectedHero({
  summary,
  plans,
  currency,
  locale,
  reminded,
  remindDisabled,
  onRemind,
}: {
  summary: ContributionOverview['summary']
  plans: ContributionPlan[]
  currency: string
  locale: string
  reminded: boolean
  remindDisabled: boolean
  onRemind: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const open = Math.max(0, summary.expectedAmount - summary.collectedAmount)
  const unpaid = Math.max(0, summary.assignedMembers - summary.paidMembers)
  const activePlans = plans.filter((plan) => plan.active)
  const monthlyPlan =
    activePlans.length === 1 && activePlans[0].cadence === 'MONTHLY' ? activePlans[0] : null
  const meta = [
    t('fees.paidOfTotal', {
      defaultValue: '{{paid}} of {{total}} paid',
      paid: summary.paidMembers,
      total: summary.assignedMembers,
    }),
    monthlyPlan
      ? t('fees.perMonth', {
          defaultValue: '{{amount}} a month',
          amount: formatDues(monthlyPlan.amount, monthlyPlan.currency, locale),
        })
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const fg = c.onInk
  return (
    <View style={[styles.hero, { backgroundColor: c.ink }]} testID="fees-hero">
      <View style={styles.heroTop}>
        <View style={styles.heroStat}>
          <Text variant="subheadline" style={{ color: fg, opacity: 0.72 }}>
            {t('contributions.summaryCollected')}
          </Text>
          <Text
            variant="dataLarge"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: fg, fontSize: 52, lineHeight: 54 }}
          >
            {formatDues(summary.collectedAmount, currency, locale)}
          </Text>
        </View>
        <View style={[styles.heroStat, styles.heroStatRight]}>
          <Text variant="subheadline" style={{ color: fg, opacity: 0.72 }}>
            {t('contributions.summaryOutstanding')}
          </Text>
          <Text variant="dataLarge" numberOfLines={1} style={{ color: fg, fontSize: 30, lineHeight: 32 }}>
            {formatDues(open, currency, locale)}
          </Text>
        </View>
      </View>
      <View
        style={styles.heroBar}
        accessibilityRole="image"
        accessibilityLabel={t('fees.paidShareA11y', {
          defaultValue: '{{paid}} of {{total}} paid',
          paid: summary.paidMembers,
          total: summary.assignedMembers,
        })}
      >
        {summary.paidMembers > 0 ? (
          <View style={{ flex: summary.paidMembers, backgroundColor: fg }} />
        ) : null}
        {unpaid > 0 || summary.paidMembers === 0 ? (
          <View style={{ flex: Math.max(unpaid, 1), backgroundColor: fg, opacity: 0.18 }} />
        ) : null}
      </View>
      <View style={styles.heroFoot}>
        <Text variant="subheadline" style={[styles.flexShrink, { color: fg, opacity: 0.8 }]}>
          {meta}
        </Text>
        {summary.overdueMembers > 0 || reminded ? (
          <Button
            variant="accent"
            size="sm"
            label={
              reminded
                ? t('fees.reminded', { defaultValue: 'Reminded' })
                : t('fees.remindCount', {
                    defaultValue: 'Remind {{count}}',
                    count: summary.overdueMembers,
                  })
            }
            accessibilityLabel={t('contributions.sendOverdueReminders')}
            disabled={reminded || remindDisabled}
            onPress={onRemind}
            testID="fees-remind-overdue"
          />
        ) : null}
      </View>
    </View>
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
      subtitle={`${formatDues(plan.amount, plan.currency, locale)} · ${t(`contributions.cadence.${plan.cadence}`)} · ${t(`contributions.targetRole.${plan.targetRole}`)}`}
      showChevron
      onPress={onPress}
    />
  )
}

function DuesMemberRow({
  member,
  locale,
  disabled,
  onPress,
  onMarkPaid,
}: {
  member: ContributionMemberRecord
  locale: string
  disabled: boolean
  onPress: () => void
  onMarkPaid: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const settled = isSettled(member.status)
  const reported = isReported(member)
  const amountLabel =
    member.amount != null && member.currency ? formatDues(member.amount, member.currency, locale) : '–'
  const meta = settled
    ? paidMeta(t, member, locale)
    : reported
      ? member.reportedAt
        ? t('fees.reportedOn', { date: formatDate(member.reportedAt, locale) })
        : t('fees.reportedMeta', { defaultValue: 'Reports: transferred' })
      : member.dueDate
        ? member.status === 'OVERDUE'
          ? t('fees.overdueSince', {
              defaultValue: 'Due since {{date}}',
              date: formatDate(member.dueDate, locale),
            })
          : t('contributions.memberDueDate', { date: formatDate(member.dueDate, locale) })
        : t('contributions.memberNoDueDate')
  const tag = statusTag(t, member)
  // The pill sits beside the pressable body, never inside it (a button in a
  // button is invalid on web and double-announced on iOS).
  return (
    <View style={styles.memberRow}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[member.name, amountLabel, tag.label, meta].filter(Boolean).join(', ')}
        wrapperStyle={styles.memberBodyWrap}
        style={styles.memberBody}
      >
        <Avatar size={36} tone="neutral" src={member.avatarUrl} fallbackText={member.name} />
        <View style={styles.memberText}>
          <Text variant="body" weight="semibold" color="primary" numberOfLines={1}>
            {member.name}{' '}
            <Text variant="data" style={[styles.memberAmount, { color: c.textPrimary }]}>
              {amountLabel}
            </Text>
          </Text>
          {meta ? (
            <Text variant="caption1" color="secondary" numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
          <DuesTag label={tag.label} tone={tag.tone} />
        </View>
      </PressableScale>
      {!settled ? (
        <Button
          variant="bordered"
          size="sm"
          label={
            reported
              ? t('fees.confirm', { defaultValue: 'Confirm' })
              : t('contributions.status.PAID')
          }
          accessibilityLabel={t('fees.markPaidA11y', {
            defaultValue: 'Mark {{name}} as paid',
            name: member.name,
          })}
          disabled={disabled}
          hapticTone="success"
          onPress={onMarkPaid}
        />
      ) : null}
    </View>
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
        subtitle={t('verein.finance.planIncluded')}
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
        <Text variant="title3" weight="bold" color="primary">
          {t('contributions.memberActionTitle', { name: member.name })}
        </Text>
        <Text variant="subheadline" color="secondary" style={styles.actionSheetSubtitle}>
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

function statusTag(
  t: (key: string, options?: Record<string, unknown>) => string,
  member: ContributionMemberRecord,
): { label: string; tone: DuesTagTone } {
  if (isReported(member)) return { label: t('fees.reported', { defaultValue: 'Reported' }), tone: 'neutral' }
  switch (member.status) {
    case 'OVERDUE':
      return { label: t('contributions.status.OVERDUE'), tone: 'overdue' }
    case 'PAID':
    case 'WAIVED':
    case 'EXEMPT':
      return { label: t(`contributions.status.${member.status}`), tone: 'paid' }
    case 'PARTIAL':
      return { label: t('contributions.status.PARTIAL'), tone: 'neutral' }
    default:
      return { label: t('contributions.status.PENDING'), tone: 'neutral' }
  }
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}


// ─── Styles ──────────────────────────────────────────────────────────────────

// Design 20 row: name / meta / tag 3pt apart.
const MEMBER_TEXT_GAP = 3

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_LG,
    paddingBottom: space['3xl'],
    gap: SPACING_XL,
  },
  flexShrink: { flexShrink: 1 },

  // Ink hero
  // Design 20: radius 28, padding 22, 18 between the three bands.
  hero: {
    borderRadius: RADIUS_HERO,
    borderCurve: 'continuous',
    padding: SPACING_XL + 2,
    gap: SPACING_LG + 2,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: SPACING_MD,
  },
  heroStat: { gap: SPACING_XS, flexShrink: 1 },
  heroStatRight: { alignItems: 'flex-end' },
  heroBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: RADIUS_FULL,
    overflow: 'hidden',
    gap: SPACING_XXS,
  },
  heroFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING_MD,
  },

  // Member rows (.row: 60pt min, avatar, text stack, money right)
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    minHeight: 60,
    paddingVertical: SPACING_MD,
    paddingHorizontal: SPACING_LG,
  },
  memberBodyWrap: { flex: 1, minWidth: 0 },
  memberBody: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACING_MD + 2 },
  memberText: { flex: 1, minWidth: 0, gap: MEMBER_TEXT_GAP },
  memberAmount: { fontSize: 16, lineHeight: 20 },
  monthChip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS + 2,
    paddingHorizontal: SPACING_MD + 2,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
  },
  pressed: { opacity: 0.6 },
  monthSheet: { paddingHorizontal: SCREEN_PADDING, paddingTop: SPACING_MD, paddingBottom: SPACING_XL },

  actionSheetBody: {
    gap: SPACING_SM,
  },
  actionSheetSubtitle: {
    marginBottom: SPACING_SM,
  },
  actionStatusGrid: {
    gap: SPACING_XS,
  },
  actionStatusRow: {
    flexDirection: 'row',
    gap: SPACING_XS,
  },
  actionStatusCell: {
    flex: 1,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
  },
})
