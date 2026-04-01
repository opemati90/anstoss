import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { PlayerPosition, type FreeAgentListItem, type FreeAgentListResponse } from '@anstoss/shared'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { neutralColors, fontSize, fontWeight, space, radius, fonts, lineHeight } from '../src/theme/tokens'

const POSITION_FILTERS = [
  PlayerPosition.GK,
  PlayerPosition.DEF,
  PlayerPosition.MID,
  PlayerPosition.FWD,
]

export default function TransferListScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
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
    <View style={styles.container}>
      <ModalHeader title={t('transferList.title')} />

      <View style={styles.filters}>
        <Text style={styles.subtitle}>{t('transferList.subtitle')}</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={neutralColors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('transferList.searchPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />
        </View>
        <TextInput
          style={styles.cityInput}
          value={city}
          onChangeText={setCity}
          placeholder={t('transferList.cityPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
        />
        <View style={styles.chipRow}>
          {POSITION_FILTERS.map((value) => {
            const active = value === position
            return (
              <TouchableOpacity
                key={value}
                style={[
                  styles.chip,
                  active && { borderColor: theme.clubPrimary, backgroundColor: `${theme.clubPrimary}14` },
                ]}
                onPress={() => setPosition((current) => (current === value ? null : value))}
                accessibilityRole="button"
                accessibilityLabel={t(`freeAgent.positionShort.${value}`)}
              >
                <Text
                  style={[
                    styles.chipText,
                    active && { color: theme.clubPrimary },
                  ]}
                >
                  {t(`freeAgent.positionShort.${value}`)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={theme.clubPrimary} />
        </View>
      ) : error ? (
        <ErrorState message={t('common.loadError')} onRetry={() => loadPage(1, true)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          onEndReachedThreshold={0.3}
          onEndReached={() => void onEndReached()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                router.push({ pathname: '/free-agent/[id]', params: { id: item.id } })
              }
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.clubPrimaryLight }]}>
                  <Text style={[styles.avatarInitial, { color: theme.clubPrimary }]}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {[item.position, item.city].filter(Boolean).join(' · ') || t('transferList.metaFallback')}
                </Text>
                <Text style={styles.cardMeta}>
                  {t('transferList.experienceCount', { count: item.experienceCount })}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={neutralColors.textTertiary}
              />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.state}>
              <Text style={styles.emptyCopy}>{emptyState}</Text>
            </View>
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={theme.clubPrimary} />
            ) : null
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  filters: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
  },
  cityInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
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
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
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
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  cardCopy: {
    flex: 1,
    gap: space.xs,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  cardMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
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
    color: neutralColors.textSecondary,
  },
  footerLoader: {
    marginTop: space.sm,
  },
})
