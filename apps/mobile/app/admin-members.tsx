import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { RosterSkeleton } from '../src/components/Skeleton'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { fonts, fontSize, fontWeight, neutralColors, radius, space } from '../src/theme/tokens'

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
  const theme = useClubColors()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clubId = activeClub?.club.id
  const isAdmin = activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

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
      <View style={styles.memberCard}>
        {item.user.avatarUrl ? (
          <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: theme.clubPrimaryLight }]}>
            <Text style={[styles.avatarInitials, { color: theme.clubPrimary }]}>
              {initials}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.user.name}</Text>
          <Text style={styles.memberEmail}>{item.user.email}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.roleBadge, { backgroundColor: theme.clubPrimaryLight }]}>
              <Text style={[styles.roleBadgeText, { color: theme.clubPrimary }]}>
                {roleLabel}
              </Text>
            </View>
            {item.teamAccess.map((ta) => (
              <View key={ta.teamId} style={styles.teamChip}>
                <Text style={styles.teamChipText}>
                  {ta.teamName}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    )
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('adminMembers.title')} mode="back" />
        <EmptyState
          icon="lock-closed-outline"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('adminMembers.title')} mode="back" />

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={neutralColors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('adminMembers.searchPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          accessibilityLabel={t('adminMembers.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.clearSearch')}
          >
            <Ionicons name="close-circle" size={18} color={neutralColors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.countLabel}>
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('common.noResults')}</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    paddingHorizontal: space.sm,
    height: 44,
    gap: space.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
  },
  countLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  list: { paddingHorizontal: space.md, paddingBottom: 100 },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: radius.full },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: { fontSize: fontSize.md, fontWeight: fontWeight.bold, fontFamily: fonts.heading },
  memberInfo: { flex: 1, marginLeft: space.sm },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  memberEmail: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    marginTop: space['2xs'],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.sm,
  },
  roleBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  roleBadgeText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    textTransform: 'uppercase',
  },
  teamChip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: neutralColors.background,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  teamChipText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  empty: { paddingTop: space['3xl'], alignItems: 'center' },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
})
