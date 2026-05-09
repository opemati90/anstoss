/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
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
import { Text, Icon } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

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

type Tone = 'success' | 'error' | 'warning' | 'info' | 'neutral'

function statusTone(status: string): Tone {
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
      setData({ items: [], hasContributions: false })
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
        setData({ items: [], hasContributions: false })
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

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchData()
  }

  const retry = () => {
    setLoading(true)
    void fetchData()
  }

  const handleMarkPaid = async (item: MyContributionItem) => {
    if (!activeClub) return
    Alert.alert(
      t('contributions.confirmPayTitle', { defaultValue: 'Mark as paid?' }),
      t('contributions.confirmPayBody', {
        defaultValue:
          '{{plan}} ({{amount}}) will be marked as paid for the current period. Your treasurer can reverse this from the admin dashboard.',
        plan: item.planName,
        amount: formatCurrency(item.amount, item.currency, locale),
      }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('contributions.confirmPayCta', { defaultValue: 'Mark paid' }),
          style: 'default',
          onPress: async () => {
            setPayingPlan(item.planId)
            try {
              // Try real Stripe Checkout first — `{ url }` is non-null
              // only when the club has finished Stripe Connect
              // onboarding. When null, we fall back to the soft
              // mark-paid signal (treasurer reconciles offline). This
              // keeps the path working for clubs that haven't wired
              // Stripe yet without a separate UI branch.
              const checkout = await api<{ url: string | null }>(
                `/clubs/${activeClub.club.id}/contributions/my/${item.planId}/checkout`,
                { method: 'POST' },
              ).catch(() => ({ url: null }))

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
                      defaultValue: 'Could not mark as paid. Try again.',
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
                  <View
                    style={[
                      styles.alertPill,
                      {
                        backgroundColor: withAlpha(c.error, 0.10),
                      },
                    ]}
                  >
                    <Icon name="exclamationmark.circle" size={12} color={c.error} />
                    <Text style={[styles.alertText, { color: c.error }]}>
                      {t('contributions.overdueAlert', {
                        defaultValue: '{{count}} overdue · please settle soon',
                        count: overdueCount,
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                {t('contributions.allDues', { defaultValue: 'YOUR DUES' })}
              </Text>

              <View style={styles.list}>
                {items.map((item) => {
                  const tone = statusTone(item.status)
                  const toneColor =
                    tone === 'success'
                      ? c.success
                      : tone === 'error'
                        ? c.error
                        : tone === 'warning'
                          ? c.warning
                          : tone === 'info'
                            ? c.primary
                            : c.textSecondary
                  const isPaid = item.status === 'PAID'
                  const isPaying = payingPlan === item.planId
                  return (
                    <View
                      key={item.planId}
                      style={[
                        styles.card,
                        {
                          backgroundColor: c.surface,
                          borderColor: item.status === 'OVERDUE'
                            ? withAlpha(c.error, 0.4)
                            : c.borderDefault,
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
                        <View style={[styles.statusPill, { backgroundColor: withAlpha(toneColor, 0.12) }]}>
                          <Text style={[styles.statusPillText, { color: toneColor }]}>
                            {t(`contributions.status.${item.status}`, {
                              defaultValue: item.status,
                            })}
                          </Text>
                        </View>
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

                      {!isPaid ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('contributions.markPaid', {
                            defaultValue: 'Mark as paid',
                          })}
                          onPress={() => void handleMarkPaid(item)}
                          disabled={isPaying}
                          style={({ pressed }) => [
                            styles.payBtn,
                            { backgroundColor: c.textPrimary },
                            pressed && { opacity: 0.92 },
                            isPaying && { opacity: 0.6 },
                          ]}
                        >
                          <Text style={[styles.payBtnText, { color: c.textInverse }]}>
                            {isPaying
                              ? t('common.saving', { defaultValue: 'Saving…' })
                              : t('contributions.markPaid', { defaultValue: 'Mark as paid' })}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )
                })}
              </View>

              <Text style={[styles.footer, { color: c.textTertiary }]}>
                {t('contributions.footnote', {
                  defaultValue:
                    'Contact your treasurer if anything looks off — payments reconcile within 24h.',
                })}
              </Text>
            </ScrollView>
          )}
        </LoadingBoundary>
      </ErrorBoundary>
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
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },

  summaryCard: {
    padding: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: 2,
  },
  summaryStat: { flex: 1, gap: 2 },
  summaryDivider: { width: hairline, height: 36 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  alertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  alertText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
  },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: 4,
    marginLeft: 4,
    marginBottom: -space.xs,
  },

  list: { gap: space.sm },
  card: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: 8,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  planName: { flex: 1, letterSpacing: -0.1 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  cadence: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  payBtn: {
    marginTop: 6,
    height: 44,
    borderRadius: 999,
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
})
