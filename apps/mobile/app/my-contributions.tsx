import { useCallback, useState } from 'react'
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { MyContributionItem, MyContributionSummary } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ApiError, api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { DashboardSkeleton } from '../src/components/Skeleton'
import { Text, Icon, StatusPill, type StatusPillTone } from '../src/components/ui'
import { elevation, fonts, hairline, radius, space } from '../src/theme/tokens'

function formatCurrency(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function statusTone(status: string): StatusPillTone {
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

export default function MyContributionsScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const locale = i18n.language

  const [data, setData] = useState<MyContributionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [payingPlan, setPayingPlan] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!activeClub) {
      setData({ items: [], hasContributions: false, bankTransfer: null })
      setError(null)
      setLoading(false)
      setRefreshing(false)
      return
    }
    try {
      const result = await api<MyContributionSummary>(
        `/clubs/${activeClub.club.id}/contributions/my`,
      )
      setData(result)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        setData({ items: [], hasContributions: false, bankTransfer: null })
        setError(null)
      } else {
        if (__DEV__) console.warn('[my-contributions] load failed:', err)
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeClub])

  // Refetch on focus (not just mount) so an admin's IBAN / dues change shows up
  // when the member returns to this screen, without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      void fetchData()
    }, [fetchData]),
  )

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchData()
  }

  const retry = () => {
    setLoading(true)
    void fetchData()
  }

  const handleReportPayment = async (item: MyContributionItem) => {
    if (!activeClub) return
    Alert.alert(
      t('contributions.confirmPayTitle', { defaultValue: 'Report a payment?' }),
      t('contributions.confirmPayBody', {
        defaultValue:
          'Tell your treasurer you paid {{plan}} ({{amount}}). It stays outstanding until they verify the payment.',
        plan: item.planName,
        amount: formatCurrency(item.amount, item.currency, locale),
      }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('contributions.confirmPayCta', { defaultValue: 'Report payment' }),
          style: 'default',
          onPress: async () => {
            setPayingPlan(item.planId)
            try {
              // Try real Stripe Checkout first — `{ url }` is non-null
              // only when the club has finished Stripe Connect
              // onboarding. A null url is a SUCCESSFUL response meaning
              // the club hasn't wired Stripe, so we fall back to the
              // unverified payment report (treasurer reconciles offline).
              // We do NOT swallow errors here: a thrown checkout call
              // (network/server failure) must propagate to the catch
              // below so a transient error can't masquerade as "paid".
              const checkout = await api<{ url: string | null }>(
                `/clubs/${activeClub.club.id}/contributions/my/${item.planId}/checkout`,
                { method: 'POST' },
              )

              if (checkout?.url) {
                await Linking.openURL(checkout.url)
                // Webhook flips the record to PAID; refresh on
                // foreground sees it. No optimistic update here —
                // user might bail mid-checkout.
              } else {
                await api(
                  `/clubs/${activeClub.club.id}/contributions/my/${item.planId}/pay`,
                  { method: 'POST' },
                )
                await fetchData()
              }
            } catch (err) {
              const message =
                err instanceof Error && err.message
                  ? err.message
                  : t('contributions.payError', {
                      defaultValue: 'Could not report the payment. Try again.',
                    })
              Alert.alert(t('common.error'), message)
            } finally {
              setPayingPlan(null)
            }
          },
        },
      ],
    )
  }

  const items = data?.items ?? []
  const total = items.reduce((sum, i) => sum + i.amount, 0)
  const outstanding = items
    .filter((i) => i.status !== 'PAID' && i.status !== 'WAIVED' && i.status !== 'EXEMPT')
    .reduce((sum, i) => sum + i.amount, 0)
  const paid = items
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + (i.paidAmount ?? i.amount), 0)
  const overdueCount = items.filter((i) => i.status === 'OVERDUE').length

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader title={t('contributions.myTitle')} mode="back" onClose={() => router.back()} />
      <ErrorBoundary
        onRetry={retry}
        fallbackTitleKey="states.contributions.error.title"
        fallbackBodyKey="states.contributions.error.body"
        fallbackRetryKey="states.common.retry"
      >
        <LoadingBoundary
          isLoading={loading}
          skeleton={<DashboardSkeleton />}
          testID="my-contributions-loading-boundary"
        >
          {error ? (
            <ErrorState
              message={t('states.contributions.error.title')}
              onRetry={retry}
              retryLabel={t('states.common.retry')}
            />
          ) : !data || !data.hasContributions || items.length === 0 ? (
            <EmptyState
              icon="receipt"
              title={t('states.contributions.empty.title')}
              description={t('states.contributions.empty.body')}
            />
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={c.primary}
                />
              }
            >
              {/* KPI summary card */}
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                  {t('contributions.myEyebrow', { defaultValue: 'CONTRIBUTIONS' })}
                </Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryStat}>
                    <Text variant="title2" color="primary" weight="semibold" tabular>
                      {formatCurrency(outstanding, items[0]?.currency ?? 'EUR', locale)}
                    </Text>
                    <Text variant="caption2" color="secondary">
                      {t('contributions.outstanding', { defaultValue: 'Outstanding' })}
                    </Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: c.borderDefault }]} />
                  <View style={styles.summaryStat}>
                    <Text variant="title2" color="primary" weight="semibold" tabular>
                      {formatCurrency(paid, items[0]?.currency ?? 'EUR', locale)}
                    </Text>
                    <Text variant="caption2" color="secondary">
                      {t('contributions.paidThisYear', { defaultValue: 'Paid' })}
                    </Text>
                  </View>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${total > 0 ? Math.min(100, (paid / total) * 100) : 0}%`,
                        backgroundColor: c.primary,
                      },
                    ]}
                  />
                </View>
                {overdueCount > 0 ? (
                  <StatusPill
                    tone="error"
                    icon="exclamationmark.circle"
                    label={t('contributions.overdueAlert', {
                      defaultValue: '{{count}} overdue · please settle soon',
                      count: overdueCount,
                    })}
                    style={styles.alertPill}
                  />
                ) : null}
              </View>

              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                {t('contributions.allDues', { defaultValue: 'YOUR DUES' })}
              </Text>

              <View style={styles.list}>
                {items.map((item) => {
                  const tone = statusTone(item.status)
                  const isPaid = item.status === 'PAID'
                  const isPaying = payingPlan === item.planId
                  return (
                    <View
                      key={item.planId}
                      style={[
                        styles.card,
                        elevation.card,
                        {
                          backgroundColor: c.surface,
                          borderColor:
                            item.status === 'OVERDUE' ? c.error : c.borderDefault,
                        },
                      ]}
                    >
                      <View style={styles.cardHead}>
                        <Text
                          variant="callout"
                          color="primary"
                          weight="semibold"
                          numberOfLines={1}
                          style={styles.planName}
                        >
                          {item.planName}
                        </Text>
                        <StatusPill
                          tone={tone}
                          label={t(`contributions.status.${item.status}`, {
                            defaultValue: item.status,
                          })}
                        />
                      </View>

                      <View style={styles.amountRow}>
                        <Text variant="title2" color="primary" weight="semibold" tabular>
                          {formatCurrency(item.amount, item.currency, locale)}
                        </Text>
                        <Text variant="caption2" color="secondary" style={styles.cadence}>
                          {t(`contributions.cadence.${item.cadence}`, {
                            defaultValue: item.cadence,
                          })}
                        </Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Icon name="calendar" size={12} color="tertiary" />
                        <Text variant="caption2" color="secondary">
                          {isPaid && item.paidAt
                            ? t('contributions.paidOn', {
                                defaultValue: 'Paid on {{date}}',
                                date: formatDate(item.paidAt, locale),
                              })
                            : t('contributions.dueOn', {
                                defaultValue: 'Due {{date}}',
                                date: formatDate(item.dueDate, locale),
                              })}
                        </Text>
                      </View>

                      {!isPaid && !item.paymentReported ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('contributions.reportPayment', {
                            defaultValue: 'Report payment',
                          })}
                          onPress={() => void handleReportPayment(item)}
                          disabled={isPaying}
                          style={({ pressed }) => [
                            styles.payBtn,
                            { backgroundColor: c.primary },
                            pressed && { opacity: 0.92 },
                            isPaying && { opacity: 0.6 },
                          ]}
                        >
                          <Text style={[styles.payBtnText, { color: c.textInverse }]}>
                            {isPaying
                              ? t('common.saving', { defaultValue: 'Saving…' })
                              : t('contributions.reportPayment', { defaultValue: 'Report payment' })}
                          </Text>
                        </Pressable>
                      ) : item.paymentReported ? (
                        <Text style={[styles.footer, { color: c.textTertiary }]}>
                          {t('contributions.paymentReported', {
                            defaultValue: 'Payment reported · awaiting verification',
                          })}
                        </Text>
                      ) : null}
                    </View>
                  )
                })}
              </View>

              {data?.bankTransfer ? (
                <View
                  style={[
                    styles.bankCard,
                    { backgroundColor: c.surface, borderColor: c.borderDefault },
                  ]}
                >
                  <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                    {t('contributions.bankTransfer.title', {
                      defaultValue: 'PAY BY BANK TRANSFER',
                    })}
                  </Text>
                  <Text variant="caption2" color="secondary" style={styles.bankIntro}>
                    {t('contributions.bankTransfer.intro', {
                      defaultValue:
                        'Transfer your dues to the club account below. Your treasurer marks you as paid once it arrives.',
                    })}
                  </Text>

                  <BankField
                    label={t('contributions.bankTransfer.holder', {
                      defaultValue: 'Account holder',
                    })}
                    value={data.bankTransfer.accountHolder}
                  />
                  <BankField
                    label={t('contributions.bankTransfer.iban', { defaultValue: 'IBAN' })}
                    value={data.bankTransfer.iban}
                    mono
                  />
                  {data.bankTransfer.reference ? (
                    <BankField
                      label={t('contributions.bankTransfer.reference', {
                        defaultValue: 'Reference',
                      })}
                      value={data.bankTransfer.reference}
                    />
                  ) : null}

                  <Text variant="caption2" color="tertiary" style={styles.bankCopyHint}>
                    {t('contributions.bankTransfer.copyHint', {
                      defaultValue: 'Long-press a value to copy it.',
                    })}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.footer, { color: c.textTertiary }]}>
                {t('contributions.footnote', {
                  defaultValue:
                    'Contact your treasurer if anything looks off. Payments reconcile within 24h.',
                })}
              </Text>
            </ScrollView>
          )}
        </LoadingBoundary>
      </ErrorBoundary>
    </View>
  )
}

function BankField({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  const c = useClubColors()
  return (
    <View style={[styles.bankField, { borderTopColor: c.borderSubtle }]}>
      <Text variant="caption2" color="tertiary" style={styles.bankFieldLabel}>
        {label.toUpperCase()}
      </Text>
      <Text
        selectable
        style={[
          styles.bankFieldValue,
          { color: c.textPrimary, fontFamily: mono ? fonts.data : fonts.body },
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 2,
    gap: space.md,
  },

  eyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },

  summaryCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space['2xs'],
  },
  summaryStat: { flex: 1, gap: space['2xs'] },
  summaryDivider: { width: hairline, height: 36 },
  progressTrack: { height: 6, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.full },

  alertPill: {
    marginTop: space['2xs'],
  },

  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.xs,
    marginLeft: space.xs,
    marginBottom: -space.xs,
  },

  list: { gap: space.sm },
  card: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: space.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  planName: { flex: 1, letterSpacing: -0.1 },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  cadence: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
  },

  payBtn: {
    marginTop: space['2xs'],
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnText: {
    fontSize: 14,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.xs,
  },

  bankCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.xs,
  },
  bankIntro: {
    marginTop: space['2xs'],
    marginBottom: space['2xs'],
  },
  bankField: {
    paddingTop: space.sm,
    marginTop: space['2xs'],
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space['2xs'],
  },
  bankFieldLabel: {
    letterSpacing: 1,
  },
  bankFieldValue: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  bankCopyHint: {
    marginTop: space.xs,
  },
})
