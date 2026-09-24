import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  MembershipRole,
  TeamGroupType,
  complianceStatus,
  type ComplianceItem,
} from '@anstoss/shared'
import { COMPLIANCE_FEATURE_ENABLED } from '../src/launchFeatures'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { FormInput } from '../src/components/FormInput'
import { Skeleton } from '../src/components/Skeleton'
import {
  AssignStaffSheet,
  type FzInfo,
  type StaffCandidate,
} from '../src/components/admin/AssignStaffSheet'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  Avatar,
  Banner,
  BottomSheet,
  Button,
  IconButton,
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  SegmentedControl,
  type SegmentedControlSegment,
  Text,
} from '../src/components/ui'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { RADIUS_FULL, space } from '../src/theme/tokens'

type CoachAssignment = { userId: string; name: string; avatarUrl: string | null }

type TeamResponse = {
  id: string
  displayName: string
  squadLabel: string | null
  leagueName: string | null
  memberCount: number
  coachAssignments: { headCoach: CoachAssignment | null; assistants: CoachAssignment[] }
}

type TeamGroupResponse = {
  id: string
  displayName: string
  type: TeamGroupType | string
  teams: TeamResponse[]
}

type ClubMemberResponse = {
  id: string
  userId: string
  role: MembershipRole
  user: { id: string; name: string; avatarUrl: string | null }
}

const GROUP_TYPES: Array<{ value: TeamGroupType; labelKey: string }> = [
  { value: TeamGroupType.SENIOR, labelKey: 'teamManagement.groupTypeSenior' },
  { value: TeamGroupType.YOUTH, labelKey: 'teamManagement.groupTypeYouth' },
  { value: TeamGroupType.MINI, labelKey: 'teamManagement.groupTypeMini' },
  { value: TeamGroupType.CUSTOM, labelKey: 'teamManagement.groupTypeCustom' },
]

const STAFF_ROLES = new Set<string>([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH])

function isYouthGroup(type: string) {
  return type === TeamGroupType.YOUTH || type === TeamGroupType.MINI
}

/**
 * Mannschaften — every team by age group with who coaches it. A team with
 * no head coach says so in the row; tapping a team opens the Trainer /
 * Co-Trainer sheet, which shows the Führungszeugnis status for youth teams.
 */
