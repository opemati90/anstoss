import { useCallback, useState } from 'react'
import { View, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Banner, Icon, Screen, Text } from '../src/components/ui'
import { card, fonts, fontSize, hairline, space } from '../src/theme/tokens'

type MemberItem = {
  id: string
  role: string
  user: { id: string; name: string; email: string; avatarUrl: string | null }
}

export default function DmNewScreen() {
  const { t } = useTranslation()
  const { user, activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [members, setMembers] = useState<MemberItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const loadMembers = useCallback(() => {
    if (!clubId) return
    setLoading(true)
    api<MemberItem[]>(`/clubs/${clubId}/members`)
      .then((data) => {
        setError(false)
        setMembers((data || []).filter((m) => m.user.id !== user?.id))
      })
      .catch(() => {
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [clubId, user?.id])

  useFocusEffect(
    useCallback(() => {
      loadMembers()
    }, [loadMembers]),
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
      <Pressable
        style={({ pressed }) => [
          styles.memberRow,
          { borderColor: c.borderDefault, backgroundColor: c.surface },
          pressed && { opacity: 0.9 },
        ]}
        onPress={() => handleSelectMember(item.user.id, item.user.name)}
        disabled={!!creating}
        accessibilityRole="button"
        accessibilityLabel={`${t('dm.startConversationWith')} ${item.user.name}`}
      >
        <View style={[styles.avatar, { backgroundColor: c.primary50 }]}>
          <Text variant="headline" weight="bold" color={c.primary}>
            {initial}
          </Text>
        </View>
        <View style={styles.memberInfo}>
          <Text variant="headline" color="primary" numberOfLines={1}>
            {item.user.name}
          </Text>
          <Text variant="footnote" color="secondary">
            {t(`roles.${item.role}`)}
          </Text>
        </View>
        {isCreating ? (
          <ActivityIndicator size="small" color={c.primary} />
        ) : (
          <Icon name="chevron.right" size="sm" color="tertiary" />
        )}
      </Pressable>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('dm.newConversation')} />} padded={false}>
      <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <Icon name="search" size="md" color="tertiary" />
        <TextInput
          style={[styles.searchInput, { color: c.textPrimary }]}
          placeholder={t('dm.searchMembers')}
          placeholderTextColor={c.textTertiary}
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
            accessibilityLabel={t('common.clear')}
          >
            <Icon name="xmark.circle.fill" size="md" color="tertiary" />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Banner
            tone="error"
            title={t('common.loadError')}
            action={{ label: t('common.retry'), onPress: loadMembers }}
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 72,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.md,
    marginBottom: space.md,
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
  list: {
    paddingHorizontal: space.md,
    paddingBottom: space['2xl'],
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    marginBottom: space.sm,
    minHeight: 64,
    gap: space.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
    gap: space['2xs'],
  },
  errorWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
})
