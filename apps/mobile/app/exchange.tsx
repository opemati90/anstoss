/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { BottomSheet, Button, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Category = 'BOOTS' | 'KIT' | 'GLOVES' | 'OTHER'
type Condition = 'NEW' | 'GOOD' | 'WORN'
type Status = 'AVAILABLE' | 'CLAIMED' | 'GONE'

type Listing = {
  id: string
  sellerUserId: string
  sellerName: string
  title: string
  category: Category
  sizeLabel: string
  condition: Condition
  askCents: number
  note?: string | null
  photoUrl: string
  postedAt: string
  status: Status
  claimedByUserId: string | null
  claimedByName: string | null
}

type Filter = 'ALL' | Category

const FILTERS: Array<{ key: Filter; label: string; icon?: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'BOOTS', label: 'Boots', icon: '👟' },
  { key: 'KIT', label: 'Kit', icon: '👕' },
  { key: 'GLOVES', label: 'Gloves', icon: '🧤' },
  { key: 'OTHER', label: 'Other', icon: '🎒' },
]

// CONDITION_LABELS are now resolved via t() at render time — see conditionLabel() below.

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

function fmtEur(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

// relativeDays is now a hook-friendly helper below.

type TFunction = ReturnType<typeof useTranslation>['t']

function conditionLabel(condition: Condition, t: TFunction): string {
  switch (condition) {
    case 'NEW': return t('exchange.condition.NEW', { defaultValue: 'New' })
    case 'GOOD': return t('exchange.condition.GOOD', { defaultValue: 'Good' })
    case 'WORN': return t('exchange.condition.WORN', { defaultValue: 'Worn' })
  }
}

function relativeDaysLabel(iso: string, t: TFunction): string {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60_000))
  if (d <= 0) return t('exchange.relativeToday', { defaultValue: 'today' })
  if (d === 1) return t('exchange.relativeYesterday', { defaultValue: 'yesterday' })
  if (d < 7) return t('exchange.relativeDaysAgo', { defaultValue: '{{d}}d ago', d })
  return t('exchange.relativeWeeksAgo', { defaultValue: '{{w}}w ago', w: Math.round(d / 7) })
}

