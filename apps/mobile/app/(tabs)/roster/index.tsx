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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { IllustratedEmptyState } from '../../../src/components/IllustratedEmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { illustrations } from '../../../src/illustrations'
import { neutralColors, semanticColors, space, radius, fontSize as fs, fontWeight as fw } from '../../../src/theme/tokens'

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
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editPosition, setEditPosition] = useState('')
  const [editJersey, setEditJersey] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

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
    try {
      await fetchMembers()
    } finally {
      setRefreshing(false)
    }
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

  const openEditModal = (member: Member) => {
    setEditingMember(member)
    setEditPosition(member.position || '')
    setEditJersey(member.jerseyNumber != null ? String(member.jerseyNumber) : '')
  }

  const saveEdit = async () => {
    if (!activeClub || !activeTeamId || !editingMember) return
    setIsSavingEdit(true)
    try {
      const body: { position?: string | null; jerseyNumber?: number | null } = {}
      body.position = editPosition.trim() || null
      body.jerseyNumber = editJersey.trim() ? parseInt(editJersey, 10) : null

      if (body.jerseyNumber != null && (isNaN(body.jerseyNumber) || body.jerseyNumber < 0 || body.jerseyNumber > 999)) {
        Alert.alert(t('common.error'), t('roster.jerseyInvalid'))
        setIsSavingEdit(false)
        return
      }

      await api(
        `/clubs/${activeClub.club.id}/teams/${activeTeamId}/roster/${editingMember.user.id}`,
        { method: 'PATCH', body },
      )
      setEditingMember(null)
      await fetchMembers()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
    } finally {
      setIsSavingEdit(false)
    }
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

    const cardContent = (
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

    if (canManageTeam && item.role === 'PLAYER') {
      return (
        <TouchableOpacity onPress={() => openEditModal(item)} activeOpacity={0.7}>
          {cardContent}
        </TouchableOpacity>
      )
    }

    return cardContent
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TabScreenHeader
          title={t('roster.screenTitle')}
          subtitle={t('roster.memberCount', { count: members.length })}
          compact
        />
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

      {/* Edit Position/Jersey Modal */}
      <Modal
        visible={!!editingMember}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingMember(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingMember?.user.name}
              </Text>
              <TouchableOpacity onPress={() => setEditingMember(null)}>
                <Ionicons name="close" size={24} color={neutralColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>{t('roster.position')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editPosition}
              onChangeText={setEditPosition}
              placeholder={t('roster.positionPlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
              maxLength={30}
              autoCapitalize="words"
            />

            <Text style={styles.modalLabel}>{t('roster.jerseyNumber')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editJersey}
              onChangeText={setEditJersey}
              placeholder={t('roster.jerseyPlaceholder')}
              placeholderTextColor={neutralColors.textTertiary}
              keyboardType="number-pad"
              maxLength={3}
            />

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: theme.clubPrimary },
                isSavingEdit && { opacity: 0.6 },
              ]}
              onPress={saveEdit}
              disabled={isSavingEdit}
            >
              {isSavingEdit ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: neutralColors.background,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerAction: {
    minHeight: 38,
    borderRadius: 999,
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
    marginTop: 16,
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
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: neutralColors.background,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: space.lg, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: space.lg,
  },
  modalTitle: {
    fontSize: fs.lg, fontWeight: fw.bold, color: neutralColors.textPrimary,
  },
  modalLabel: {
    fontSize: fs.sm, fontWeight: fw.bold, color: neutralColors.textPrimary,
    marginTop: space.md, marginBottom: space.xs,
  },
  modalInput: {
    height: 48, borderWidth: 1, borderColor: neutralColors.border,
    borderRadius: radius.md, paddingHorizontal: space.md,
    fontSize: fs.md, color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  modalSaveButton: {
    height: 48, borderRadius: radius.md, justifyContent: 'center',
    alignItems: 'center', marginTop: space.lg,
  },
  modalSaveText: {
    fontSize: fs.md, fontWeight: fw.bold, color: '#FFF',
  },
})

function formatTrialDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}
