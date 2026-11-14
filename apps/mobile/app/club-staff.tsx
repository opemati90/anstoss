import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Platform,
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
  Banner,
  Button,
  ListRow,
  Screen,
  SectionGroup,
  SoftIcon,
  Text,
} from '../src/components/ui'
import { Skeleton } from '../src/components/Skeleton'
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
  ClubOperationalRole.MEDIA_MANAGER,
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
  const [officeSheet, setOfficeSheet] = useState<ClubOperationalRole | null>(null)

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

  // The staff list is people with a function in the club — not all 126
  // members (those live in the Mitgliederliste).
  const staffMembers = useMemo(
    () =>
      sortedMembers.filter(
        (m) => STAFF_ROLES.has(m.role) || (m.operationalRoles ?? []).length > 0,
      ),
    [sortedMembers],
  )
  const canAssignCriticalOffice = activeClub?.role === MembershipRole.OWNER

  const assignOffice = async (office: ClubOperationalRole, userId: string) => {
    const member = members.find((m) => m.userId === userId)
    if (!member) return
    const next = Array.from(new Set([...(member.operationalRoles ?? []), office]))
    await submitOperationalRoles(member, next)
  }

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
        body: {
          decision,
          note:
            decision === 'APPROVE'
              ? t('verein.offices.claimApprovedNote')
              : t('verein.offices.claimRejectedNote'),
        },
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
        header={<ModalHeader title={t('verein.offices.title')} mode="back" />}
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
        header={<ModalHeader title={t('verein.offices.title')} mode="back" />}
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
      header={<ModalHeader title={t('verein.offices.title')} mode="back" />}
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

      {/* Pflichtämter first: an unfilled Kassenwart is the thing to fix. */}
      <SectionGroup
        header={t('verein.offices.required')}
        footer={
          canAssignCriticalOffice
            ? t('verein.offices.requiredHint')
            : t('verein.offices.requiredOwnerOnly')
        }
        style={styles.section}
      >
        {loading ? (
          <View style={styles.skeletonRows}>
            <Skeleton shape="card" height={52} />
            <Skeleton shape="card" height={52} />
          </View>
        ) : (
          operationalCoverage.map((entry) => (
            <ListRow
              key={entry.role}
              left={<SoftIcon name="person.badge.key" color={entry.count > 0 ? undefined : c.warning} />}
              title={t(`verein.office.${entry.role}`)}
              subtitle={entry.count > 0 ? entry.names.join(', ') : t('verein.offices.unfilled')}
              subtitleNumberOfLines={2}
              right={
                entry.count === 0 && canAssignCriticalOffice ? (
                  <Text variant="subheadline" weight="semibold" color="tint">
                    {t('aufgaben.fill')}
                  </Text>
                ) : undefined
              }
              showChevron={canAssignCriticalOffice}
              onPress={canAssignCriticalOffice ? () => setOfficeSheet(entry.role) : undefined}
            />
          ))
        )}
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
            const busy = pendingAction?.userId === claim.claimant.id
            return (
              <View key={claim.id} style={styles.claimRow}>
                <View style={styles.claimHead}>
                  <Avatar size="md" src={claim.claimant.avatarUrl} fallbackText={claim.claimant.name} />
                  <View style={styles.claimText}>
                    <Text variant="body" weight="semibold" color="primary" numberOfLines={1}>
                      {claim.claimant.name}
                    </Text>
                    <Text variant="footnote" color="secondary" numberOfLines={2}>
                      {[
                        t(`verein.roleLabel.${claim.desiredRole}`, { defaultValue: claim.desiredRole }),
                        requestedRoles || t('clubStaff.noTeamRole', { defaultValue: 'No team role' }),
                        !canApproveClaim
                          ? t('clubStaff.ownerApprovalRequired', { defaultValue: 'Owner approval required' })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={styles.claimActions}>
                  <Button
                    label={t('pendingRequests.reject')}
                    variant="plain"
                    size="sm"
                    disabled={busy}
                    onPress={() => void reviewStaffClaim(claim, 'REJECT')}
                  />
                  {canApproveClaim ? (
                    <Button
                      label={t('pendingRequests.approve')}
                      variant="filled"
                      size="sm"
                      loading={busy}
                      disabled={busy}
                      onPress={() => void reviewStaffClaim(claim, 'APPROVE')}
                    />
                  ) : null}
                </View>
              </View>
            )
          })}
        </SectionGroup>
      ) : null}

      {/* People with a function: Vorstand, Admins, Trainer, office holders. */}
      <SectionGroup
        header={t('verein.offices.staff')}
        footer={t('verein.offices.staffHint')}
        style={styles.section}
      >
        {loading ? (
          <View style={styles.skeletonRows}>
            <Skeleton shape="card" height={60} />
            <Skeleton shape="card" height={60} />
            <Skeleton shape="card" height={60} />
          </View>
        ) : staffMembers.length === 0 ? (
          <ListRow
            left={<SoftIcon name="info.circle" />}
            title={t('clubStaff.emptyTitle', { defaultValue: 'No staff yet' })}
            subtitle={t('clubStaff.emptyBody')}
            subtitleNumberOfLines={3}
          />
        ) : (
          staffMembers.map((m) => {
            const isPending = pendingAction?.userId === m.userId
            const ops = (m.operationalRoles ?? []).map((r) =>
              r === ClubOperationalRole.TREASURER || r === ClubOperationalRole.SECRETARY
                ? t(`verein.office.${r}`)
                : t(`clubStaff.operationalRole.${r}`),
            )
            const teams = (m.user.teamAccess ?? []).map((a) => a.team.displayName)
            return (
              <ListRow
                key={m.id}
                left={<Avatar size="md" src={m.user.avatarUrl} fallbackText={m.user.name} />}
                title={m.user.name}
                subtitle={[t(`verein.memberRole.${m.role}`), ...ops, ...teams].join(' · ')}
                subtitleNumberOfLines={2}
                showChevron={!isPending}
                disabled={isPending}
                onPress={() => openMemberActions(m)}
              />
            )
          })
        )}
        <ListRow
          left={<SoftIcon name="person.badge.plus" />}
          title={t('clubStaff.inviteCoach', { defaultValue: 'Invite a coach' })}
          subtitle={t('clubStaff.inviteCoachBody')}
          subtitleNumberOfLines={2}
          showChevron
          onPress={() =>
            router.push({ pathname: '/invite', params: { mode: 'coach', returnTo: '/club-staff' } })
          }
        />
      </SectionGroup>

      <SelectionSheet
        visible={officeSheet !== null}
        title={officeSheet ? t('verein.offices.assignTitle', { office: t(`verein.office.${officeSheet}`) }) : ''}
        description={t('verein.offices.assignHint')}
        options={sortedMembers
          .filter((m) => STAFF_ROLES.has(m.role))
          .map((m) => ({ label: m.user.name, value: m.userId, description: t(`verein.memberRole.${m.role}`) }))}
        selectedValue={''}
        onSelect={(userId) => {
          const office = officeSheet
          setOfficeSheet(null)
          if (office) void assignOffice(office, userId)
        }}
        onClose={() => setOfficeSheet(null)}
      />

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
  skeletonRows: { padding: space.md, gap: space.sm },
  claimRow: { paddingHorizontal: space.md, paddingVertical: space.sm + space.xs, gap: space.sm },
  claimHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  claimText: { flex: 1, minWidth: 0, gap: space['2xs'] },
  claimActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.sm },
})
