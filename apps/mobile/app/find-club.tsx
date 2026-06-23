import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Image, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubSearchResponse, ClubSearchResult } from '@anstoss/shared'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, SearchBar, ListRow, Text, Button } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { hairline, radius, space } from '../src/theme/tokens'

const MIN_QUERY_LEN = 2
const DEBOUNCE_MS = 300

export default function FindClubScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClubSearchResult[]>([])
  const [isLoading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRequestIdRef = useRef(0)

  const handleQueryChange = (next: string) => {
    const trimmed = next.trim()
    searchRequestIdRef.current += 1
    setQuery(next)
    setResults([])
    setError(null)
    setHasSearched(false)
    setLoading(trimmed.length >= MIN_QUERY_LEN)
  }

  useEffect(() => {
    const trimmed = query.trim()
    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([])
      setHasSearched(false)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await api<ClubSearchResponse>(
          `/clubs/search?q=${encodeURIComponent(trimmed)}`,
        )
        if (cancelled || requestId !== searchRequestIdRef.current) return
        setResults(res?.results ?? [])
        setHasSearched(true)
      } catch (e) {
        if (cancelled || requestId !== searchRequestIdRef.current) return
        setError(e instanceof Error ? e.message : t('findClub.loadError'))
        setHasSearched(true)
      } finally {
        if (!cancelled && requestId === searchRequestIdRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, t])

  const renderEmpty = () => {
    if (isLoading) return null
    if (!hasSearched) return <EmptyHint text={t('findClub.startTyping')} />
    if (error) return <EmptyHint text={error} />
    return (
      <EmptyHint
        text={t('findClub.empty')}
        actionLabel={t('findClub.setupMissingClub', {
          defaultValue: 'Set up this club',
        })}
        onAction={() =>
          router.push({
            pathname: '/club-setup',
            params: { clubName: query.trim() },
          })
        }
      />
    )
  }

  return (
    <Screen header={<ModalHeader mode="back" title={t('findClub.title')} />} padded={false}>
      <View style={styles.container}>
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={handleQueryChange}
            placeholder={t('findClub.searchPlaceholder')}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            testID="find-club-search"
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListHeaderComponent={isLoading ? <LoadingRow color={c.textTertiary} /> : null}
          renderItem={({ item }) => (
            <ListRow
              testID={`find-club-row-${item.slug}`}
              title={item.name}
              subtitle={buildSubtitle(item, t)}
              onPress={() => router.push(`/club/${item.slug}`)}
              showChevron
              left={<BadgeThumb club={item} />}
            />
          )}
        />
      </View>
    </Screen>
  )
}

function buildSubtitle(
  club: ClubSearchResult,
  t: (k: string, o?: { count?: number; defaultValue?: string }) => string,
) {
  const parts: string[] = []
  if (club.city) parts.push(club.city)
  if (club.association) parts.push(club.association)
  parts.push(
    club.isActive === false
      ? t('findClub.directoryRecord', { defaultValue: 'Not on Anstoss yet' })
      : t('findClub.memberCount', { count: club.memberCount }),
  )
  return parts.join(' · ')
}

function BadgeThumb({ club }: { club: ClubSearchResult }) {
  const c = useClubColors()
  if (club.badgeUrl) {
    return (
      <Image
        source={{ uri: club.badgeUrl }}
        style={[styles.badge, { backgroundColor: c.background, borderColor: c.borderDefault }]}
        resizeMode="contain"
      />
    )
  }
  return (
    <View
      style={[
        styles.badgeFallback,
        { backgroundColor: club.primaryColor, borderColor: c.borderDefault },
      ]}
    >
      <Text variant="caption1" color="inverse">
        {club.name
          .split(/\s+/)
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()}
      </Text>
    </View>
  )
}

function EmptyHint({
  text,
  actionLabel,
  onAction,
}: {
  text: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View style={styles.empty}>
      <Text variant="body" color="secondary" align="center">
        {text}
      </Text>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant="bordered"
          size="sm"
          onPress={onAction}
          style={styles.emptyAction}
        />
      ) : null}
    </View>
  )
}

function LoadingRow({ color }: { color: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="small" color={color} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  listContent: { paddingHorizontal: space.lg, paddingBottom: space['2xl'], gap: space.xs },
  empty: {
    padding: space['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  emptyAction: { alignSelf: 'center' },
  loading: { paddingVertical: space.md, alignItems: 'center' },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  badgeFallback: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
