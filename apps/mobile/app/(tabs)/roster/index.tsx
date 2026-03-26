import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  TouchableOpacity,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { IllustratedEmptyState } from '../../../src/components/IllustratedEmptyState'
import { illustrations } from '../../../src/illustrations'
import { neutralColors, semanticColors } from '../../../src/theme/tokens'

type Member = {
  id: string
  role: string
  phase: 'FULL' | 'TRIAL'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED'
  createdAt: string
  position?: string | null
  jerseyNumber?: number | null
  loanedFromTeamId?: string | null
  loanedFromTeamName?: string | null
  user: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

const ROLE_ORDER = [
  'HEAD_COACH',
  'ASSISTANT_COACH',
  'OWNER',
  'ADMIN',
  'COACH',
  'PLAYER',
  'PARENT',
]

export default function RosterScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const [members, setMembers] = useState<Member[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null)

  const canManageTeam =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const fetchMembers = useCallback(async () => {
    if (!activeClub || !activeTeamId) return
    try {
      const data = await api<Member[]>(
        `/clubs/${activeClub.club.id}/members?teamId=${activeTeamId}`,
      )
      const sorted = (data || []).sort(
        (a, b) => {
          const trialDelta =
            Number(b.phase === 'TRIAL' && b.status === 'ACTIVE') -
            Number(a.phase === 'TRIAL' && a.status === 'ACTIVE')

          if (trialDelta !== 0) return trialDelta

          const roleDelta = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
          if (roleDelta !== 0) return roleDelta

          return a.user.name.localeCompare(b.user.name, 'de')
        },
      )
      setMembers(sorted)
    } catch {
      // Stale data is fine for this list.
    } finally {
      setLoading(false)
    }
  }, [activeClub, activeTeamId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchMembers()
    setRefreshing(false)
  }

  const submitTrialDecision = async (
    member: Member,
    decision: 'ACCEPT' | 'REJECT',
  ) => {
    if (!activeClub) return

    setUpdatingMemberId(member.id)
    try {
      await api(`/clubs/${activeClub.club.id}/team-access/${member.id}/decision`, {
        method: 'POST',
        body: { decision },
      })
      await fetchMembers()
    } catch {
      Alert.alert(t('common.error'), t('roster.trialActionError'))
    } finally {
      setUpdatingMemberId(null)
    }
  }

  const handleRejectTrial = (member: Member) => {
    Alert.alert(
      t('roster.rejectTrialTitle'),
      t('roster.rejectTrialBody', { name: member.user.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('roster.rejectTrialCta'),
          style: 'destructive',
          onPress: () => {
            void submitTrialDecision(member, 'REJECT')
          },
        },
      ],
    )
  }

  const pendingTrials = members.filter(
    (member) => member.phase === 'TRIAL' && member.status === 'ACTIVE',
  )

  const renderMember = ({ item }: { item: Member }) => {
    const name = item.user.name || t('roster.unknownMember')
    const initials = name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    const roleLabel =
      item.role === 'HEAD_COACH' || item.role === 'ASSISTANT_COACH'
        ? t(`teamRoles.${item.role}`)
        : t(`roles.${item.role}`)
    const showRoleBadge =
      item.role === 'HEAD_COACH' ||
      item.role === 'ASSISTANT_COACH' ||
      item.role === 'COACH' ||
      item.role === 'OWNER' ||
      item.role === 'ADMIN'
    const isTrial = item.phase === 'TRIAL' && item.status === 'ACTIVE'
    const isUpdating = updatingMemberId === item.id

    return (
      <View style={styles.memberCard}>
        {item.jerseyNumber != null ? (
          <View style={styles.jerseyBox}>
            <Text style={styles.jerseyText}>{item.jerseyNumber}</Text>
          </View>
        ) : null}
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
          <Text style={styles.memberName}>{name}</Text>
          <Text style={styles.memberRole}>
            {isTrial
              ? t('roster.trialMeta', {
                role: roleLabel,
                date: formatTrialDate(
                  item.createdAt,
                  i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE',
                ),
              })
              : item.position
                ? `${item.position} · ${roleLabel}`
                : roleLabel}
          </Text>

          {isTrial && canManageTeam ? (
            <View style={styles.trialActionRow}>
              <TouchableOpacity
                style={[
                  styles.trialApproveButton,
                  { backgroundColor: neutralColors.textPrimary },
                  isUpdating && styles.actionDisabled,
                ]}
                onPress={() => void submitTrialDecision(item, 'ACCEPT')}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={neutralColors.textInverse} />
                ) : (
                  <Text style={styles.trialApproveText}>
                    {t('roster.approveTrialCta')}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.trialRejectButton,
                  isUpdating && styles.actionDisabled,
                ]}
                onPress={() => handleRejectTrial(item)}
                disabled={isUpdating}
              >
                <Text style={styles.trialRejectText}>
                  {t('roster.rejectTrialCta')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={styles.badgeColumn}>
          {isTrial ? (
            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeText}>{t('roster.trialBadge')}</Text>
            </View>
          ) : null}
          {item.loanedFromTeamId ? (
            <View style={styles.loanBadge}>
              <Ionicons name="swap-horizontal" size={10} color={semanticColors.info} />
              <Text style={styles.loanBadgeText}>{t('loans.badge')}</Text>
            </View>
          ) : null}
          {showRoleBadge && (
            <View style={[styles.roleBadge, { backgroundColor: theme.clubPrimaryLight }]}>
              <Text style={[styles.roleBadgeText, { color: theme.clubPrimary }]}>
                {roleLabel}
              </Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('roster.screenTitle')}</Text>
          <Text style={styles.memberCount}>
            {t('roster.memberCount', { count: members.length })}
          </Text>
        </View>
        {canManageTeam ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerAction, { borderColor: theme.clubPrimary }]}
              onPress={() => router.push('/player-loan')}
            >
              <Ionicons name="swap-horizontal" size={14} color={theme.clubPrimary} />
              <Text style={[styles.headerActionText, { color: theme.clubPrimary }]}>
                {t('loans.title')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerAction, { borderColor: theme.clubPrimary }]}
              onPress={() => router.push('/team-families')}
            >
              <Text style={[styles.headerActionText, { color: theme.clubPrimary }]}>
                {t('roster.manageFamiliesCta')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      {canManageTeam && pendingTrials.length > 0 ? (
        <View style={styles.trialSummaryCard}>
          <Text style={styles.trialSummaryTitle}>
            {t('roster.pendingTrialsTitle', { count: pendingTrials.length })}
          </Text>
          <Text style={styles.trialSummaryBody}>
            {t('roster.pendingTrialsBody')}
          </Text>
        </View>
      ) : null}
      <FlatList
        key={activeTeamId}
        data={members}
        keyExtractor={(member) => member.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <IllustratedEmptyState
                illustration={illustrations.emptyRoster}
                title={t('roster.emptyTitle')}
                description={t('roster.emptyBody')}
              />
              {canManageTeam && (
                <TouchableOpacity
                  style={[styles.emptyAction, { backgroundColor: theme.clubPrimary }]}
                  onPress={() => router.push('/invite')}
                >
                  <Text style={styles.emptyActionText}>{t('more.invitePlayers')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  memberCount: { fontSize: 14, color: neutralColors.textSecondary },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAction: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.surface,
    flexDirection: 'row',
    gap: 4,
  },
  headerActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  trialSummaryCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${semanticColors.warning}33`,
    borderRadius: 12,
    backgroundColor: `${semanticColors.warning}10`,
    padding: 16,
  },
  trialSummaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  trialSummaryBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  jerseyBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  jerseyText: {
    fontSize: 14,
    fontFamily: 'GeistMono_400Regular',
    fontWeight: '700',
    color: neutralColors.textSecondary,
    textAlign: 'center',
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: { fontSize: 16, fontWeight: '700' },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 16, fontWeight: '600', color: neutralColors.textPrimary },
  memberRole: { fontSize: 13, color: neutralColors.textSecondary, marginTop: 2 },
  badgeColumn: {
    marginLeft: 10,
    alignItems: 'flex-end',
    gap: 6,
  },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  roleBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  trialBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: `${semanticColors.warning}12`,
    borderWidth: 1,
    borderColor: `${semanticColors.warning}33`,
  },
  trialBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: semanticColors.warning,
  },
  loanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: `${semanticColors.info}15`,
  },
  loanBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: semanticColors.info,
  },
  trialActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  trialApproveButton: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialApproveText: {
    fontSize: 13,
    fontWeight: '700',
    color: neutralColors.textInverse,
  },
  trialRejectButton: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${semanticColors.error}4D`,
    backgroundColor: `${semanticColors.error}0D`,
  },
  trialRejectText: {
    fontSize: 13,
    fontWeight: '700',
    color: semanticColors.error,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  empty: { paddingTop: 72, alignItems: 'center' },
  emptyAction: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  emptyActionText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
})

function formatTrialDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}
