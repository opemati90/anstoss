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
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors, space, fontSize, fontWeight, radius } from '../src/theme/tokens'

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

  const clubId = activeClub?.club.id

  const fetchMembers = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<AdminMember[]>(`/clubs/${clubId}/members`)
      setMembers(data || [])
    } catch {
      // stale ok
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchMembers()
    setRefreshing(false)
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('adminMembers.title')}</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={neutralColors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('adminMembers.searchPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={neutralColors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.countLabel}>
        {t('adminMembers.count', { count: filtered.length })}
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  backButton: { marginRight: space.sm },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
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
    color: neutralColors.textPrimary,
  },
  countLabel: {
    fontSize: fontSize.xs,
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
    padding: 14,
    marginBottom: space.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  memberInfo: { flex: 1, marginLeft: space.sm },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  memberEmail: {
    fontSize: fontSize.xs,
    color: neutralColors.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: space.sm,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  teamChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: neutralColors.background,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  teamChipText: {
    fontSize: fontSize['2xs'],
    color: neutralColors.textSecondary,
  },
  empty: { paddingTop: 72, alignItems: 'center' },
  emptyText: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
  },
})
