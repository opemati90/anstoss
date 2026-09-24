import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { MemberListFilter, MemberListPage } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Skeleton } from '../src/components/Skeleton'
import { MemberSheet } from '../src/components/admin/MemberSheet'
import {
  Avatar,
  FilterChipRow,
  ListRow,
  Screen,
  Text,
} from '../src/components/ui'
import { SearchBar } from '../src/components/ui/SearchBar'
import { hairline, RADIUS_CARD, space } from '../src/theme/tokens'

const PAGE_SIZE = 50

export type AdminMemberRow = {
  id: string
  userId?: string
  role: string
  operationalRoles?: string[]
  isYouth?: boolean
  isActive?: boolean
  teamNames?: string[]
  user: {
    id: string
    name: string
    email?: string | null
    avatarUrl: string | null
  }
}

type Counts = Record<MemberListFilter, number>

const FILTERS: MemberListFilter[] = ['all', 'active', 'passive', 'youth']

/**
 * Mitgliederliste — the whole club, paginated, with Aktiv / Passiv / Jugend
 * filters and one total that matches the Verein tab. Tap a member for the
 * admin sheet (Beitrag, SEPA, DSGVO, Führungszeugnis).
 */
export default function AdminMembersScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

  const [filter, setFilter] = useState<MemberListFilter>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<AdminMemberRow[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const requestRef = useRef(0)

  // Debounce typing so every keystroke is not a request.
  useEffect(() => {
    const handle = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(handle)
  }, [search])

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!clubId) return
      const requestId = ++requestRef.current
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        filter,
      })
      if (query) params.set('q', query)
      try {
        const data = await api<MemberListPage<AdminMemberRow> | AdminMemberRow[]>(
          `/clubs/${clubId}/members?${params.toString()}`,
        )
        if (requestId !== requestRef.current) return
        const page = normalisePage(data, filter, query)
        setItems((current) => (offset === 0 ? page.items : [...current, ...page.items]))
        setTotal(page.total)
        setCounts(page.counts)
        setStatus('ready')
      } catch {
        if (requestId !== requestRef.current) return
        if (offset === 0) setStatus('error')
      }
    },
    [clubId, filter, query],
  )

  useEffect(() => {
    setStatus('loading')
    void fetchPage(0)
  }, [fetchPage])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchPage(0)
    } finally {
      setRefreshing(false)
    }
  }

  const loadMore = async () => {
    if (loadingMore || status !== 'ready' || items.length >= total) return
    setLoadingMore(true)
    try {
      await fetchPage(items.length)
    } finally {
      setLoadingMore(false)
    }
  }

  const removeMember = useCallback(
    (userId: string, name: string) => {
      if (!clubId) return
      Alert.alert(
        t('adminMembers.removeTitle', { name }),
        t('adminMembers.removeBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('adminMembers.removeConfirm'),
            style: 'destructive',
            onPress: async () => {
              try {
                await api(`/clubs/${clubId}/members/${userId}`, { method: 'DELETE' })
                setSelectedUserId(null)
                await fetchPage(0)
              } catch (e) {
                Alert.alert(
                  t('common.error'),
                  e instanceof ApiError && e.status === 403
                    ? t('adminMembers.removeOwnerError')
                    : t('adminMembers.removeError'),
                )
              }
            },
          },
        ],
      )
    },
    [clubId, fetchPage, t],
  )

  const chips = useMemo(
    () =>
      FILTERS.map((key) => ({
        key,
        label: t(`verein.members.filter.${key}`),
        count: counts?.[key],
        testID: `members-filter-${key}`,
      })),
    [counts, t],
  )

  if (!isAdmin || !clubId) {
    return (
      <Screen
        header={<ModalHeader title={t('verein.members.list')} mode="back" />}
        padded={false}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  const listHeader = (
    <View style={styles.listHeader}>
      <Text variant="footnote" color="secondary" tabular>
        {t('verein.members.totalCount', { count: total })}
      </Text>
    </View>
  )

  return (
    <Screen
      header={<ModalHeader title={t('verein.members.list')} mode="back" />}
      scroll={false}
      padded={false}
    >
      <View style={styles.controls}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('verein.members.search')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <FilterChipRow
          chips={chips}
          selected={filter}
          singleSelect
          onToggle={(key) => setFilter(key)}
          testID="members-filters"
        />
      </View>

      {status === 'loading' ? (
        <MembersSkeleton />
      ) : status === 'error' ? (
        <ErrorState
          message={t('verein.members.loadError')}
          onRetry={() => {
            setStatus('loading')
            void fetchPage(0)
          }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="person.2"
          title={query ? t('verein.members.noResults') : t('verein.members.emptyTitle')}
          description={
            query ? t('verein.members.noResultsHint', { query }) : t('verein.members.emptyBody')
          }
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <Skeleton shape="card" height={60} />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.rowWrap,
                { backgroundColor: c.surface, borderColor: c.borderSubtle },
                index === 0 && styles.rowFirst,
                index === items.length - 1 && styles.rowLast,
              ]}
            >
              <ListRow
                left={<Avatar size="md" src={item.user.avatarUrl} fallbackText={item.user.name} />}
                title={item.user.name}
                subtitle={memberSubtitle(item, t)}
                showChevron
                onPress={() => setSelectedUserId(item.userId ?? item.user.id)}
              />
            </View>
          )}
        />
      )}

      <MemberSheet
        clubId={clubId}
        userId={selectedUserId}
        visible={selectedUserId !== null}
        onClose={() => setSelectedUserId(null)}
        onChanged={() => void fetchPage(0)}
        onRemove={(summary) => removeMember(summary.userId, summary.name)}
      />
    </Screen>
  )
}

