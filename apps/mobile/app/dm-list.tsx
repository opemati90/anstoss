import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { neutralColors, fontSize, fontWeight, space, radius, fonts } from '../src/theme/tokens'

type ConversationItem = {
  id: string
  otherUser: { id: string; name: string; avatarUrl: string | null } | null
  lastMessage: { content: string; senderId: string; createdAt: string } | null
  unreadCount: number
  updatedAt: string
}

export default function DmListScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const clubId = activeClub?.club.id

  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchConversations = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<ConversationItem[]>(`/clubs/${clubId}/conversations`)
      setConversations(data)
    } catch {
      // silent
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

  const handleNewConversation = () => {
    router.push('/dm-new')
  }

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
    const initial = name.charAt(0).toUpperCase()
    const preview = item.lastMessage?.content || ''

    return (
      <TouchableOpacity
        style={styles.conversationRow}
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
        <View style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}>
          <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>{initial}</Text>
        </View>
        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <Text style={styles.conversationName} numberOfLines={1}>{name}</Text>
            {item.lastMessage && (
              <Text style={styles.conversationTime}>{formatTime(item.lastMessage.createdAt)}</Text>
            )}
          </View>
          <View style={styles.conversationPreview}>
            <Text style={styles.previewText} numberOfLines={1}>{preview}</Text>
            {item.unreadCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.clubPrimary }]}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader
        title={t('dm.title')}
        mode="back"
        rightAction={
          <TouchableOpacity
            onPress={handleNewConversation}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('dm.newConversation')}
          >
            <Ionicons name="create-outline" size={22} color={theme.clubPrimary} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.clubPrimary} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="chatbubble-outline"
            title={t('dm.emptyTitle')}
            description={t('dm.emptyBody')}
          />
        </View>
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingBottom: 40 },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: neutralColors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, fontFamily: fonts.heading },
  conversationInfo: { flex: 1, marginLeft: space.sm },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conversationName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, fontFamily: fonts.heading, color: neutralColors.textPrimary, flex: 1, marginRight: space.sm },
  conversationTime: { fontSize: fontSize.xs, fontFamily: fonts.data, color: neutralColors.textTertiary },
  conversationPreview: { flexDirection: 'row', alignItems: 'center', marginTop: space['2xs'] },
  previewText: { fontSize: fontSize.sm, fontFamily: fonts.body, color: neutralColors.textSecondary, flex: 1 },
  unreadBadge: {
    minWidth: space.md,
    height: space.md,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xs,
    marginLeft: space.sm,
  },
  unreadText: { fontSize: fontSize['2xs'], fontWeight: fontWeight.bold, fontFamily: fonts.heading, color: neutralColors.textInverse },
})
