import { useCallback, useEffect, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { MyContributionSummary } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ApiError, api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { DashboardSkeleton } from '../src/components/Skeleton'
import { StatusPill, type StatusPillTone } from '../src/components/ui/StatusPill'
import { Text, Icon } from '../src/components/ui'
import { card, hairline, space } from '../src/theme/tokens'

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

export default function MyContributionsScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const locale = i18n.language

  const [data, setData] = useState<MyContributionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<ApiError | Error | null>(null)

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
        if (__DEV__) {
          console.warn('[my-contributions] load failed:', err)
        }
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
          ) : !data || !data.hasContributions ? (
            <EmptyState
              icon="receipt"
              title={t('states.contributions.empty.title')}
              description={t('states.contributions.empty.body')}
            />
          ) : (
            <ScrollView
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
              {data.items.map((item) => (
            <View
              key={item.planId}
              style={[
                styles.card,
                {
                  backgroundColor: c.surface,
                  borderColor: item.status === 'OVERDUE' ? c.error : c.borderDefault,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text variant="headline" color="primary" numberOfLines={1} style={styles.planName}>
                  {item.planName}
                </Text>
                <StatusPill
                  label={t(`contributions.status.${item.status}`)}
                  tone={statusTone(item.status)}
                />
              </View>

              <View style={styles.cardRow}>
                <Icon name="banknote" size="sm" color={c.textSecondary} />
                <Text variant="body" color="primary" weight="semibold">
                  {formatCurrency(item.amount, item.currency, locale)}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t(`contributions.cadence.${item.cadence}`)}
                </Text>
              </View>

              <View style={styles.cardRow}>
                <Icon name="calendar" size="sm" color={c.textSecondary} />
                <Text variant="subheadline" color="secondary">
                  {t('contributions.myDueOn', {
                    date: formatDate(item.dueDate, locale),
                  })}
                </Text>
              </View>

              {item.paidAmount != null && item.paidAmount > 0 ? (
                <View style={styles.cardRow}>
                  <Icon name="checkmark.circle" size="sm" color={c.success} />
                  <Text variant="subheadline" color="secondary">
                    {formatCurrency(item.paidAmount, item.currency, locale)}{' '}
                    {item.paidAt ? formatDate(item.paidAt, locale) : ''}
                  </Text>
                </View>
              ) : null}
            </View>
              ))}
            </ScrollView>
          )}
        </LoadingBoundary>
      </ErrorBoundary>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: space.md,
    gap: space.md,
  },
  card: {
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    gap: space.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  planName: {
    flex: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
})
