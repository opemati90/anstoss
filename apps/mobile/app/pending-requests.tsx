import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { useClubColors } from '../src/context/ClubThemeContext'
import { neutralColors, semanticColors, space, radius, fontSize, fontWeight, fonts } from '../src/theme/tokens'

type JoinRequestItem = {
  id: string
  role: string
  message: string | null
  status: string
  createdAt: string
  user: { id: string; name: string; email: string }
}

export default function PendingRequestsScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const { clubPrimary } = useClubColors()
  const clubId = activeClub?.club.id

  const [requests, setRequests] = useState<JoinRequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<JoinRequestItem[]>(`/clubs/${clubId}/join-requests`)
      setRequests(data)
    } catch {
      // silent
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [clubId])

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true)
      fetchRequests()
    }, [fetchRequests]),
  )

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchRequests()
  }

  const handleAction = async (requestId: string, action: 'approve' | 'reject') => {
    if (!clubId) return

    if (action === 'reject') {
      Alert.alert(
        t('pendingRequests.rejectConfirmTitle'),
        t('pendingRequests.rejectConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('pendingRequests.reject'),
            style: 'destructive',
            onPress: () => performAction(requestId, action),
          },
        ],
      )
      return
    }
    performAction(requestId, action)
  }

  const performAction = async (requestId: string, action: 'approve' | 'reject') => {
    if (!clubId) return
    setProcessingId(requestId)
    try {
      await api(`/clubs/${clubId}/join-requests/${requestId}/${action}`, {
        method: 'POST',
        body: {},
      })
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
    } catch (error) {
      const msg =
        error instanceof ApiError && error.message
          ? error.message
          : t('common.error')
      Alert.alert(t('common.error'), msg)
    } finally {
      setProcessingId(null)
    }
  }

  const renderItem = ({ item }: { item: JoinRequestItem }) => {
    const isProcessing = processingId === item.id
    const date = new Date(item.createdAt)
    const dateStr = date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.userName}>{item.user.name}</Text>
            <Text style={styles.userEmail}>{item.user.email}</Text>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: clubPrimary }]}>
            <Text style={styles.roleBadgeText}>
              {t(`roles.${item.role}`)}
            </Text>
          </View>
        </View>

        {item.message && (
          <Text style={styles.message} numberOfLines={3}>
            "{item.message}"
          </Text>
        )}

        <Text style={styles.dateText}>{dateStr}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => handleAction(item.id, 'reject')}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={`${t('pendingRequests.reject')} ${item.user.name}`}
          >
            {isProcessing ? (
              <ActivityIndicator color={neutralColors.textSecondary} size="small" />
            ) : (
              <>
                <Ionicons name="close" size={18} color={semanticColors.error} />
                <Text style={styles.rejectText}>{t('pendingRequests.reject')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton, { backgroundColor: clubPrimary }]}
            onPress={() => handleAction(item.id, 'approve')}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={`${t('pendingRequests.approve')} ${item.user.name}`}
          >
            {isProcessing ? (
              <ActivityIndicator color={neutralColors.textInverse} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color={neutralColors.textInverse} />
                <Text style={styles.approveText}>{t('pendingRequests.approve')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.outer}>
      <ModalHeader title={t('pendingRequests.title')} />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={clubPrimary} />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color={neutralColors.textTertiary} />
          <Text style={styles.emptyText}>{t('pendingRequests.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: neutralColors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.md,
  },
  list: { padding: space.md },
  card: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    marginBottom: space.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: space['2xl'],
    height: space['2xl'],
    borderRadius: radius.full,
    backgroundColor: neutralColors.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textInverse,
  },
  cardInfo: { flex: 1 },
  userName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  userEmail: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  roleBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  roleBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  message: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    fontStyle: 'italic',
    marginTop: space.sm,
    lineHeight: 20,
  },
  dateText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
    marginTop: space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 44,
    borderRadius: radius.md,
  },
  rejectButton: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  approveButton: {},
  rejectText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: semanticColors.error,
  },
  approveText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
})
