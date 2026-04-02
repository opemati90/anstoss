import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  ClubCapability,
  ClubOperationalRole,
  MembershipRole,
} from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { MultiSelectSheet } from '../src/components/MultiSelectSheet'
import { SelectionSheet } from '../src/components/SelectionSheet'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  fontSize,
  fonts,
  lineHeight,
  neutralColors,
  radius,
  semanticColors,
  space,
  TAB_BAR_CLEARANCE,
} from '../src/theme/tokens'

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
        group: {
          id: string
          displayName: string
        }
      }
    }>
  }
}

type PendingAction =
  | { userId: string; kind: 'role' }
  | { userId: string; kind: 'operations' }
  | { userId: string; kind: 'offboard' }
  | null

type ActionState = {
  disabled: boolean
  reason?: string
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

const CAPABILITY_ORDER: ClubCapability[] = [
  ClubCapability.INVITES,
  ClubCapability.ROSTER,
  ClubCapability.EVENTS,
  ClubCapability.COMMUNICATIONS,
  ClubCapability.PUBLIC_PROFILE,
  ClubCapability.BILLING,
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
  const theme = useClubColors()
  const [members, setMembers] = useState<ClubMember[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [roleSheetMember, setRoleSheetMember] = useState<ClubMember | null>(null)
  const [operationsSheetMember, setOperationsSheetMember] = useState<ClubMember | null>(
    null,
  )

  const canManageStaff =
    activeClub?.role === MembershipRole.OWNER ||
    activeClub?.role === MembershipRole.ADMIN

  const fetchMembers = useCallback(async () => {
    if (!activeClub || !canManageStaff) {
      setMembers([])
      setLoading(false)
      return
    }

    try {
      const data = await api<ClubMember[]>(`/clubs/${activeClub.club.id}/members`)
      setMembers(data || [])
    } catch {
      Alert.alert(t('common.error'), t('clubStaff.loadError'))
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
        if (roleDelta !== 0) {
          return roleDelta
        }

        const criticalDelta =
          countCriticalRoles(b.operationalRoles) - countCriticalRoles(a.operationalRoles)
        if (criticalDelta !== 0) {
          return criticalDelta
        }

        return a.user.name.localeCompare(b.user.name, 'de')
      }),
    [members],
  )

  const operationalCoverage = useMemo(
    () =>
      CRITICAL_ROLE_ORDER.map((role) => {
        const holders = sortedMembers.filter((member) =>
          member.operationalRoles.includes(role),
        )

        return {
          role,
          count: holders.length,
          names: holders.map((member) => member.user.name),
        }
      }),
    [sortedMembers],
  )

  const operationalAssignmentsCount = useMemo(
    () =>
      sortedMembers.filter((member) => member.operationalRoles.length > 0).length,
    [sortedMembers],
  )

  const criticalCoverageCount = operationalCoverage.filter(
    (entry) => entry.count > 0,
  ).length

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchMembers()
    } finally {
      setRefreshing(false)
    }
  }

  const getAvailableRoles = useCallback(
    (member: ClubMember) => {
      if (!activeClub || !canManageStaff || !user) {
        return [] as MembershipRole[]
      }

      if (member.userId === user.id) {
        return [] as MembershipRole[]
      }

      if (member.role === MembershipRole.OWNER) {
        return [] as MembershipRole[]
      }

      const hasCoachAssignments = member.user.teamAccess.length > 0

      if (activeClub.role === MembershipRole.OWNER) {
        return [
          MembershipRole.ADMIN,
          MembershipRole.COACH,
          ...(hasCoachAssignments ? [] : [MembershipRole.PLAYER, MembershipRole.PARENT]),
        ].filter((role) => role !== member.role)
      }

      if (activeClub.role === MembershipRole.ADMIN) {
        if (member.role === MembershipRole.ADMIN) {
          return [] as MembershipRole[]
        }

        return [
          MembershipRole.COACH,
          ...(hasCoachAssignments ? [] : [MembershipRole.PLAYER, MembershipRole.PARENT]),
        ].filter((role) => role !== member.role)
      }

      return [] as MembershipRole[]
    },
    [activeClub, canManageStaff, user],
  )

  const getRoleActionState = useCallback(
    (member: ClubMember): ActionState => {
      if (!user || !activeClub) {
        return {
          disabled: true,
          reason: t('clubStaff.roleLockedGeneric'),
        }
      }

      const availableRoles = getAvailableRoles(member)
      if (availableRoles.length > 0) {
        return { disabled: false }
      }

      if (member.userId === user.id) {
        return {
          disabled: true,
          reason: t('clubStaff.selfLocked'),
        }
      }

      if (member.role === MembershipRole.OWNER) {
        return {
          disabled: true,
          reason: t('clubStaff.ownerLocked'),
        }
      }

      if (
        activeClub.role === MembershipRole.ADMIN &&
        member.role === MembershipRole.ADMIN
      ) {
        return {
          disabled: true,
          reason: t('clubStaff.adminLocked'),
        }
      }

      if (
        member.user.teamAccess.length > 0 &&
        !canKeepSquadAssignments(availableRoles)
      ) {
        return {
          disabled: true,
          reason: t('clubStaff.reassignLocked'),
        }
      }

      return {
        disabled: true,
        reason: t('clubStaff.roleLockedGeneric'),
      }
    },
    [activeClub, getAvailableRoles, t, user],
  )

  const getOperationalRoleActionState = useCallback(
    (member: ClubMember): ActionState => {
      if (!activeClub || !canManageStaff) {
        return {
          disabled: true,
          reason: t('clubStaff.accessDeniedBody'),
        }
      }

      if (
        member.role === MembershipRole.OWNER &&
        activeClub.role !== MembershipRole.OWNER
      ) {
        return {
          disabled: true,
          reason: t('clubStaff.ownerLocked'),
        }
      }

      if (
        activeClub.role === MembershipRole.ADMIN &&
        member.role === MembershipRole.ADMIN
      ) {
        return {
          disabled: true,
          reason: t('clubStaff.adminLocked'),
        }
      }

      return { disabled: false }
    },
    [activeClub, canManageStaff, t],
  )

  const getOffboardActionState = useCallback(
    (member: ClubMember): ActionState => {
      if (!user || !activeClub || !canManageStaff) {
        return {
          disabled: true,
          reason: t('clubStaff.accessDeniedBody'),
        }
      }

      if (member.userId === user.id) {
        return {
          disabled: true,
          reason: t('clubStaff.selfLocked'),
        }
      }

      if (member.role === MembershipRole.OWNER) {
        return {
          disabled: true,
          reason: t('clubStaff.ownerLocked'),
        }
      }

      if (
        activeClub.role === MembershipRole.ADMIN &&
        member.role === MembershipRole.ADMIN
      ) {
        return {
          disabled: true,
          reason: t('clubStaff.adminLocked'),
        }
      }

      return { disabled: false }
    },
    [activeClub, canManageStaff, t, user],
  )

  const submitRoleChange = async (member: ClubMember, role: MembershipRole) => {
    if (!activeClub) {
      return
    }

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

  const submitOperationalRoles = async (
    member: ClubMember,
    operationalRoles: ClubOperationalRole[],
  ) => {
    if (!activeClub) {
      return
    }

    setPendingAction({ userId: member.userId, kind: 'operations' })
    try {
      await api(
        `/clubs/${activeClub.club.id}/members/${member.userId}/operational-roles`,
        {
          method: 'PATCH',
          body: { operationalRoles },
        },
      )
      await fetchMembers()
    } catch (error) {
      Alert.alert(t('common.error'), getOperationalRoleErrorMessage(error, t))
    } finally {
      setPendingAction(null)
    }
  }

  const offboardMember = async (
    member: ClubMember,
    preservePlayerAccess: boolean,
  ) => {
    if (!activeClub) {
      return
    }

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
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('clubStaff.offboardKeepAccess'),
          onPress: () => {
            void offboardMember(member, true)
          },
        },
        {
          text: t('clubStaff.offboardRemoveAllAccess'),
          style: 'destructive',
          onPress: () => {
            void offboardMember(member, false)
          },
        },
      ],
    )
  }

  const renderMember = ({ item }: { item: ClubMember }) => {
    const roleAction = getRoleActionState(item)
    const operationsAction = getOperationalRoleActionState(item)
    const offboardAction = getOffboardActionState(item)
    const initials = item.user.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    const teamAssignments = item.user.teamAccess
      .map((entry) => entry.team.displayName)
      .join(', ')
    const enabledCapabilities = CAPABILITY_ORDER.filter(
      (capability) => item.permissions?.[capability],
    )
    const helperMessage = [
      roleAction.reason,
      operationsAction.reason,
      offboardAction.reason,
    ].find(Boolean)
    const showHelperMessage =
      roleAction.disabled && operationsAction.disabled && offboardAction.disabled
    const isRolePending =
      pendingAction?.userId === item.userId && pendingAction.kind === 'role'
    const isOperationsPending =
      pendingAction?.userId === item.userId && pendingAction.kind === 'operations'
    const isOffboardPending =
      pendingAction?.userId === item.userId && pendingAction.kind === 'offboard'

    return (
      <View style={styles.memberCard}>
        {item.user.avatarUrl ? (
          <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: theme.clubPrimaryLight }]}>
            <Text style={[styles.avatarInitials, { color: theme.clubPrimary }]}>
              {initials}
            </Text>
          </View>
        )}

        <View style={styles.memberBody}>
          <View style={styles.memberHeader}>
            <View style={styles.memberCopy}>
              <Text style={styles.memberName}>{item.user.name}</Text>
              <Text style={styles.memberMeta}>{item.user.email}</Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: theme.clubPrimaryLight }]}>
              <Text style={[styles.roleBadgeText, { color: theme.clubPrimary }]}>
                {t(`roles.${item.role}`)}
              </Text>
            </View>
          </View>

          {teamAssignments ? (
            <Text style={styles.assignmentText}>
              {t('clubStaff.teamAssignments', { teams: teamAssignments })}
            </Text>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t('clubStaff.operationalRolesTitle')}</Text>
            {item.operationalRoles.length > 0 ? (
              <View style={styles.chipRow}>
                {item.operationalRoles.map((role) => (
                  <View key={role} style={styles.neutralChip}>
                    <Text style={styles.neutralChipText}>
                      {t(`clubStaff.operationalRole.${role}`)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyLine}>{t('clubStaff.operationalRolesEmpty')}</Text>
            )}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockLabel}>{t('clubStaff.capabilitiesTitle')}</Text>
            {enabledCapabilities.length > 0 ? (
              <View style={styles.chipRow}>
                {enabledCapabilities.map((capability) => (
                  <View key={capability} style={styles.capabilityChip}>
                    <Text style={styles.capabilityChipText}>
                      {t(`clubStaff.capability.${capability}`)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyLine}>{t('clubStaff.capabilitiesEmpty')}</Text>
            )}
          </View>

          <View style={styles.actionsRow}>
            <ActionButton
              label={t('clubStaff.changeRoleCta')}
              onPress={() => setRoleSheetMember(item)}
              disabled={roleAction.disabled || isRolePending}
              loading={isRolePending}
              color={theme.clubPrimary}
            />
            <ActionButton
              label={t('clubStaff.operationalRolesCta')}
              onPress={() => setOperationsSheetMember(item)}
              disabled={operationsAction.disabled || isOperationsPending}
              loading={isOperationsPending}
              color={theme.clubPrimary}
            />
          </View>

          <ActionButton
            label={t('clubStaff.offboardCta')}
            onPress={() => openOffboardPrompt(item)}
            disabled={offboardAction.disabled || isOffboardPending}
            loading={isOffboardPending}
            color={semanticColors.error}
            destructive
            fullWidth
          />

          {showHelperMessage && helperMessage ? (
            <Text style={styles.helperText}>{helperMessage}</Text>
          ) : null}
        </View>
      </View>
    )
  }

  const roleSheetOptions = useMemo(
    () =>
      roleSheetMember
        ? getAvailableRoles(roleSheetMember).map((role) => ({
            label: t(`roles.${role}`),
            value: role,
          }))
        : [],
    [getAvailableRoles, roleSheetMember, t],
  )

  const operationalRoleOptions = useMemo(
    () =>
      OPERATIONAL_ROLE_ORDER.map((role) => ({
        label: t(`clubStaff.operationalRole.${role}`),
        value: role,
        disabled:
          activeClub?.role === MembershipRole.ADMIN &&
          CRITICAL_OPERATIONAL_ROLES.has(role),
      })),
    [activeClub?.role, t],
  )

  if (!activeClub) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('clubStaff.screenTitle')} />
        <View style={styles.centerState}>
          <Text style={styles.centerStateText}>{t('clubStaff.noClubBody')}</Text>
        </View>
      </View>
    )
  }

  if (!canManageStaff) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('clubStaff.screenTitle')} />
        <View style={styles.centerState}>
          <Text style={styles.centerStateText}>{t('clubStaff.accessDeniedBody')}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('clubStaff.screenTitle')} />

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={theme.clubPrimary} />
        </View>
      ) : (
        <FlatList
          data={sortedMembers}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.headerStack}>
              <View style={styles.hero}>
                <Text style={styles.eyebrow}>{t('clubStaff.eyebrow')}</Text>
                <Text style={styles.title}>{t('clubStaff.title')}</Text>
                <Text style={styles.subtitle}>
                  {t('clubStaff.subtitle', { clubName: activeClub.club.name })}
                </Text>
              </View>

              <View style={styles.summaryGrid}>
                <SummaryCard
                  value={String(sortedMembers.length)}
                  label={t('clubStaff.summaryMembers')}
                  accentColor={theme.clubPrimary}
                />
                <SummaryCard
                  value={String(operationalAssignmentsCount)}
                  label={t('clubStaff.summaryOperational')}
                  accentColor={theme.clubPrimary}
                />
                <SummaryCard
                  value={`${criticalCoverageCount}/${CRITICAL_ROLE_ORDER.length}`}
                  label={t('clubStaff.summaryCritical')}
                  accentColor={theme.clubPrimary}
                />
              </View>

              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>{t('clubStaff.coverageTitle')}</Text>
                <Text style={styles.noteBody}>{t('clubStaff.coverageBody')}</Text>
                <View style={styles.coverageList}>
                  {operationalCoverage.map((entry) => (
                    <View key={entry.role} style={styles.coverageRow}>
                      <Text style={styles.coverageLabel}>
                        {t(`clubStaff.operationalRole.${entry.role}`)}
                      </Text>
                      <Text
                        style={[
                          styles.coverageValue,
                          {
                            color:
                              entry.count > 0
                                ? semanticColors.success
                                : semanticColors.error,
                          },
                        ]}
                      >
                        {entry.count > 0
                          ? t('clubStaff.coverageAssigned', {
                              names: entry.names.join(', '),
                            })
                          : t('clubStaff.coverageOpen')}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.noteCard}>
                <Text style={styles.noteTitle}>{t('clubStaff.noteTitle')}</Text>
                <Text style={styles.noteBody}>{t('clubStaff.noteBody')}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Text style={styles.centerStateText}>{t('clubStaff.emptyBody')}</Text>
            </View>
          }
        />
      )}

      <SelectionSheet
        visible={!!roleSheetMember}
        title={t('clubStaff.roleChoiceTitle', {
          name: roleSheetMember?.user.name || '',
        })}
        description={t('clubStaff.roleChoiceBody')}
        options={roleSheetOptions}
        selectedValue={roleSheetMember?.role || MembershipRole.PLAYER}
        onSelect={(role) => {
          if (roleSheetMember) {
            void submitRoleChange(roleSheetMember, role)
          }
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
        options={operationalRoleOptions}
        selectedValues={operationsSheetMember?.operationalRoles || []}
        saveLabel={t('common.save')}
        onSave={(roles) => {
          if (operationsSheetMember) {
            void submitOperationalRoles(operationsSheetMember, roles)
          }
        }}
        onClose={() => setOperationsSheetMember(null)}
      />
    </View>
  )
}

