/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useState } from 'react'
import {
  View,
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
import { Text } from './ui'
import { space, radius, hairline } from '../theme/tokens'

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
    const initials = (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('')
    const preview = item.lastMessage?.content || ''
    const hasUnread = item.unreadCount > 0

    return (
      <Pressable
        style={({ pressed }) => [
          styles.conversationRow,
          { borderBottomWidth: hairline, borderBottomColor: c.borderDefault },
          pressed && { backgroundColor: c.surfaceSunken ?? c.background },
        ]}
        onPress={() =>
          router.push({
            pathname: '/dm-chat',
            params: {
              conversationId: item.id,
              userName: name,
              userId: item.otherUser?.id,
            },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${t('dm.conversationWith')} ${name}`}
      >
        <View style={[styles.avatar, { backgroundColor: c.primary50 }]}>
          <Text variant="footnote" weight="semibold" color="tint">
            {initials || '?'}
          </Text>
        </View>
        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <Text
              variant="callout"
              weight={hasUnread ? 'semibold' : 'medium'}
              color="primary"
              numberOfLines={1}
              style={styles.conversationName}
            >
              {name}
            </Text>
            {item.lastMessage ? (
              <Text variant="caption2" color="tertiary" tabular>
                {formatTime(item.lastMessage.createdAt)}
              </Text>
            ) : null}
          </View>
          <View style={styles.conversationPreview}>
            <Text
              variant="footnote"
              color={hasUnread ? 'primary' : 'secondary'}
              weight={hasUnread ? 'medium' : 'regular'}
              numberOfLines={1}
              style={styles.previewText}
            >
              {preview || t('dm.noMessages', { defaultValue: 'No messages yet' })}
            </Text>
            {hasUnread ? (
              <View style={[styles.unreadBadge, { backgroundColor: c.primary }]}>
                <Text variant="caption2" color="inverse" weight="semibold" tabular>
                  {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                </Text>
              </View>
            ) : null}
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
            removeClippedSubviews
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={9}
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
  list: { paddingBottom: space.xl },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    gap: space.sm + 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationInfo: { flex: 1, gap: 2 },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.xs,
  },
  conversationName: { flex: 1 },
  conversationPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  previewText: { flex: 1 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
})
