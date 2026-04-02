import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  type InjuryAvailabilityStatus,
  type RosterOpsMemberSummary,
  type RosterOpsSnapshot,
  type TeamDutyAssignment,
} from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { RosterSkeleton } from '../../../src/components/Skeleton'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api, ApiError } from '../../../src/api/client'
import { EmptyState } from '../../../src/components/EmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import {
  fonts,
  fontSize,
  fontWeight,
  lineHeight,
  neutralColors,
  radius,
  semanticColors,
  space,
} from '../../../src/theme/tokens'

type WorkspaceTab = 'squad' | 'operations' | 'medic' | 'kit'

const WORKSPACE_TABS: WorkspaceTab[] = ['squad', 'operations', 'medic', 'kit']

const INJURY_STATUS_OPTIONS: InjuryAvailabilityStatus[] = [
  'OUT',
  'DOUBTFUL',
  'DAY_TO_DAY',
]

export default function RosterScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const params = useLocalSearchParams<{ tab?: string | string[] }>()
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const requestedTab = WORKSPACE_TABS.includes(tabParam as WorkspaceTab)
    ? (tabParam as WorkspaceTab)
    : null
  const [snapshot, setSnapshot] = useState<RosterOpsSnapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('squad')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<RosterOpsMemberSummary | null>(null)
  const [editPosition, setEditPosition] = useState('')
  const [editJersey, setEditJersey] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [injuryModalVisible, setInjuryModalVisible] = useState(false)
  const [selectedInjuryPlayerId, setSelectedInjuryPlayerId] = useState<string | null>(
    null,
  )
  const [injuryTitle, setInjuryTitle] = useState('')
  const [injuryReturnLabel, setInjuryReturnLabel] = useState('')
  const [injuryStatus, setInjuryStatus] =
    useState<InjuryAvailabilityStatus>('OUT')
  const [isSavingInjury, setIsSavingInjury] = useState(false)

  const canManageTeam =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const fetchRosterOps = useCallback(async () => {
    if (!activeClub || !activeTeamId) {
      return
    }

    try {
      const data = await api<RosterOpsSnapshot>(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/roster-ops`,
      )
      setError(false)
      setSnapshot(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeClub, activeTeamId])

  useFocusEffect(
    useCallback(() => {
      void fetchRosterOps()
    }, [fetchRosterOps]),
  )

  useEffect(() => {
    if (requestedTab && requestedTab !== activeTab) {
      setActiveTab(requestedTab)
    }
  }, [activeTab, requestedTab])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchRosterOps()
    } finally {
      setRefreshing(false)
    }
  }

  if (activeClub && !canManageTeam) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.emptyStateContent}>
          <TabScreenHeader
            title={t('roster.screenTitle')}
            subtitle={activeTeamAccess?.team.displayName || activeClub.club.name}
            eyebrow={t('roster.workspace.operations')}
          />
          <EmptyState
            icon="people-outline"
            title={t('roster.accessDeniedTitle')}
            description={t('roster.accessDeniedBody')}
          />
        </ScrollView>
      </View>
    )
  }

  const openEditModal = (member: RosterOpsMemberSummary) => {
    setEditingMember(member)
    setEditPosition(member.position || '')
    setEditJersey(
      member.jerseyNumber != null ? String(member.jerseyNumber) : '',
    )
  }

  const saveEdit = async () => {
    if (!activeClub || !activeTeamId || !editingMember) {
      return
    }

    const parsedJersey = editJersey.trim()
      ? Number.parseInt(editJersey.trim(), 10)
      : null

    if (
      parsedJersey != null &&
      (Number.isNaN(parsedJersey) || parsedJersey < 0 || parsedJersey > 999)
    ) {
      Alert.alert(t('common.error'), t('roster.jerseyInvalid'))
      return
    }

    setIsSavingEdit(true)
    try {
      await api(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/roster/${editingMember.userId}`,
        {
          method: 'PATCH',
          body: {
            position: editPosition.trim() || null,
            jerseyNumber: parsedJersey,
          },
        },
      )
      setEditingMember(null)
      await fetchRosterOps()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setIsSavingEdit(false)
    }
  }

  const submitTrialDecision = async (
    member: RosterOpsMemberSummary,
    decision: 'ACCEPT' | 'REJECT',
  ) => {
    if (!activeClub) {
      return
    }

    setPendingId(member.id)
    try {
      await api(`/clubs/${activeClub.club.id}/team-access/${member.id}/decision`, {
        method: 'POST',
        body: { decision },
      })
      await fetchRosterOps()
    } catch {
      Alert.alert(t('common.error'), t('roster.trialActionError'))
    } finally {
      setPendingId(null)
    }
  }

  const updateOperationalStatus = async (
    member: RosterOpsMemberSummary,
    operationalStatus: 'ACTIVE' | 'NEW_PLAYER' | 'INACTIVE',
  ) => {
    if (!activeClub || !activeTeamId) {
      return
    }

    setPendingId(member.id)
    try {
      await api(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/roster/${member.userId}`,
        {
          method: 'PATCH',
          body: { operationalStatus },
        },
      )
      await fetchRosterOps()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setPendingId(null)
    }
  }

  const reportInjury = async () => {
    if (!activeClub || !activeTeamId || !selectedInjuryPlayerId || !injuryTitle.trim()) {
      Alert.alert(t('common.error'), t('roster.injuryRequired'))
      return
    }

    setIsSavingInjury(true)
    try {
      await api(`/clubs/${activeClub.club.id}/teams/${activeTeamId}/injuries`, {
        method: 'POST',
        body: {
          userId: selectedInjuryPlayerId,
          title: injuryTitle.trim(),
          status: injuryStatus,
          expectedReturnLabel: injuryReturnLabel.trim() || undefined,
        },
      })
      resetInjuryModal()
      await fetchRosterOps()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setIsSavingInjury(false)
    }
  }

  const clearInjury = async (injuryId: string) => {
    if (!activeClub || !activeTeamId) {
      return
    }

    setPendingId(injuryId)
    try {
      await api(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/injuries/${injuryId}`,
        {
          method: 'PATCH',
          body: { cleared: true },
        },
      )
      await fetchRosterOps()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setPendingId(null)
    }
  }

  const rotateDuty = async (kind: 'JERSEY_CLEANUP' | 'BIB_CLEANUP') => {
    if (!activeClub || !activeTeamId) {
      return
    }

    setPendingId(kind)
    try {
      await api(`/clubs/${activeClub.club.id}/teams/${activeTeamId}/duties/rotate`, {
        method: 'POST',
        body: { kind },
      })
      await fetchRosterOps()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('errors.server')
      Alert.alert(t('common.error'), message)
    } finally {
      setPendingId(null)
    }
  }

  const updateDuty = async (
    assignment: TeamDutyAssignment,
    status: 'COMPLETED' | 'SKIPPED',
  ) => {
    if (!activeClub || !activeTeamId) {
      return
    }

    setPendingId(assignment.id)
    try {
      await api(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/duties/${assignment.id}`,
        {
          method: 'PATCH',
          body: { status },
        },
      )
      await fetchRosterOps()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setPendingId(null)
    }
  }

  const selectablePlayers = useMemo(
    () => getSelectablePlayers(snapshot),
    [snapshot],
  )

  const totalMembers = useMemo(
    () => getTotalRosterCount(snapshot),
    [snapshot],
  )

  const renderContent = () => {
    if (!snapshot) {
      if (loading) {
        return <RosterSkeleton />
      }

      if (error) {
        return (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{t('common.loadError')}</Text>
            <TouchableOpacity onPress={() => { setError(false); setLoading(true); fetchRosterOps() }} style={styles.retryButton}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )
      }

      return (
        <View style={styles.empty}>
          <EmptyState
            icon="people-outline"
            title={t('roster.emptyTitle')}
            description={t('roster.emptyBody')}
          />
        </View>
      )
    }

    switch (activeTab) {
      case 'operations':
        return (
          <View style={styles.tabContent}>
            <SectionBlock
              title={t('roster.trialsTitle')}
              count={snapshot.operations.trials.length}
            >
              {snapshot.operations.trials.length > 0 ? (
                snapshot.operations.trials.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    locale={locale}
                    subtitle={t('roster.trialMeta', {
                      role: translateRosterRole(member.role, t),
                      date: formatShortDate(member.createdAt, locale),
                    })}
                    badge={t('roster.trialBadge')}
                    actions={
                      canManageTeam ? (
                        <View style={styles.rowActions}>
                          <SmallActionButton
                            label={t('roster.approveTrialCta')}
                            filled
                            color={theme.clubPrimary}
                            disabled={pendingId === member.id}
                            onPress={() => void submitTrialDecision(member, 'ACCEPT')}
                          />
                          <SmallActionButton
                            label={t('roster.rejectTrialCta')}
                            color={semanticColors.error}
                            disabled={pendingId === member.id}
                            onPress={() => void submitTrialDecision(member, 'REJECT')}
                          />
                        </View>
                      ) : null
                    }
                  />
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.trialsEmpty')} />
              )}
            </SectionBlock>

            <SectionBlock
              title={t('roster.newPlayersTitle')}
              count={snapshot.operations.newPlayers.length}
            >
              {snapshot.operations.newPlayers.length > 0 ? (
                snapshot.operations.newPlayers.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    locale={locale}
                    subtitle={member.position || t('roster.noPosition')}
                    badge={t('roster.newPlayerBadge')}
                    onPress={
                      canManageTeam && member.role === 'PLAYER'
                        ? () => openEditModal(member)
                        : undefined
                    }
                    actions={
                      canManageTeam ? (
                        <View style={styles.rowActions}>
                          <SmallActionButton
                            label={t('roster.markActive')}
                            filled
                            color={theme.clubPrimary}
                            disabled={pendingId === member.id}
                            onPress={() => void updateOperationalStatus(member, 'ACTIVE')}
                          />
                          <SmallActionButton
                            label={t('roster.markInactive')}
                            color={semanticColors.warning}
                            disabled={pendingId === member.id}
                            onPress={() => void updateOperationalStatus(member, 'INACTIVE')}
                          />
                        </View>
                      ) : null
                    }
                  />
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.newPlayersEmpty')} />
              )}
            </SectionBlock>

            <SectionBlock
              title={t('roster.inactiveTitle')}
              count={snapshot.operations.inactive.length}
            >
              {snapshot.operations.inactive.length > 0 ? (
                snapshot.operations.inactive.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    locale={locale}
                    subtitle={member.position || t('roster.noPosition')}
                    badge={t('roster.inactiveBadge')}
                    actions={
                      canManageTeam ? (
                        <View style={styles.rowActions}>
                          <SmallActionButton
                            label={t('roster.markActive')}
                            filled
                            color={theme.clubPrimary}
                            disabled={pendingId === member.id}
                            onPress={() => void updateOperationalStatus(member, 'ACTIVE')}
                          />
                        </View>
                      ) : null
                    }
                  />
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.inactiveEmpty')} />
              )}
            </SectionBlock>
          </View>
        )
      case 'medic':
        return (
          <View style={styles.tabContent}>
            {canManageTeam ? (
              <TouchableOpacity
                style={[styles.primaryWideButton, { backgroundColor: theme.clubPrimary }]}
                onPress={() => {
                  setSelectedInjuryPlayerId(selectablePlayers[0]?.userId ?? null)
                  setInjuryModalVisible(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={t('roster.reportInjury')}
              >
                <Text style={styles.primaryWideButtonText}>
                  {t('roster.reportInjury')}
                </Text>
              </TouchableOpacity>
            ) : null}

            <SectionBlock
              title={t('roster.activeInjuriesTitle')}
              count={snapshot.medic.active.length}
            >
              {snapshot.medic.active.length > 0 ? (
                snapshot.medic.active.map((injury) => (
                  <View key={injury.id} style={styles.infoCard}>
                    <View style={styles.infoCardTop}>
                      <View style={styles.infoCardCopy}>
                        <Text style={styles.infoCardTitle}>
                          {injury.user?.name || t('roster.unknownMember')}
                        </Text>
                        <Text style={styles.infoCardSubtitle}>{injury.title}</Text>
                      </View>
                      <StatusBadge
                        label={translateInjuryStatus(injury.status, t)}
                        tone={injury.status === 'OUT' ? 'danger' : 'warning'}
                      />
                    </View>
                    {injury.expectedReturnLabel ? (
                      <Text style={styles.infoCardMeta}>
                        {t('roster.expectedReturn')}: {injury.expectedReturnLabel}
                      </Text>
                    ) : null}
                    {canManageTeam ? (
                      <View style={styles.rowActions}>
                        <SmallActionButton
                          label={t('roster.clearInjury')}
                          filled
                          color={theme.clubPrimary}
                          disabled={pendingId === injury.id}
                          onPress={() => void clearInjury(injury.id)}
                        />
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.activeInjuriesEmpty')} />
              )}
            </SectionBlock>

            <SectionBlock
              title={t('roster.recentlyClearedTitle')}
              count={snapshot.medic.recentlyCleared.length}
            >
              {snapshot.medic.recentlyCleared.length > 0 ? (
                snapshot.medic.recentlyCleared.map((injury) => (
                  <View key={injury.id} style={styles.simpleRow}>
                    <View>
                      <Text style={styles.simpleRowTitle}>
                        {injury.user?.name || t('roster.unknownMember')}
                      </Text>
                      <Text style={styles.simpleRowSubtitle}>{injury.title}</Text>
                    </View>
                    <Text style={styles.simpleRowMeta}>
                      {injury.clearedAt
                        ? formatRelativeDay(injury.clearedAt, locale)
                        : ''}
                    </Text>
                  </View>
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.recentlyClearedEmpty')} />
              )}
            </SectionBlock>
          </View>
        )
      case 'kit':
        return (
          <View style={styles.tabContent}>
            {canManageTeam ? (
              <View style={styles.rotateRow}>
                <SmallActionButton
                  label={t('roster.rotateJerseyCleanup')}
                  filled
                  color={theme.clubPrimary}
                  disabled={pendingId === 'JERSEY_CLEANUP'}
                  onPress={() => void rotateDuty('JERSEY_CLEANUP')}
                />
                <SmallActionButton
                  label={t('roster.rotateBibCleanup')}
                  color={theme.clubPrimary}
                  disabled={pendingId === 'BIB_CLEANUP'}
                  onPress={() => void rotateDuty('BIB_CLEANUP')}
                />
              </View>
            ) : null}

            <SectionBlock
              title={t('roster.pendingKitTitle')}
              count={snapshot.kit.pending.length}
            >
              {snapshot.kit.pending.length > 0 ? (
                snapshot.kit.pending.map((assignment) => (
                  <View key={assignment.id} style={styles.infoCard}>
                    <View style={styles.infoCardTop}>
                      <View style={styles.infoCardCopy}>
                        <Text style={styles.infoCardTitle}>
                          {translateDutyKind(assignment.kind, t)}
                        </Text>
                        <Text style={styles.infoCardSubtitle}>
                          {assignment.assignedUser?.name || t('roster.unknownMember')}
                        </Text>
                      </View>
                      <StatusBadge label={t('roster.pendingBadge')} tone="neutral" />
                    </View>
                    {assignment.dueDate ? (
                      <Text style={styles.infoCardMeta}>
                        {t('roster.dueDate')}: {formatShortDate(assignment.dueDate, locale)}
                      </Text>
                    ) : null}
                    {canManageTeam ? (
                      <View style={styles.rowActions}>
                        <SmallActionButton
                          label={t('roster.completeDuty')}
                          filled
                          color={theme.clubPrimary}
                          disabled={pendingId === assignment.id}
                          onPress={() => void updateDuty(assignment, 'COMPLETED')}
                        />
                        <SmallActionButton
                          label={t('roster.skipDuty')}
                          color={semanticColors.warning}
                          disabled={pendingId === assignment.id}
                          onPress={() => void updateDuty(assignment, 'SKIPPED')}
                        />
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.pendingKitEmpty')} />
              )}
            </SectionBlock>

            <SectionBlock
              title={t('roster.recentKitTitle')}
              count={snapshot.kit.recent.length}
            >
              {snapshot.kit.recent.length > 0 ? (
                snapshot.kit.recent.map((assignment) => (
                  <View key={assignment.id} style={styles.simpleRow}>
                    <View>
                      <Text style={styles.simpleRowTitle}>
                        {translateDutyKind(assignment.kind, t)}
                      </Text>
                      <Text style={styles.simpleRowSubtitle}>
                        {assignment.assignedUser?.name || t('roster.unknownMember')}
                      </Text>
                    </View>
                    <Text style={styles.simpleRowMeta}>
                      {assignment.status === 'COMPLETED'
                        ? t('roster.completedBadge')
                        : t('roster.skippedBadge')}
                    </Text>
                  </View>
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.recentKitEmpty')} />
              )}
            </SectionBlock>
          </View>
        )
      default:
        return (
          <View style={styles.tabContent}>
            <SectionBlock
              title={t('roster.activeSquadTitle')}
              count={snapshot.squad.length}
            >
              {snapshot.squad.length > 0 ? (
                snapshot.squad.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    locale={locale}
                    subtitle={buildMemberSubtitle(member, t)}
                    badge={undefined}
                    onPress={
                      canManageTeam && member.role === 'PLAYER'
                        ? () => openEditModal(member)
                        : undefined
                    }
                    actions={
                      canManageTeam && member.role === 'PLAYER' ? (
                        <View style={styles.rowActions}>
                          <SmallActionButton
                            label={t('roster.markNew')}
                            color={theme.clubPrimary}
                            disabled={pendingId === member.id}
                            onPress={() => void updateOperationalStatus(member, 'NEW_PLAYER')}
                          />
                          <SmallActionButton
                            label={t('roster.markInactive')}
                            color={semanticColors.warning}
                            disabled={pendingId === member.id}
                            onPress={() => void updateOperationalStatus(member, 'INACTIVE')}
                          />
                        </View>
                      ) : null
                    }
                  />
                ))
              ) : (
                <EmptyBlockCopy text={t('roster.activeSquadEmpty')} />
              )}
            </SectionBlock>
          </View>
        )
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <TabScreenHeader
            title={t('roster.screenTitle')}
            subtitle={
              snapshot?.team.displayName
                ? `${snapshot.team.displayName} · ${t('roster.memberCount', {
                    count: totalMembers,
                  })}`
                : t('roster.memberCount', { count: totalMembers })
            }
            compact
          />


        </View>

        <View style={styles.tabRow}>
          {WORKSPACE_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && {
                  backgroundColor: theme.clubPrimary,
                  borderColor: theme.clubPrimary,
                },
              ]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="button"
              accessibilityLabel={t(`roster.workspace.${tab}`)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === tab && styles.tabButtonTextActive,
                ]}
              >
                {t(`roster.workspace.${tab}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {renderContent()}
      </ScrollView>

      <Modal
        visible={Boolean(editingMember)}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingMember(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingMember?.name}</Text>
              <TouchableOpacity
                onPress={() => setEditingMember(null)}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={neutralColors.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>{t('roster.position')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editPosition}
              onChangeText={setEditPosition}
              placeholder={t('roster.positionPlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
              maxLength={30}
              autoCapitalize="words"
            />

            <Text style={styles.modalLabel}>{t('roster.jerseyNumber')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editJersey}
              onChangeText={setEditJersey}
              placeholder={t('roster.jerseyPlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
              keyboardType="number-pad"
              maxLength={3}
            />

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: theme.clubPrimary },
                isSavingEdit && styles.disabled,
              ]}
              onPress={() => void saveEdit()}
              disabled={isSavingEdit}
              accessibilityRole="button"
              accessibilityLabel={t('common.save')}
            >
              {isSavingEdit ? (
                <ActivityIndicator color={neutralColors.textInverse} />
              ) : (
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={injuryModalVisible}
        transparent
        animationType="slide"
        onRequestClose={resetInjuryModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('roster.reportInjury')}</Text>
              <TouchableOpacity
                onPress={resetInjuryModal}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={neutralColors.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>{t('roster.injuryPlayer')}</Text>
            <View style={styles.selectionGrid}>
              {selectablePlayers.map((member) => {
                const active = selectedInjuryPlayerId === member.userId
                return (
                  <TouchableOpacity
                    key={member.userId}
                    style={[
                      styles.selectionChip,
                      active && {
                        borderColor: theme.clubPrimary,
                        backgroundColor: theme.clubPrimaryLight,
                      },
                    ]}
                    onPress={() => setSelectedInjuryPlayerId(member.userId)}
                  >
                    <Text
                      style={[
                        styles.selectionChipText,
                        active && { color: theme.clubPrimary },
                      ]}
                    >
                      {member.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.modalLabel}>{t('roster.injuryTitleLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={injuryTitle}
              onChangeText={setInjuryTitle}
              placeholder={t('roster.injuryTitlePlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
            />

            <Text style={styles.modalLabel}>{t('roster.injuryStatusLabel')}</Text>
            <View style={styles.selectionGrid}>
              {INJURY_STATUS_OPTIONS.map((status) => {
                const active = injuryStatus === status
                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.selectionChip,
                      active && {
                        borderColor: theme.clubPrimary,
                        backgroundColor: theme.clubPrimaryLight,
                      },
                    ]}
                    onPress={() => setInjuryStatus(status)}
                  >
                    <Text
                      style={[
                        styles.selectionChipText,
                        active && { color: theme.clubPrimary },
                      ]}
                    >
                      {translateInjuryStatus(status, t)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.modalLabel}>{t('roster.expectedReturn')}</Text>
            <TextInput
              style={styles.modalInput}
              value={injuryReturnLabel}
              onChangeText={setInjuryReturnLabel}
              placeholder={t('roster.expectedReturnPlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
            />

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: theme.clubPrimary },
                isSavingInjury && styles.disabled,
              ]}
              onPress={() => void reportInjury()}
              disabled={isSavingInjury}
              accessibilityRole="button"
              accessibilityLabel={t('roster.reportInjury')}
            >
              {isSavingInjury ? (
                <ActivityIndicator color={neutralColors.textInverse} />
              ) : (
                <Text style={styles.modalSaveText}>{t('roster.reportInjury')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )

  function resetInjuryModal() {
    setInjuryModalVisible(false)
    setSelectedInjuryPlayerId(null)
    setInjuryTitle('')
    setInjuryReturnLabel('')
    setInjuryStatus('OUT')
  }
}

function SectionBlock({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      {children}
    </View>
  )
}

function EmptyBlockCopy({ text }: { text: string }) {
  return <Text style={styles.emptyBlockCopy}>{text}</Text>
}

function MemberCard({
  member,
  locale,
  subtitle,
  badge,
  actions,
  onPress,
}: {
  member: RosterOpsMemberSummary
  locale: string
  subtitle: string
  badge?: string
  actions?: React.ReactNode
  onPress?: () => void
}) {
  const initials = member.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const content = (
    <View style={styles.memberCard}>
      {member.jerseyNumber != null ? (
        <View style={styles.jerseyBox}>
          <Text style={styles.jerseyText}>{member.jerseyNumber}</Text>
        </View>
      ) : null}

      {member.avatarUrl ? (
        <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
      )}

      <View style={styles.memberCopy}>
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.memberMeta}>{subtitle}</Text>
        <Text style={styles.memberJoined}>{formatShortDate(member.createdAt, locale)}</Text>
        {actions}
      </View>

      {badge ? <StatusBadge label={badge} tone="neutral" /> : null}
    </View>
  )

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={member.name}
      >
        {content}
      </TouchableOpacity>
    )
  }

  return content
}

function SmallActionButton({
  label,
  color,
  filled = false,
  disabled = false,
  onPress,
}: {
  label: string
  color: string
  filled?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[
        styles.smallActionButton,
        filled
          ? { backgroundColor: color, borderColor: color }
          : { borderColor: color, backgroundColor: `${color}12` },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.smallActionText,
          { color: filled ? neutralColors.textInverse : color },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function StatusBadge({
  label,
  tone,
}: {
  label: string
  tone: 'neutral' | 'warning' | 'danger'
}) {
  const toneStyles =
    tone === 'danger'
      ? {
          borderColor: `${semanticColors.error}40`,
          backgroundColor: `${semanticColors.error}12`,
          color: semanticColors.error,
        }
      : tone === 'warning'
        ? {
            borderColor: `${semanticColors.warning}45`,
            backgroundColor: `${semanticColors.warning}14`,
            color: semanticColors.warning,
          }
        : {
            borderColor: neutralColors.border,
            backgroundColor: neutralColors.background,
            color: neutralColors.textSecondary,
          }

  return (
    <View
      style={[
        styles.statusBadge,
        {
          borderColor: toneStyles.borderColor,
          backgroundColor: toneStyles.backgroundColor,
        },
      ]}
    >
      <Text style={[styles.statusBadgeText, { color: toneStyles.color }]}>
        {label}
      </Text>
    </View>
  )
}

function getSelectablePlayers(snapshot: RosterOpsSnapshot | null) {
  if (!snapshot) {
    return []
  }

  const source = [
    ...snapshot.squad,
    ...snapshot.operations.newPlayers,
    ...snapshot.operations.inactive,
    ...snapshot.operations.trials,
  ].filter((member) => member.role === 'PLAYER')

  const byUserId = new Map<string, RosterOpsMemberSummary>()
  source.forEach((member) => {
    if (!byUserId.has(member.userId)) {
      byUserId.set(member.userId, member)
    }
  })

  return Array.from(byUserId.values()).sort((left, right) =>
    left.name.localeCompare(right.name, 'de'),
  )
}

function getTotalRosterCount(snapshot: RosterOpsSnapshot | null) {
  if (!snapshot) {
    return 0
  }

  const userIds = new Set<string>()
  const buckets = [
    snapshot.squad,
    snapshot.operations.trials,
    snapshot.operations.newPlayers,
    snapshot.operations.inactive,
  ]

  buckets.forEach((bucket) => {
    bucket.forEach((member) => userIds.add(member.userId))
  })

  return userIds.size
}

function buildMemberSubtitle(
  member: RosterOpsMemberSummary,
  t: (key: string) => string,
) {
  const roleLabel = translateRosterRole(member.role, t)

  if (member.position) {
    return `${member.position} · ${roleLabel}`
  }

  return roleLabel
}

function translateRosterRole(role: string, t: (key: string) => string) {
  if (role === 'HEAD_COACH' || role === 'ASSISTANT_COACH') {
    return t(`teamRoles.${role}`)
  }

  return t(`roles.${role}`)
}

function translateInjuryStatus(
  status: InjuryAvailabilityStatus,
  t: (key: string) => string,
) {
  switch (status) {
    case 'DOUBTFUL':
      return t('roster.injuryStatusDoubtful')
    case 'DAY_TO_DAY':
      return t('roster.injuryStatusDayToDay')
    default:
      return t('roster.injuryStatusOut')
  }
}

function translateDutyKind(
  kind: string,
  t: (key: string) => string,
) {
  return kind === 'BIB_CLEANUP'
    ? t('roster.bibCleanup')
    : t('roster.jerseyCleanup')
}

function formatShortDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

function formatRelativeDay(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
  }).format(new Date(iso))
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  emptyStateContent: {
    flexGrow: 1,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space['2xl'],
  },
  scrollContent: {
    paddingBottom: space['2xl'],
  },
  header: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  tabRow: {
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  tabButton: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  tabButtonTextActive: {
    color: neutralColors.textInverse,
  },
  tabContent: {
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  sectionBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  sectionCount: {
    minWidth: 28,
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textSecondary,
  },
  emptyBlockCopy: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  jerseyBox: {
    width: 28,
    alignItems: 'center',
    paddingTop: space.sm,
  },
  jerseyText: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    fontFamily: fonts.data,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: neutralColors.background,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  memberCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  memberName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  memberMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  memberJoined: {
    fontSize: fontSize.xs,
    color: neutralColors.textTertiary,
    fontFamily: fonts.data,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  smallActionButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallActionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
  },
  statusBadge: {
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  infoCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    padding: space.md,
    gap: space.sm,
  },
  infoCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  infoCardCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  infoCardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  infoCardSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  infoCardMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
  },
  simpleRow: {
    minHeight: 52,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  simpleRowTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  simpleRowSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  simpleRowMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
  },
  rotateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  primaryWideButton: {
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryWideButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    paddingTop: space['3xl'],
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: neutralColors.background,
    borderTopLeftRadius: space.lg,
    borderTopRightRadius: space.lg,
    padding: space.lg,
    paddingBottom: space['2xl'],
    gap: space.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  modalLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  modalInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
    color: neutralColors.textPrimary,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  modalSaveButton: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  modalSaveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  selectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  selectionChip: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  disabled: {
    opacity: 0.55,
  },
  errorCard: {
    margin: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semanticColors.error,
    backgroundColor: neutralColors.surface,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  errorText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  retryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
})
