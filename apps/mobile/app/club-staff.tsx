import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import { ClubCapability, ClubOperationalRole, MembershipRole } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { MultiSelectSheet } from '../src/components/MultiSelectSheet'
import { SelectionSheet } from '../src/components/SelectionSheet'
import {
  Avatar,
  Badge,
  Banner,
  ListRow,
  Screen,
  SectionGroup,
  SettingsIcon,
  SettingsIconTint,
  StatusPill,
  Text,
} from '../src/components/ui'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { space } from '../src/theme/tokens'

type ClubMember = {
  id: string
  userId: string
  role: MembershipRole
  operationalRoles: ClubOperationalRole[]
  permissions?: Record<ClubCapability, boolean>
  user: {
    id: string
    name: string
    email: string
    avatarUrl: string | null
    teamAccess: Array<{
      id: string
      role: 'HEAD_COACH' | 'ASSISTANT_COACH'
      team: {
        id: string
        displayName: string
        group: { id: string; displayName: string }
      }
    }>
  }
}

type PendingAction =
  | { userId: string; kind: 'role' }
  | { userId: string; kind: 'operations' }
  | { userId: string; kind: 'offboard' }
  | null

type StaffClaim = {
  id: string
  desiredRole: 'ADMIN' | 'COACH'
  requestedTeamIds: string[]
  requestedTeamRoles: string[]
  status: 'SUBMITTED' | 'NEEDS_INFO'
  claimant: { id: string; name: string; email: string | null; avatarUrl: string | null }
}

const ROLE_ORDER: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.COACH,
  MembershipRole.PLAYER,
  MembershipRole.PARENT,
]

const OPERATIONAL_ROLE_ORDER: ClubOperationalRole[] = [
  ClubOperationalRole.SECRETARY,
  ClubOperationalRole.TREASURER,
  ClubOperationalRole.TEAM_COORDINATOR,
  ClubOperationalRole.CAPTAIN,
  ClubOperationalRole.BOARD_MEMBER,
  ClubOperationalRole.SUPPORT_STAFF,
]

const CRITICAL_ROLE_ORDER: ClubOperationalRole[] = [
  ClubOperationalRole.SECRETARY,
  ClubOperationalRole.TREASURER,
]

const STAFF_ROLES = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.COACH,
])

const CRITICAL_OPERATIONAL_ROLES = new Set<ClubOperationalRole>(CRITICAL_ROLE_ORDER)

