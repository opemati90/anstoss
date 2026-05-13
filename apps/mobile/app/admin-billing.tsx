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
  SettingsIconTint,
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
 * Admin Billing — iOS Settings doctrine.
 *
 * Sunken gray background, grouped white section cards, tinted-square SF
 * symbol leads each functional row. The previous version stacked four
 * competing visual systems (hero card, 2x2 stat grid, money strip, plan
 * cards, member rows) — this one stays disciplined to one pattern.
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
          {/* Period summary — single grouped list of stat rows. */}
          <SectionGroup
            header={t('contributions.thisPeriod', { defaultValue: 'This period' })}
            style={styles.section}
          >
            <ListRow
              left={
                <SettingsIcon
                  name="person.2.fill"
                  tint={SettingsIconTint.blue}
                />
              }
              title={t('contributions.summaryAssigned')}
              right={<StatValue value={contributions.summary.assignedMembers} />}
            />
            <ListRow
              left={
                <SettingsIcon
                  name="checkmark.circle.fill"
                  tint={SettingsIconTint.green}
                />
              }
              title={t('contributions.summaryPaid')}
              right={<StatValue value={contributions.summary.paidMembers} />}
            />
            <ListRow
              left={
                <SettingsIcon
                  name="exclamationmark.triangle.fill"
                  tint={SettingsIconTint.orange}
                />
              }
              title={t('contributions.summaryOverdue')}
              right={
                <StatValue
                  value={contributions.summary.overdueMembers}
                  tone={
                    contributions.summary.overdueMembers > 0
                      ? semanticColors.warning
                      : undefined
                  }
                />
              }
            />
            <ListRow
              left={
                <SettingsIcon
                  name="banknote"
                  tint={SettingsIconTint.teal}
                />
              }
              title={t('contributions.summaryCollected')}
              right={
                <Text variant="body" color="secondary" tabular>
                  {formatCurrency(
                    contributions.summary.collectedAmount,
                    contributions.settings.defaultCurrency,
                    locale,
                  )}
                </Text>
              }
            />
            <ListRow
              left={
                <SettingsIcon
                  name="chart.bar.fill"
                  tint={SettingsIconTint.purple}
                />
              }
              title={t('contributions.summaryExpected')}
              right={
                <Text variant="body" color="secondary" tabular>
                  {formatCurrency(
                    contributions.summary.expectedAmount,
                    contributions.settings.defaultCurrency,
                    locale,
                  )}
                </Text>
              }
            />
          </SectionGroup>

          {/* Tracking + auto-reminders — tap row to toggle. */}
          <SectionGroup
            header={t('contributions.tracking', { defaultValue: 'Tracking' })}
            footer={t('contributions.settingsBody')}
            style={styles.section}
          >
            <ListRow
              left={
                <SettingsIcon
                  name="gearshape.fill"
                  tint={SettingsIconTint.gray}
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
                <SettingsIcon name="bell.fill" tint={SettingsIconTint.red} />
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

          {/* Contribution plans. Top row = "Add plan" action; rest = plans. */}
          <SectionGroup
            header={t('contributions.plansTitle')}
            style={styles.section}
          >
            <ListRow
              left={
                <SettingsIcon
                  name="plus.circle.fill"
                  tint={SettingsIconTint.blue}
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
              <ListRow
                key={plan.id}
                left={
                  <SettingsIcon
                    name="creditcard.fill"
                    tint={SettingsIconTint.indigo}
                  />
                }
                title={plan.name}
                subtitle={`${formatCurrency(plan.amount, plan.currency, locale)} · ${t(`contributions.cadence.${plan.cadence}`)} · ${t(`contributions.targetRole.${plan.targetRole}`)}`}
                showChevron
                onPress={() =>
                  router.push({
                    pathname: '/admin-contribution-plan',
                    params: { planId: plan.id },
                  })
                }
              />
            ))}
          </SectionGroup>

          {/* Members enrolled. Tap row → action sheet. */}
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
                    tint={SettingsIconTint.orange}
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
                    tint={SettingsIconTint.gray}
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

          {/* Platform billing — at the bottom of the screen. */}
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

/** Numeric right-aligned value, optional warning tone. */
function StatValue({ value, tone }: { value: number; tone?: string }) {
  return (
    <Text
      variant="body"
      tabular
      color="secondary"
      style={tone ? { color: tone } : undefined}
    >
      {value}
    </Text>
  )
}

/** iOS-native short "On" / "Off" indicator (matches Settings toggle rows). */
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
        <View style={styles.memberAvatar}>
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
            tint={SettingsIconTint.gray}
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
            tint={SettingsIconTint.yellow}
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
            tint={
              stripeConnected ? SettingsIconTint.green : SettingsIconTint.orange
            }
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

  if (!member) {
    return null
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBackdrop, { backgroundColor: c.surfaceOverlay }]} />
        <View style={[styles.actionSheet, { backgroundColor: c.background }]}>
          <View style={styles.actionSheetHandle}>
            <View style={[styles.actionSheetHandleBar, { backgroundColor: c.borderStrong }]} />
          </View>
          <Text style={[styles.actionSheetTitle, { color: c.textPrimary }]}>
            {t('contributions.memberActionTitle', { name: member.name })}
          </Text>
          <Text style={[styles.actionSheetSubtitle, { color: c.textSecondary }]}>
            {member.planName}
          </Text>

          <View style={styles.actionButtonGrid}>
            <Button label={t('contributions.markPaid')} size="md" onPress={() => onStatusChange('PAID')} disabled={loading} fullWidth />
            <Button label={t('contributions.markPending')} variant="secondary" size="md" onPress={() => onStatusChange('PENDING')} disabled={loading} fullWidth />
            <Button label={t('contributions.markPartial')} variant="secondary" size="md" onPress={() => onStatusChange('PARTIAL')} disabled={loading} fullWidth />
            <Button label={t('contributions.markWaived')} variant="secondary" size="md" onPress={() => onStatusChange('WAIVED')} disabled={loading} fullWidth />
            <Button label={t('contributions.markExempt')} variant="secondary" size="md" onPress={() => onStatusChange('EXEMPT')} disabled={loading} fullWidth />
            <Button label={t('contributions.sendReminder')} variant="ghost" size="md" onPress={() => void onSendReminder()} disabled={loading || !member.planId} fullWidth />
            <Button label={t('common.close')} variant="ghost" size="md" onPress={onClose} fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  )
}

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

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.lg,
  },
  section: {
    paddingHorizontal: space.md,
  },
  memberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E6E7F2',
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
    paddingBottom: space.xl,
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
    color: '#5F626C',
    marginBottom: space.md,
  },
  actionButtonGrid: {
    gap: space.sm,
  },
})