function SummaryCard({
  value,
  label,
  accentColor,
}: {
  value: string
  label: string
  accentColor: string
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function ActionButton({
  label,
  onPress,
  disabled,
  loading,
  color,
  destructive = false,
  fullWidth = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  color: string
  destructive?: boolean
  fullWidth?: boolean
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        fullWidth && styles.actionButtonFullWidth,
        destructive
          ? {
              backgroundColor: `${color}10`,
              borderColor: `${color}33`,
            }
          : {
              borderColor: color,
            },
        disabled && styles.actionButtonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Text
          style={[
            styles.actionButtonText,
            {
              color,
            },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

function canKeepSquadAssignments(roles: MembershipRole[]) {
  return roles.some((role) => STAFF_ROLES.has(role))
}

function countCriticalRoles(roles: ClubOperationalRole[]) {
  return roles.filter((role) => CRITICAL_OPERATIONAL_ROLES.has(role)).length
}

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

  if (
    message.includes('Reassign secretary or treasurer responsibilities before offboarding')
  ) {
    return t('clubStaff.criticalRoleReassignBody')
  }

  return t('clubStaff.offboardError')
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStack: {
    gap: space.md,
    paddingBottom: space.md,
  },
  hero: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.xs,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontFamily: fonts.heading,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  summaryCard: {
    flex: 1,
    minHeight: 92,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.xs,
  },
  summaryValue: {
    fontSize: fontSize['2xl'],
    fontFamily: fonts.heading,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  noteCard: {
    marginHorizontal: space.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  noteTitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  noteBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  coverageList: {
    gap: space.sm,
  },
  coverageRow: {
    gap: space['2xs'],
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  coverageLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  coverageValue: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  list: {
    paddingHorizontal: space.md,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    marginBottom: space.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  memberBody: {
    flex: 1,
    gap: space.sm,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  memberCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  memberName: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  memberMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  roleBadge: {
    minHeight: 28,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBadgeText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.heading,
    textTransform: 'uppercase',
  },
  assignmentText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  block: {
    gap: space.xs,
  },
  blockLabel: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.heading,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  neutralChip: {
    minHeight: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neutralChipText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  capabilityChip: {
    minHeight: 28,
    borderRadius: radius.full,
    backgroundColor: neutralColors.background,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capabilityChipText: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    textTransform: 'uppercase',
  },
  emptyLine: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  actionButtonFullWidth: {
    flex: 0,
    alignSelf: 'stretch',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.heading,
    textAlign: 'center',
  },
  helperText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textTertiary,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  centerStateText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    textAlign: 'center',
    color: neutralColors.textSecondary,
  },
})
