import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { MembershipRole, TeamGroupType } from '@anstoss/shared'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { Screen, Button, Text } from '../src/components/ui'
import { card, fontSize, hairline, space, radius, fonts, lineHeight } from '../src/theme/tokens'

type CoachAssignment = {
  userId: string
  name: string
  avatarUrl: string | null
}

type TeamResponse = {
  id: string
  displayName: string
  squadLabel: string | null
  leagueName: string | null
  memberCount: number
  coachAssignments: {
    headCoach: CoachAssignment | null
    assistants: CoachAssignment[]
  }
}

type TeamGroupResponse = {
  id: string
  displayName: string
  type: TeamGroupType
  teams: TeamResponse[]
}

type TeamOption = TeamResponse & {
  groupDisplayName: string
}

type ClubMemberResponse = {
  id: string
  userId: string
  role: MembershipRole
  user: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

const GROUP_TYPES: Array<{ value: TeamGroupType; labelKey: string }> = [
  { value: TeamGroupType.SENIOR, labelKey: 'teamManagement.groupTypeSenior' },
  { value: TeamGroupType.YOUTH, labelKey: 'teamManagement.groupTypeYouth' },
  { value: TeamGroupType.MINI, labelKey: 'teamManagement.groupTypeMini' },
  { value: TeamGroupType.CUSTOM, labelKey: 'teamManagement.groupTypeCustom' },
]

const STAFF_MEMBERSHIP_ROLES = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.COACH,
])

function flattenTeams(groups: TeamGroupResponse[]): TeamOption[] {
  return groups.flatMap((group) =>
    group.teams.map((team) => ({
      ...team,
      groupDisplayName: group.displayName,
    })),
  )
}

