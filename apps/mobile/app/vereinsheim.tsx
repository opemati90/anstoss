/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type MenuItem = {
  id: string
  name: string
  priceCents: number
  icon: string
  category: 'FOOD' | 'DRINK' | 'OTHER'
}

type Order = {
  id: string
  buyerId: string | null
  buyerName: string
  itemId: string
  itemName: string
  priceCents: number
  qty: number
  placedAt: string
  paid: boolean
}

type Payload = {
  menu: MenuItem[]
  orders: Order[]
  targetCents: number
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

function fmtEur(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}


function relative(iso: string, t: (key: string, opts?: any) => string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60_000)
  if (m < 1) return t('vereinsheim.relativeNow', { defaultValue: 'now' })
  if (m < 60) return t('vereinsheim.relativeMinutes', { defaultValue: '{{m}}m ago', m })
  const h = Math.round(m / 60)
  return t('vereinsheim.relativeHours', { defaultValue: '{{h}}h ago', h })
}

export default function VereinsheimScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const locale = i18n.language

  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<Payload>(`/clubs/${clubId}/vereinsheim`)
      setData(result ?? null)
      setFetchError(false)
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const totals = useMemo(() => {
    if (!data) return { revenue: 0, orderCount: 0, byItem: new Map<string, number>() }
    const revenue = data.orders.reduce(
      (sum, o) => sum + o.priceCents * o.qty,
      0,
    )
    const byItem = new Map<string, number>()
    for (const o of data.orders) {
      byItem.set(o.itemId, (byItem.get(o.itemId) ?? 0) + o.qty)
    }
    return { revenue, orderCount: data.orders.length, byItem }
  }, [data])

  const target = data?.targetCents ?? 20000
  const progress = Math.min(1, totals.revenue / Math.max(1, target))

  const order = async (item: MenuItem) => {
    if (!clubId) return
    setBusyId(item.id)
    try {
      await api(`/clubs/${clubId}/vereinsheim/orders`, {
        method: 'POST',
        body: { itemId: item.id, qty: 1 },
      })
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('vereinsheim.orderError', {
          defaultValue: "Couldn't place order. Try again.",
        }),
      )
    } finally {
      setBusyId(null)
    }
  }

  const food = (data?.menu ?? []).filter((m) => m.category === 'FOOD')
  const drinks = (data?.menu ?? []).filter((m) => m.category === 'DRINK')

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('vereinsheim.title', { defaultValue: 'Vereinsheim' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : fetchError ? (
        <ErrorState onRetry={fetchData} fillContainer />
      ) : !data ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('vereinsheim.empty', { defaultValue: 'Menu not available.' })}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void fetchData()
              }}
              tintColor={c.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('vereinsheim.eyebrow', { defaultValue: 'CLUBHOUSE · LIVE' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('vereinsheim.headline', {
              defaultValue: "Saturday's bar",
            })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('vereinsheim.body', {
              defaultValue:
                'Tap to add to tab. Pay at the counter or auto-charge from your prepaid wallet.',
            })}
          </Text>

          {/* Revenue summary */}
          <View
            style={[
              styles.revenueCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <View style={styles.revenueHead}>
              <Text style={[styles.tinyEyebrow, { color: c.textTertiary }]}>
                {t('vereinsheim.revenueLabel', { defaultValue: 'TODAY' })}
              </Text>
              <Text variant="caption2" color="secondary" tabular>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <Text variant="title2" color="primary" weight="semibold" tabular>
              {fmtEur(totals.revenue, locale)}
              <Text variant="title3" color="secondary">
                {' '}
                / {fmtEur(target, locale)}
              </Text>
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress * 100}%`, backgroundColor: c.primary },
                ]}
              />
            </View>
            <View style={styles.revenueRow}>
              <View style={styles.revenueStat}>
                <Text variant="title3" color="primary" weight="semibold" tabular>
                  {totals.orderCount}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('vereinsheim.ordersLabel', { defaultValue: 'Orders' })}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <View style={styles.revenueStat}>
                <Text variant="title3" color="primary" weight="semibold" tabular>
                  {totals.byItem.size}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('vereinsheim.itemsLabel', { defaultValue: 'Items sold' })}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <View style={styles.revenueStat}>
                <Text variant="title3" color="primary" weight="semibold" tabular>
                  {fmtEur(target - totals.revenue, locale).replace(/[€$]/g, '').trim()}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('vereinsheim.toGoLabel', { defaultValue: 'To target' })}
                </Text>
              </View>
            </View>
          </View>

          {/* Food section */}
          {food.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                {t('vereinsheim.food', { defaultValue: 'FOOD' })}
              </Text>
              <View style={styles.menuGrid}>
                {food.map((item) => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onPress={() => order(item)}
                    soldQty={totals.byItem.get(item.id) ?? 0}
                    locale={locale}
                    c={c}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Drinks section */}
          {drinks.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                {t('vereinsheim.drinks', { defaultValue: 'DRINKS' })}
              </Text>
              <View style={styles.menuGrid}>
                {drinks.map((item) => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onPress={() => order(item)}
                    soldQty={totals.byItem.get(item.id) ?? 0}
                    locale={locale}
                    c={c}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Recent orders */}
          {data.orders.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                {t('vereinsheim.recentOrders', { defaultValue: 'RECENT ORDERS' })}
              </Text>
              <View
                style={[
                  styles.list,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                {data.orders.slice(0, 8).map((o, idx) => (
                  <View
                    key={o.id}
                    style={[
                      styles.orderRow,
                      idx > 0 && {
                        borderTopWidth: hairline,
                        borderTopColor: c.borderDefault,
                      },
                    ]}
                  >
                    <Text style={styles.orderEmoji}>
                      {data.menu.find((m) => m.id === o.itemId)?.icon ?? '•'}
                    </Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                        {o.itemName}
                        {o.qty > 1 ? `  ×${o.qty}` : ''}
                      </Text>
                      <Text variant="caption2" color="tertiary" numberOfLines={1}>
                        {o.buyerName}  ·  {relative(o.placedAt, t)}
                      </Text>
                    </View>
                    <Text variant="footnote" color="primary" weight="semibold" tabular>
                      {fmtEur(o.priceCents * o.qty, locale)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('vereinsheim.footer', {
              defaultValue:
                'Revenue feeds the club account at end of day. Walk-up tabs are tracked separately.',
            })}
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

function MenuCard({
  item,
  busy,
  onPress,
  soldQty,
  locale,
  c,
}: {
  item: MenuItem
  busy: boolean
  onPress: () => void
  soldQty: number
  locale: string
  c: ReturnType<typeof useClubColors>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.name}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.menuCard,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.85 },
        busy && { opacity: 0.5 },
      ]}
    >
      <Text style={styles.menuEmoji}>{item.icon}</Text>
      <View style={{ gap: 2, flex: 1 }}>
        <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption2" color="secondary" tabular>
          {fmtEur(item.priceCents, locale)}
        </Text>
      </View>
      <View style={styles.menuCta}>
        {soldQty > 0 ? (
          <View style={[styles.soldPill, { backgroundColor: withAlpha(c.primary, 0.12) }]}>
            <Text style={[styles.soldText, { color: c.primary }]} tabular>
              ×{soldQty}
            </Text>
          </View>
        ) : null}
        <View style={[styles.plusBubble, { backgroundColor: c.textPrimary }]}>
          <Icon name="plus" size={12} color="inverse" />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 2,
    gap: space.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  tinyEyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  revenueCard: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 10,
  },
  revenueHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%' },
  revenueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  revenueStat: { flex: 1, gap: 2 },
  divider: { width: hairline, height: 28 },

  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
    marginBottom: -space.xs,
  },

  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: space.sm,
  },
  menuCard: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  menuEmoji: { fontSize: 24 },
  menuCta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soldPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  soldText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  plusBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  orderEmoji: { fontSize: 20 },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },
})
