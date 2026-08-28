import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, View, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Banner, Icon, Screen, Text } from '../src/components/ui'
import { SearchBar } from '../src/components/ui/SearchBar'
import { elevation, hairline, radius, space } from '../src/theme/tokens'

type MemberItem = {
  id: string
  role: string
  user: {
    id: string
    name: string
    avatarUrl: string | null
    teamAccess: Array<{ role: string; team: { id: string; displayName: string } }>
  }
}

type DirectoryPage = { items: MemberItem[]; nextCursor: string | null }

export default function DmNewScreen() {
  const { t } = useTranslation()
  const { user, activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [members, setMembers] = useState<MemberItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const requestGeneration = useRef(0)
  const cursorsInFlight = useRef(new Set<string>())

  const loadMembers = useCallback((query: string, cursor?: string, generation = requestGeneration.current) => {
    if (!clubId || query.trim().length < 2) {
      setMembers([])
      setNextCursor(null)
      setLoading(false)
      setError(false)
      return
    }
    if (cursor && cursorsInFlight.current.has(cursor)) return
    if (cursor) cursorsInFlight.current.add(cursor)
    else setLoading(true)
    const params = new URLSearchParams({ query: query.trim(), limit: '50' })
    if (cursor) params.set('cursor', cursor)
    api<DirectoryPage>(`/clubs/${clubId}/member-directory?${params.toString()}`)
      .then((data) => {
        if (generation !== requestGeneration.current) return
        setError(false)
        const visible = (data.items || []).filter((member) => member.user.id !== user?.id)
        setMembers((current) => {
          if (!cursor) return visible
          const byId = new Map(current.map((member) => [member.id, member]))
          for (const member of visible) byId.set(member.id, member)
          return [...byId.values()]
        })
        setNextCursor(data.nextCursor)
      })
      .catch(() => {
        if (generation === requestGeneration.current && !cursor) setError(true)
      })
      .finally(() => {
        if (cursor) cursorsInFlight.current.delete(cursor)
        if (generation === requestGeneration.current && !cursor) setLoading(false)
      })
  }, [clubId, user?.id])

  useEffect(() => {
    const generation = ++requestGeneration.current
    cursorsInFlight.current.clear()
    setNextCursor(null)
    const normalized = search.trim()
    if (normalized.length < 2) {
      setMembers([])
      setLoading(false)
      setError(false)
      return
    }
    const timer = setTimeout(() => loadMembers(normalized, undefined, generation), 300)
    return () => clearTimeout(timer)
  }, [loadMembers, search])

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
    } catch (err) {
      Alert.alert(
        t('common.errorTitle'),
        err instanceof ApiError && err.status === 403
          ? t('dm.restricted')
          : t('dm.resolveError'),
      )
    } finally {
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
          elevation.card,
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
            {item.user.teamAccess[0]?.team.displayName ?? t(`roles.${item.role}`)}
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
      <SearchBar
        placeholder={t('dm.searchMembers')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        containerStyle={styles.searchBar}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Banner
            tone="error"
            title={t('common.loadError')}
            action={{ label: t('common.retry'), onPress: () => loadMembers(search) }}
          />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            if (nextCursor && !loading) loadMembers(search, nextCursor)
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="subheadline" color="secondary">
                {search.trim().length < 2 ? t('dm.searchHint') : t('common.noResults')}
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
    paddingTop: space['3xl'] + space.sm,
  },
  searchBar: {
    marginHorizontal: space.md,
    marginBottom: space.md,
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
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    marginBottom: space.sm,
    minHeight: 64,
    gap: space.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
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
