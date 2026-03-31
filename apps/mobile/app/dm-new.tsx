import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, fontSize, fontWeight, space, radius, fonts } from '../src/theme/tokens'

type MemberItem = {
  id: string
  role: string
  user: { id: string; name: string; email: string; avatarUrl: string | null }
}

export default function DmNewScreen() {
  const { t } = useTranslation()
  const { user, activeClub } = useAuth()
  const theme = useClubColors()
  const clubId = activeClub?.club.id

  const [members, setMembers] = useState<MemberItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (!clubId) return
      setLoading(true)
      api<MemberItem[]>(`/clubs/${clubId}/members`)
        .then((data) => {
          // Filter out current user
          setMembers((data || []).filter((m) => m.user.id !== user?.id))
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }, [clubId, user?.id]),
  )

  const filtered = search.trim()
    ? members.filter((m) => {
        const q = search.toLowerCase()
        return m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q)
      })
    : members

  const handleSelectMember = async (memberId: string, memberName: string) => {
    if (!clubId || creating) return
    setCreating(memberId)
    try {
      const conversation = await api<{ id: string }>(`/clubs/${clubId}/conversations`, {
        method: 'POST',
        body: { participantId: memberId },
      })
      router.replace({
        pathname: '/dm-chat',
        params: { conversationId: conversation.id, userName: memberName },
      })
    } catch {
      setCreating(null)
    }
  }

  const renderMember = ({ item }: { item: MemberItem }) => {
    const initial = item.user.name.charAt(0).toUpperCase()
    const isCreating = creating === item.user.id

    return (
      <TouchableOpacity
        style={styles.memberRow}
        onPress={() => handleSelectMember(item.user.id, item.user.name)}
        disabled={!!creating}
        accessibilityRole="button"
        accessibilityLabel={`${t('dm.startConversationWith')} ${item.user.name}`}
      >
        <View style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}>
          <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>{initial}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.user.name}</Text>
          <Text style={styles.memberRole}>{t(`roles.${item.role}`)}</Text>
        </View>
        {isCreating && <ActivityIndicator size="small" color={theme.clubPrimary} />}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('dm.newConversation')} />

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={neutralColors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('dm.searchMembers')}
          placeholderTextColor={neutralColors.textTertiary}
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
            accessibilityLabel={t('common.clear')}
          >
            <Ionicons name="close-circle" size={18} color={neutralColors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.clubPrimary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 72 },
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
  list: { paddingBottom: space['2xl'] },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, fontFamily: fonts.heading },
  memberInfo: { flex: 1, marginLeft: space.sm },
  memberName: { fontSize: fontSize.md, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textPrimary },
  memberRole: { fontSize: fontSize.xs, fontFamily: fonts.body, color: neutralColors.textSecondary, marginTop: space['2xs'] },
  emptyText: { fontSize: fontSize.sm, fontFamily: fonts.body, color: neutralColors.textSecondary },
})
