import { useCallback, useMemo, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import QRCode from 'react-native-qrcode-svg'
import type { MyContributionItem, MyContributionSummary } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ApiError, api } from '../src/api/client'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { DashboardSkeleton } from '../src/components/Skeleton'
import { ClubScreenHeader } from '../src/components/club/ClubScreenHeader'
import { DuesTag, formatDues, type DuesTagTone } from '../src/components/club/DuesTag'
import { Button, PressableScale, SectionGroup, Text } from '../src/components/ui'
import {
  RADIUS_CARD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXS,
} from '../src/theme/tokens'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'

const SETTLED = new Set(['PAID', 'WAIVED', 'EXEMPT'])
const QR_SIZE = 112

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}

/** "DE89370400440532013000" → "DE89 3704 0044 0532 0130 00" */
function groupIban(iban: string) {
  return iban
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

/**
 * EPC069-12 ("GiroCode") payload: German banking apps prefill recipient,
 * IBAN, amount and reference from it ("Foto-Überweisung"). EUR only.
 */
function girocodePayload(
  holder: string,
  iban: string,
  amountCents: number,
  currency: string,
  reference: string,
) {
  if (currency.toUpperCase() !== 'EUR' || amountCents <= 0) return null
  return [
    'BCD',
    '002',
    '1',
    'SCT',
    '',
    holder.slice(0, 70),
    iban.replace(/\s+/g, ''),
    `EUR${(amountCents / 100).toFixed(2)}`,
    '',
    '',
    reference.slice(0, 140),
  ].join('\n')
}

function statusTag(
  t: (key: string, options?: Record<string, unknown>) => string,
  item: MyContributionItem,
): { label: string; tone: DuesTagTone } {
  if (SETTLED.has(item.status)) {
    return { label: t(`contributions.status.${item.status}`), tone: 'paid' }
  }
  if (item.paymentReported) return { label: t('fees.reported', { defaultValue: 'Reported' }), tone: 'neutral' }
  if (item.status === 'OVERDUE') return { label: t('contributions.status.OVERDUE'), tone: 'overdue' }
  return { label: t(`contributions.status.${item.status}`), tone: 'neutral' }
}

/**
 * Meine Beiträge (redesign screen 26): the member's own dues. The open item
 * leads in large Barlow with its status tag, then the club's transfer details
 * with a GiroCode to scan, one "Ich habe überwiesen" action (reports the
 * payment; the treasurer confirms) and the paid history.
 */
export default function MyContributionsScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const locale = i18n.language

  const [data, setData] = useState<MyContributionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [payingPlan, setPayingPlan] = useState<string | null>(null)
  const [focusPlanId, setFocusPlanId] = useState<string | null>(null)

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
        amount: formatDues(item.amount, item.currency, locale),
      }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('contributions.confirmPayCta', { defaultValue: 'Report payment' }),
          style: 'default',
          onPress: async () => {
            setPayingPlan(item.planId)
            try {
              await api(`/clubs/${activeClub.club.id}/contributions/my/${item.planId}/pay`, {
                method: 'POST',
              })
              await fetchData()
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

  const items = useMemo(() => data?.items ?? [], [data])
  const openItems = useMemo(
    () =>
      items
        .filter((i) => !SETTLED.has(i.status))
        .sort(
          (a, b) =>
            Number(b.status === 'OVERDUE') - Number(a.status === 'OVERDUE') ||
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        ),
    [items],
  )
  const settledItems = useMemo(
    () =>
      items
        .filter((i) => SETTLED.has(i.status))
        .sort(
          (a, b) =>
            new Date(b.paidAt ?? b.dueDate).getTime() - new Date(a.paidAt ?? a.dueDate).getTime(),
        ),
    [items],
  )
  const current =
    openItems.find((i) => i.planId === focusPlanId) ?? openItems[0] ?? settledItems[0] ?? null
  const otherOpen = openItems.filter((i) => i !== current)
  const bank = data?.bankTransfer ?? null

  return (
    <View style={[styles.root, { backgroundColor: c.background, paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <ClubScreenHeader title={t('fees.title', { defaultValue: 'Dues' })} fallbackHref="/(tabs)" />
      </View>
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
          ) : !data || !data.hasContributions || items.length === 0 || !current ? (
            <EmptyState
              icon="receipt"
              title={t('states.contributions.empty.title')}
              description={t('states.contributions.empty.body')}
            />
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, { paddingBottom: SPACING_XL * 2 + insets.bottom }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={c.textTertiary}
                />
              }
            >
              <CurrentDue item={current} locale={locale} />

              {bank && !SETTLED.has(current.status) ? (
                <PaymentCard
                  holder={bank.accountHolder}
                  iban={bank.iban}
                  reference={bank.reference ?? current.planName}
                  amount={current.amount}
                  currency={current.currency}
                />
              ) : null}

              {!SETTLED.has(current.status) ? (
                current.paymentReported ? (
                  <Text variant="subheadline" color="primary" align="center" testID="my-dues-reported">
                    {t('mydues.reportedThanks', {
                      defaultValue: 'Thanks. Your treasurer confirms as soon as the money arrives.',
                    })}
                  </Text>
                ) : (
                  <Button
                    variant="filled"
                    size="lg"
                    fullWidth
                    label={t('mydues.iTransferred', { defaultValue: 'I have transferred' })}
                    loading={payingPlan === current.planId}
                    disabled={payingPlan === current.planId}
                    onPress={() => void handleReportPayment(current)}
                    testID="my-dues-report"
                  />
                )
              ) : null}

              {otherOpen.length > 0 ? (
                <SectionGroup header={t('contributions.summaryOutstanding')}>
                  {otherOpen.map((item) => (
                    <DuesRow
                      key={item.planId}
                      item={item}
                      locale={locale}
                      onPress={() => setFocusPlanId(item.planId)}
                    />
                  ))}
                </SectionGroup>
              ) : null}

              {settledItems.length > 0 && settledItems[0] !== current ? (
                <SectionGroup header={t('contributions.summaryPaid')}>
                  {settledItems.map((item) => (
                    <DuesRow key={item.planId} item={item} locale={locale} />
                  ))}
                </SectionGroup>
              ) : null}

              <Text variant="caption1" color="secondary">
                {t('mydues.footnote', {
                  defaultValue: 'The money goes straight to your club. Anstoss only shows the status.',
                })}
              </Text>
            </ScrollView>
          )}
        </LoadingBoundary>
      </ErrorBoundary>
    </View>
  )
}

/** The lead item: "Plan · fällig 15.12.", the amount in large Barlow, its tag. */
function CurrentDue({ item, locale }: { item: MyContributionItem; locale: string }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const tag = statusTag(t, item)
  const settled = SETTLED.has(item.status)
  const line = settled
    ? item.paidAt
      ? `${item.planName} · ${t('fees.paidOn', { defaultValue: 'Paid {{date}}', date: formatDate(item.paidAt, locale) })}`
      : item.planName
    : `${item.planName} · ${t('mydues.dueShort', { defaultValue: 'due {{date}}', date: formatDate(item.dueDate, locale) })}`
  return (
    <View style={styles.currentRow} testID="my-dues-current">
      <View style={styles.currentStat}>
        <Text variant="subheadline" color="secondary" numberOfLines={2}>
          {line}
        </Text>
        <Text
          variant="dataLarge"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ color: c.textPrimary, fontSize: 52, lineHeight: 54 }}
        >
          {formatDues(item.amount, item.currency, locale)}
        </Text>
      </View>
      <DuesTag label={tag.label} tone={tag.tone} />
    </View>
  )
}

