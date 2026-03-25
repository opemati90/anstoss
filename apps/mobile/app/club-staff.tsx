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
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { MembershipRole } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { neutralColors } from '../src/theme/tokens'

type ClubMember = {
  id: string
  userId: string
  role: MembershipRole
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

const ROLE_ORDER: MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.COACH,
  MembershipRole.PLAYER,
  MembershipRole.PARENT,
]

const STAFF_ROLES = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.COACH,
])

export default function ClubStaffScreen() {
  const { t } = useTranslation()
  const { user, activeClub } = useAuth()
  const theme = useClubColors()
  const [members, setMembers] = useState<ClubMember[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

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
        if (roleDelta !== 0) return roleDelta
        return a.user.name.localeCompare(b.user.name, 'de')
      }),
    [members],
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchMembers()
    setRefreshing(false)
  }

  const getAvailableRoles = (member: ClubMember) => {
    if (!activeClub || !canManageStaff || !user) return [] as MembershipRole[]
    if (member.userId === user.id) return [] as MembershipRole[]
    if (member.role === MembershipRole.OWNER) return [] as MembershipRole[]

    const hasCoachAssignments = member.user.teamAccess.length > 0

    if (activeClub.role === MembershipRole.OWNER) {
      return [
        MembershipRole.ADMIN,
        MembershipRole.COACH,
        ...(hasCoachAssignments ? [] : [MembershipRole.PLAYER, MembershipRole.PARENT]),
      ].filter((role) => role !== member.role)
    }

    if (activeClub.role === MembershipRole.ADMIN) {
      if (member.role === MembershipRole.ADMIN) return [] as MembershipRole[]

      return [
        MembershipRole.COACH,
        ...(hasCoachAssignments ? [] : [MembershipRole.PLAYER, MembershipRole.PARENT]),
      ].filter((role) => role !== member.role)
    }

    return [] as MembershipRole[]
  }

  const getLockReason = (member: ClubMember) => {
    if (!user || !activeClub) return t('clubStaff.roleLockedGeneric')
    if (member.userId === user.id) return t('clubStaff.selfLocked')
    if (member.role === MembershipRole.OWNER) return t('clubStaff.ownerLocked')
    if (activeClub.role === MembershipRole.ADMIN && member.role === MembershipRole.ADMIN) {
      return t('clubStaff.adminLocked')
    }
    if (member.user.teamAccess.length > 0 && !canKeepSquadAssignments(getAvailableRoles(member))) {
      return t('clubStaff.reassignLocked')
    }

    return t('clubStaff.roleLockedGeneric')
  }

  const submitRoleChange = async (member: ClubMember, role: MembershipRole) => {
    if (!activeClub) return

    setUpdatingUserId(member.userId)
    try {
      await api(`/clubs/${activeClub.club.id}/members/${member.userId}/role`, {
        method: 'PATCH',
        body: { role },
      })
      await fetchMembers()
    } catch (error) {
      Alert.alert(
        t('common.error'),
        getRoleErrorMessage(error, t),
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  const openRolePicker = (member: ClubMember) => {
    const availableRoles = getAvailableRoles(member)

    if (availableRoles.length === 0) {
      return
    }

    Alert.alert(
      t('clubStaff.roleChoiceTitle', { name: member.user.name }),
      t('clubStaff.roleChoiceBody'),
      [
        ...availableRoles.map((role) => ({
          text: t(`roles.${role}`),
          onPress: () => {
            void submitRoleChange(member, role)
          },
        })),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ],
    )
  }

  const renderMember = ({ item }: { item: ClubMember }) => {
    const availableRoles = getAvailableRoles(item)
    const isLocked = availableRoles.length === 0
    const isUpdating = updatingUserId === item.userId
    const initials = item.user.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    const teamAssignments = item.user.teamAccess
      .map((entry) => entry.team.displayName)
      .join(', ')

    return (
      <View style={styles.memberCard}>
        {item.user.avatarUrl ? (
          <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: theme.clubPrimaryLight }]}>
            <Text style={[styles.avatarInitials, { color: theme.clubPrimary }]}>
              {initials}
            </Text>
          </View>
        )}

        <View style={styles.memberInfo}>
          <View style={styles.memberHeader}>
            <Text style={styles.memberName}>{item.user.name}</Text>
            <View style={[styles.roleBadge, { backgroundColor: theme.clubPrimaryLight }]}>
              <Text style={[styles.roleBadgeText, { color: theme.clubPrimary }]}>
                {t(`roles.${item.role}`)}
              </Text>
            </View>
          </View>
          <Text style={styles.memberMeta}>{item.user.email}</Text>
          {teamAssignments ? (
            <Text style={styles.memberMeta}>
              {t('clubStaff.teamAssignments', { teams: teamAssignments })}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.actionButton,
              isLocked && styles.actionButtonDisabled,
              !isLocked && { borderColor: theme.clubPrimary },
            ]}
            onPress={() => openRolePicker(item)}
            disabled={isLocked || isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color={theme.clubPrimary} />
            ) : (
              <Text
                style={[
                  styles.actionButtonText,
                  isLocked
                    ? styles.actionButtonTextDisabled
                    : { color: theme.clubPrimary },
                ]}
              >
                {isLocked
                  ? getLockReason(item)
                  : t('clubStaff.changeRoleCta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (!activeClub) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.centerStateText}>{t('clubStaff.noClubBody')}</Text>
      </View>
    )
  }

  if (!canManageStaff) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.centerStateText}>{t('clubStaff.accessDeniedBody')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('clubStaff.screenTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t('clubStaff.eyebrow')}</Text>
        <Text style={styles.title}>{t('clubStaff.title')}</Text>
        <Text style={styles.subtitle}>
          {t('clubStaff.subtitle', { clubName: activeClub.club.name })}
        </Text>
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>{t('clubStaff.noteTitle')}</Text>
        <Text style={styles.noteBody}>{t('clubStaff.noteBody')}</Text>
      </View>

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
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Text style={styles.centerStateText}>{t('clubStaff.emptyBody')}</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

function canKeepSquadAssignments(roles: MembershipRole[]) {
  return roles.some((role) => STAFF_ROLES.has(role))
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  headerSpacer: { width: 28 },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: neutralColors.textSecondary,
  },
  noteCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 6,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  noteBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  memberName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  memberMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  roleBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  actionButton: {
    marginTop: 12,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionButtonDisabled: {
    borderColor: neutralColors.border,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionButtonTextDisabled: {
    color: neutralColors.textSecondary,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  centerStateText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: neutralColors.textSecondary,
  },
})
