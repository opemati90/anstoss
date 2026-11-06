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
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { api } from '../src/api/client'
import { adminActionErrorKey, shouldReloadAfterError } from '../src/components/admin/adminActions'
import { formatDate, fromIsoDate } from '../src/features/wechsel/format'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { RosterSkeleton } from '../src/components/Skeleton'
import {
  Icon,
  Button,
  FilterChipRow,
  ListRow,
  Screen,
  SectionGroup,
  Text,
} from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fonts, fontSize, hairline, lineHeight, radius, space } from '../src/theme/tokens'

type WechselReleaseStatus = 'PENDING' | 'GRANTED' | 'REFUSED' | 'NOT_NEEDED'

type JoinRequestItem = {
  id: string
  role: string
  teamId?: string | null
  message: string | null
  status: string
  revision: number
  createdAt: string
  // Wechselbörse review M2: the API sends isMinor instead of email + DOB.
  user: { id: string; name: string; email?: string; dateOfBirth?: string | null; isMinor?: boolean }
  // Wechselbörse: Aufnahmeantrag fields, set when the request comes from a trial.
  trialInviteId?: string | null
  trialInvite?: { id: string; team: { id: string; displayName: string } | null } | null
  street?: string | null
  postalCode?: string | null
  city?: string | null
  phone?: string | null
  nationality?: string | null
  previousClubName?: string | null
  lastMatchDate?: string | null
  sepaConsentAt?: string | null
  parentalConsentAt?: string | null
  releaseStatus?: WechselReleaseStatus | null
  passApplicationAt?: string | null
  eligibleFrom?: string | null
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
  const [teams, setTeams] = useState<{ id: string; displayName: string }[]>([])
  const [teamsFailed, setTeamsFailed] = useState(false)
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [selectedTeams, setSelectedTeams] = useState<Record<string, string>>({})

  const loadTeams = useCallback(async () => {
    const slug = activeClub?.club.slug
    if (!slug) { setTeamsFailed(true); return }
    setTeamsLoading(true)
    try {
      const result = await api<{ teams: { id: string; displayName: string }[] }>(
        `/clubs/lookup?slug=${encodeURIComponent(slug)}`,
      )
      setTeams(result.teams ?? [])
      setTeamsFailed(false)
    } catch {
      setTeamsFailed(true)
    } finally {
      setTeamsLoading(false)
    }
  }, [activeClub?.club.slug])

  const fetchRequests = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<JoinRequestItem[]>(`/clubs/${clubId}/join-requests`)
      setRequests(data)
      if (data.some((item) => item.role === 'PLAYER' && !item.teamId)) void loadTeams()
      setError(false)
    } catch {
      setError(true)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [clubId, loadTeams])

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
    request: Pick<JoinRequestItem, 'id' | 'revision' | 'role' | 'teamId'>,
    action: 'approve' | 'reject',
  ) => {
    if (!clubId) return
    setProcessingId(request.id)
    try {
      await api(`/clubs/${clubId}/join-requests/${request.id}/${action}`, {
        method: 'POST',
        body: {
          revision: request.revision,
          ...(action === 'approve' && request.role === 'PLAYER' && !request.teamId
            ? { teamId: selectedTeams[request.id] }
            : {}),
        },
      })
      setRequests((prev) => prev.filter((r) => r.id !== request.id))
    } catch (err) {
      // M3: translated message per status; a 409/404 means someone else
      // already decided, so reload the list.
      Alert.alert(t('common.error'), t(adminActionErrorKey(err)))
      if (shouldReloadAfterError(err)) void fetchRequests()
    } finally {
      setProcessingId(null)
    }
  }

  const handleAction = (request: JoinRequestItem, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      Alert.alert(
        t('pendingRequests.rejectConfirmTitle'),
        t('pendingRequests.rejectConfirmBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('pendingRequests.reject'),
            style: 'destructive',
            onPress: () => performAction(request, action),
          },
        ],
      )
      return
    }
    performAction(request, action)
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
                  const needsTeam = item.role === 'PLAYER' && !item.teamId
                  const date = new Date(item.createdAt)
                  const dateStr = date.toLocaleDateString(getAppLocale(getAppLanguage()), {
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
                        subtitle={[
                          t(`roles.${item.role}`),
                          dateStr,
                          item.trialInvite?.team?.displayName
                            ? t('joinReview.fromTrial', { team: item.trialInvite.team.displayName })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      {item.trialInviteId ? <AufnahmeantragDetails item={item} /> : null}
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
                      {needsTeam ? (
                        <View style={styles.messageBlock}>
                          <Text variant="footnote" color="secondary">{t('onboardingFlow.club.pickTeam')}</Text>
                          {teamsLoading ? <ActivityIndicator color={c.textSecondary} /> : teamsFailed ? (
                            <Button
                              label={t('onboardingFlow.common.retry')}
                              variant="bordered"
                              onPress={() => void loadTeams()}
                            />
                          ) : teams.length ? (
                            <FilterChipRow<string>
                              wrap
                              singleSelect
                              selected={selectedTeams[item.id] ?? null}
                              onToggle={(teamId) => setSelectedTeams((current) => ({ ...current, [item.id]: teamId }))}
                              chips={teams.map((team) => ({ key: team.id, label: team.displayName, testID: `request-team-${item.id}-${team.id}` }))}
                            />
                          ) : <Text variant="footnote" color="secondary">{t('onboardingFlow.club.noTeams')}</Text>}
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
                          onPress={() => handleAction(item, 'reject')}
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
                                color={c.textSecondary}
                              />
                              <Text
                                style={[
                                  styles.actionBtnText,
                                  { color: c.textSecondary },
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
                          onPress={() => handleAction(item, 'approve')}
                          disabled={isProcessing || (needsTeam && !selectedTeams[item.id])}
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

/**
 * Aufnahmeantrag from a trial (Wechselbörse): the facts the admin needs to
 * decide, plus the Vereinswechsel checklist. Address and phone stay behind a
 * "Details" disclosure (data minimisation); nationality only when given.
 */
function AufnahmeantragDetails({ item }: { item: JoinRequestItem }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [expanded, setExpanded] = useState(false)
  const dateOnly = (value?: string | null) => (value ? formatDate(fromIsoDate(value)) : null)
  const timestamp = (value?: string | null) => (value ? formatDate(value) : null)
  const consent = (value?: string | null) =>
    value
      ? t('joinReview.consentGivenOn', { date: timestamp(value) })
      : t('joinReview.consentMissing')
  const isMinor = (() => {
    if (typeof item.user.isMinor === 'boolean') return item.user.isMinor
    if (!item.user.dateOfBirth) return false
    const dob = new Date(item.user.dateOfBirth)
    const adult = new Date(dob)
    adult.setFullYear(dob.getFullYear() + 18)
    return adult.getTime() > Date.now()
  })()
  const address = [item.street, [item.postalCode, item.city].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim().length > 0)
    .join(', ')
  const hasContactDetails = Boolean(address || item.phone)
  const tracksWechsel = Boolean(item.previousClubName || item.releaseStatus)

  return (
    <View style={styles.details}>
      <View style={[styles.factList, { borderColor: c.borderSubtle }]}>
        {item.previousClubName ? (
          <Fact label={t('aufnahme.previousClub')} value={item.previousClubName} />
        ) : null}
        {item.lastMatchDate ? (
          <Fact label={t('aufnahme.lastMatch')} value={dateOnly(item.lastMatchDate)} tabular />
        ) : null}
        {item.nationality ? (
          <Fact label={t('aufnahme.nationality')} value={item.nationality} />
        ) : null}
        <Fact label={t('joinReview.sepa')} value={consent(item.sepaConsentAt)} tabular />
        {isMinor || item.parentalConsentAt ? (
          <Fact label={t('joinReview.parental')} value={consent(item.parentalConsentAt)} tabular />
        ) : null}
        {hasContactDetails && expanded ? (
          <>
            {address ? <Fact label={t('joinReview.address')} value={address} /> : null}
            {item.phone ? <Fact label={t('joinReview.phone')} value={item.phone} tabular /> : null}
          </>
        ) : null}
        {hasContactDetails ? (
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            style={({ pressed }) => [styles.disclosure, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? t('joinReview.hideDetails') : t('joinReview.details')}
            hitSlop={8}
          >
            <Text variant="footnote" weight="semibold" color="tint">
              {expanded ? t('joinReview.hideDetails') : t('joinReview.details')}
            </Text>
            <Icon name={expanded ? 'chevron.up' : 'chevron.down'} size="sm" color="tint" />
          </Pressable>
        ) : null}
      </View>

      {tracksWechsel ? (
        <View style={[styles.factList, { borderColor: c.borderSubtle }]}>
          <Text variant="footnote" weight="semibold" color="secondary">
            {t('joinReview.wechselHeader')}
          </Text>
          <Fact
            label={t('wechsel.stepRelease')}
            value={
              item.releaseStatus ? t(`wechsel.release.${item.releaseStatus}`) : t('joinReview.open')
            }
          />
          <Fact
            label={t('wechsel.stepPass')}
            value={dateOnly(item.passApplicationAt) ?? t('joinReview.open')}
            tabular
          />
          <Fact
            label={t('wechsel.stepEligible')}
            value={dateOnly(item.eligibleFrom) ?? t('joinReview.open')}
            tabular
          />
          <Pressable
            onPress={() =>
              router.push({ pathname: '/wechselboerse', params: { tab: 'wechsel' } } as never)
            }
            style={({ pressed }) => [styles.disclosure, pressed && { opacity: 0.6 }]}
            accessibilityRole="link"
            accessibilityLabel={t('joinReview.openWechsel')}
            hitSlop={8}
          >
            <Text variant="footnote" weight="semibold" color="tint">
              {t('joinReview.openWechsel')}
            </Text>
            <Icon name="chevron.right" size="sm" color="tint" />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

function Fact({ label, value, tabular }: { label: string; value: string | null; tabular?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text variant="footnote" color="secondary" style={styles.factLabel}>
        {label}
      </Text>
      <Text variant="footnote" color="primary" tabular={tabular} style={styles.factValue}>
        {value ?? ''}
      </Text>
    </View>
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
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  details: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  factList: {
    borderTopWidth: hairline,
    paddingTop: space.sm,
    gap: space.xs,
  },
  fact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: space.sm,
    rowGap: space['2xs'],
  },
  factLabel: { flexShrink: 1, minWidth: 0 },
  factValue: { flexShrink: 1, minWidth: 0, textAlign: 'right' },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    alignSelf: 'flex-start',
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
    borderWidth: hairline,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    lineHeight: lineHeight.sm,
  },
})