export default function ExchangeScreen() {
  const { t, i18n } = useTranslation()
  const { user, activeClub } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const clubId = activeClub?.club.id
  const locale = i18n.language

  const [items, setItems] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)

  // compose state
  const [cTitle, setCTitle] = useState('')
  const [cCategory, setCCategory] = useState<Category>('BOOTS')
  const [cSize, setCSize] = useState('')
  const [cCondition, setCCondition] = useState<Condition>('GOOD')
  const [cAsk, setCAsk] = useState('15')
  const [cNote, setCNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<Listing[]>(`/clubs/${clubId}/exchange`)
      setItems(result ?? [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    return items
      .slice()
      .filter((i) => filter === 'ALL' || i.category === filter)
      .sort((a, b) => {
        // Available first, then claimed, then gone. Within each, newest first.
        const order: Record<Status, number> = {
          AVAILABLE: 0,
          CLAIMED: 1,
          GONE: 2,
        }
        return (
          order[a.status] - order[b.status] ||
          new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        )
      })
  }, [items, filter])

  const counts = useMemo(() => {
    return {
      available: items.filter((i) => i.status === 'AVAILABLE').length,
      claimed: items.filter((i) => i.status === 'CLAIMED').length,
      gone: items.filter((i) => i.status === 'GONE').length,
    }
  }, [items])

  const claim = async (item: Listing) => {
    if (!clubId) return
    const mineClaim = item.claimedByUserId === user?.id
    setBusyId(item.id)
    try {
      await api(`/clubs/${clubId}/exchange/${item.id}/claim`, {
        method: mineClaim ? 'DELETE' : 'POST',
      })
      await fetchData()
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  const markGone = (item: Listing) => {
    Alert.alert(
      t('exchange.goneTitle', { defaultValue: 'Mark as gone?' }),
      t('exchange.goneBody', {
        defaultValue:
          'Hides the listing from new browsers. The claimer keeps the conversation in DMs.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('exchange.markGone', { defaultValue: 'Mark gone' }),
          style: 'destructive',
          onPress: async () => {
            if (!clubId) return
            setBusyId(item.id)
            try {
              await api(`/clubs/${clubId}/exchange/${item.id}/gone`, {
                method: 'POST',
              })
              await fetchData()
            } catch {
              Alert.alert(t('common.error'))
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  const submit = async () => {
    if (!clubId) return
    if (!cTitle.trim()) {
      Alert.alert(
        t('common.errorTitle'),
        t('exchange.titleRequired', { defaultValue: 'Add a title.' }),
      )
      return
    }
    const askCents = Math.round(
      Math.max(0, parseFloat(cAsk.replace(',', '.')) || 0) * 100,
    )
    setSubmitting(true)
    try {
      await api(`/clubs/${clubId}/exchange`, {
        method: 'POST',
        body: {
          title: cTitle.trim(),
          category: cCategory,
          sizeLabel: cSize.trim() || '—',
          condition: cCondition,
          askCents,
          note: cNote.trim() || null,
        },
      })
      setComposeOpen(false)
      setCTitle('')
      setCSize('')
      setCAsk('15')
      setCNote('')
      setCCategory('BOOTS')
      setCCondition('GOOD')
      await fetchData()
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('exchange.title', { defaultValue: 'Boot exchange' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="bag"
          title={t('exchange.emptyTitle', {
            defaultValue: 'No listings yet',
          })}
          description={t('exchange.emptyBody', {
            defaultValue:
              'Outgrown boots? Old gloves? Drop the first listing — kit changes hands within the team.',
          })}
        />
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
            {t('exchange.eyebrow', { defaultValue: 'EXCHANGE · TEAM' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('exchange.headline', { defaultValue: 'Outgrown kit' })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('exchange.body', {
              defaultValue:
                'Team-internal classifieds. Outgrown boots become someone else\'s starter pair.',
            })}
          </Text>

          {/* Summary */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <SummaryStat
              label={t('exchange.available', { defaultValue: 'Available' })}
              value={counts.available}
              tone={c.success}
            />
            <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
            <SummaryStat
              label={t('exchange.claimed', { defaultValue: 'Claimed' })}
              value={counts.claimed}
              tone={c.warning}
            />
            <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
            <SummaryStat
              label={t('exchange.gone', { defaultValue: 'Gone' })}
              value={counts.gone}
              tone={c.textSecondary}
            />
          </View>

          {/* Filters */}
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = filter === f.key
              return (
                <Pressable
                  key={f.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setFilter(f.key)}
                  style={[
                    styles.filterChip,
                    active
                      ? { backgroundColor: c.textPrimary, borderColor: c.textPrimary }
                      : { borderColor: c.borderStrong, backgroundColor: c.surface },
                  ]}
                >
                  {f.icon ? <Text style={styles.filterEmoji}>{f.icon}</Text> : null}
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: active ? c.textInverse : c.textPrimary },
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Listings */}
          {filtered.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
            >
              <Text variant="footnote" color="secondary">
                {t('exchange.filterEmpty', {
                  defaultValue: 'Nothing in this category right now.',
                })}
              </Text>
            </View>
          ) : (
            filtered.map((item) => {
              const statusColor =
                item.status === 'AVAILABLE'
                  ? c.success
                  : item.status === 'CLAIMED'
                    ? c.warning
                    : c.textSecondary
              const conditionColor =
                item.condition === 'NEW'
                  ? c.primary
                  : item.condition === 'GOOD'
                    ? c.success
                    : c.warning
              const isMine = item.sellerUserId === user?.id
              const claimedByMe = item.claimedByUserId === user?.id
              return (
                <View
                  key={item.id}
                  style={[
                    styles.listingCard,
                    {
                      backgroundColor: c.surface,
                      borderColor: c.borderDefault,
                      opacity: item.status === 'GONE' ? 0.55 : 1,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={styles.listingImage}
                    resizeMode="cover"
                  />
                  <View style={styles.listingBody}>
                    <View style={styles.listingHead}>
                      <Text variant="callout" color="primary" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: withAlpha(statusColor, 0.12) },
                        ]}
                      >
                        <Text style={[styles.statusPillText, { color: statusColor }]}>
                          {item.status}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.metaChip,
                          { backgroundColor: withAlpha(conditionColor, 0.12) },
                        ]}
                      >
                        <Text style={[styles.metaChipText, { color: conditionColor }]}>
                          {conditionLabel(item.condition, t)}
                        </Text>
                      </View>
                      <Text variant="caption2" color="secondary" tabular>
                        {item.sizeLabel}
                      </Text>
                      <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                      <Text variant="caption2" color="secondary">
                        {item.sellerName}
                      </Text>
                      <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                      <Text variant="caption2" color="tertiary" tabular>
                        {relativeDaysLabel(item.postedAt, t)}
                      </Text>
                    </View>
                    {item.note ? (
                      <Text variant="footnote" color="secondary" style={styles.note} numberOfLines={2}>
                        "{item.note}"
                      </Text>
                    ) : null}

                    <View style={styles.footerRow}>
                      <Text variant="title3" color="primary" weight="semibold" tabular>
                        {item.askCents === 0
                          ? t('exchange.free', { defaultValue: 'Free' })
                          : fmtEur(item.askCents, locale)}
                      </Text>
                      {item.status === 'GONE' ? (
                        <Text variant="caption2" color="tertiary">
                          {t('exchange.takenBy', {
                            defaultValue: 'Taken by {{name}}',
                            name: item.claimedByName ?? '—',
                          })}
                        </Text>
                      ) : isMine ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {item.status === 'CLAIMED' ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => markGone(item)}
                              disabled={busyId === item.id}
                              style={({ pressed }) => [
                                styles.actionFilled,
                                { backgroundColor: c.textPrimary },
                                pressed && { opacity: 0.85 },
                              ]}
                            >
                              <Text style={[styles.actionFilledText, { color: c.textInverse }]}>
                                {t('exchange.markGone', { defaultValue: 'Mark gone' })}
                              </Text>
                            </Pressable>
                          ) : null}
                          <View
                            style={[
                              styles.youOwnPill,
                              {
                                backgroundColor: withAlpha(c.primary, 0.12),
                                borderColor: 'transparent',
                              },
                            ]}
                          >
                            <Text style={[styles.youOwnText, { color: c.primary }]}>
                              {t('exchange.yours', { defaultValue: 'YOURS' })}
                            </Text>
                          </View>
                        </View>
                      ) : claimedByMe ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => claim(item)}
                          disabled={busyId === item.id}
                          style={({ pressed }) => [
                            styles.actionGhost,
                            { borderColor: c.borderStrong },
                            pressed && { opacity: 0.5 },
                            busyId === item.id && { opacity: 0.5 },
                          ]}
                        >
                          <Icon name="checkmark" size={11} color={c.success} />
                          <Text style={[styles.actionGhostText, { color: c.textPrimary }]}>
                            {t('exchange.youClaimed', {
                              defaultValue: "You claimed — release",
                            })}
                          </Text>
                        </Pressable>
                      ) : item.status === 'CLAIMED' ? (
                        <View
                          style={[
                            styles.actionGhost,
                            { borderColor: c.borderDefault, backgroundColor: c.surface },
                          ]}
                        >
                          <Icon name="lock" size={11} color={c.textTertiary} />
                          <Text style={[styles.actionGhostText, { color: c.textTertiary }]}>
                            {t('exchange.alreadyClaimed', {
                              defaultValue: 'Claimed by {{name}}',
                              name: item.claimedByName ?? '—',
                            })}
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => claim(item)}
                          disabled={busyId === item.id}
                          style={({ pressed }) => [
                            styles.actionFilled,
                            { backgroundColor: c.textPrimary },
                            pressed && { opacity: 0.85 },
                            busyId === item.id && { opacity: 0.5 },
                          ]}
                        >
                          <Icon name="hand.raised" size={11} color="inverse" />
                          <Text style={[styles.actionFilledText, { color: c.textInverse }]}>
                            {t('exchange.claim', { defaultValue: 'Claim' })}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              )
            })
          )}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('exchange.footer', {
              defaultValue:
                'Once claimed, buyer + seller continue in DMs. Pickup at the next training.',
            })}
          </Text>
        </ScrollView>
      )}

      {/* FAB */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('exchange.add', { defaultValue: 'Add listing' })}
        onPress={() => setComposeOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.textPrimary, bottom: space.lg + insets.bottom },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Icon name="plus" size="lg" color="inverse" />
      </Pressable>

      {/* Compose */}
      <BottomSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        heightPct="auto"
      >
        <View style={styles.sheetBody}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('exchange.composeEyebrow', { defaultValue: 'NEW LISTING' })}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
            {t('exchange.composeTitle', { defaultValue: 'List for the team' })}
          </Text>

          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('exchange.titleLabel', { defaultValue: 'TITLE' })}
          </Text>
          <View style={[styles.fieldCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            <TextInput
              style={[styles.fieldInput, { color: c.textPrimary }]}
              value={cTitle}
              onChangeText={setCTitle}
              placeholder={t('exchange.titlePlaceholder', {
                defaultValue: 'e.g. Adidas Predator FG · Size 38',
              })}
              placeholderTextColor={c.textTertiary}
            />
          </View>

          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('exchange.categoryLabel', { defaultValue: 'CATEGORY' })}
          </Text>
          <View style={styles.chipGrid}>
            {(['BOOTS', 'KIT', 'GLOVES', 'OTHER'] as Category[]).map((opt) => {
              const active = cCategory === opt
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  onPress={() => setCCategory(opt)}
                  style={[
                    styles.optionChip,
                    active
                      ? {
                          backgroundColor: withAlpha(c.primary, 0.12),
                          borderColor: c.primary,
                        }
                      : { borderColor: c.borderStrong, backgroundColor: c.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: active ? c.primary : c.textPrimary },
                    ]}
                  >
                    {opt}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                {t('exchange.sizeLabel', { defaultValue: 'SIZE' })}
              </Text>
              <View style={[styles.fieldCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
                <TextInput
                  style={[styles.fieldInput, { color: c.textPrimary }]}
                  value={cSize}
                  onChangeText={setCSize}
                  placeholder="EU 38"
                  placeholderTextColor={c.textTertiary}
                />
              </View>
            </View>
            <View style={styles.inlineField}>
              <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                {t('exchange.askLabel', { defaultValue: 'ASK (€)' })}
              </Text>
              <View style={[styles.fieldCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
                <TextInput
                  style={[styles.fieldInput, { color: c.textPrimary }]}
                  value={cAsk}
                  onChangeText={setCAsk}
                  placeholder="15"
                  placeholderTextColor={c.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('exchange.conditionLabel', { defaultValue: 'CONDITION' })}
          </Text>
          <View style={styles.segmentRow}>
            {(['NEW', 'GOOD', 'WORN'] as Condition[]).map((opt) => {
              const active = cCondition === opt
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  onPress={() => setCCondition(opt)}
                  style={[
                    styles.segmentPill,
                    active
                      ? { backgroundColor: c.textPrimary, borderColor: c.textPrimary }
                      : { borderColor: c.borderStrong, backgroundColor: c.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? c.textInverse : c.textPrimary },
                    ]}
                  >
                    {conditionLabel(opt, t)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('exchange.noteLabel', { defaultValue: 'NOTE (OPTIONAL)' })}
          </Text>
          <View style={[styles.fieldCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextarea, { color: c.textPrimary }]}
              value={cNote}
              onChangeText={setCNote}
              placeholder={t('exchange.notePlaceholder', {
                defaultValue: 'Studs still solid, used for one season…',
              })}
              placeholderTextColor={c.textTertiary}
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.footerActions}>
            <Button
              label={t('exchange.post', { defaultValue: 'Post listing' })}
              variant="filled"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={submitting}
              onPress={submit}
            />
            <Button
              label={t('common.cancel')}
              variant="ghost"
              size="lg"
              fullWidth
              onPress={() => setComposeOpen(false)}
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <View style={styles.summaryStat}>
      <Text variant="title3" color="primary" weight="semibold" tabular>
        <Text style={{ color: tone }}>{value}</Text>
      </Text>
      <Text variant="caption2" color="secondary">
        {label}
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
    paddingBottom: space['2xl'] * 3,
    gap: space.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    marginTop: space.sm,
  },
  summaryStat: { flex: 1, gap: 2, alignItems: 'flex-start' },
  divider: { width: hairline, height: 28 },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: space.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  filterEmoji: { fontSize: 13 },
  filterChipText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  emptyCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    marginTop: space.sm,
  },

  listingCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  listingImage: {
    width: '100%',
    height: 180,
  },
  listingBody: {
    padding: space.md,
    gap: 8,
  },
  listingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  metaChipText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  metaDot: { fontSize: 11, fontFamily: fonts.label },
  note: { fontStyle: 'italic', lineHeight: 18 },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  actionFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  actionFilledText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  actionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  actionGhostText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  youOwnPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  youOwnText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },

  fab: {
    position: 'absolute',
    bottom: space.lg,
    right: space.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  sheetBody: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
  },
  fieldCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
    marginTop: 6,
  },
  fieldInput: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.body,
    minHeight: 46,
  },
  fieldTextarea: {
    minHeight: 64,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  inlineRow: { flexDirection: 'row', gap: space.sm },
  inlineField: { flex: 1 },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  optionChipText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  segmentRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  segmentPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  footerActions: {
    marginTop: space.md,
    gap: 6,
  },
})