export default function ClubStaffScreen() {
  const { t } = useTranslation()
  const { user, activeClub } = useAuth()
  const c = useClubColors()
  const [members, setMembers] = useState<ClubMember[]>([])
  const [staffClaims, setStaffClaims] = useState<StaffClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [roleSheetMember, setRoleSheetMember] = useState<ClubMember | null>(null)
  const [operationsSheetMember, setOperationsSheetMember] = useState<ClubMember | null>(null)

  const canManageStaff =
    activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

  const fetchMembers = useCallback(async () => {
    if (!activeClub || !canManageStaff) {
      setMembers([])
      setLoading(false)
      return
    }

    try {
      setLoadError(false)
      const [data, claims] = await Promise.all([
        api<ClubMember[]>(`/clubs/${activeClub.club.id}/members`),
        api<StaffClaim[]>(`/clubs/${activeClub.club.id}/staff-access-requests`),
      ])
      const safe = (Array.isArray(data) ? data : [])
        .filter((m) => m && m.id && m.userId && m.user?.name)
        .map((m) => ({
          ...m,
          operationalRoles: Array.isArray(m.operationalRoles) ? m.operationalRoles : [],
          user: {
            ...m.user,
            name: m.user?.name || '-',
            email: m.user?.email || '',
            teamAccess: Array.isArray(m.user?.teamAccess) ? m.user.teamAccess : [],
          },
        })) as ClubMember[]
      setMembers(safe)
      setStaffClaims(
        (Array.isArray(claims) ? claims : []).filter(
          (claim) => claim.status === 'SUBMITTED' || claim.status === 'NEEDS_INFO',
        ),
      )
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [activeClub, canManageStaff, t])

  useEffect(() => {
    setLoading(true)
  }, [activeClub?.club.id, canManageStaff])

  useEffect(() => {
    if (loading) {
      void fetchMembers()
    }
  }, [fetchMembers, loading])

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const roleDelta = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
        if (roleDelta !== 0) return roleDelta
        const criticalDelta =
          countCriticalRoles(b.operationalRoles) - countCriticalRoles(a.operationalRoles)
        if (criticalDelta !== 0) return criticalDelta
        return a.user.name.localeCompare(b.user.name, 'de')
      }),
    [members],
  )

  const operationalCoverage = useMemo(
    () =>
      CRITICAL_ROLE_ORDER.map((role) => {
        const holders = sortedMembers.filter((m) => (m.operationalRoles ?? []).includes(role))
        return {
          role,
          count: holders.length,
          names: holders.map((m) => m.user.name),
        }
      }),
    [sortedMembers],
  )

  const operationalAssignmentsCount = useMemo(
    () => sortedMembers.filter((m) => (m.operationalRoles ?? []).length > 0).length,
    [sortedMembers],
  )

  const criticalCoverageCount = operationalCoverage.filter((e) => e.count > 0).length

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchMembers()
    } finally {
      setRefreshing(false)
    }
  }

  const getAvailableRoles = useCallback(
    (member: ClubMember): MembershipRole[] => {
      if (!activeClub || !canManageStaff || !user) return []
      if (member.userId === user.id) return []
      if (member.role === MembershipRole.OWNER) return []

      const hasCoachAssignments = (member.user.teamAccess ?? []).length > 0

      if (activeClub.role === MembershipRole.OWNER) {
        return [
          MembershipRole.ADMIN,
          MembershipRole.COACH,
          ...(hasCoachAssignments ? [] : [MembershipRole.PLAYER, MembershipRole.PARENT]),
        ].filter((r) => r !== member.role)
      }

      if (activeClub.role === MembershipRole.ADMIN) {
        if (member.role === MembershipRole.ADMIN) return []
        return [
          MembershipRole.COACH,
          ...(hasCoachAssignments ? [] : [MembershipRole.PLAYER, MembershipRole.PARENT]),
        ].filter((r) => r !== member.role)
      }

      return []
    },
    [activeClub, canManageStaff, user],
  )

  const canChangeRole = (member: ClubMember) => getAvailableRoles(member).length > 0
  const canChangeOps = (member: ClubMember) => {
    if (!activeClub || !canManageStaff) return false
    if (member.role === MembershipRole.OWNER && activeClub.role !== MembershipRole.OWNER)
      return false
    if (activeClub.role === MembershipRole.ADMIN && member.role === MembershipRole.ADMIN)
      return false
    return true
  }
  const canOffboard = (member: ClubMember) => {
    if (!user || !activeClub || !canManageStaff) return false
    if (member.userId === user.id) return false
    if (member.role === MembershipRole.OWNER) return false
    if (activeClub.role === MembershipRole.ADMIN && member.role === MembershipRole.ADMIN)
      return false
    return true
  }

  const submitRoleChange = async (member: ClubMember, role: MembershipRole) => {
    if (!activeClub) return
    setPendingAction({ userId: member.userId, kind: 'role' })
    try {
      await api(`/clubs/${activeClub.club.id}/members/${member.userId}/role`, {
        method: 'PATCH',
        body: { role },
      })
      await fetchMembers()
    } catch (error) {
      Alert.alert(t('common.error'), getRoleErrorMessage(error, t))
    } finally {
      setPendingAction(null)
    }
  }

  const reviewStaffClaim = async (claim: StaffClaim, decision: 'APPROVE' | 'REJECT') => {
    if (!activeClub) return
    setPendingAction({ userId: claim.claimant.id, kind: 'role' })
    try {
      await api(`/clubs/${activeClub.club.id}/staff-access-requests/${claim.id}/decision`, {
        method: 'POST',
        body: { decision },
      })
      await fetchMembers()
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.tryAgain'))
    } finally {
      setPendingAction(null)
    }
  }

  const submitOperationalRoles = async (
    member: ClubMember,
    operationalRoles: ClubOperationalRole[],
  ) => {
    if (!activeClub) return
    setPendingAction({ userId: member.userId, kind: 'operations' })
    try {
      await api(`/clubs/${activeClub.club.id}/members/${member.userId}/operational-roles`, {
        method: 'PATCH',
        body: { operationalRoles },
      })
      await fetchMembers()
    } catch (error) {
      Alert.alert(t('common.error'), getOperationalRoleErrorMessage(error, t))
    } finally {
      setPendingAction(null)
    }
  }

  const offboardMember = async (member: ClubMember, preservePlayerAccess: boolean) => {
    if (!activeClub) return
    setPendingAction({ userId: member.userId, kind: 'offboard' })
    try {
      await api(`/clubs/${activeClub.club.id}/members/${member.userId}/offboard`, {
        method: 'POST',
        body: { preservePlayerAccess },
      })
      await fetchMembers()
      Alert.alert(
        t('clubStaff.offboardSuccessTitle'),
        t('clubStaff.offboardSuccessBody', { name: member.user.name }),
      )
    } catch (error) {
      Alert.alert(t('common.error'), getOffboardErrorMessage(error, t))
    } finally {
      setPendingAction(null)
    }
  }

  const openOffboardPrompt = (member: ClubMember) => {
    Alert.alert(
      t('clubStaff.offboardTitle', { name: member.user.name }),
      t('clubStaff.offboardBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('clubStaff.offboardKeepAccess'),
          onPress: () => void offboardMember(member, true),
        },
        {
          text: t('clubStaff.offboardRemoveAllAccess'),
          style: 'destructive',
          onPress: () => void offboardMember(member, false),
        },
      ],
    )
  }

  /** iOS-native action sheet — tap row → choose action. */
  const openMemberActions = (member: ClubMember) => {
    const actions: Array<{
      label: string
      perform: () => void
      destructive?: boolean
      disabled?: boolean
    }> = [
      {
        label: t('clubStaff.changeRoleCta'),
        perform: () => setRoleSheetMember(member),
        disabled: !canChangeRole(member),
      },
      {
        label: t('clubStaff.operationalRolesCta'),
        perform: () => setOperationsSheetMember(member),
        disabled: !canChangeOps(member),
      },
      {
        label: t('clubStaff.offboardCta'),
        perform: () => openOffboardPrompt(member),
        destructive: true,
        disabled: !canOffboard(member),
      },
    ]

    const enabled = actions.filter((a) => !a.disabled)
    if (enabled.length === 0) {
      Alert.alert(
        member.user.name,
        t('clubStaff.noActionsAvailable', {
          defaultValue: 'No actions are available for this member.',
        }),
      )
      return
    }

    if (Platform.OS === 'ios') {
      const labels = [...enabled.map((a) => a.label), t('common.cancel')]
      const cancelButtonIndex = labels.length - 1
      const destructiveIndex = enabled.findIndex((a) => a.destructive)
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: member.user.name,
          options: labels,
          cancelButtonIndex,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        },
        (idx) => {
          if (idx !== undefined && idx >= 0 && idx < enabled.length) {
            enabled[idx]?.perform()
          }
        },
      )
      return
    }

    Alert.alert(member.user.name, undefined, [
      ...enabled.map((a) => ({
        text: a.label,
        style: a.destructive ? ('destructive' as const) : undefined,
        onPress: a.perform,
      })),
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }

  if (!activeClub) {
    return (
      <Screen
        header={<ModalHeader title={t('clubStaff.screenTitle')} mode="back" />}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
        <View style={styles.centerState}>
          <Text variant="body" color="secondary" align="center">
            {t('clubStaff.noClubBody')}
          </Text>
        </View>
      </Screen>
    )
  }

  if (!canManageStaff) {
    return (
      <Screen
        header={<ModalHeader title={t('clubStaff.screenTitle')} mode="back" />}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
        <View style={styles.centerState}>
          <Text variant="body" color="secondary" align="center">
            {t('clubStaff.accessDeniedBody')}
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      header={<ModalHeader title={t('clubStaff.screenTitle')} mode="back" />}
      scroll
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {loadError ? (
        <Banner
          tone="error"
          title={t('clubStaff.loadErrorTitle', { defaultValue: 'Staff could not be loaded' })}
          description={t('clubStaff.loadError')}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void fetchMembers(),
          }}
          style={styles.section}
        />
      ) : null}

      <SectionGroup
        header={t('clubStaff.addStaff', { defaultValue: 'Add staff' })}
        footer={t('clubStaff.addStaffHelp', {
          defaultValue:
            'Invite a coach to one team. Coach access never grants club administration rights.',
        })}
        style={styles.section}
      >
        <ListRow
          left={<SettingsIcon name="person.badge.plus" tint={SettingsIconTint.red} />}
          title={t('clubStaff.inviteCoach', { defaultValue: 'Invite a coach' })}
          subtitle={t('clubStaff.inviteCoachBody', {
            defaultValue: 'Send an identity-bound email invitation and choose their team role.',
          })}
          subtitleNumberOfLines={2}
          showChevron
          onPress={() =>
            router.push({ pathname: '/invite', params: { mode: 'coach', returnTo: '/club-staff' } })
          }
        />
      </SectionGroup>

      {/* Overview section — 3 stats as iOS Settings rows. */}
      <SectionGroup
        header={t('clubStaff.overview', { defaultValue: 'Overview' })}
        style={styles.section}
      >
        <ListRow
          left={<SettingsIcon name="person.2.fill" tint={SettingsIconTint.gray} />}
          title={t('clubStaff.summaryMembers')}
          right={
            <Text variant="body" color="secondary" tabular>
              {String(sortedMembers.length)}
            </Text>
          }
        />
        <ListRow
          left={<SettingsIcon name="shield.fill" tint={SettingsIconTint.gray} />}
          title={t('clubStaff.summaryOperational')}
          right={
            <Text variant="body" color="secondary" tabular>
              {String(operationalAssignmentsCount)}
            </Text>
          }
        />
        <ListRow
          left={<SettingsIcon name="checkmark.seal.fill" tint={SettingsIconTint.gray} />}
          title={t('clubStaff.summaryCritical')}
          right={
            <StatusPill
              label={`${criticalCoverageCount}/${CRITICAL_ROLE_ORDER.length}`}
              tone={criticalCoverageCount === CRITICAL_ROLE_ORDER.length ? 'success' : 'warning'}
            />
          }
        />
      </SectionGroup>

      {staffClaims.length > 0 ? (
        <SectionGroup
          header={t('clubStaff.accessRequests', { defaultValue: 'Staff access requests' })}
          footer={t('clubStaff.accessRequestsHint', {
            defaultValue:
              'Approving a coach grants only the selected team roles. Admin authority remains separate.',
          })}
          style={styles.section}
        >
          {staffClaims.map((claim) => {
            const canApproveClaim =
              claim.desiredRole !== 'ADMIN' || activeClub?.role === MembershipRole.OWNER
            const requestedRoles = claim.requestedTeamRoles
              .map((role) => t(`teamRoles.${role}`, { defaultValue: role }))
              .join(', ')
            return (
              <ListRow
                key={claim.id}
                left={
                  <Avatar
                    size="md"
                    src={claim.claimant.avatarUrl}
                    fallbackText={claim.claimant.name}
                  />
                }
                title={claim.claimant.name}
                subtitle={`${t(`roles.${claim.desiredRole}`, { defaultValue: claim.desiredRole })} · ${requestedRoles || t('clubStaff.noTeamRole', { defaultValue: 'No team role' })}${!canApproveClaim ? ` · ${t('clubStaff.ownerApprovalRequired', { defaultValue: 'Owner approval required' })}` : ''}`}
                subtitleNumberOfLines={2}
                right={
                  <View style={styles.requestActions}>
                    {canApproveClaim ? (
                      <Pressable
                        accessibilityRole="button"
                        style={styles.requestButton}
                        onPress={() => void reviewStaffClaim(claim, 'APPROVE')}
                      >
                        <Text variant="footnote" weight="semibold" color="primary">
                          {t('pendingRequests.approve')}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      style={styles.requestButton}
                      onPress={() => void reviewStaffClaim(claim, 'REJECT')}
                    >
                      <Text variant="footnote" weight="semibold" color="error">
                        {t('pendingRequests.reject')}
                      </Text>
                    </Pressable>
                  </View>
                }
              />
            )
          })}
        </SectionGroup>
      ) : null}

      {/* Critical role coverage — each role as its own row. */}
      <SectionGroup
        header={t('clubStaff.coverageTitle')}
        footer={t('clubStaff.coverageBody')}
        style={styles.section}
      >
        {operationalCoverage.map((entry) => (
          <ListRow
            key={entry.role}
            left={<SettingsIcon name="shield.fill" tint={SettingsIconTint.gray} />}
            title={t(`clubStaff.operationalRole.${entry.role}`)}
            subtitle={entry.count > 0 ? entry.names.join(', ') : undefined}
            subtitleNumberOfLines={2}
            right={
              entry.count > 0 ? (
                <StatusPill label={String(entry.count)} tone="success" />
              ) : (
                <StatusPill label={t('clubStaff.coverageOpen')} tone="warning" />
              )
            }
          />
        ))}
      </SectionGroup>

      {/* Members — one row per member, tap → iOS action sheet. */}
      <SectionGroup
        header={t('clubStaff.membersSection', { defaultValue: 'Staff & members' })}
        style={styles.section}
      >
        {loading ? (
          <View style={styles.inlineLoader}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : sortedMembers.length === 0 ? (
          <ListRow
            left={<SettingsIcon name="info.circle.fill" tint={SettingsIconTint.gray} />}
            title={t('clubStaff.emptyTitle', { defaultValue: 'No staff yet' })}
            subtitle={t('clubStaff.emptyBody')}
            subtitleNumberOfLines={3}
          />
        ) : (
          sortedMembers.map((m) => {
            const isPending = pendingAction?.userId === m.userId
            const ops = m.operationalRoles ?? []
            const opLabels = ops.map((r) => t(`clubStaff.operationalRole.${r}`)).join(', ')

            return (
              <ListRow
                key={m.id}
                left={<Avatar size="md" src={m.user.avatarUrl} fallbackText={m.user.name} />}
                title={m.user.name}
                subtitle={opLabels || undefined}
                right={
                  isPending ? (
                    <ActivityIndicator size="small" color={c.primary} />
                  ) : (
                    <Badge label={t(`roles.${m.role}`)} variant="neutral" />
                  )
                }
                showChevron={!isPending}
                onPress={() => openMemberActions(m)}
              />
            )
          })
        )}
      </SectionGroup>

      <SelectionSheet
        visible={!!roleSheetMember}
        title={t('clubStaff.roleChoiceTitle', {
          name: roleSheetMember?.user.name || '',
        })}
        description={t('clubStaff.roleChoiceBody')}
        options={
          roleSheetMember
            ? getAvailableRoles(roleSheetMember).map((role) => ({
                label: t(`roles.${role}`),
                value: role,
              }))
            : []
        }
        selectedValue={roleSheetMember?.role || MembershipRole.PLAYER}
        onSelect={(role) => {
          if (roleSheetMember) void submitRoleChange(roleSheetMember, role)
        }}
        onClose={() => setRoleSheetMember(null)}
      />

      <MultiSelectSheet
        visible={!!operationsSheetMember}
        title={t('clubStaff.operationalRolesSheetTitle', {
          name: operationsSheetMember?.user.name || '',
        })}
        description={
          activeClub.role === MembershipRole.ADMIN
            ? t('clubStaff.operationalRolesSheetBodyAdmin')
            : t('clubStaff.operationalRolesSheetBodyOwner')
        }
        options={OPERATIONAL_ROLE_ORDER.map((role) => ({
          label: t(`clubStaff.operationalRole.${role}`),
          value: role,
          disabled:
            activeClub.role === MembershipRole.ADMIN && CRITICAL_OPERATIONAL_ROLES.has(role),
        }))}
        selectedValues={operationsSheetMember?.operationalRoles || []}
        saveLabel={t('common.save')}
        onSave={(roles) => {
          if (operationsSheetMember) void submitOperationalRoles(operationsSheetMember, roles)
        }}
        onClose={() => setOperationsSheetMember(null)}
      />
    </Screen>
  )
}

function countCriticalRoles(roles: ClubOperationalRole[]) {
  return roles.filter((r) => CRITICAL_OPERATIONAL_ROLES.has(r)).length
}
function canKeepSquadAssignments(roles: MembershipRole[]) {
  return roles.some((r) => STAFF_ROLES.has(r))
}
// Preserved for future inline reassignment guards (e.g., re-enabling
// pre-flight role validation before opening the SelectionSheet).
void canKeepSquadAssignments

function getRoleErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Reassign squad coaching responsibilities')) {
    return t('clubStaff.reassignRequiredBody')
  }
  if (message.includes('You cannot change your own club role')) {
    return t('clubStaff.selfLockedBody')
  }
  if (message.includes('Only club owners can assign admin role')) {
    return t('clubStaff.adminPromotionBlockedBody')
  }
  if (message.includes('Admins cannot change other admins')) {
    return t('clubStaff.adminLockedBody')
  }
  if (message.includes('Owner role cannot be changed')) {
    return t('clubStaff.ownerLockedBody')
  }
  return t('clubStaff.roleUpdateError')
}

function getOperationalRoleErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Only club owners can assign secretary or treasurer')) {
    return t('clubStaff.criticalRoleOwnerOnlyBody')
  }
  if (message.includes('Admins cannot change other admins')) {
    return t('clubStaff.adminLockedBody')
  }
  return t('clubStaff.operationalRolesSaveError')
}

function getOffboardErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('You cannot offboard your own club access')) {
    return t('clubStaff.selfLockedBody')
  }
  if (message.includes('Owner role cannot be changed')) {
    return t('clubStaff.ownerLockedBody')
  }
  if (message.includes('Admins cannot change other admins')) {
    return t('clubStaff.adminLockedBody')
  }
  if (message.includes('Reassign secretary or treasurer responsibilities before offboarding')) {
    return t('clubStaff.criticalRoleReassignBody')
  }
  return t('clubStaff.offboardError')
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
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  inlineLoader: {
    paddingVertical: space.xl,
    alignItems: 'center',
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  requestButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
})
