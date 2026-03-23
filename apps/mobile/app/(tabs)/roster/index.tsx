import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { neutralColors } from '../../../src/theme/tokens'

type Member = {
  id: string
  role: string
  user: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

const ROLE_ORDER = ['OWNER', 'ADMIN', 'COACH', 'PLAYER', 'PARENT']
const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  COACH: 'Coach',
  PLAYER: 'Player',
  PARENT: 'Parent',
}

export default function RosterScreen() {
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [members, setMembers] = useState<Member[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchMembers = useCallback(async () => {
    if (!activeClub) return
    try {
      const data = await api<Member[]>(`/clubs/${activeClub.club.id}/members`)
      // Sort by role hierarchy
      const sorted = (data || []).sort(
        (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
      )
      setMembers(sorted)
    } catch {
      // Stale data is fine
    } finally {
      setLoading(false)
    }
  }, [activeClub])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchMembers()
    setRefreshing(false)
  }

  const renderMember = ({ item }: { item: Member }) => {
    const name = item.user.name || 'Unknown'
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

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
          <Text style={styles.memberName}>{name}</Text>
          <Text style={styles.memberRole}>{ROLE_LABELS[item.role] || item.role}</Text>
        </View>
        {(item.role === 'COACH' || item.role === 'OWNER' || item.role === 'ADMIN') && (
          <View style={[styles.roleBadge, { backgroundColor: theme.clubPrimaryLight }]}>
            <Text style={[styles.roleBadgeText, { color: theme.clubPrimary }]}>
              {ROLE_LABELS[item.role]}
            </Text>
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Squad</Text>
        <Text style={styles.memberCount}>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </Text>
      </View>
      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={neutralColors.textTertiary} />
              <Text style={styles.emptyTitle}>No members yet</Text>
              <Text style={styles.emptyText}>
                Share your club invite to add players.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  memberCount: { fontSize: 14, color: neutralColors.textSecondary },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: neutralColors.surface,
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: neutralColors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 16, fontWeight: '700' },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 16, fontWeight: '600', color: neutralColors.textPrimary },
  memberRole: { fontSize: 13, color: neutralColors.textSecondary, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  roleBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: neutralColors.textSecondary, marginTop: 4, textAlign: 'center' },
})
