import { useCallback, useState } from 'react'
import {
  Alert,
  Modal,
  RefreshControl,
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
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { api } from '../src/api/client'
import { useEntitlements } from '../src/hooks/useEntitlements'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import { AdminStatsSkeleton } from '../src/components/Skeleton'
import { PaywallSheet } from '../src/components/billing/PaywallSheet'
import {
  Button,
  ListRow,
  Screen,
  SectionGroup,
  SettingsIcon,
  StatCard,
  StatGrid,
  Text,
} from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import {
  card,
  fontSize,
  fonts,
  lineHeight,
  radius,
  semanticColors,
  space,
} from '../src/theme/tokens'

/**
 * Admin Billing — Renuir editorial doctrine.
 *
 * Money stats are the hero: 2×3 StatGrid (Geist Mono, no rainbow).
 * Tracking and Plans use a single neutral/primary SettingsIcon tint —
 * no more 5-color icon palette.
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
        current ? { ...current, settings } : current,
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
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
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
          {/* ── Period stats hero — 2×3 StatGrid, Geist Mono values ── */}
          <View style={styles.section}>
            <Text
              variant="caption2"
              color="tertiary"
              style={styles.sectionEyebrow}
            >
              {t('contributions.thisPeriod', { defaultValue: 'THIS PERIOD' }).toUpperCase()}
            </Text>
            <StatGrid columns={3}>
              <StatCard
                label={t('contributions.summaryAssigned')}
                value={String(contributions.summary.assignedMembers)}
              />
              <StatCard
                label={t('contributions.summaryPaid')}
                value={String(contributions.summary.paidMembers)}
              />
              <StatCard
                label={t('contributions.summaryOverdue')}
                value={String(contributions.summary.overdueMembers)}
                tint={
                  contributions.summary.overdueMembers > 0
                    ? semanticColors.warning
                    : undefined
                }
              />
            </StatGrid>

            <View style={[styles.moneyGrid, { backgroundColor: c.surface }]}>
              <MoneyStatCard
                label={t('contributions.summaryCollected')}
                value={formatCurrency(
                  contributions.summary.collectedAmount,
                  contributions.settings.defaultCurrency,
                  locale,
                )}
              />
              <View style={[styles.moneyDivider, { backgroundColor: c.borderSubtle }]} />
              <MoneyStatCard
                label={t('contributions.summaryExpected')}
                value={formatCurrency(
                  contributions.summary.expectedAmount,
                  contributions.settings.defaultCurrency,
                  locale,
                )}
                muted
              />
            </View>
          </View>

          {/* ── Tracking + auto-reminders ── */}
          <SectionGroup
            header={t('contributions.tracking', { defaultValue: 'Tracking' })}
            footer={t('contributions.settingsBody')}
            style={styles.section}
          >
            <ListRow
              left={
                <SettingsIcon
                  name="gearshape.fill"
                  tint={c.textSecondary}
                />
              }
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
              left={
                <SettingsIcon name="bell.fill" tint={c.textSecondary} />
              }
              title={t('contributions.autoReminders', {
                defaultValue: 'Auto reminders',
              })}
              right={
                <OnOffValue on={contributions.settings.autoRemindersEnabled} />
              }
              disabled={savingSettings || !contributions.settings.enabled}
              onPress={() =>
                updateContributionSettings({
                  autoRemindersEnabled:
                    !contributions.settings.autoRemindersEnabled,
                })
              }
            />
          </SectionGroup>

          {/* ── Contribution plans ── */}
          <SectionGroup
            header={t('contributions.plansTitle')}
            style={styles.section}
          >
            <ListRow
              left={
                <SettingsIcon
                  name="plus.circle.fill"
                  tint={c.primary}
                />
              }
              title={t('contributions.addPlan')}
              showChevron
              onPress={() =>
                requireContributionIntake(() =>
                  router.push('/admin-contribution-plan'),
                )
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
                left={
                  <SettingsIcon
                    name="paperplane.fill"
                    tint={c.textSecondary}
                  />
                }
                title={t('contributions.sendOverdueReminders')}
                showChevron
                disabled={actionLoading}
                onPress={() => handleSendReminders()}
              />
            ) : null}
            {contributions.members.filter((m) => m.planId).length === 0 ? (
              <ListRow
                left={
                  <SettingsIcon
                    name="info.circle.fill"
                    tint={c.textSecondary}
                  />
                }
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

          {/* ── Platform billing ── */}
          <SectionGroup
            header={t('adminBilling.platformBillingTitle')}
            style={styles.section}
          >
            <PlatformBillingRows
              billing={billing}
              locale={locale}
              onSetupStripe={() =>
                requireContributionIntake(() => router.push('/stripe-connect'))
              }
            />
          </SectionGroup>
        </>
      ) : null}

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
 * Two-column money stat with Geist Mono value. Sits inside the custom
 * moneyGrid row below the StatGrid — not a full StatCard because we want
 * the currency string at `data` size (20 pt) with a label below.
 */