/** Transfer details: GiroCode + Empfänger / IBAN / Verwendungszweck. */
function PaymentCard({
  holder,
  iban,
  reference,
  amount,
  currency,
}: {
  holder: string
  iban: string
  reference: string
  amount: number
  currency: string
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const payload = girocodePayload(holder, iban, amount, currency, reference)
  const fields = [
    { key: 'holder', label: t('mydues.recipient', { defaultValue: 'Recipient' }), value: holder },
    { key: 'iban', label: t('contributions.bankTransfer.iban'), value: groupIban(iban), mono: true },
    { key: 'reference', label: t('contributions.bankTransfer.reference'), value: reference },
  ]
  return (
    <View style={[styles.payCard, { backgroundColor: c.surface }]} testID="my-dues-payment">
      {payload ? (
        <View style={styles.qrRow}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('mydues.qrA11y', { defaultValue: 'Transfer QR code' })}
          >
            <QRCode value={payload} size={QR_SIZE} color={c.textPrimary} backgroundColor={c.surface} />
          </View>
          <Text variant="caption1" color="secondary" style={styles.flex}>
            {t('mydues.qrHint', {
              defaultValue: 'Choose “photo transfer” in your banking app and scan. Everything is prefilled.',
            })}
          </Text>
        </View>
      ) : null}
      <View>
        {fields.map((field, idx) => (
          <View
            key={field.key}
            style={[
              styles.payField,
              idx < fields.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: c.borderSubtle,
              },
            ]}
          >
            <Text variant="caption1" color="secondary">
              {field.label}
            </Text>
            <Text variant="subheadline" weight="semibold" color="primary" selectable tabular={field.mono}>
              {field.value}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption1" color="tertiary">
        {t('contributions.bankTransfer.copyHint')}
      </Text>
    </View>
  )
}

function DuesRow({
  item,
  locale,
  onPress,
}: {
  item: MyContributionItem
  locale: string
  onPress?: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const settled = SETTLED.has(item.status)
  const tag = statusTag(t, item)
  const meta = settled
    ? item.paidAt
      ? t('fees.paidOn', { defaultValue: 'Paid {{date}}', date: formatDate(item.paidAt, locale) })
      : tag.label
    : `${tag.label} · ${t('mydues.dueShort', { defaultValue: 'due {{date}}', date: formatDate(item.dueDate, locale) })}`
  const amount = formatDues(settled ? (item.paidAmount ?? item.amount) : item.amount, item.currency, locale)
  const content = (
    <>
      <View style={styles.flex}>
        <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={1}>
          {item.planName}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text variant="data" align="right" style={{ color: c.textPrimary, fontSize: 18, lineHeight: 22 }}>
        {amount}
      </Text>
    </>
  )
  if (!onPress) return <View style={styles.duesRow}>{content}</View>
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.planName}, ${amount}, ${meta}`}
      style={styles.duesRow}
    >
      {content}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  headerWrap: { paddingHorizontal: SCREEN_PADDING, paddingTop: SPACING_LG, paddingBottom: SPACING_SM },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    gap: SPACING_XL,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING_MD,
  },
  currentStat: { flex: 1, minWidth: 0, gap: SPACING_XS },
  payCard: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: SPACING_LG,
    gap: SPACING_MD,
  },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING_LG },
  payField: { minHeight: 60, justifyContent: 'center', paddingVertical: SPACING_MD, gap: SPACING_XXS },
  duesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    minHeight: 54,
    paddingVertical: SPACING_MD,
    paddingHorizontal: SPACING_LG,
  },
})
