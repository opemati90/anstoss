import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { RosterSkeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Badge, Icon, Screen, Text } from '../src/components/ui'
import { card, fonts, fontSize, hairline, space } from '../src/theme/tokens'

type AdminMember = {
  id: string
  role: string
  user: {
    id: string
    name: string
    email: string
    avatarUrl: string | null
  }
  teamAccess: {
    teamId: string
    teamName: string
    role: string
  }[]
}

export default function AdminMembersScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clubId = activeClub?.club.id
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

  const fetchMembers = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<AdminMember[]>(`/clubs/${clubId}/members`)
      setMembers(data || [])
      setError(null)
    } catch {
      setError(t('errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchMembers()
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = search.trim()
    ? members.filter((m) => {
        const q = search.toLowerCase()
        return (
          m.user.name.toLowerCase().includes(q) ||
          m.user.email.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q)
        )
      })
    : members

  const renderMember = ({ item }: { item: AdminMember }) => {
    const initials = item.user.name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    const roleLabel = t(`roles.${item.role}`)

    return (
      <View style={[styles.memberCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        {item.user.avatarUrl ? (
          <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: c.primary50 }]}>
            <Text variant="headline" weight="bold" color={c.primary}>
              {initials}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text variant="headline" color="primary" numberOfLines={1}>
            {item.user.name}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {item.user.email}
          </Text>
          <View style={styles.badgeRow}>
            <Badge label={roleLabel} variant="club" />
            {item.teamAccess.map((ta) => (
              <Badge key={ta.teamId} label={ta.teamName} variant="neutral" />
            ))}
          </View>
        </View>
      </View>
    )
  }

  if (!isAdmin) {
    return (
      <Screen header={<ModalHeader title={t('adminMembers.title')} mode="back" />} padded={false}>
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('adminMembers.title')} mode="back" />} padded={false}>
      <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Icon name="search" size="md" color="tertiary" />
        <TextInput
          style={[styles.searchInput, { color: c.textPrimary }]}
          placeholder={t('adminMembers.searchPlaceholder')}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={t('adminMembers.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 ? (
          <Pressable
            onPress={() => setSearch('')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.clearSearch')}
          >
            <Icon name="xmark.circle.fill" size="md" color="tertiary" />
          </Pressable>
        ) : null}
      </View>

      <Text variant="caption2" color="tertiary" tabular style={styles.countLabel}>
        {t('adminMembers.count', { count: filtered.length })}
      </Text>

      {error ? (
        <ErrorState message={error} onRetry={fetchMembers} />
      ) : loading ? (
        <RosterSkeleton />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="subheadline" color="secondary">
                {t('common.noResults')}
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.sm,
    height: 44,
    gap: space.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  countLabel: {
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  list: { paddingHorizontal: space.md },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.paddingCompact,
    marginBottom: space.sm,
    gap: space.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: { flex: 1, gap: space['2xs'] },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
  },
  empty: { paddingTop: space['3xl'], alignItems: 'center' },
})
