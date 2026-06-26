import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { MembershipRole, TeamGroupType } from '@anstoss/shared'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { FormInput } from '../src/components/FormInput'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  Button,
  Card,
  Divider,
  Icon,
  ListRow,
  Screen,
  SectionHeader,
  SegmentedControl,
  type SegmentedControlSegment,
  SettingsIcon,
  SettingsIconTint,
  Text,
} from '../src/components/ui'
import {
  fontSize,
  hairline,
  space,
  radius,
  fonts,
  lineHeight,
  SPACING_SM,
  SPACING_MD,
  SPACING_LG,
  RADIUS_MD,
  RADIUS_LG,
} from '../src/theme/tokens'

// Android needs an opt-in to animate height changes; iOS does this by
// default. Top-level so the call site can fire LayoutAnimation cheaply.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

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
    (group?.teams ?? []).map((team) => ({
      ...team,
      groupDisplayName: group?.displayName ?? '',
    })),
  )
}

export default function TeamManagementScreen() {
  const { t } = useTranslation()
  const { activeClub, teamMembers } = useAuth()
  const c = useClubColors()
  const [groups, setGroups] = useState<TeamGroupResponse[]>([])
  const [assignableStaff, setAssignableStaff] = useState<ClubMemberResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false)
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false)

  // Add Group / Add Team / Assign Coaches are collapsed actions that expand
  // inline within their own card. The Structure view at the top is the hero —
  // it answers "what exists" — with the actions stacked beneath it.
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [addTeamOpen, setAddTeamOpen] = useState(false)
  const [coachesOpen, setCoachesOpen] = useState(false)
  const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
  const openAddGroup = () => {
    animate()
    setAddGroupOpen(true)
  }
  const toggleAddGroup = () => {
    animate()
    setAddGroupOpen((open) => !open)
  }
  const toggleAddTeam = () => {
    animate()
    setAddTeamOpen((open) => !open)
  }
  const toggleCoaches = () => {
    animate()
    setCoachesOpen((open) => !open)
  }
  const [isSavingCoaches, setIsSavingCoaches] = useState(false)

  const [groupName, setGroupName] = useState('')
  const [groupType, setGroupType] = useState<TeamGroupType>(TeamGroupType.SENIOR)

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [squadLabel, setSquadLabel] = useState('')
  const [leagueName, setLeagueName] = useState('')
  const [fussballUrl, setFussballUrl] = useState('')
  const [newTeamHeadCoachUserId, setNewTeamHeadCoachUserId] = useState<string | null>(null)

  const [selectedCoachTeamId, setSelectedCoachTeamId] = useState<string | null>(null)
  const [selectedHeadCoachUserId, setSelectedHeadCoachUserId] = useState<string | null>(null)
  const [selectedAssistantCoachUserIds, setSelectedAssistantCoachUserIds] = useState<string[]>([])

  const teamOptions = useMemo(() => flattenTeams(groups), [groups])
  const selectedCoachTeam = teamOptions.find((team) => team.id === selectedCoachTeamId) || null

  const groupTypeSegments: SegmentedControlSegment<TeamGroupType>[] = GROUP_TYPES.map((option) => ({
    key: option.value,
    label: t(option.labelKey),
  }))

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
      // Drop members with missing user / role / id so the staff chips
      // below can dereference member.user.name etc. without exploding.
      const nextAssignableStaff = (memberData || []).filter(
        (member) =>
          !!member?.id &&
          !!member?.user?.name &&
          !!member?.role &&
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
        current && nextAssignableStaff.some((member) => member.userId === current) ? current : null,
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

    setSelectedHeadCoachUserId(selectedCoachTeam.coachAssignments?.headCoach?.userId ?? null)
    setSelectedAssistantCoachUserIds(
      (selectedCoachTeam.coachAssignments?.assistants ?? []).map((assistant) => assistant.userId),
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
      animate()
      setAddGroupOpen(false)
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
      const created = await api<{ id: string }>(
        `/clubs/${activeClub.club.id}/team-groups/${selectedGroupId}/teams`,
        {
          method: 'POST',
          body: {
            name: teamName.trim(),
            squadLabel: squadLabel.trim() || undefined,
            leagueName: leagueName.trim() || undefined,
            headCoachUserId: newTeamHeadCoachUserId || undefined,
          },
        },
      )

      // Best-effort external team-data auto-link. If the URL is invalid or the
      // upstream is down, the team itself is still created — the admin
      // can re-link from the team detail screen later.
      const urlInput = fussballUrl.trim()
      if (urlInput && created?.id) {
        try {
          const result = await api<{
            link: { id: string; label: string }
            sync: {
              status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
              importedCount: number
              updatedCount: number
              skippedCount: number
              errorSummary: string | null
            }
          }>('/integrations/fussball/team-links', {
            method: 'POST',
            body: {
              teamId: created.id,
              input: urlInput,
            },
            headers: { 'x-club-id': activeClub.club.id },
          })
          const total = (result?.sync?.importedCount ?? 0) + (result?.sync?.updatedCount ?? 0)
          if (result?.sync?.status === 'FAILED') {
            Alert.alert(
              t('teamManagement.fussballSyncFailedTitle', {
                defaultValue: 'External team data linked, but sync failed',
              }),
              result.sync.errorSummary ??
                t('teamManagement.fussballSyncFailedBody', {
                  defaultValue:
                    'We linked the team but couldn’t pull fixtures yet. Retry from team settings.',
                }),
            )
          } else if (total > 0) {
            Alert.alert(
              t('teamManagement.fussballLinkedTitle', {
                defaultValue: 'External team data linked',
              }),
              t('teamManagement.fussballLinkedBody', {
                defaultValue: '{{label}} — {{count}} fixtures imported.',
                label: result.link.label,
                count: total,
              }),
            )
          }
        } catch (err) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : t('teamManagement.fussballLinkFailedBody', {
                  defaultValue:
                    'The team was created. Try linking again from team settings — the URL might be incorrect.',
                })
          Alert.alert(
            t('teamManagement.fussballLinkFailedTitle', {
              defaultValue: 'Couldn’t link external team data yet',
            }),
            message,
          )
        }
      }

      setTeamName('')
      setSquadLabel('')
      setLeagueName('')
      setFussballUrl('')
      setNewTeamHeadCoachUserId(null)
      animate()
      setAddTeamOpen(false)
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
      current.includes(userId) ? current.filter((entry) => entry !== userId) : [...current, userId],
    )
  }

  const formatCoachSummary = (team: TeamResponse) => {
    const summaryParts: string[] = []

    const headCoach = team.coachAssignments?.headCoach
    const assistants = team.coachAssignments?.assistants ?? []

    if (headCoach?.name) {
      summaryParts.push(t('teamManagement.headCoachSummary', { name: headCoach.name }))
    }

    if (assistants.length > 0) {
      summaryParts.push(
        t('teamManagement.assistantCoachSummary', {
          names: assistants
            .filter((a) => a?.name)
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

  // Mirror the API (teams.service assertManageAccess): club managers
  // (OWNER/ADMIN/COACH membership) OR anyone holding a coach-role TeamAccess
  // (HEAD_COACH / ASSISTANT_COACH) on a team in this club may manage rosters.
  const isClubManager =
    activeClub.role === MembershipRole.OWNER ||
    activeClub.role === MembershipRole.ADMIN ||
    activeClub.role === MembershipRole.COACH
  const isTeamCoach = teamMembers.some(
    (tm) =>
      tm.team.clubId === activeClub.club.id &&
      (tm.status == null || tm.status === 'ACTIVE') &&
      (tm.role === 'HEAD_COACH' || tm.role === 'ASSISTANT_COACH'),
  )
  const canManage = isClubManager || isTeamCoach
  if (!canManage) {
    return (
      <Screen
        header={<ModalHeader title={t('teamManagement.screenTitle')} mode="back" />}
        scroll={false}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  const hasGroups = groups.length > 0

  // Reusable expandable action card: a tappable header row with an inline
  // body that slides open within the SAME card (no detached floating form).
  const ActionCard = ({
    icon,
    tint,
    label,
    open,
    onToggle,
    children,
  }: {
    icon: string
    tint: string
    label: string
    open: boolean
    onToggle: () => void
    children: React.ReactNode
  }) => (
    <Card variant="plain" padding="none" style={styles.actionCard}>
      <Pressable
        style={styles.actionHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
      >
        <SettingsIcon name={icon} tint={tint} />
        <Text variant="body" color="primary" style={styles.actionTitle} numberOfLines={1}>
          {label}
        </Text>
        <Icon name={open ? 'chevron.up' : 'chevron.down'} size="sm" color="tertiary" />
      </Pressable>
      {open ? (
        <View>
          <Divider />
          <View style={styles.actionBody}>{children}</View>
        </View>
      ) : null}
    </Card>
  )

  const renderStaffChip = (
    member: ClubMemberResponse,
    isActive: boolean,
    onPress: () => void,
    opts?: { disabled?: boolean; keyPrefix?: string },
  ) => (
    <Pressable
      key={`${opts?.keyPrefix ?? 'staff'}-${member.id}`}
      style={[
        styles.staffChip,
        { borderColor: c.borderDefault, backgroundColor: c.background },
        isActive && { borderColor: c.primary, backgroundColor: c.primary50 },
        opts?.disabled && styles.disabledChip,
      ]}
      onPress={onPress}
      disabled={opts?.disabled}
      accessibilityRole="button"
      accessibilityLabel={member.user.name}
    >
      <Text variant="footnote" color="primary" numberOfLines={1}>
        {member.user.name}
      </Text>
      <Text style={[styles.staffMeta, { color: c.textSecondary }]} numberOfLines={1}>
        {t(`roles.${member.role}`)}
      </Text>
    </Pressable>
  )

  return (
    <Screen
      header={<ModalHeader title={t('teamManagement.screenTitle')} mode="back" />}
      scroll={false}
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.inlineLoader}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <>
            {/* ── Structure ─────────────────────────────────────── */}
            <SectionHeader title={t('teamManagement.structureLabel')} />

            {!hasGroups ? (
              <Card variant="elevated" padding="hero" style={styles.heroCard}>
                <View style={[styles.heroIcon, { backgroundColor: c.primary50 }]}>
                  <Icon name="person.3" size="lg" color="primary" />
                </View>
                <Text variant="title3" color="primary" style={styles.heroTitle}>
                  {t('teamManagement.emptyTitle', {
                    defaultValue: 'Build your club structure',
                  })}
                </Text>
                <Text variant="body" color="secondary" style={styles.heroBody}>
                  {t('teamManagement.emptyBody', {
                    defaultValue:
                      'Start with a group like Men, Youth, or Bambini — then place squads underneath it.',
                  })}
                </Text>
                <Button
                  label={t('teamManagement.createFirstGroup', {
                    defaultValue: 'Create your first group',
                  })}
                  variant="filled"
                  size="lg"
                  fullWidth
                  onPress={openAddGroup}
                  style={styles.heroCta}
                />
              </Card>
            ) : (
              groups.map((group) => {
                const groupTypeLabel = t(
                  GROUP_TYPES.find((option) => option.value === group.type)?.labelKey ||
                    'teamManagement.groupTypeCustom',
                )
                const teams = group.teams ?? []
                return (
                  <Card key={group.id} variant="plain" padding="none" style={styles.groupCard}>
                    <View style={styles.groupHeader}>
                      <SettingsIcon name="flag.fill" tint={c.primary} />
                      <View style={styles.groupHeaderText}>
                        <Text variant="title3" color="primary" numberOfLines={1}>
                          {group.displayName}
                        </Text>
                        <Text variant="caption1" color="tertiary" numberOfLines={1}>
                          {groupTypeLabel}
                        </Text>
                      </View>
                    </View>
                    <Divider />
                    {teams.length === 0 ? (
                      <View style={styles.groupEmptyRow}>
                        <Text variant="footnote" color="tertiary">
                          {t('teamManagement.noTeamsInGroup')}
                        </Text>
                      </View>
                    ) : (
                      teams.map((team, teamIdx) => (
                        <View key={team.id}>
                          {teamIdx > 0 ? <Divider /> : null}
                          <ListRow
                            left={
                              <SettingsIcon
                                name="figure.soccer.fill"
                                tint={SettingsIconTint.gray}
                              />
                            }
                            title={team.displayName}
                            subtitle={team.leagueName || t('teamManagement.noLeagueAssigned')}
                            right={
                              <Text variant="footnote" color="secondary" tabular>
                                {t('teamManagement.memberCount', {
                                  defaultValue: '{{count}}',
                                  count: team.memberCount,
                                })}
                              </Text>
                            }
                          />
                        </View>
                      ))
                    )}
                  </Card>
                )
              })
            )}

            {/* ── Manage ────────────────────────────────────────── */}
            <SectionHeader
              title={t('teamManagement.manageLabel', { defaultValue: 'Manage' })}
              style={styles.manageHeader}
            />

            <ActionCard
              icon="plus.circle.fill"
              tint={c.primary}
              label={t('teamManagement.addGroupLabel')}
              open={addGroupOpen}
              onToggle={toggleAddGroup}
            >
              <FormInput
                label={t('teamManagement.groupNameLabel')}
                value={groupName}
                onChangeText={setGroupName}
                placeholder={t('teamManagement.groupNamePlaceholder')}
                style={{ backgroundColor: c.background }}
              />
              <SegmentedControl
                segments={groupTypeSegments}
                value={groupType}
                onChange={(key) => setGroupType(key)}
                style={styles.segmented}
              />
              <Button
                label={t('teamManagement.addGroupCta')}
                variant="filled"
                size="lg"
                fullWidth
                loading={isSubmittingGroup}
                disabled={isSubmittingGroup}
                onPress={() => void handleCreateGroup()}
                style={styles.formCta}
              />
            </ActionCard>

            <ActionCard
              icon="plus.circle.fill"
              tint={c.primary}
              label={t('teamManagement.addTeamLabel')}
              open={addTeamOpen}
              onToggle={toggleAddTeam}
            >
              {!hasGroups ? (
                <View style={styles.bodyEmpty}>
                  <Text variant="body" color="primary" style={styles.bodyEmptyTitle}>
                    {t('teamManagement.noGroupsForTeamTitle')}
                  </Text>
                  <Text variant="footnote" color="secondary">
                    {t('teamManagement.noGroupsForTeamBody')}
                  </Text>
                </View>
              ) : (
                <View style={styles.addTeamSections}>
                  {/* ── Basics sub-card ───────────────────────────── */}
                  <Card variant="plain" padding="none" style={styles.subCard}>
                    <View style={styles.subCardHeader}>
                      <Text variant="footnote" color="secondary" weight="semibold" tracking="wide">
                        {t('teamManagement.addTeamBasicsHeading', { defaultValue: 'BASICS' })}
                      </Text>
                    </View>
                    <Divider />
                    <View style={styles.subCardBody}>
                      <View>
                        <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
                          {t('teamManagement.groupPickerLabel')}
                        </Text>
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
                                <Text variant="footnote" color="primary" numberOfLines={1}>
                                  {group.displayName}
                                </Text>
                              </Pressable>
                            )
                          })}
                        </View>
                      </View>
                      <FormInput
                        label={t('teamManagement.teamNameLabel')}
                        value={teamName}
                        onChangeText={setTeamName}
                        placeholder={t('teamManagement.teamNamePlaceholder')}
                        style={{ backgroundColor: c.background }}
                      />
                      <FormInput
                        label={t('teamManagement.squadLabelLabel')}
                        value={squadLabel}
                        onChangeText={setSquadLabel}
                        placeholder={t('teamManagement.squadLabelPlaceholder')}
                        style={{ backgroundColor: c.background }}
                      />
                      <FormInput
                        label={t('teamManagement.leagueLabel')}
                        value={leagueName}
                        onChangeText={setLeagueName}
                        placeholder={t('teamManagement.leaguePlaceholder')}
                        style={{ backgroundColor: c.background }}
                      />
                      <View>
                        <FormInput
                          label={t('teamManagement.fussballUrlLabel')}
                          value={fussballUrl}
                          onChangeText={setFussballUrl}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                          placeholder={t('teamManagement.fussballUrlPlaceholder', {
                            defaultValue: 'Public team-data URL (optional)',
                          })}
                          style={{ backgroundColor: c.background }}
                        />
                        <Text
                          style={[styles.fieldHint, styles.spacedField, { color: c.textSecondary }]}
                        >
                          {t('teamManagement.fussballUrlHint', {
                            defaultValue:
                              'Linking pulls fixtures + squad — admins can bulk-invite from the imported roster.',
                          })}
                        </Text>
                      </View>
                    </View>
                  </Card>

                  {/* ── Coaches sub-card ──────────────────────────── */}
                  <Card variant="plain" padding="none" style={styles.subCard}>
                    <View style={styles.subCardHeader}>
                      <Text variant="footnote" color="secondary" weight="semibold" tracking="wide">
                        {t('teamManagement.addTeamCoachesHeading', { defaultValue: 'COACHES' })}
                      </Text>
                    </View>
                    <Divider />
                    <View style={styles.subCardBody}>
                      <View>
                        <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
                          {t('teamManagement.headCoachLabel')}
                        </Text>
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
                            <Text variant="footnote" color="primary" numberOfLines={1}>
                              {t('teamManagement.noHeadCoach')}
                            </Text>
                          </Pressable>
                          {assignableStaff.map((member) =>
                            renderStaffChip(
                              member,
                              newTeamHeadCoachUserId === member.userId,
                              () => setNewTeamHeadCoachUserId(member.userId),
                              { keyPrefix: 'newhead' },
                            ),
                          )}
                        </View>
                      </View>
                    </View>
                  </Card>

                  <Button
                    label={t('teamManagement.addTeamCta')}
                    variant="filled"
                    size="lg"
                    fullWidth
                    loading={isSubmittingTeam}
                    disabled={isSubmittingTeam}
                    onPress={() => void handleCreateTeam()}
                    style={styles.formCta}
                  />
                </View>
              )}
            </ActionCard>

            <ActionCard
              icon="person.3"
              tint={c.primary}
              label={t('teamManagement.assignCoachesLabel')}
              open={coachesOpen}
              onToggle={toggleCoaches}
            >
              {teamOptions.length === 0 ? (
                <View style={styles.bodyEmpty}>
                  <Text variant="body" color="primary" style={styles.bodyEmptyTitle}>
                    {t('teamManagement.noTeamsForCoachesTitle')}
                  </Text>
                  <Text variant="footnote" color="secondary">
                    {t('teamManagement.noTeamsForCoachesBody')}
                  </Text>
                </View>
              ) : assignableStaff.length === 0 ? (
                <View style={styles.bodyEmpty}>
                  <Text variant="body" color="primary" style={styles.bodyEmptyTitle}>
                    {t('teamManagement.noStaffTitle')}
                  </Text>
                  <Text variant="footnote" color="secondary">
                    {t('teamManagement.noStaffBody')}
                  </Text>
                </View>
              ) : (
                <View style={styles.assignCoachesSections}>
                  {/* ── Team picker ─────────────────────────────────── */}
                  <View>
                    <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>
                      {t('teamManagement.teamPickerLabel')}
                    </Text>
                    <View style={styles.chipRow}>
                      {teamOptions.map((team) => {
                        const isActive = team.id === selectedCoachTeamId
                        return (
                          <Pressable
                            key={team.id}
                            style={[
                              styles.chip,
                              { borderColor: c.borderDefault, backgroundColor: c.background },
                              isActive && { borderColor: c.primary, backgroundColor: c.primary50 },
                            ]}
                            onPress={() => setSelectedCoachTeamId(team.id)}
                            accessibilityRole="button"
                            accessibilityLabel={team.displayName}
                          >
                            <Text variant="footnote" color="primary" numberOfLines={1}>
                              {team.displayName}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>

                  {selectedCoachTeam ? (
                    <>
                      {/* ── Summary card ──────────────────────────────── */}
                      <View
                        style={[
                          styles.summaryCard,
                          { borderColor: c.borderDefault, backgroundColor: c.background },
                        ]}
                      >
                        <Text variant="footnote" color="primary" numberOfLines={1}>
                          {selectedCoachTeam.displayName}
                        </Text>
                        <Text variant="caption1" color="secondary" numberOfLines={2}>
                          {formatCoachSummary(selectedCoachTeam)}
                        </Text>
                      </View>

                      {/* ── Head coach sub-card ───────────────────────── */}
                      <Card variant="plain" padding="none" style={styles.subCard}>
                        <View style={styles.subCardHeader}>
                          <Text
                            variant="footnote"
                            color="secondary"
                            weight="semibold"
                            tracking="wide"
                          >
                            {t('teamManagement.headCoachLabel').toUpperCase()}
                          </Text>
                        </View>
                        <Divider />
                        <View style={styles.subCardBody}>
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
                              <Text variant="footnote" color="primary" numberOfLines={1}>
                                {t('teamManagement.noHeadCoach')}
                              </Text>
                            </Pressable>
                            {assignableStaff.map((member) =>
                              renderStaffChip(
                                member,
                                selectedHeadCoachUserId === member.userId,
                                () => {
                                  setSelectedHeadCoachUserId(member.userId)
                                  setSelectedAssistantCoachUserIds((current) =>
                                    current.filter((entry) => entry !== member.userId),
                                  )
                                },
                                { keyPrefix: 'head' },
                              ),
                            )}
                          </View>
                        </View>
                      </Card>

                      {/* ── Assistants sub-card ───────────────────────── */}
                      <Card variant="plain" padding="none" style={styles.subCard}>
                        <View style={styles.subCardHeader}>
                          <Text
                            variant="footnote"
                            color="secondary"
                            weight="semibold"
                            tracking="wide"
                          >
                            {t('teamManagement.assistantCoachesLabel').toUpperCase()}
                          </Text>
                        </View>
                        <Divider />
                        <View style={styles.subCardBody}>
                          <View style={styles.chipRow}>
                            {assignableStaff.map((member) =>
                              renderStaffChip(
                                member,
                                selectedAssistantCoachUserIds.includes(member.userId),
                                () => toggleAssistantCoachUserId(member.userId),
                                {
                                  keyPrefix: 'assistant',
                                  disabled: selectedHeadCoachUserId === member.userId,
                                },
                              ),
                            )}
                          </View>
                        </View>
                      </Card>

                      <Button
                        label={t('teamManagement.saveCoachAssignments')}
                        variant="filled"
                        size="lg"
                        fullWidth
                        loading={isSavingCoaches}
                        disabled={isSavingCoaches}
                        onPress={() => void handleSaveCoachAssignments()}
                      />
                    </>
                  ) : null}
                </View>
              )}
            </ActionCard>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.sm,
  },
  inlineLoader: {
    paddingVertical: space['2xl'],
    alignItems: 'center',
  },
  // Hero empty state
  heroCard: {
    alignItems: 'center',
    gap: space.sm,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  heroTitle: { textAlign: 'center' },
  heroBody: { textAlign: 'center', maxWidth: 300 },
  heroCta: { marginTop: space.md },
  // Group cards (structure)
  groupCard: { overflow: 'hidden' },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  groupHeaderText: { flex: 1, gap: space['2xs'] },
  groupEmptyRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  // Manage section
  manageHeader: { marginTop: space.lg },
  // Expandable action cards
  actionCard: { overflow: 'hidden' },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 56,
  },
  actionTitle: { flex: 1 },
  actionBody: {
    paddingHorizontal: SPACING_MD,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_LG,
  },
  segmented: { marginTop: SPACING_MD },
  formCta: { marginTop: SPACING_LG },
  bodyEmpty: { gap: space.xs },
  bodyEmptyTitle: {},
  // Add Team / Assign Coaches section wrappers
  addTeamSections: {
    gap: SPACING_MD,
  },
  assignCoachesSections: {
    gap: SPACING_LG,
  },
  // Sub-cards used inside expanded accordion bodies
  subCard: {
    overflow: 'hidden',
  },
  subCardHeader: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  subCardBody: {
    paddingHorizontal: SPACING_MD,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_LG,
    gap: SPACING_MD,
  },
  subCardInput: {},
  // Fields
  fieldLabel: {
    marginBottom: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  fieldHint: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  spacedField: { marginTop: space.md },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING_SM,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: SPACING_MD,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffChip: {
    minHeight: 48,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_LG,
    borderWidth: hairline,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space['2xs'],
  },
  disabledChip: { opacity: 0.4 },
  staffMeta: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
  },
  summaryCard: {
    borderWidth: hairline,
    borderRadius: RADIUS_MD,
    padding: SPACING_MD,
    gap: SPACING_SM,
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
