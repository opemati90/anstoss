import { useState, useCallback } from 'react'
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
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
import {
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  Text,
} from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  fonts,
  fontSize,
  lineHeight,
  radius,
  semanticColors,
  space,
} from '../src/theme/tokens'

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

  const performAction = async (
    requestId: string,
    action: 'approve' | 'reject',
  ) => {
    if (!clubId) return
    setProcessingId(requestId)
    try {
      await api(`/clubs/${clubId}/join-requests/${requestId}/${action}`, {
        method: 'POST',
        body: {},
      })
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
    } catch (err) {
      const msg =
        err instanceof ApiError && err.message ? err.message : t('common.error')
      Alert.alert(t('common.error'), msg)
    } finally {
      setProcessingId(null)
    }
  }

  const handleAction = (requestId: string, action: 'approve' | 'reject') => {
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

  return (
    <Screen
      header={<ModalHeader title={t('pendingRequests.title')} mode="back" />}
      scroll={false}
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
    >
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
            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                />
              }
            >
              <SectionGroup
                header={t('pendingRequests.sectionHeader', {
                  defaultValue: 'Awaiting your review',
                  count: requests.length,
                })}
                footer={t('pendingRequests.sectionFooter', {
                  defaultValue:
                    'Approve to grant access. Rejecting is reversible by the user.',
                })}
                style={styles.section}
              >
                {requests.map((item) => {
                  const isProcessing = processingId === item.id
                  const date = new Date(item.createdAt)
                  const dateStr = date.toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                  })
                  return (
                    <View key={item.id}>
                      <ListRow
                        left={
                          <View
                            style={[
                              styles.avatar,
                              { backgroundColor: c.primary50 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.avatarText,
                                { color: c.primary },
                              ]}
                            >
                              {item.user.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        }
                        title={item.user.name}
                        subtitle={`${t(`roles.${item.role}`)} · ${dateStr}`}
                      />
                      {item.message ? (
                        <View style={styles.messageBlock}>
                          <Text
                            variant="footnote"
                            color="secondary"
                            numberOfLines={4}
                          >
                            {item.message}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.actionRow}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.actionBtn,
                            styles.rejectBtn,
                            { borderColor: c.borderDefault },
                            pressed && { opacity: 0.6 },
                          ]}
                          onPress={() => handleAction(item.id, 'reject')}
                          disabled={isProcessing}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('pendingRequests.reject')} ${item.user.name}`}
                        >
                          {isProcessing ? (
                            <ActivityIndicator
                              color={c.textSecondary}
                              size="small"
                            />
                          ) : (
                            <>
                              <Icon
                                name="xmark"
                                size="sm"
                                color={semanticColors.error}
                              />
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  { color: semanticColors.error },
                                ]}
                              >
                                {t('pendingRequests.reject')}
                              </Text>
                            </>
                          )}
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [
                            styles.actionBtn,
                            { backgroundColor: c.primary },
                            pressed && { opacity: 0.7 },
                          ]}
                          onPress={() => handleAction(item.id, 'approve')}
                          disabled={isProcessing}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('pendingRequests.approve')} ${item.user.name}`}
                        >
                          {isProcessing ? (
                            <ActivityIndicator
                              color={c.textInverse}
                              size="small"
                            />
                          ) : (
                            <>
                              <Icon
                                name="checkmark"
                                size="sm"
                                color={c.textInverse}
                              />
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  { color: c.textInverse },
                                ]}
                              >
                                {t('pendingRequests.approve')}
                              </Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )
                })}
              </SectionGroup>
            </ScrollView>
          )}
        </LoadingBoundary>
      </ErrorBoundary>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.lg,
  },
  section: {
    paddingHorizontal: space.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  messageBlock: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    paddingTop: 0,
  },
  actionRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 38,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
  },
  rejectBtn: {
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    lineHeight: lineHeight.sm,
  },
})
