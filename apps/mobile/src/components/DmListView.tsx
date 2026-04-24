import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useClubColors } from '../context/ClubThemeContext'
import { api } from '../api/client'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingBoundary } from './LoadingBoundary'
import { ErrorBoundary } from './ErrorBoundary'
import { RosterSkeleton } from './Skeleton'
import { fontSize, space, radius, fonts,
  hairline } from '../theme/tokens'

export type ConversationItem = {
  id: string
  otherUser: { id: string; name: string; avatarUrl: string | null } | null
  lastMessage: { content: string; senderId: string; createdAt: string } | null
  unreadCount: number
  updatedAt: string
}

export function DmListView() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  const fetchConversations = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ConversationItem[]>(`/clubs/${clubId}/conversations`)
      setError(false)
      setConversations(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchConversations()
    }, [fetchConversations]),
  )

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  }

  const renderItem = ({ item }: { item: ConversationItem }) => {
    const name = item.otherUser?.name || t('dm.unknownUser')
    const initial = (name || '?').charAt(0).toUpperCase()
    const preview = item.lastMessage?.content || ''

    return (
      <Pressable
        style={[styles.conversationRow, { borderBottomWidth: hairline, borderBottomColor: c.borderDefault }]}
        onPress={() =>
          router.push({
            pathname: '/dm-chat',
            params: {
              conversationId: item.id,
              userName: name,
            },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${t('dm.conversationWith')} ${name}`}
      >
        <View style={[styles.avatar, { backgroundColor: c.primary50 }]}>
          <Text style={[styles.avatarText, { color: c.primary }]}>{initial}</Text>
        </View>
        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.conversationName, { color: c.textPrimary }]} numberOfLines={1}>{name}</Text>
            {item.lastMessage && (
              <Text style={[styles.conversationTime, { color: c.textTertiary }]}>{formatTime(item.lastMessage.createdAt)}</Text>
            )}
          </View>
          <View style={styles.conversationPreview}>
            <Text style={[styles.previewText, { color: c.textSecondary }]} numberOfLines={1}>{preview}</Text>
            {item.unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: c.primary }]}>
                <Text style={[styles.unreadText, { color: c.textInverse }]}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    )
  }

  const retry = () => {
    setError(false)
    setLoading(true)
    void fetchConversations()
  }

  return (
    <ErrorBoundary
      onRetry={retry}
      fallbackTitleKey="states.dm.error.title"
      fallbackBodyKey="states.dm.error.body"
      fallbackRetryKey="states.common.retry"
    >
      <LoadingBoundary
        isLoading={loading}
        skeleton={<RosterSkeleton />}
        testID="dm-loading-boundary"
      >
        {error ? (
          <ErrorState
            message={t('states.dm.error.title')}
            onRetry={retry}
            retryLabel={t('states.common.retry')}
          />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon="bubble.left.and.bubble.right"
            title={t('states.dm.empty.title')}
            description={t('states.dm.empty.body')}
            actionLabel={t('states.dm.empty.cta')}
            onAction={() => router.push('/dm-new')}
          />
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  fetchConversations()
                }}
              />
            }
          />
        )}
      </LoadingBoundary>
    </ErrorBoundary>
  )
}

/** Hook to get total unread DM count for badge display */
export function useDmUnreadCount() {
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id
  const [unreadCount, setUnreadCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      if (!clubId) return
      api<ConversationItem[]>(`/clubs/${clubId}/conversations`)
        .then((data) => {
          const total = data.reduce((sum, c) => sum + c.unreadCount, 0)
          setUnreadCount(total)
        })
        .catch(() => {
          // silently fail for badge count
        })
    }, [clubId]),
  )

  return unreadCount
}

const styles = StyleSheet.create({
  list: { paddingBottom: 40 },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: fontSize.lg, fontFamily: fonts.heading },
  conversationInfo: { flex: 1, marginLeft: space.sm },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conversationName: { fontSize: fontSize.md, fontFamily: fonts.heading, flex: 1, marginRight: space.sm },
  conversationTime: { fontSize: fontSize.xs, fontFamily: fonts.data },
  conversationPreview: { flexDirection: 'row', alignItems: 'center', marginTop: space['2xs'] },
  previewText: { fontSize: fontSize.sm, fontFamily: fonts.body, flex: 1 },
  unreadBadge: {
    minWidth: space.md,
    height: space.md,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xs,
    marginLeft: space.sm,
  },
  unreadText: { fontSize: fontSize['2xs'], fontFamily: fonts.heading },
})
