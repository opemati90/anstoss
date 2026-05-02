/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { Redirect, router } from 'expo-router'
import {
  PlayerPosition,
  PreferredFoot,
  type FreeAgentListItem,
  type FreeAgentListResponse,
} from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { RosterSkeleton } from '../src/components/Skeleton'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { Screen, Text, Icon } from '../src/components/ui'
import { fontSize, space, radius, fonts, hairline } from '../src/theme/tokens'

const POSITION_FILTERS = [
  PlayerPosition.GK,
  PlayerPosition.DEF,
  PlayerPosition.MID,
  PlayerPosition.FWD,
]

const FOOT_FILTERS = [PreferredFoot.LEFT, PreferredFoot.RIGHT, PreferredFoot.BOTH]

type SortKey = 'recent' | 'name' | 'experience'

const SORT_OPTIONS: SortKey[] = ['recent', 'experience', 'name']

export default function TransferListScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [items, setItems] = useState<FreeAgentListItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [position, setPosition] = useState<PlayerPosition | null>(null)
  const [foot, setFoot] = useState<PreferredFoot | null>(null)
  const [sort, setSort] = useState<SortKey>('recent')
  const [showFilters, setShowFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  // Without an active club the marketplace doesn't apply — bounce home
  // rather than render an access-denied empty inside the modal. This also
  // prevents the back-stack confusion where admins-without-club land on
  // /club-setup and the marketplace shows up under that root.
  const shouldBounce = !activeClub

  const activeFilterCount = useMemo(
    () =>
      [
        query.trim().length > 0,
        city.trim().length > 0,
        position !== null,
        foot !== null,
        sort !== 'recent',
      ].filter(Boolean).length,
    [query, city, position, foot, sort],
  )

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (!isAdmin) return

      if (replace) {
        setIsLoading(true)
      } else {
        setIsLoadingMore(true)
      }

      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: '12',
        })

        if (query.trim()) params.set('query', query.trim())
        if (city.trim()) params.set('city', city.trim())
        if (position) params.set('position', position)
        if (foot) params.set('foot', foot)
        if (sort !== 'recent') params.set('sort', sort)

        const response = await api<FreeAgentListResponse>(`/free-agents?${params.toString()}`)
        setItems((current) => (replace ? response.items : [...current, ...response.items]))
        setPage(response.page)
        setTotal(response.total)
        setError(false)
      } catch {
        setError(true)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
        setIsLoadingMore(false)
      }
    },
    [city, foot, isAdmin, position, query, sort],
  )

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadPage(1, true)
    }, 250)

    return () => clearTimeout(timeoutId)
  }, [loadPage])

  const onRefresh = async () => {
    setIsRefreshing(true)
    await loadPage(1, true)
  }

  const onEndReached = async () => {
    if (isLoadingMore || items.length >= total || isLoading) return
    await loadPage(page + 1, false)
  }

  const retry = () => {
    setIsLoading(true)
    void loadPage(1, true)
  }

  const clearFilters = () => {
    setQuery('')
    setCity('')
    setPosition(null)
    setFoot(null)
    setSort('recent')
  }

  if (shouldBounce) {
    return <Redirect href="/(tabs)" />
  }

  return (
    <Screen
      header={
        <ModalHeader
          title={t('transferList.title')}
          // Always go home rather than router.back() — the marketplace is a
          // top-level destination from admin contexts, and the stack root may
          // be /club-setup or another irrelevant screen depending on entry.
          onClose={() => router.replace('/(tabs)')}
        />
      }
      padded={false}
    >
      <View style={styles.hero}>
        <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary">
          {t('transferList.heroEyebrow', { defaultValue: 'FREE AGENTS' }).toUpperCase()}
        </Text>
        <Text variant="title2" weight="bold" color="primary" style={styles.heroTitle}>
          {isAdmin
            ? total > 0
              ? t('transferList.heroCount', {
                  defaultValue: '{{count}} player available',
                  count: total,
                })
              : t('transferList.heroCountNone', {
                  defaultValue: 'Browse available players',
                })
            : t('transferList.title')}
        </Text>
        {isAdmin ? (
          <Text variant="footnote" color="secondary" style={styles.heroSubtitle}>
            {t('transferList.subtitle', {
              defaultValue: 'Players who marked themselves available for transfer.',
            })}
          </Text>
        ) : null}
      </View>

      {isAdmin ? (
        <View style={styles.controls}>
          <View
            style={[
              styles.searchRow,
              { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
            ]}
          >
            <Icon name="magnifyingglass" size="md" color={c.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: c.textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder={t('transferList.searchPlaceholder')}
              placeholderTextColor={c.textTertiary}
              returnKeyType="search"
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Icon name="xmark.circle.fill" size="sm" color={c.textTertiary} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterToolbar}>
            <Pressable
              onPress={() => setShowFilters((v) => !v)}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => [
                styles.toolbarBtn,
                {
                  backgroundColor: showFilters ? c.primary : c.surface,
                  borderColor: showFilters ? c.primary : c.borderDefault,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Icon
                name="line.3.horizontal.decrease.circle"
                size={16}
                color={showFilters ? 'inverse' : 'primary'}
              />
              <Text
                variant="caption1"
                weight="semibold"
                style={{ color: showFilters ? c.surface : c.textPrimary }}
              >
                {t('transferList.filters', { defaultValue: 'Filters' })}
                {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
              </Text>
            </Pressable>

            {SORT_OPTIONS.map((key) => {
              const active = sort === key
              return (
                <Pressable
                  key={key}
                  onPress={() => setSort(key)}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.sortPill,
                    {
                      backgroundColor: active ? c.textPrimary : 'transparent',
                      borderColor: active ? c.textPrimary : c.borderDefault,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    variant="caption1"
                    weight="semibold"
                    style={{ color: active ? c.surface : c.textSecondary }}
                  >
                    {t(`transferList.sort.${key}`, {
                      defaultValue:
                        key === 'recent'
                          ? 'Recent'
                          : key === 'experience'
                            ? 'Experience'
                            : 'Name',
                    })}
                  </Text>
                </Pressable>
              )
            })}

            {activeFilterCount > 0 ? (
              <Pressable
                onPress={clearFilters}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.clearBtn}
              >
                <Text variant="caption1" weight="semibold" style={{ color: c.error }}>
                  {t('transferList.clear', { defaultValue: 'Clear' })}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {showFilters ? (
            <View style={[styles.filterPanel, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
              <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary">
                {t('transferList.position', { defaultValue: 'POSITION' }).toUpperCase()}
              </Text>
              <View style={styles.chipRow}>
                {POSITION_FILTERS.map((value) => {
                  const active = value === position
                  return (
                    <Pressable
                      key={value}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? c.primary : c.borderDefault,
                          backgroundColor: active ? `${c.primary}1F` : c.surface,
                        },
                      ]}
                      onPress={() => setPosition((current) => (current === value ? null : value))}
                      accessibilityRole="button"
                      accessibilityLabel={t(`freeAgent.positionShort.${value}`)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? c.primary : c.textPrimary },
                        ]}
                      >
                        {t(`freeAgent.positionShort.${value}`)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.filterLabel}>
                {t('transferList.foot', { defaultValue: 'FOOT' }).toUpperCase()}
              </Text>
              <View style={styles.chipRow}>
                {FOOT_FILTERS.map((value) => {
                  const active = value === foot
                  return (
                    <Pressable
                      key={value}
                      style={[
                        styles.chip,
                        {
                          borderColor: active ? c.primary : c.borderDefault,
                          backgroundColor: active ? `${c.primary}1F` : c.surface,
                        },
                      ]}
                      onPress={() => setFoot((current) => (current === value ? null : value))}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? c.primary : c.textPrimary },
                        ]}
                      >
                        {t(`freeAgent.foot.${value}`, {
                          defaultValue:
                            value === PreferredFoot.LEFT
                              ? 'Left'
                              : value === PreferredFoot.RIGHT
                                ? 'Right'
                                : 'Both',
                        })}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.filterLabel}>
                {t('transferList.city', { defaultValue: 'CITY' }).toUpperCase()}
              </Text>
              <TextInput
                style={[
                  styles.cityInput,
                  { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken, color: c.textPrimary },
                ]}
                value={city}
                onChangeText={setCity}
                placeholder={t('transferList.cityPlaceholder')}
                placeholderTextColor={c.textTertiary}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <ErrorBoundary
        onRetry={retry}
        fallbackTitleKey="states.transfers.error.title"
        fallbackBodyKey="states.transfers.error.body"
        fallbackRetryKey="states.common.retry"
      >
        <LoadingBoundary
          isLoading={isLoading}
          skeleton={<RosterSkeleton />}
          testID="transfers-loading-boundary"
        >
          {error ? (
            <ErrorState
              message={t('states.transfers.error.title')}
              onRetry={retry}
              retryLabel={t('states.common.retry')}
            />
          ) : !isAdmin ? (
            <View style={styles.state}>
              <EmptyState
                icon="lock.fill"
                title={t('transferList.accessDenied', {
                  defaultValue: 'Admins only',
                })}
                description={t('transferList.accessDeniedBody', {
                  defaultValue:
                    'Only club admins and owners can browse the player marketplace.',
                })}
              />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.state}>
              <EmptyState
                icon="arrow.left.arrow.right"
                title={
                  activeFilterCount > 0
                    ? t('transferList.empty.filteredTitle', {
                        defaultValue: 'No matches',
                      })
                    : t('states.transfers.empty.title')
                }
                description={
                  activeFilterCount > 0
                    ? t('transferList.empty.filteredBody', {
                        defaultValue: 'Try adjusting or clearing your filters.',
                      })
                    : t('states.transfers.empty.body')
                }
              />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
              onEndReachedThreshold={0.3}
              onEndReached={() => void onEndReached()}
              renderItem={({ item }) => (
                <FreeAgentCard
                  item={item}
                  onPress={() =>
                    router.push({ pathname: '/free-agent/[id]', params: { id: item.id } })
                  }
                />
              )}
              ListFooterComponent={
                isLoadingMore ? (
                  <ActivityIndicator style={styles.footerLoader} color={c.primary} />
                ) : null
              }
            />
          )}
        </LoadingBoundary>
      </ErrorBoundary>
    </Screen>
  )
}

function FreeAgentCard({
  item,
  onPress,
}: {
  item: FreeAgentListItem
  onPress: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  const initials = item.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  const meta = [item.position, item.city].filter(Boolean).join(' · ')

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      style={({ pressed }) => [
        styles.card,
        { borderColor: c.borderDefault, backgroundColor: c.surface },
        pressed && { opacity: 0.92 },
      ]}
    >
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: c.primary }]}>
          <Text style={styles.avatarInitial}>{initials || '?'}</Text>
        </View>
      )}
      <View style={styles.cardCopy}>
        <Text
          variant="callout"
          weight="semibold"
          color="primary"
          numberOfLines={1}
          style={styles.cardTitle}
        >
          {item.name}
        </Text>
        {meta ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.badgeRow}>
          {item.position ? (
            <View style={[styles.badge, { backgroundColor: c.primary50, borderColor: 'transparent' }]}>
              <Text style={[styles.badgeText, { color: c.primary }]}>{item.position}</Text>
            </View>
          ) : null}
          <View style={[styles.badge, { backgroundColor: c.surfaceSunken, borderColor: c.borderDefault }]}>
            <Icon name="trophy.fill" size={10} color="tertiary" />
            <Text style={[styles.badgeText, { color: c.textSecondary }]}>
              {t('transferList.experienceCount', { count: item.experienceCount })}
            </Text>
          </View>
        </View>
      </View>
      <Icon name="chevron.right" size="md" color={c.textTertiary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 4,
  },
  heroTitle: { letterSpacing: -0.4 },
  heroSubtitle: { marginTop: 4 },
  controls: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  filterToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  sortPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  clearBtn: {
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    marginLeft: 'auto',
  },
  filterPanel: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.xs,
  },
  filterLabel: { marginTop: space.sm },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    fontWeight: '600',
  },
  cityInput: {
    minHeight: 44,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  list: {
    paddingHorizontal: space.md,
    paddingBottom: space['2xl'],
    gap: space.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: { letterSpacing: -0.2 },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  badgeText: {
    fontFamily: fonts.label,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  state: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingTop: space['2xl'],
  },
  footerLoader: { paddingVertical: space.lg },
})