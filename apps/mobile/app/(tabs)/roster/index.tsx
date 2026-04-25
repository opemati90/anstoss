import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
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
import { Button, Text, Icon } from '../../../src/components/ui'
import {
  fonts,
  fontSize,
  lineHeight,
  radius,
  space,
  hairline,
  TAB_BAR_CLEARANCE,
} from '../../../src/theme/tokens'

type WorkspaceTab = 'squad' | 'operations' | 'medic' | 'kit'

const WORKSPACE_TABS: WorkspaceTab[] = ['squad', 'operations', 'medic', 'kit']

const INJURY_STATUS_OPTIONS: InjuryAvailabilityStatus[] = ['OUT', 'DOUBTFUL', 'DAY_TO_DAY']

export default function RosterScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
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
  const [selectedInjuryPlayerId, setSelectedInjuryPlayerId] = useState<string | null>(null)
  const [injuryTitle, setInjuryTitle] = useState('')
  const [injuryReturnLabel, setInjuryReturnLabel] = useState('')
  const [injuryStatus, setInjuryStatus] = useState<InjuryAvailabilityStatus>('OUT')
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
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ScrollView contentContainerStyle={styles.emptyStateContent}>
          <TabScreenHeader
            title={t('roster.screenTitle')}
            subtitle={activeTeamAccess?.team.displayName || activeClub.club.name}
            eyebrow={t('roster.workspace.operations')}
          />
          <EmptyState
            icon="person.2"
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
    setEditJersey(member.jerseyNumber != null ? String(member.jerseyNumber) : '')
  }

  const saveEdit = async () => {
    if (!activeClub || !activeTeamId || !editingMember) {
      return
    }

    const parsedJersey = editJersey.trim() ? Number.parseInt(editJersey.trim(), 10) : null

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
      await api(`/clubs/${activeClub.club.id}/teams/${activeTeamId}/roster/${member.userId}`, {
        method: 'PATCH',
        body: { operationalStatus },
      })
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
      await api(`/clubs/${activeClub.club.id}/teams/${activeTeamId}/injuries/${injuryId}`, {
        method: 'PATCH',
        body: { cleared: true },
      })
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

  const updateDuty = async (assignment: TeamDutyAssignment, status: 'COMPLETED' | 'SKIPPED') => {
    if (!activeClub || !activeTeamId) {
      return
    }

    setPendingId(assignment.id)
    try {
      await api(`/clubs/${activeClub.club.id}/teams/${activeTeamId}/duties/${assignment.id}`, {
        method: 'PATCH',
        body: { status },
      })
      await fetchRosterOps()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setPendingId(null)
    }
  }

  const selectablePlayers = useMemo(() => getSelectablePlayers(snapshot), [snapshot])

  const totalMembers = useMemo(() => getTotalRosterCount(snapshot), [snapshot])

  const renderContent = () => {
    if (!snapshot) {
      if (loading) {
        return <RosterSkeleton />
      }

      if (error) {
        return (
          <View style={[styles.errorCard, { borderColor: c.error, backgroundColor: c.surface }]}>
            <Text style={[styles.errorText, { color: c.textSecondary }]}>
              {t('common.loadError')}
            </Text>
            <Button
              label={t('common.retry')}
              variant="secondary"
              size="md"
              onPress={() => {
                setError(false)
                setLoading(true)
                fetchRosterOps()
              }}
            />
          </View>
        )
      }

      return (
        <View style={styles.empty}>
          <EmptyState
            icon="person.2"
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
            <SectionBlock title={t('roster.trialsTitle')} count={snapshot.operations.trials.length}>
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
                            color={c.primary}
                            disabled={pendingId === member.id}
                            onPress={() => void submitTrialDecision(member, 'ACCEPT')}
                          />
                          <SmallActionButton
                            label={t('roster.rejectTrialCta')}
                            color={c.error}
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
                            color={c.primary}
                            disabled={pendingId === member.id}
                            onPress={() => void updateOperationalStatus(member, 'ACTIVE')}
                          />
                          <SmallActionButton
                            label={t('roster.markInactive')}
                            color={c.warning}
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
                            color={c.primary}
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
              <Button
                label={t('roster.reportInjury')}
                variant="filled"
                size="md"
                fullWidth
                onPress={() => {
                  setSelectedInjuryPlayerId(selectablePlayers[0]?.userId ?? null)
                  setInjuryModalVisible(true)
                }}
              />
            ) : null}

            <SectionBlock
              title={t('roster.activeInjuriesTitle')}
              count={snapshot.medic.active.length}
            >
              {snapshot.medic.active.length > 0 ? (
                snapshot.medic.active.map((injury) => (
                  <View
                    key={injury.id}
                    style={[
                      styles.infoCard,
                      { borderColor: c.borderDefault, backgroundColor: c.background },
                    ]}
                  >
                    <View style={styles.infoCardTop}>
                      <View style={styles.infoCardCopy}>
                        <Text style={[styles.infoCardTitle, { color: c.textPrimary }]}>
                          {injury.user?.name || t('roster.unknownMember')}
                        </Text>
                        <Text style={[styles.infoCardSubtitle, { color: c.textSecondary }]}>
                          {injury.title}
                        </Text>
                      </View>
                      <StatusBadge
                        label={translateInjuryStatus(injury.status, t)}
                        tone={injury.status === 'OUT' ? 'danger' : 'warning'}
                      />
                    </View>
                    {injury.expectedReturnLabel ? (
                      <Text style={[styles.infoCardMeta, { color: c.textTertiary }]}>
                        {t('roster.expectedReturn')}: {injury.expectedReturnLabel}
                      </Text>
                    ) : null}
                    {canManageTeam ? (
                      <View style={styles.rowActions}>
                        <SmallActionButton
                          label={t('roster.clearInjury')}
                          filled
                          color={c.primary}
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
                      <Text style={[styles.simpleRowTitle, { color: c.textPrimary }]}>
                        {injury.user?.name || t('roster.unknownMember')}
                      </Text>
                      <Text style={[styles.simpleRowSubtitle, { color: c.textSecondary }]}>
                        {injury.title}
                      </Text>
                    </View>
                    <Text style={[styles.simpleRowMeta, { color: c.textTertiary }]}>
                      {injury.clearedAt ? formatRelativeDay(injury.clearedAt, locale) : ''}
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
                  color={c.primary}
                  disabled={pendingId === 'JERSEY_CLEANUP'}
                  onPress={() => void rotateDuty('JERSEY_CLEANUP')}
                />
                <SmallActionButton
                  label={t('roster.rotateBibCleanup')}
                  color={c.primary}
                  disabled={pendingId === 'BIB_CLEANUP'}
                  onPress={() => void rotateDuty('BIB_CLEANUP')}
                />
              </View>
            ) : null}

            <SectionBlock title={t('roster.pendingKitTitle')} count={snapshot.kit.pending.length}>
              {snapshot.kit.pending.length > 0 ? (
                snapshot.kit.pending.map((assignment) => (
                  <View
                    key={assignment.id}
                    style={[
                      styles.infoCard,
                      { borderColor: c.borderDefault, backgroundColor: c.background },
                    ]}
                  >
                    <View style={styles.infoCardTop}>
                      <View style={styles.infoCardCopy}>
                        <Text style={[styles.infoCardTitle, { color: c.textPrimary }]}>
                          {translateDutyKind(assignment.kind, t)}
                        </Text>
                        <Text style={[styles.infoCardSubtitle, { color: c.textSecondary }]}>
                          {assignment.assignedUser?.name || t('roster.unknownMember')}
                        </Text>
                      </View>
                      <StatusBadge label={t('roster.pendingBadge')} tone="neutral" />
                    </View>
                    {assignment.dueDate ? (
                      <Text style={[styles.infoCardMeta, { color: c.textTertiary }]}>
                        {t('roster.dueDate')}: {formatShortDate(assignment.dueDate, locale)}
                      </Text>
                    ) : null}
                    {canManageTeam ? (
                      <View style={styles.rowActions}>
                        <SmallActionButton
                          label={t('roster.completeDuty')}
                          filled
                          color={c.primary}
                          disabled={pendingId === assignment.id}
                          onPress={() => void updateDuty(assignment, 'COMPLETED')}
                        />
                        <SmallActionButton
                          label={t('roster.skipDuty')}
                          color={c.warning}
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

            <SectionBlock title={t('roster.recentKitTitle')} count={snapshot.kit.recent.length}>
              {snapshot.kit.recent.length > 0 ? (
                snapshot.kit.recent.map((assignment) => (
                  <View key={assignment.id} style={styles.simpleRow}>
                    <View>
                      <Text style={[styles.simpleRowTitle, { color: c.textPrimary }]}>
                        {translateDutyKind(assignment.kind, t)}
                      </Text>
                      <Text style={[styles.simpleRowSubtitle, { color: c.textSecondary }]}>
                        {assignment.assignedUser?.name || t('roster.unknownMember')}
                      </Text>
                    </View>
                    <Text style={[styles.simpleRowMeta, { color: c.textTertiary }]}>
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
            <SectionBlock title={t('roster.activeSquadTitle')} count={snapshot.squad.length}>
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
                            color={c.primary}
                            disabled={pendingId === member.id}
                            onPress={() => void updateOperationalStatus(member, 'NEW_PLAYER')}
                          />
                          <SmallActionButton
                            label={t('roster.markInactive')}
                            color={c.warning}
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
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

        <View style={[styles.tabRow, { backgroundColor: c.surfaceSunken }]}>
          {WORKSPACE_TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && {
                  backgroundColor: c.surface,
                },
              ]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="button"
              accessibilityLabel={t(`roster.workspace.${tab}`)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  {
                    color:
                      activeTab === tab ? c.textPrimary : c.textSecondary,
                  },
                ]}
              >
                {t(`roster.workspace.${tab}`)}
              </Text>
            </Pressable>
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
          style={[styles.modalOverlay, { backgroundColor: c.surfaceOverlay }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalSheet, { backgroundColor: c.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.textPrimary }]}>
                {editingMember?.name}
              </Text>
              <Pressable
                onPress={() => setEditingMember(null)}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Icon name="xmark" size="lg" color={c.textPrimary} />
              </Pressable>
            </View>

            <Text style={[styles.modalLabel, { color: c.textPrimary }]}>
              {t('roster.position')}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
              ]}
              value={editPosition}
              onChangeText={setEditPosition}
              placeholder={t('roster.positionPlaceholder')}
              placeholderTextColor={c.textTertiary}
              maxLength={30}
              autoCapitalize="words"
            />

            <Text style={[styles.modalLabel, { color: c.textPrimary }]}>
              {t('roster.jerseyNumber')}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
              ]}
              value={editJersey}
              onChangeText={setEditJersey}
              placeholder={t('roster.jerseyPlaceholder')}
              placeholderTextColor={c.textTertiary}
              keyboardType="number-pad"
              maxLength={3}
            />

            <Button
              label={t('common.save')}
              variant="filled"
              size="lg"
              fullWidth
              loading={isSavingEdit}
              disabled={isSavingEdit}
              onPress={() => void saveEdit()}
            />
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
          style={[styles.modalOverlay, { backgroundColor: c.surfaceOverlay }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalSheet, { backgroundColor: c.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.textPrimary }]}>
                {t('roster.reportInjury')}
              </Text>
              <Pressable
                onPress={resetInjuryModal}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Icon name="xmark" size="lg" color={c.textPrimary} />
              </Pressable>
            </View>

            <Text style={[styles.modalLabel, { color: c.textPrimary }]}>
              {t('roster.injuryPlayer')}
            </Text>
            <View style={styles.selectionGrid}>
              {selectablePlayers.map((member) => {
                const active = selectedInjuryPlayerId === member.userId
                return (
                  <Pressable
                    key={member.userId}
                    accessibilityRole="button"
                    accessibilityLabel={member.name}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.selectionChip,
                      { borderColor: c.borderDefault, backgroundColor: c.surface },
                      active && {
                        borderColor: c.primary,
                        backgroundColor: c.primary50,
                      },
                    ]}
                    onPress={() => setSelectedInjuryPlayerId(member.userId)}
                  >
                    <Text
                      style={[
                        styles.selectionChipText,
                        { color: c.textPrimary },
                        active ? { color: c.primary } : {},
                      ]}
                    >
                      {member.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={[styles.modalLabel, { color: c.textPrimary }]}>
              {t('roster.injuryTitleLabel')}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
              ]}
              value={injuryTitle}
              onChangeText={setInjuryTitle}
              placeholder={t('roster.injuryTitlePlaceholder')}
              placeholderTextColor={c.textTertiary}
            />

            <Text style={[styles.modalLabel, { color: c.textPrimary }]}>
              {t('roster.injuryStatusLabel')}
            </Text>
            <View style={styles.selectionGrid}>
              {INJURY_STATUS_OPTIONS.map((status) => {
                const active = injuryStatus === status
                return (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    accessibilityLabel={status}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.selectionChip,
                      { borderColor: c.borderDefault, backgroundColor: c.surface },
                      active && {
                        borderColor: c.primary,
                        backgroundColor: c.primary50,
                      },
                    ]}
                    onPress={() => setInjuryStatus(status)}
                  >
                    <Text
                      style={[
                        styles.selectionChipText,
                        { color: c.textPrimary },
                        active ? { color: c.primary } : {},
                      ]}
                    >
                      {translateInjuryStatus(status, t)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={[styles.modalLabel, { color: c.textPrimary }]}>
              {t('roster.expectedReturn')}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
              ]}
              value={injuryReturnLabel}
              onChangeText={setInjuryReturnLabel}
              placeholder={t('roster.expectedReturnPlaceholder')}
              placeholderTextColor={c.textTertiary}
            />

            <Button
              label={t('roster.reportInjury')}
              variant="filled"
              size="lg"
              fullWidth
              loading={isSavingInjury}
              disabled={isSavingInjury}
              onPress={() => void reportInjury()}
            />
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
  const c = useClubColors()
  return (
    <View style={[styles.sectionBlock, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{title}</Text>
        <Text
          style={[
            styles.sectionCount,
            { borderColor: c.borderDefault, backgroundColor: c.background, color: c.textSecondary },
          ]}
        >
          {count}
        </Text>
      </View>
      {children}
    </View>
  )
}

function EmptyBlockCopy({ text }: { text: string }) {
  const c = useClubColors()
  return <Text style={[styles.emptyBlockCopy, { color: c.textSecondary }]}>{text}</Text>
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
  const c = useClubColors()

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
          <Text style={[styles.jerseyText, { color: c.textSecondary }]}>{member.jerseyNumber}</Text>
        </View>
      ) : null}

      {member.avatarUrl ? (
        <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
      ) : (
        <View
          style={[
            styles.avatarPlaceholder,
            { backgroundColor: c.background, borderColor: c.borderDefault },
          ]}
        >
          <Text style={[styles.avatarInitials, { color: c.textPrimary }]}>{initials}</Text>
        </View>
      )}

      <View style={styles.memberCopy}>
        <Text style={[styles.memberName, { color: c.textPrimary }]}>{member.name}</Text>
        <Text style={[styles.memberMeta, { color: c.textSecondary }]}>{subtitle}</Text>
        <Text style={[styles.memberJoined, { color: c.textTertiary }]}>
          {formatShortDate(member.createdAt, locale)}
        </Text>
        {actions}
      </View>

      {badge ? <StatusBadge label={badge} tone="neutral" /> : null}
    </View>
  )

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={member.name}>
        {content}
      </Pressable>
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
  const c = useClubColors()
  return (
    <Pressable
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
      <Text style={[styles.smallActionText, { color: filled ? c.textInverse : color }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: 'neutral' | 'warning' | 'danger' }) {
  const c = useClubColors()

  const toneStyles =
    tone === 'danger'
      ? {
          borderColor: `${c.error}40`,
          backgroundColor: `${c.error}12`,
          color: c.error,
        }
      : tone === 'warning'
        ? {
            borderColor: `${c.warning}45`,
            backgroundColor: `${c.warning}14`,
            color: c.warning,
          }
        : {
            borderColor: c.borderDefault,
            backgroundColor: c.background,
            color: c.textSecondary,
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
      <Text style={[styles.statusBadgeText, { color: toneStyles.color }]}>{label}</Text>
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

function buildMemberSubtitle(member: RosterOpsMemberSummary, t: (key: string) => string) {
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

function translateInjuryStatus(status: InjuryAvailabilityStatus, t: (key: string) => string) {
  switch (status) {
    case 'DOUBTFUL':
      return t('roster.injuryStatusDoubtful')
    case 'DAY_TO_DAY':
      return t('roster.injuryStatusDayToDay')
    default:
      return t('roster.injuryStatusOut')
  }
}

function translateDutyKind(kind: string, t: (key: string) => string) {
  return kind === 'BIB_CLEANUP' ? t('roster.bibCleanup') : t('roster.jerseyCleanup')
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
  },
  emptyStateContent: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  scrollContent: {
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
  },
  header: {
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  tabRow: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: 4,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 2,
  },
  tabButton: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: space.sm,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  tabButtonTextActive: {},
  tabContent: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  sectionBlock: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: space.lg,
    gap: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  sectionCount: {
    minWidth: 28,
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
    borderWidth: hairline,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
  },
  emptyBlockCopy: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    paddingVertical: space.xs,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.sm,
  },
  jerseyBox: {
    width: 28,
    alignItems: 'center',
    paddingTop: space.sm,
  },
  jerseyText: {
    fontSize: fontSize.sm,
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
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  memberCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  memberName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  memberMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  memberJoined: {
    fontSize: fontSize.xs,
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
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallActionText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
  },
  statusBadge: {
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  infoCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
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
    fontFamily: fonts.heading,
  },
  infoCardSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  infoCardMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
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
    fontFamily: fonts.heading,
  },
  simpleRowSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  simpleRowMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
  },
  rotateRow: {
    flexDirection: 'row',
    gap: space.sm,
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
  },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
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
    fontFamily: fonts.heading,
  },
  modalLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  modalInput: {
    minHeight: 48,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
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
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  disabled: {
    opacity: 0.55,
  },
  errorCard: {
    margin: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  errorText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    textAlign: 'center' as const,
  },
})