export default function TeamManagementScreen() {
  const { t } = useTranslation()
  const { activeClub, teamMembers } = useAuth()
  const params = useLocalSearchParams<{ teamId?: string }>()
  const clubId = activeClub?.club.id ?? null

  const [groups, setGroups] = useState<TeamGroupResponse[]>([])
  const [staff, setStaff] = useState<StaffCandidate[]>([])
  const [fzByUserId, setFzByUserId] = useState<Record<string, FzInfo>>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [savingCoaches, setSavingCoaches] = useState(false)
  const [createMode, setCreateMode] = useState<'group' | 'team' | null>(null)
  const [openedFromParam, setOpenedFromParam] = useState(false)

  const isClubManager =
    activeClub?.role === MembershipRole.OWNER ||
    activeClub?.role === MembershipRole.ADMIN ||
    activeClub?.role === MembershipRole.COACH
  const isTeamCoach = teamMembers.some(
    (tm) =>
      tm.team.clubId === clubId &&
      (tm.status == null || tm.status === 'ACTIVE') &&
      (tm.role === 'HEAD_COACH' || tm.role === 'ASSISTANT_COACH'),
  )
  const canManage = isClubManager || isTeamCoach
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

  const load = useCallback(async () => {
    if (!clubId) return
    try {
      const [groupData, memberData, complianceData] = await Promise.all([
        api<TeamGroupResponse[]>(`/clubs/${clubId}/team-groups`),
        api<ClubMemberResponse[]>(`/clubs/${clubId}/members`).catch(() => []),
        isAdmin && COMPLIANCE_FEATURE_ENABLED
          ? api<ComplianceItem[]>(`/clubs/${clubId}/compliance?kind=FUEHRUNGSZEUGNIS`).catch(() => [])
          : Promise.resolve([] as ComplianceItem[]),
      ])
      setGroups(Array.isArray(groupData) ? groupData : [])
      setStaff(
        (Array.isArray(memberData) ? memberData : [])
          .filter((m) => m?.user?.name && STAFF_ROLES.has(m.role))
          .map((m) => ({
            userId: m.userId ?? m.user.id,
            name: m.user.name,
            avatarUrl: m.user.avatarUrl ?? null,
          })),
      )
      const fz: Record<string, FzInfo> = {}
      for (const item of Array.isArray(complianceData) ? complianceData : []) {
        if (item.kind !== 'FUEHRUNGSZEUGNIS') continue
        // L6: same window as the API (COMPLIANCE_EXPIRING_WINDOW_DAYS).
        fz[item.memberUserId] = {
          expiresAt: item.expiresAt,
          status: complianceStatus(item.expiresAt),
        }
      }
      setFzByUserId(fz)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [clubId, isAdmin])

  useEffect(() => {
    setStatus('loading')
    void load()
  }, [load])

  // Deep link from the Aufgaben inbox: open the assign sheet for that team.
  // M4: only admins can save coach assignments (server: assertClubAdministrator),
  // so only admins get the sheet.
  useEffect(() => {
    if (openedFromParam || status !== 'ready' || !params.teamId || !isAdmin) return
    if (groups.some((g) => g.teams.some((team) => team.id === params.teamId))) {
      setEditingTeamId(params.teamId)
    }
    setOpenedFromParam(true)
  }, [groups, isAdmin, openedFromParam, params.teamId, status])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const allTeams = useMemo(
    () => groups.flatMap((group) => group.teams.map((team) => ({ team, group }))),
    [groups],
  )
  const withoutCoach = allTeams.filter(({ team }) => !team.coachAssignments?.headCoach).length
  const editing = allTeams.find(({ team }) => team.id === editingTeamId) ?? null

  const saveCoaches = async (next: { headCoachUserId: string | null; assistantCoachUserIds: string[] }) => {
    if (!clubId || !editing) return
    setSavingCoaches(true)
    try {
      await api(`/clubs/${clubId}/teams/${editing.team.id}/coaches`, {
        method: 'POST',
        body: next,
      })
      setEditingTeamId(null)
      await load()
    } catch {
      Alert.alert(t('common.error'), t('teamManagement.coachAssignmentsError'))
    } finally {
      setSavingCoaches(false)
    }
  }

  const openCreateMenu = () => {
    const options = [t('verein.teams.newTeam'), t('verein.teams.newGroup')]
    const choose = (index: number) => {
      if (index === 0) setCreateMode(groups.length > 0 ? 'team' : 'group')
      if (index === 1) setCreateMode('group')
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, t('common.cancel')], cancelButtonIndex: options.length },
        (index) => choose(index),
      )
      return
    }
    Alert.alert(t('verein.teams.add'), undefined, [
      { text: options[0], onPress: () => choose(0) },
      { text: options[1], onPress: () => choose(1) },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  const header = (
    <ModalHeader
      title={t('verein.teams.title')}
      mode="back"
      rightAction={
        canManage && status === 'ready' ? (
          <IconButton onPress={openCreateMenu} accessibilityLabel={t('verein.teams.add')}>
            <Icon name="plus" size="lg" color="primary" />
          </IconButton>
        ) : undefined
      }
    />
  )

  if (!activeClub || !canManage) {
    return (
      <Screen header={header} padded={false}>
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
      header={header}
      scroll={status === 'ready'}
      padded={false}
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {status === 'loading' ? (
        <TeamsSkeleton />
      ) : status === 'error' ? (
        <ErrorState
          message={t('teamManagement.loadError')}
          onRetry={() => {
            setStatus('loading')
            void load()
          }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="person.3"
          title={t('teamManagement.emptyTitle')}
          description={t('teamManagement.emptyBody')}
          actionLabel={t('teamManagement.createFirstGroup')}
          onAction={() => setCreateMode('group')}
        />
      ) : (
        <>
          {withoutCoach > 0 ? (
            <Banner
              tone="warning"
              icon="exclamationmark.triangle"
              title={t('verein.teams.withoutCoach', { count: withoutCoach })}
              description={
                isAdmin ? t('verein.teams.withoutCoachHint') : t('verein.teams.readOnlyHint')
              }
            />
          ) : null}
          {groups.map((group) => (
            <SectionGroup
              key={group.id}
              header={`${group.displayName} · ${t(
                GROUP_TYPES.find((g) => g.value === group.type)?.labelKey ??
                  'teamManagement.groupTypeCustom',
              )}`}
            >
              {group.teams.length === 0 ? (
                <ListRow
                  title={t('teamManagement.noTeamsInGroup')}
                  subtitle={t('verein.teams.addTeamHint')}
                  onPress={() => setCreateMode('team')}
                />
              ) : (
                group.teams.map((team) => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    onPress={isAdmin ? () => setEditingTeamId(team.id) : undefined}
                  />
                ))
              )}
            </SectionGroup>
          ))}
        </>
      )}

      <AssignStaffSheet
        visible={isAdmin && editing !== null}
        teamName={editing?.team.displayName ?? ''}
        isYouthTeam={editing ? isYouthGroup(editing.group.type) : false}
        candidates={staff}
        headCoachUserId={editing?.team.coachAssignments?.headCoach?.userId ?? null}
        assistantUserIds={(editing?.team.coachAssignments?.assistants ?? []).map((a) => a.userId)}
        fzByUserId={fzByUserId}
        saving={savingCoaches}
        onClose={() => setEditingTeamId(null)}
        onSave={(next) => void saveCoaches(next)}
      />

      <CreateSheet
        mode={createMode}
        clubId={activeClub.club.id}
        groups={groups}
        onClose={() => setCreateMode(null)}
        onCreated={async () => {
          setCreateMode(null)
          await load()
        }}
      />
    </Screen>
  )

}

/** Read-only (no chevron, not pressable) when `onPress` is absent (M4). */
function TeamRow({ team, onPress }: { team: TeamResponse; onPress?: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const head = team.coachAssignments?.headCoach ?? null
  const assistants = team.coachAssignments?.assistants ?? []
  const coachLine = head
    ? [
        t('verein.teams.coachLine', { name: head.name }),
        assistants.length > 0
          ? t('verein.teams.assistantLine', { names: assistants.map((a) => a.name).join(', ') })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : t('verein.teams.noCoach')
  return (
    <ListRow
      left={
        head ? (
          <View style={styles.avatarStack}>
            <Avatar size="md" src={head.avatarUrl} fallbackText={head.name} />
            {assistants[0] ? (
              <View style={[styles.avatarOverlap, { borderColor: c.surface }]}>
                <Avatar size="sm" src={assistants[0].avatarUrl} fallbackText={assistants[0].name} />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.noCoach, { backgroundColor: c.warningBg }]}>
            <Icon name="exclamationmark.triangle.fill" size="md" color="warning" />
          </View>
        )
      }
      title={team.displayName}
      subtitle={[coachLine, team.leagueName].filter(Boolean).join(' · ')}
      right={
        <Text variant="footnote" color="secondary" tabular>
          {t('verein.teams.playerCount', { count: team.memberCount })}
        </Text>
      }
      accessibilityLabel={`${team.displayName}, ${coachLine}`}
      showChevron={Boolean(onPress)}
      onPress={onPress}
    />
  )
}

function CreateSheet({
  mode,
  clubId,
  groups,
  onClose,
  onCreated,
}: {
  mode: 'group' | 'team' | null
  clubId: string
  groups: TeamGroupResponse[]
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsetsSafe()
  const [name, setName] = useState('')
  const [squadLabel, setSquadLabel] = useState('')
  const [league, setLeague] = useState('')
  const [groupType, setGroupType] = useState<TeamGroupType>(TeamGroupType.YOUTH)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!mode) return
    setName('')
    setSquadLabel('')
    setLeague('')
    setGroupId(groups[0]?.id ?? null)
  }, [groups, mode])

  const typeSegments: SegmentedControlSegment<TeamGroupType>[] = GROUP_TYPES.map((option) => ({
    key: option.value,
    label: t(option.labelKey),
  }))
  const groupSegments: SegmentedControlSegment<string>[] = groups.map((group) => ({
    key: group.id,
    label: group.displayName,
  }))

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert(
        mode === 'group'
          ? t('teamManagement.groupNameRequiredTitle')
          : t('teamManagement.teamNameRequiredTitle'),
        mode === 'group'
          ? t('teamManagement.groupNameRequiredBody')
          : t('teamManagement.teamNameRequiredBody'),
      )
      return
    }
    setSaving(true)
    try {
      if (mode === 'group') {
        await api(`/clubs/${clubId}/team-groups`, {
          method: 'POST',
          body: { displayName: name.trim(), type: groupType },
        })
      } else if (groupId) {
        await api(`/clubs/${clubId}/team-groups/${groupId}/teams`, {
          method: 'POST',
          body: {
            name: name.trim(),
            squadLabel: squadLabel.trim() || undefined,
            leagueName: league.trim() || undefined,
          },
        })
      }
      await onCreated()
    } catch {
      Alert.alert(
        t('common.error'),
        mode === 'group' ? t('teamManagement.groupCreateError') : t('teamManagement.teamCreateError'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      visible={mode !== null}
      onClose={onClose}
      heightPct="auto"
      paddingBottom={space.lg + insets.bottom}
    >
      <View style={styles.form}>
        <Text variant="title3" weight="bold" color="primary">
          {mode === 'group' ? t('verein.teams.newGroup') : t('verein.teams.newTeam')}
        </Text>
        {mode === 'group' ? (
          <>
            <FormInput
              label={t('teamManagement.groupNameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('teamManagement.groupNamePlaceholder')}
            />
            <SegmentedControl segments={typeSegments} value={groupType} onChange={setGroupType} fullWidth />
          </>
        ) : (
          <>
            {groupSegments.length > 1 && groupId ? (
              <SegmentedControl segments={groupSegments} value={groupId} onChange={setGroupId} fullWidth />
            ) : null}
            <FormInput
              label={t('teamManagement.teamNameLabel')}
              value={name}
              onChangeText={setName}
              placeholder={t('teamManagement.teamNamePlaceholder')}
            />
            <FormInput
              label={t('teamManagement.squadLabelLabel')}
              value={squadLabel}
              onChangeText={setSquadLabel}
              placeholder={t('teamManagement.squadLabelPlaceholder')}
            />
            <FormInput
              label={t('teamManagement.leagueLabel')}
              value={league}
              onChangeText={setLeague}
              placeholder={t('teamManagement.leaguePlaceholder')}
            />
          </>
        )}
        <Button
          label={mode === 'group' ? t('teamManagement.addGroupCta') : t('teamManagement.addTeamCta')}
          variant="filled"
          size="lg"
          fullWidth
          loading={saving}
          disabled={saving}
          onPress={() => void submit()}
        />
      </View>
    </BottomSheet>
  )
}

function TeamsSkeleton() {
  return (
    <View style={styles.skeleton} testID="team-management-loading">
      {[3, 4].map((rows, groupIndex) => (
        <View key={groupIndex} style={styles.skeletonGroup}>
          <Skeleton shape="line" width="35%" height={12} />
          {Array.from({ length: rows }).map((_, index) => (
            <View key={index} style={styles.skeletonRow}>
              <Skeleton shape="circle" width={40} height={40} />
              <View style={styles.skeletonText}>
                <Skeleton shape="line" width="50%" height={14} />
                <Skeleton shape="line" width="70%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  avatarStack: { width: 48, height: 44, justifyContent: 'center' },
  avatarOverlap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: RADIUS_FULL,
  },
  noCoach: {
    width: 40,
    height: 40,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: space.md },
  skeleton: { gap: space.lg },
  skeletonGroup: { gap: space.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skeletonText: { flex: 1, gap: space.xs },
})