function memberSubtitle(
  item: AdminMemberRow,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const parts = [t(`verein.memberRole.${item.role}`, { defaultValue: item.role })]
  if (item.teamNames && item.teamNames.length > 0) parts.push(item.teamNames.join(', '))
  else if (item.isActive === false) parts.push(t('verein.members.filter.passive'))
  return parts.join(' · ')
}

/**
 * Accepts the paginated envelope and, for an older API that still returns a
 * bare array, filters/paginates locally so the screen never breaks.
 */
export function normalisePage(
  data: MemberListPage<AdminMemberRow> | AdminMemberRow[] | null | undefined,
  filter: MemberListFilter,
  query: string,
): { items: AdminMemberRow[]; total: number; counts: Counts } {
  if (data && !Array.isArray(data) && Array.isArray(data.items)) {
    return {
      items: data.items.filter((row) => row?.id && row.user?.name),
      total: typeof data.total === 'number' ? data.total : data.items.length,
      counts: data.counts,
    }
  }
  const rows = (Array.isArray(data) ? data : []).filter((row) => row?.id && row.user?.name)
  const isActive = (row: AdminMemberRow) => row.isActive ?? true
  const counts: Counts = {
    all: rows.length,
    active: rows.filter(isActive).length,
    passive: rows.filter((row) => !isActive(row)).length,
    youth: rows.filter((row) => row.isYouth).length,
  }
  const q = query.toLowerCase()
  const filtered = rows.filter((row) => {
    if (filter === 'active' && !isActive(row)) return false
    if (filter === 'passive' && isActive(row)) return false
    if (filter === 'youth' && !row.isYouth) return false
    return !q || row.user.name.toLowerCase().includes(q)
  })
  return { items: filtered, total: filtered.length, counts }
}

function MembersSkeleton() {
  return (
    <View style={styles.skeleton} testID="admin-members-loading">
      <Skeleton shape="line" width="30%" height={12} />
      {Array.from({ length: 7 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton shape="circle" width={40} height={40} />
          <View style={styles.skeletonText}>
            <Skeleton shape="line" width="55%" height={14} />
            <Skeleton shape="line" width="35%" height={12} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: space.sm,
  },
  listHeader: { paddingHorizontal: space.sm, paddingBottom: space.xs },
  listContent: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space['2xl'],
  },
  rowWrap: {
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderBottomWidth: hairline,
  },
  rowFirst: {
    borderTopWidth: hairline,
    borderTopLeftRadius: RADIUS_CARD,
    borderTopRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  rowLast: {
    borderBottomLeftRadius: RADIUS_CARD,
    borderBottomRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  footer: { paddingTop: space.sm },
  skeleton: { padding: space.md, gap: space.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skeletonText: { flex: 1, gap: space.xs },
})
