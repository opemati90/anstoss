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
import { router } from 'expo-router'
import { PlayerPosition, type FreeAgentListItem, type FreeAgentListResponse } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { Screen, Text, Icon } from '../src/components/ui'
import { fontSize, space, radius, fonts, lineHeight, hairline } from '../src/theme/tokens'

const POSITION_FILTERS = [
  PlayerPosition.GK,
  PlayerPosition.DEF,
  PlayerPosition.MID,
  PlayerPosition.FWD,
]

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
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

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
    [city, isAdmin, position, query],
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

  const emptyState = useMemo(() => {
    if (isAdmin) {
      return t('transferList.empty')
    }
    return t('transferList.accessDenied')
  }, [isAdmin, t])

  return (
    <Screen header={<ModalHeader title={t('transferList.title')} />} padded={false}>
      <View style={styles.filters}>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          {t('transferList.subtitle')}
        </Text>
        <View style={[styles.searchRow, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Icon name="magnifyingglass" size="md" color={c.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('transferList.searchPlaceholder')}
            placeholderTextColor={c.textTertiary}
          />
        </View>
        <TextInput
          style={[
            styles.cityInput,
            { borderColor: c.border, backgroundColor: c.surface, color: c.textPrimary },
          ]}
          value={city}
          onChangeText={setCity}
          placeholder={t('transferList.cityPlaceholder')}
          placeholderTextColor={c.textTertiary}
        />
        <View style={styles.chipRow}>
          {POSITION_FILTERS.map((value) => {
            const active = value === position
            return (
              <Pressable
                key={value}
                style={[
                  styles.chip,
                  { borderColor: c.border, backgroundColor: c.surface },
                  active && { borderColor: c.primary, backgroundColor: `${c.primary}14` },
                ]}
                onPress={() => setPosition((current) => (current === value ? null : value))}
                accessibilityRole="button"
                accessibilityLabel={t(`freeAgent.positionShort.${value}`)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: c.textPrimary },
                    active ? { color: c.primary } : {},
                  ]}
                >
                  {t(`freeAgent.positionShort.${value}`)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : error ? (
        <ErrorState message={t('common.loadError')} onRetry={() => loadPage(1, true)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.3}
          onEndReached={() => void onEndReached()}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}
              onPress={() => router.push({ pathname: '/free-agent/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: c.primary50 }]}>
                  <Text style={[styles.avatarInitial, { color: c.primary }]}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.cardCopy}>
                <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{item.name}</Text>
                <Text style={[styles.cardMeta, { color: c.textSecondary }]}>
                  {[item.position, item.city].filter(Boolean).join(' · ') ||
                    t('transferList.metaFallback')}
                </Text>
                <Text style={[styles.cardMeta, { color: c.textSecondary }]}>
                  {t('transferList.experienceCount', { count: item.experienceCount })}
                </Text>
              </View>
              <Icon name="chevron.right" size="md" color={c.textTertiary} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.state}>
              <Text style={[styles.emptyCopy, { color: c.textSecondary }]}>{emptyState}</Text>
            </View>
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={c.primary} />
            ) : null
          }
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
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
    minHeight: 48,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  cityInput: {
    minHeight: 48,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
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
    padding: space.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
  },
  cardCopy: {
    flex: 1,
    gap: space.xs,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  cardMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  emptyCopy: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
  footerLoader: {
    marginTop: space.sm,
  },
})