function MoneyStatCard({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <View style={styles.moneyCell}>
      <Text
        variant="data"
        color={muted ? 'secondary' : 'primary'}
        tabular
        numberOfLines={1}
        style={styles.moneyValue}
      >
        {value}
      </Text>
      <Text variant="caption1" color="secondary">
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
      {on
        ? t('common.on', { defaultValue: 'On' })
        : t('common.off', { defaultValue: 'Off' })}
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
  const c = useClubColors()
  return (
    <ListRow
      left={
        <SettingsIcon
          name="creditcard.fill"
          tint={c.textSecondary}
        />
      }
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
  const c = useClubColors()
  const statusTone = getStatusTone(member.status, c)
  const amountLabel =
    member.amount != null && member.currency
      ? formatCurrency(member.amount, member.currency, locale)
      : '—'
  const dueLabel = member.dueDate
    ? formatDate(member.dueDate, locale)
    : t('contributions.memberNoDueDate')

  return (
    <ListRow
      left={
        <View style={[styles.memberAvatar, { backgroundColor: c.primary50 }]}>
          <Text variant="footnote" weight="bold" style={{ color: c.textSecondary }}>
            {getInitials(member.name)}
          </Text>
        </View>
      }
      title={member.name}
      subtitle={`${amountLabel} · ${dueLabel}`}
      right={
        <View style={[styles.statusPill, { backgroundColor: `${statusTone}1F` }]}>
          <Text style={[styles.statusPillText, { color: statusTone }]}>
            {member.status ? t(`contributions.status.${member.status}`) : '—'}
          </Text>
        </View>
      }
      showChevron
      onPress={onPress}
    />
  )
}

function PlatformBillingRows({
  billing,
  locale,
  onSetupStripe,
}: {
  billing: BillingStatus | null
  locale: string
  onSetupStripe: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (!billing) {
    return (
      <ListRow
        left={
          <SettingsIcon
            name="info.circle.fill"
            tint={c.textSecondary}
          />
        }
        title={t('adminBilling.unavailable')}
      />
    )
  }

  const stripeConnected = billing.connectStatus === 'active'
  const statusKey = billing.subscriptionStatus ?? 'inactive'
  const statusColor =
    billing.subscriptionStatus === 'active'
      ? semanticColors.success
      : billing.subscriptionStatus === 'past_due'
        ? semanticColors.warning
        : c.textSecondary
  const statusLabel = t(`adminBilling.status.${statusKey}`, {
    defaultValue: t('adminBilling.statusInactive', { defaultValue: 'Inactive' }),
  })
  const planLabel =
    billing.plan === 'FOUNDATION'
      ? t('adminBilling.freePlan')
      : t('adminBilling.proPlan')

  return (
    <>
      <ListRow
        left={
          <SettingsIcon
            name="star.fill"
            tint={c.textSecondary}
          />
        }
        title={planLabel}
        subtitle={
          billing.currentPeriodEnd
            ? t('adminBilling.periodEnd', {
                date: formatDate(billing.currentPeriodEnd, locale),
              })
            : undefined
        }
        right={
          <Text variant="body" style={{ color: statusColor }}>
            {statusLabel}
          </Text>
        }
      />
      <ListRow
        left={
          <SettingsIcon
            name={stripeConnected ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
            tint={stripeConnected ? semanticColors.success : c.textSecondary}
          />
        }
        title={t('adminBilling.paymentSetup')}
        subtitle={
          stripeConnected
            ? t('adminBilling.stripeConnected')
            : t('adminBilling.stripeNotConnected')
        }
        showChevron={!stripeConnected}
        onPress={!stripeConnected ? onSetupStripe : undefined}
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
  onStatusChange: (
    status: 'PAID' | 'PENDING' | 'PARTIAL' | 'WAIVED' | 'EXEMPT',
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()

  if (!member) {
    return null
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBackdrop, { backgroundColor: c.surfaceOverlay }]} />
        <View style={[styles.actionSheet, { backgroundColor: c.background, paddingBottom: space.xl + insets.bottom }]}>
          <View style={styles.actionSheetHandle}>
            <View style={[styles.actionSheetHandleBar, { backgroundColor: c.borderStrong }]} />
          </View>
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
                <Button label={t('contributions.markPending')} variant="tinted" size="sm" onPress={() => onStatusChange('PENDING')} disabled={loading} fullWidth />
              </View>
              <View style={styles.actionStatusCell}>
                <Button label={t('contributions.markPartial')} variant="tinted" size="sm" onPress={() => onStatusChange('PARTIAL')} disabled={loading} fullWidth />
              </View>
            </View>
            <View style={styles.actionStatusRow}>
              <View style={styles.actionStatusCell}>
                <Button label={t('contributions.markWaived')} variant="tinted" size="sm" onPress={() => onStatusChange('WAIVED')} disabled={loading} fullWidth />
              </View>
              <View style={styles.actionStatusCell}>
                <Button label={t('contributions.markExempt')} variant="tinted" size="sm" onPress={() => onStatusChange('EXEMPT')} disabled={loading} fullWidth />
              </View>
            </View>
          </View>

          {/* Ghost actions */}
          <View style={[styles.actionDivider, { backgroundColor: c.borderSubtle }]} />
          <Button label={t('contributions.sendReminder')} variant="plain" size="md" onPress={() => void onSendReminder()} disabled={loading || !member.planId} fullWidth />
          <Button label={t('common.close')} variant="bordered" size="md" onPress={onClose} fullWidth />
        </View>
      </View>
    </Modal>
  )
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getStatusTone(
  status: ContributionMemberRecord['status'],
  theme: { primary: string; textSecondary: string; textPrimary: string },
) {
  switch (status) {
    case 'PAID':
      return semanticColors.success
    case 'OVERDUE':
      return semanticColors.warning
    case 'PARTIAL':
      return semanticColors.info
    case 'WAIVED':
      return theme.primary
    case 'EXEMPT':
      return theme.textSecondary
    default:
      return theme.textPrimary
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

  // Money stats: side-by-side inside a card surface below the StatGrid
  moneyGrid: {
    flexDirection: 'row',
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    // Surface is added dynamically — handled via inline style inside
    // the parent because we need useClubColors here. Instead we keep
    // this as a static layout: the white background comes from the
    // StatCard siblings above sharing the same StatGrid surface.
  },
  moneyCell: {
    flex: 1,
    gap: 3,
  },
  moneyValue: {
    // data variant already uses Geist Mono — no extra font override needed
  },
  moneyDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: space.lg,
    alignSelf: 'stretch',
  },

  memberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    // backgroundColor resolved inline via c.primary50
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    minWidth: 60,
    alignItems: 'center',
  },
  statusPillText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  actionSheet: {
    borderTopLeftRadius: card.heroRadius,
    borderTopRightRadius: card.heroRadius,
    paddingHorizontal: card.paddingHero,
    paddingTop: space.sm,
    // paddingBottom set inline to include insets.bottom
    gap: space.sm,
  },
  actionSheetHandle: {
    alignItems: 'center',
    paddingBottom: space.md,
  },
  actionSheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
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
  actionButtonGrid: {
    gap: space.sm,
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