export default function TeamManagementScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [groups, setGroups] = useState<TeamGroupResponse[]>([])
  const [assignableStaff, setAssignableStaff] = useState<ClubMemberResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false)
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false)
  const [isSavingCoaches, setIsSavingCoaches] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [groupType, setGroupType] = useState<TeamGroupType>(TeamGroupType.SENIOR)

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [squadLabel, setSquadLabel] = useState('')
  const [leagueName, setLeagueName] = useState('')
  const [newTeamHeadCoachUserId, setNewTeamHeadCoachUserId] = useState<string | null>(null)

  const [selectedCoachTeamId, setSelectedCoachTeamId] = useState<string | null>(null)
  const [selectedHeadCoachUserId, setSelectedHeadCoachUserId] = useState<string | null>(null)
  const [selectedAssistantCoachUserIds, setSelectedAssistantCoachUserIds] = useState<
    string[]
  >([])

  const teamOptions = useMemo(() => flattenTeams(groups), [groups])
  const selectedCoachTeam =
    teamOptions.find((team) => team.id === selectedCoachTeamId) || null

  const loadClubData = async () => {
    if (!activeClub) {
      setGroups([])
      setAssignableStaff([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const [groupData, memberData] = await Promise.all([
        api<TeamGroupResponse[]>(`/clubs/${activeClub.club.id}/team-groups`),
        api<ClubMemberResponse[]>(`/clubs/${activeClub.club.id}/members`),
      ])

      const nextGroups = groupData || []
      const nextAssignableStaff = (memberData || []).filter((member) =>
        STAFF_MEMBERSHIP_ROLES.has(member.role),
      )
      const nextTeams = flattenTeams(nextGroups)

      setGroups(nextGroups)
      setAssignableStaff(nextAssignableStaff)
      setSelectedGroupId((current) =>
        current && nextGroups.some((group) => group.id === current)
          ? current
          : nextGroups[0]?.id || null,
      )
      setSelectedCoachTeamId((current) =>
        current && nextTeams.some((team) => team.id === current)
          ? current
          : nextTeams[0]?.id || null,
      )
      setNewTeamHeadCoachUserId((current) =>
        current && nextAssignableStaff.some((member) => member.userId === current)
          ? current
          : null,
      )
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadClubData()
  }, [activeClub?.club.id])

  useEffect(() => {
    if (!selectedCoachTeam) {
      setSelectedHeadCoachUserId(null)
      setSelectedAssistantCoachUserIds([])
      return
    }

    setSelectedHeadCoachUserId(selectedCoachTeam.coachAssignments.headCoach?.userId || null)
    setSelectedAssistantCoachUserIds(
      selectedCoachTeam.coachAssignments.assistants.map((assistant) => assistant.userId),
    )
  }, [selectedCoachTeam])

  const handleCreateGroup = async () => {
    if (!activeClub || !groupName.trim()) {
      Alert.alert(
        t('teamManagement.groupNameRequiredTitle'),
        t('teamManagement.groupNameRequiredBody'),
      )
      return
    }

    setIsSubmittingGroup(true)
    try {
      await api(`/clubs/${activeClub.club.id}/team-groups`, {
        method: 'POST',
        body: {
          displayName: groupName.trim(),
          type: groupType,
        },
      })
      setGroupName('')
      await loadClubData()
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.groupCreateError'))
    } finally {
      setIsSubmittingGroup(false)
    }
  }

  const handleCreateTeam = async () => {
    if (!activeClub || !selectedGroupId || !teamName.trim()) {
      Alert.alert(
        t('teamManagement.teamNameRequiredTitle'),
        t('teamManagement.teamNameRequiredBody'),
      )
      return
    }

    setIsSubmittingTeam(true)
    try {
      await api(`/clubs/${activeClub.club.id}/team-groups/${selectedGroupId}/teams`, {
        method: 'POST',
        body: {
          name: teamName.trim(),
          squadLabel: squadLabel.trim() || undefined,
          leagueName: leagueName.trim() || undefined,
          headCoachUserId: newTeamHeadCoachUserId || undefined,
        },
      })
      setTeamName('')
      setSquadLabel('')
      setLeagueName('')
      setNewTeamHeadCoachUserId(null)
      await loadClubData()
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.teamCreateError'))
    } finally {
      setIsSubmittingTeam(false)
    }
  }

  const handleSaveCoachAssignments = async () => {
    if (!activeClub || !selectedCoachTeamId) {
      return
    }

    setIsSavingCoaches(true)
    try {
      await api(`/clubs/${activeClub.club.id}/teams/${selectedCoachTeamId}/coaches`, {
        method: 'POST',
        body: {
          headCoachUserId: selectedHeadCoachUserId,
          assistantCoachUserIds: selectedAssistantCoachUserIds,
        },
      })
      await loadClubData()
      Alert.alert(
        t('teamManagement.coachAssignmentsSavedTitle'),
        t('teamManagement.coachAssignmentsSavedBody'),
      )
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.coachAssignmentsError'))
    } finally {
      setIsSavingCoaches(false)
    }
  }

  const toggleAssistantCoachUserId = (userId: string) => {
    setSelectedAssistantCoachUserIds((current) =>
      current.includes(userId)
        ? current.filter((entry) => entry !== userId)
        : [...current, userId],
    )
  }

  const formatCoachSummary = (team: TeamResponse) => {
    const summaryParts: string[] = []

    if (team.coachAssignments.headCoach) {
      summaryParts.push(
        t('teamManagement.headCoachSummary', {
          name: team.coachAssignments.headCoach.name,
        }),
      )
    }

    if (team.coachAssignments.assistants.length > 0) {
      summaryParts.push(
        t('teamManagement.assistantCoachSummary', {
          names: team.coachAssignments.assistants
            .map((assistant) => assistant.name)
            .join(', '),
        }),
      )
    }

    if (summaryParts.length === 0) {
      return t('teamManagement.noCoachAssigned')
    }

    return summaryParts.join(' · ')
  }

  if (!activeClub) {
    return (
      <View style={[styles.emptyState, { backgroundColor: c.background }]}>
        <Text style={[styles.emptyStateText, { color: c.textSecondary }]}>
          {t('invite.emptyWithoutClub')}
        </Text>
      </View>
    )
  }

  const isAdmin = activeClub.role === MembershipRole.OWNER || activeClub.role === MembershipRole.ADMIN
  if (!isAdmin) {
    return (
      <Screen header={<ModalHeader title={t('teamManagement.screenTitle')} mode="back" />} scroll={false} padded={false}>
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen
      header={<ModalHeader title={t('teamManagement.screenTitle')} />}
      scroll={false}
      padded={false}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={2}>{t('teamManagement.title')}</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={3}>
          {t('teamManagement.subtitle', { clubName: activeClub.club.name })}
        </Text>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]} numberOfLines={1}>{t('teamManagement.structureLabel')}</Text>
          {isLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <View style={[styles.listCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
              {groups.length === 0 ? (
                <Text style={[styles.groupEmptyText, { color: c.textSecondary }]}>{t('teamManagement.noGroupsYet')}</Text>
              ) : (
                groups.map((group) => (
                  <View key={group.id} style={styles.groupBlock}>
                    <Text style={[styles.groupTitle, { color: c.textPrimary }]} numberOfLines={1}>{group.displayName}</Text>
                    <Text style={[styles.groupTypeMeta, { color: c.textSecondary }]} numberOfLines={1}>
                      {t(
                        GROUP_TYPES.find((option) => option.value === group.type)?.labelKey ||
                          'teamManagement.groupTypeCustom',
                      )}
                    </Text>
                    {group.teams.length === 0 ? (
                      <Text style={[styles.groupEmptyText, { color: c.textSecondary }]}>
                        {t('teamManagement.noTeamsInGroup')}
                      </Text>
                    ) : (
                      group.teams.map((team) => (
                        <View key={team.id} style={[styles.teamCard, { borderColor: c.borderDefault, backgroundColor: c.background }]}>
                          <View style={styles.teamCardHeader}>
                            <Text style={[styles.teamName, { color: c.textPrimary }]} numberOfLines={1}>{team.displayName}</Text>
                            <Text style={[styles.teamCount, { color: c.textSecondary }]} numberOfLines={1}>
                              {t('teamManagement.memberCount', { count: team.memberCount })}
                            </Text>
                          </View>
                          <Text style={[styles.teamMeta, { color: c.textSecondary }]} numberOfLines={1}>
                            {team.leagueName || t('teamManagement.noLeagueAssigned')}
                          </Text>
                          <Text style={[styles.teamMeta, { color: c.textSecondary }]} numberOfLines={2}>{formatCoachSummary(team)}</Text>
                        </View>
                      ))
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]} numberOfLines={1}>{t('teamManagement.addGroupLabel')}</Text>
          <View style={[styles.formCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
            <TextInput
              style={[styles.input, { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary }]}
              value={groupName}
              onChangeText={setGroupName}
              placeholder={t('teamManagement.groupNamePlaceholder')}
              placeholderTextColor={c.textTertiary}
            />
            <View style={styles.chipRow}>
              {GROUP_TYPES.map((option) => {
                const isActive = option.value === groupType
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.chip,
                      { borderColor: c.borderDefault, backgroundColor: c.background },
                      isActive && {
                        borderColor: c.primary,
                        backgroundColor: c.primary50,
                      },
                    ]}
                    onPress={() => setGroupType(option.value)}
                    accessibilityRole="button"
                    accessibilityLabel={t(option.labelKey)}
                  >
                    <Text style={[styles.chipText, { color: c.textPrimary }]} numberOfLines={1}>{t(option.labelKey)}</Text>
                  </Pressable>
                )
              })}
            </View>
            <Button
              label={t('teamManagement.addGroupCta')}
              variant="filled"
              size="lg"
              fullWidth
              loading={isSubmittingGroup}
              disabled={isSubmittingGroup}
              onPress={() => void handleCreateGroup()}
              style={styles.buttonSpacing}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]} numberOfLines={1}>{t('teamManagement.addTeamLabel')}</Text>
          {groups.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
              <Text style={[styles.emptyCardTitle, { color: c.textPrimary }]} numberOfLines={2}>
                {t('teamManagement.noGroupsForTeamTitle')}
              </Text>
              <Text style={[styles.emptyCardBody, { color: c.textSecondary }]} numberOfLines={3}>
                {t('teamManagement.noGroupsForTeamBody')}
              </Text>
            </View>
          ) : (
            <View style={[styles.formCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
              <Text style={[styles.fieldLabel, { color: c.textPrimary }]} numberOfLines={1}>{t('teamManagement.groupPickerLabel')}</Text>
              <View style={styles.chipRow}>
                {groups.map((group) => {
                  const isActive = group.id === selectedGroupId
                  return (
                    <Pressable
                      key={group.id}
                      style={[
                        styles.chip,
                        { borderColor: c.borderDefault, backgroundColor: c.background },
                        isActive && {
                          borderColor: c.primary,
                          backgroundColor: c.primary50,
                        },
                      ]}
                      onPress={() => setSelectedGroupId(group.id)}
                      accessibilityRole="button"
                      accessibilityLabel={group.displayName}
                    >
                      <Text style={[styles.chipText, { color: c.textPrimary }]} numberOfLines={1}>{group.displayName}</Text>
                    </Pressable>
                  )
                })}
              </View>
              <TextInput
                style={[styles.input, { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary }]}
                value={teamName}
                onChangeText={setTeamName}
                placeholder={t('teamManagement.teamNamePlaceholder')}
                placeholderTextColor={c.textTertiary}
              />
              <TextInput
                style={[styles.input, styles.spacedInput, { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary }]}
                value={squadLabel}
                onChangeText={setSquadLabel}
                placeholder={t('teamManagement.squadLabelPlaceholder')}
                placeholderTextColor={c.textTertiary}
              />
              <TextInput
                style={[styles.input, styles.spacedInput, { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary }]}
                value={leagueName}
                onChangeText={setLeagueName}
                placeholder={t('teamManagement.leaguePlaceholder')}
                placeholderTextColor={c.textTertiary}
              />
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced, { color: c.textPrimary }]} numberOfLines={1}>
                {t('teamManagement.headCoachLabel')}
              </Text>
              <Text style={[styles.fieldHint, { color: c.textSecondary }]} numberOfLines={2}>{t('teamManagement.staffOnlyHint')}</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[
                    styles.chip,
                    { borderColor: c.borderDefault, backgroundColor: c.background },
                    !newTeamHeadCoachUserId && {
                      borderColor: c.primary,
                      backgroundColor: c.primary50,
                    },
                  ]}
                  onPress={() => setNewTeamHeadCoachUserId(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('teamManagement.noHeadCoach')}
                >
                  <Text style={[styles.chipText, { color: c.textPrimary }]} numberOfLines={1}>{t('teamManagement.noHeadCoach')}</Text>
                </Pressable>
                {assignableStaff.map((member) => {
                  const isActive = newTeamHeadCoachUserId === member.userId
                  return (
                    <Pressable
                      key={member.id}
                      style={[
                        styles.staffChip,
                        { borderColor: c.borderDefault, backgroundColor: c.background },
                        isActive && {
                          borderColor: c.primary,
                          backgroundColor: c.primary50,
                        },
                      ]}
                      onPress={() => setNewTeamHeadCoachUserId(member.userId)}
                      accessibilityRole="button"
                      accessibilityLabel={member.user.name}
                    >
                      <Text style={[styles.chipText, { color: c.textPrimary }]} numberOfLines={1}>{member.user.name}</Text>
                      <Text style={[styles.staffMeta, { color: c.textSecondary }]} numberOfLines={1}>{t(`roles.${member.role}`)}</Text>
                    </Pressable>
                  )
                })}
              </View>
              <Button
                label={t('teamManagement.addTeamCta')}
                variant="filled"
                size="lg"
                fullWidth
                loading={isSubmittingTeam}
                disabled={isSubmittingTeam}
                onPress={() => void handleCreateTeam()}
                style={styles.buttonSpacing}
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]} numberOfLines={1}>{t('teamManagement.assignCoachesLabel')}</Text>
          {teamOptions.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
              <Text style={[styles.emptyCardTitle, { color: c.textPrimary }]} numberOfLines={2}>{t('teamManagement.noTeamsForCoachesTitle')}</Text>
              <Text style={[styles.emptyCardBody, { color: c.textSecondary }]} numberOfLines={3}>{t('teamManagement.noTeamsForCoachesBody')}</Text>
            </View>
          ) : assignableStaff.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
              <Text style={[styles.emptyCardTitle, { color: c.textPrimary }]} numberOfLines={2}>{t('teamManagement.noStaffTitle')}</Text>
              <Text style={[styles.emptyCardBody, { color: c.textSecondary }]} numberOfLines={3}>{t('teamManagement.noStaffBody')}</Text>
            </View>
          ) : (
            <View style={[styles.formCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
              <Text style={[styles.fieldLabel, { color: c.textPrimary }]} numberOfLines={1}>{t('teamManagement.teamPickerLabel')}</Text>
              <View style={styles.optionGrid}>
                {teamOptions.map((team) => {
                  const isActive = team.id === selectedCoachTeamId
                  return (
                    <Pressable
                      key={team.id}
                      style={[
                        styles.optionCard,
                        { borderColor: c.borderDefault, backgroundColor: c.background },
                        isActive && {
                          borderColor: c.primary,
                          backgroundColor: c.primary50,
                        },
                      ]}
                      onPress={() => setSelectedCoachTeamId(team.id)}
                      accessibilityRole="button"
                      accessibilityLabel={team.displayName}
                    >
                      <Text style={[styles.optionTitle, { color: c.textPrimary }]} numberOfLines={1}>{team.displayName}</Text>
                      <Text style={[styles.optionBody, { color: c.textSecondary }]} numberOfLines={1}>{team.groupDisplayName}</Text>
                    </Pressable>
                  )
                })}
              </View>

              {selectedCoachTeam ? (
                <>
                  <View style={[styles.summaryCard, { borderColor: c.borderDefault, backgroundColor: c.background }]}>
                    <Text style={[styles.summaryTitle, { color: c.textPrimary }]} numberOfLines={1}>{selectedCoachTeam.displayName}</Text>
                    <Text style={[styles.summaryBody, { color: c.textSecondary }]} numberOfLines={2}>{formatCoachSummary(selectedCoachTeam)}</Text>
                  </View>

                  <Text style={[styles.fieldLabel, styles.fieldLabelSpaced, { color: c.textPrimary }]} numberOfLines={1}>
                    {t('teamManagement.headCoachLabel')}
                  </Text>
                  <View style={styles.chipRow}>
                    <Pressable
                      style={[
                        styles.chip,
                        { borderColor: c.borderDefault, backgroundColor: c.background },
                        !selectedHeadCoachUserId && {
                          borderColor: c.primary,
                          backgroundColor: c.primary50,
                        },
                      ]}
                      onPress={() => setSelectedHeadCoachUserId(null)}
                      accessibilityRole="button"
                      accessibilityLabel={t('teamManagement.noHeadCoach')}
                    >
                      <Text style={[styles.chipText, { color: c.textPrimary }]} numberOfLines={1}>{t('teamManagement.noHeadCoach')}</Text>
                    </Pressable>
                    {assignableStaff.map((member) => {
                      const isActive = selectedHeadCoachUserId === member.userId
                      return (
                        <Pressable
                          key={`head-${member.id}`}
                          style={[
                            styles.staffChip,
                            { borderColor: c.borderDefault, backgroundColor: c.background },
                            isActive && {
                              borderColor: c.primary,
                              backgroundColor: c.primary50,
                            },
                          ]}
                          onPress={() => {
                            setSelectedHeadCoachUserId(member.userId)
                            setSelectedAssistantCoachUserIds((current) =>
                              current.filter((entry) => entry !== member.userId),
                            )
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={member.user.name}
                        >
                          <Text style={[styles.chipText, { color: c.textPrimary }]} numberOfLines={1}>{member.user.name}</Text>
                          <Text style={[styles.staffMeta, { color: c.textSecondary }]} numberOfLines={1}>{t(`roles.${member.role}`)}</Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  <Text style={[styles.fieldLabel, styles.fieldLabelSpaced, { color: c.textPrimary }]} numberOfLines={1}>
                    {t('teamManagement.assistantCoachesLabel')}
                  </Text>
                  <View style={styles.chipRow}>
                    {assignableStaff.map((member) => {
                      const isActive = selectedAssistantCoachUserIds.includes(member.userId)
                      const isDisabled = selectedHeadCoachUserId === member.userId

                      return (
                        <Pressable
                          key={`assistant-${member.id}`}
                          style={[
                            styles.staffChip,
                            { borderColor: c.borderDefault, backgroundColor: c.background },
                            isActive && {
                              borderColor: c.primary,
                              backgroundColor: c.primary50,
                            },
                            isDisabled && styles.disabledChip,
                          ]}
                          onPress={() => {
                            if (isDisabled) return
                            toggleAssistantCoachUserId(member.userId)
                          }}
                          disabled={isDisabled}
                          accessibilityRole="button"
                          accessibilityLabel={member.user.name}
                        >
                          <Text style={[styles.chipText, { color: c.textPrimary }]} numberOfLines={1}>{member.user.name}</Text>
                          <Text style={[styles.staffMeta, { color: c.textSecondary }]} numberOfLines={1}>{t(`roles.${member.role}`)}</Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  <Button
                    label={t('teamManagement.saveCoachAssignments')}
                    variant="filled"
                    size="lg"
                    fullWidth
                    loading={isSavingCoaches}
                    disabled={isSavingCoaches}
                    onPress={() => void handleSaveCoachAssignments()}
                    style={styles.buttonSpacing}
                  />
                </>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.md },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.lg,
    letterSpacing: -0.15,
  },
  subtitle: {
    marginTop: space.sm,
    marginBottom: space.lg,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontFamily: fonts.body,
  },
  section: { marginBottom: space.lg },
  sectionLabel: {
    marginBottom: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  listCard: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.padding,
    gap: space.md,
  },
  groupBlock: { gap: space.sm },
  groupTitle: { fontSize: fontSize.md, fontFamily: fonts.label },
  groupTypeMeta: { fontSize: fontSize.sm, fontFamily: fonts.body },
  groupEmptyText: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, fontFamily: fonts.body },
  teamCard: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.paddingCompact,
    gap: space.xs,
  },
  teamCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  teamName: { flex: 1, fontSize: fontSize.md, fontFamily: fonts.label },
  teamCount: { fontSize: fontSize.xs, fontFamily: fonts.body },
  teamMeta: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, fontFamily: fonts.body },
  formCard: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.padding,
  },
  fieldLabel: {
    marginBottom: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  fieldLabelSpaced: { marginTop: space.md },
  fieldHint: {
    marginBottom: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffChip: {
    minHeight: 48,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['2xs'],
  },
  disabledChip: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  staffMeta: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
  },
  input: {
    height: 52,
    borderWidth: hairline,
    borderRadius: card.radius,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  spacedInput: { marginTop: space.sm },
  optionGrid: {
    gap: space.sm,
  },
  optionCard: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.paddingCompact,
    gap: space.xs,
  },
  optionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  optionBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  summaryCard: {
    marginTop: space.md,
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.paddingCompact,
    gap: space.xs,
  },
  summaryTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  summaryBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  buttonSpacing: {
    marginTop: space.md,
  },
  emptyCard: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.padding,
    gap: space.sm,
  },
  emptyCardTitle: { fontSize: fontSize.md, fontFamily: fonts.label },
  emptyCardBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  emptyStateText: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
})
