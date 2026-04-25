import { useState, useCallback } from 'react'
import {
  View,
  Pressable,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { RosterSkeleton } from '../src/components/Skeleton'
import { Screen, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space, radius, fontSize, fonts, lineHeight, hairline } from '../src/theme/tokens'

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
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [requests, setRequests] = useState<JoinRequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<JoinRequestItem[]>(`/clubs/${clubId}/join-requests`)
      setRequests(data)
      setError(false)
    } catch {
      setError(true)
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
      Alert.alert(t('pendingRequests.rejectConfirmTitle'), t('pendingRequests.rejectConfirmBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('pendingRequests.reject'),
          style: 'destructive',
          onPress: () => performAction(requestId, action),
        },
      ])
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
      const msg = error instanceof ApiError && error.message ? error.message : t('common.error')
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
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: c.textTertiary }]}>
            <Text style={[styles.avatarText, { color: c.textInverse }]}>
              {item.user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.userName, { color: c.textPrimary }]}>{item.user.name}</Text>
            <Text style={[styles.userEmail, { color: c.textSecondary }]}>{item.user.email}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.roleBadge, { backgroundColor: c.primary50 }]}>
                <Text style={[styles.roleBadgeText, { color: c.primary }]}>
                  {t(`roles.${item.role}`)}
                </Text>
              </View>
              <Text style={[styles.dateText, { color: c.textTertiary }]}>{dateStr}</Text>
            </View>
          </View>
        </View>

        {item.message && (
          <View
            style={[styles.messageCard, { backgroundColor: c.background, borderColor: c.borderDefault }]}
          >
            <Text style={[styles.message, { color: c.textSecondary }]} numberOfLines={3}>
              {item.message}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[
              styles.actionButton,
              styles.rejectButton,
              { borderColor: c.borderDefault, backgroundColor: c.surface },
            ]}
            onPress={() => handleAction(item.id, 'reject')}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={`${t('pendingRequests.reject')} ${item.user.name}`}
          >
            {isProcessing ? (
              <ActivityIndicator color={c.textSecondary} size="small" />
            ) : (
              <>
                <Icon name="xmark" size="md" color={c.error} />
                <Text style={[styles.rejectText, { color: c.error }]}>
                  {t('pendingRequests.reject')}
                </Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={[styles.actionButton, { backgroundColor: c.primary }]}
            onPress={() => handleAction(item.id, 'approve')}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={`${t('pendingRequests.approve')} ${item.user.name}`}
          >
            {isProcessing ? (
              <ActivityIndicator color={c.textInverse} size="small" />
            ) : (
              <>
                <Icon name="checkmark" size="md" color={c.textInverse} />
                <Text style={[styles.approveText, { color: c.textInverse }]}>
                  {t('pendingRequests.approve')}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <Screen header={<ModalHeader title={t('pendingRequests.title')} />} padded={false}>
      <ErrorBoundary
        onRetry={fetchRequests}
        fallbackTitleKey="states.pending_requests.error.title"
        fallbackBodyKey="states.pending_requests.error.body"
        fallbackRetryKey="states.common.retry"
      >
        <LoadingBoundary
          isLoading={isLoading}
          skeleton={<RosterSkeleton />}
          testID="pending-requests-loading-boundary"
        >
          {error ? (
            <ErrorState
              message={t('states.pending_requests.error.title')}
              onRetry={fetchRequests}
              retryLabel={t('states.common.retry')}
            />
          ) : requests.length === 0 ? (
            <EmptyState
              icon="person.2"
              title={t('states.pending_requests.empty.title')}
              description={t('states.pending_requests.empty.body')}
            />
          ) : (
            <FlatList
              data={requests}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
            />
          )}
        </LoadingBoundary>
      </ErrorBoundary>
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.md,
  },
  list: { padding: space.md },
  card: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md + 2,
    marginBottom: space.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  avatar: {
    width: space['2xl'],
    height: space['2xl'],
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  cardInfo: { flex: 1 },
  userName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  userEmail: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  roleBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  roleBadgeText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
  },
  messageCard: {
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  message: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  dateText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
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
    minHeight: 44,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  rejectButton: {
    borderWidth: hairline,
  },
  rejectText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  approveText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
})
