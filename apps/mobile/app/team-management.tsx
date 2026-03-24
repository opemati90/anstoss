import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { MembershipRole, TeamGroupType } from '@anstoss/shared'
import { api } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { neutralColors } from '../src/theme/tokens'

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
  const theme = useClubColors()
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
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>{t('invite.emptyWithoutClub')}</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('teamManagement.screenTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.title}>{t('teamManagement.title')}</Text>
      <Text style={styles.subtitle}>
        {t('teamManagement.subtitle', { clubName: activeClub.club.name })}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('teamManagement.structureLabel')}</Text>
        {isLoading ? (
          <ActivityIndicator color={theme.clubPrimary} />
        ) : (
          <View style={styles.listCard}>
            {groups.length === 0 ? (
              <Text style={styles.groupEmptyText}>{t('teamManagement.noGroupsYet')}</Text>
            ) : (
              groups.map((group) => (
                <View key={group.id} style={styles.groupBlock}>
                  <Text style={styles.groupTitle}>{group.displayName}</Text>
                  <Text style={styles.groupTypeMeta}>
                    {t(
                      GROUP_TYPES.find((option) => option.value === group.type)?.labelKey ||
                        'teamManagement.groupTypeCustom',
                    )}
                  </Text>
                  {group.teams.length === 0 ? (
                    <Text style={styles.groupEmptyText}>
                      {t('teamManagement.noTeamsInGroup')}
                    </Text>
                  ) : (
                    group.teams.map((team) => (
                      <View key={team.id} style={styles.teamCard}>
                        <View style={styles.teamCardHeader}>
                          <Text style={styles.teamName}>{team.displayName}</Text>
                          <Text style={styles.teamCount}>
                            {t('teamManagement.memberCount', { count: team.memberCount })}
                          </Text>
                        </View>
                        <Text style={styles.teamMeta}>
                          {team.leagueName || t('teamManagement.noLeagueAssigned')}
                        </Text>
                        <Text style={styles.teamMeta}>{formatCoachSummary(team)}</Text>
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
        <Text style={styles.sectionLabel}>{t('teamManagement.addGroupLabel')}</Text>
        <View style={styles.formCard}>
          <TextInput
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholder={t('teamManagement.groupNamePlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />
          <View style={styles.chipRow}>
            {GROUP_TYPES.map((option) => {
              const isActive = option.value === groupType
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.chip,
                    isActive && styles.activeChip,
                    isActive && {
                      borderColor: theme.clubPrimary,
                      backgroundColor: theme.clubPrimaryLight,
                    },
                  ]}
                  onPress={() => setGroupType(option.value)}
                >
                  <Text style={styles.chipText}>{t(option.labelKey)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
            onPress={() => void handleCreateGroup()}
            disabled={isSubmittingGroup}
          >
            {isSubmittingGroup ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('teamManagement.addGroupCta')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('teamManagement.addTeamLabel')}</Text>
        {groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>
              {t('teamManagement.noGroupsForTeamTitle')}
            </Text>
            <Text style={styles.emptyCardBody}>
              {t('teamManagement.noGroupsForTeamBody')}
            </Text>
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>{t('teamManagement.groupPickerLabel')}</Text>
            <View style={styles.chipRow}>
              {groups.map((group) => {
                const isActive = group.id === selectedGroupId
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.chip,
                      isActive && styles.activeChip,
                      isActive && {
                        borderColor: theme.clubPrimary,
                        backgroundColor: theme.clubPrimaryLight,
                      },
                    ]}
                    onPress={() => setSelectedGroupId(group.id)}
                  >
                    <Text style={styles.chipText}>{group.displayName}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <TextInput
              style={styles.input}
              value={teamName}
              onChangeText={setTeamName}
              placeholder={t('teamManagement.teamNamePlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
            />
            <TextInput
              style={[styles.input, styles.spacedInput]}
              value={squadLabel}
              onChangeText={setSquadLabel}
              placeholder={t('teamManagement.squadLabelPlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
            />
            <TextInput
              style={[styles.input, styles.spacedInput]}
              value={leagueName}
              onChangeText={setLeagueName}
              placeholder={t('teamManagement.leaguePlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
            />
            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
              {t('teamManagement.headCoachLabel')}
            </Text>
            <Text style={styles.fieldHint}>{t('teamManagement.staffOnlyHint')}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  !newTeamHeadCoachUserId && styles.activeChip,
                  !newTeamHeadCoachUserId && {
                    borderColor: theme.clubPrimary,
                    backgroundColor: theme.clubPrimaryLight,
                  },
                ]}
                onPress={() => setNewTeamHeadCoachUserId(null)}
              >
                <Text style={styles.chipText}>{t('teamManagement.noHeadCoach')}</Text>
              </TouchableOpacity>
              {assignableStaff.map((member) => {
                const isActive = newTeamHeadCoachUserId === member.userId
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.staffChip,
                      isActive && styles.activeChip,
                      isActive && {
                        borderColor: theme.clubPrimary,
                        backgroundColor: theme.clubPrimaryLight,
                      },
                    ]}
                    onPress={() => setNewTeamHeadCoachUserId(member.userId)}
                  >
                    <Text style={styles.chipText}>{member.user.name}</Text>
                    <Text style={styles.staffMeta}>{t(`roles.${member.role}`)}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
              onPress={() => void handleCreateTeam()}
              disabled={isSubmittingTeam}
            >
              {isSubmittingTeam ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{t('teamManagement.addTeamCta')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('teamManagement.assignCoachesLabel')}</Text>
        {teamOptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>{t('teamManagement.noTeamsForCoachesTitle')}</Text>
            <Text style={styles.emptyCardBody}>{t('teamManagement.noTeamsForCoachesBody')}</Text>
          </View>
        ) : assignableStaff.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>{t('teamManagement.noStaffTitle')}</Text>
            <Text style={styles.emptyCardBody}>{t('teamManagement.noStaffBody')}</Text>
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>{t('teamManagement.teamPickerLabel')}</Text>
            <View style={styles.optionGrid}>
              {teamOptions.map((team) => {
                const isActive = team.id === selectedCoachTeamId
                return (
                  <TouchableOpacity
                    key={team.id}
                    style={[
                      styles.optionCard,
                      isActive && styles.activeChip,
                      isActive && {
                        borderColor: theme.clubPrimary,
                        backgroundColor: theme.clubPrimaryLight,
                      },
                    ]}
                    onPress={() => setSelectedCoachTeamId(team.id)}
                  >
                    <Text style={styles.optionTitle}>{team.displayName}</Text>
                    <Text style={styles.optionBody}>{team.groupDisplayName}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {selectedCoachTeam ? (
              <>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>{selectedCoachTeam.displayName}</Text>
                  <Text style={styles.summaryBody}>{formatCoachSummary(selectedCoachTeam)}</Text>
                </View>

                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                  {t('teamManagement.headCoachLabel')}
                </Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      !selectedHeadCoachUserId && styles.activeChip,
                      !selectedHeadCoachUserId && {
                        borderColor: theme.clubPrimary,
                        backgroundColor: theme.clubPrimaryLight,
                      },
                    ]}
                    onPress={() => setSelectedHeadCoachUserId(null)}
                  >
                    <Text style={styles.chipText}>{t('teamManagement.noHeadCoach')}</Text>
                  </TouchableOpacity>
                  {assignableStaff.map((member) => {
                    const isActive = selectedHeadCoachUserId === member.userId
                    return (
                      <TouchableOpacity
                        key={`head-${member.id}`}
                        style={[
                          styles.staffChip,
                          isActive && styles.activeChip,
                          isActive && {
                            borderColor: theme.clubPrimary,
                            backgroundColor: theme.clubPrimaryLight,
                          },
                        ]}
                        onPress={() => {
                          setSelectedHeadCoachUserId(member.userId)
                          setSelectedAssistantCoachUserIds((current) =>
                            current.filter((entry) => entry !== member.userId),
                          )
                        }}
                      >
                        <Text style={styles.chipText}>{member.user.name}</Text>
                        <Text style={styles.staffMeta}>{t(`roles.${member.role}`)}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                  {t('teamManagement.assistantCoachesLabel')}
                </Text>
                <View style={styles.chipRow}>
                  {assignableStaff.map((member) => {
                    const isActive = selectedAssistantCoachUserIds.includes(member.userId)
                    const isDisabled = selectedHeadCoachUserId === member.userId

                    return (
                      <TouchableOpacity
                        key={`assistant-${member.id}`}
                        style={[
                          styles.staffChip,
                          isActive && styles.activeChip,
                          isActive && {
                            borderColor: theme.clubPrimary,
                            backgroundColor: theme.clubPrimaryLight,
                          },
                          isDisabled && styles.disabledChip,
                        ]}
                        onPress={() => {
                          if (isDisabled) return
                          toggleAssistantCoachUserId(member.userId)
                        }}
                        disabled={isDisabled}
                      >
                        <Text style={styles.chipText}>{member.user.name}</Text>
                        <Text style={styles.staffMeta}>{t(`roles.${member.role}`)}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
                  onPress={() => void handleSaveCoachAssignments()}
                  disabled={isSavingCoaches}
                >
                  {isSavingCoaches ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {t('teamManagement.saveCoachAssignments')}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary },
  headerSpacer: { width: 28 },
  title: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  subtitle: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 15,
    lineHeight: 22,
    color: neutralColors.textSecondary,
  },
  section: { marginBottom: 24 },
  sectionLabel: {
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  listCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 18,
  },
  groupBlock: { gap: 10 },
  groupTitle: { fontSize: 16, fontWeight: '600', color: neutralColors.textPrimary },
  groupTypeMeta: { fontSize: 13, color: neutralColors.textSecondary },
  groupEmptyText: { fontSize: 14, lineHeight: 20, color: neutralColors.textSecondary },
  teamCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    backgroundColor: neutralColors.background,
    padding: 12,
    gap: 6,
  },
  teamCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  teamName: { flex: 1, fontSize: 15, fontWeight: '600', color: neutralColors.textPrimary },
  teamCount: { fontSize: 12, color: neutralColors.textSecondary },
  teamMeta: { fontSize: 13, lineHeight: 18, color: neutralColors.textSecondary },
  formCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
  },
  fieldLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  fieldLabelSpaced: { marginTop: 16 },
  fieldHint: {
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffChip: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  activeChip: {
    borderWidth: 1,
  },
  disabledChip: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: neutralColors.textPrimary,
  },
  staffMeta: {
    fontSize: 11,
    fontWeight: '500',
    color: neutralColors.textSecondary,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: neutralColors.textPrimary,
  },
  spacedInput: { marginTop: 10 },
  optionGrid: {
    gap: 10,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    backgroundColor: neutralColors.background,
    padding: 12,
    gap: 4,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  optionBody: {
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  summaryCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    backgroundColor: neutralColors.background,
    padding: 12,
    gap: 4,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  summaryBody: {
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  primaryButton: {
    marginTop: 16,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textInverse,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 8,
  },
  emptyCardTitle: { fontSize: 16, fontWeight: '600', color: neutralColors.textPrimary },
  emptyCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: neutralColors.background,
  },
  emptyStateText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: neutralColors.textSecondary,
  },
})
