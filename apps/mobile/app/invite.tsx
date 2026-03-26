import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { TeamAccessPhase, TeamRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors, semanticColors } from '../src/theme/tokens'

type TeamGroupResponse = {
  id: string
  displayName: string
  teams: Array<{
    id: string
    displayName: string
    squadLabel: string | null
    leagueName: string | null
  }>
}

type CreatedInvite = {
  code: string
  link: string
}

type TeamMemberResponse = {
  id: string
  role: 'PLAYER' | 'PARENT' | 'HEAD_COACH' | 'ASSISTANT_COACH'
  user: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

const ROLE_OPTIONS: Array<{ value: TeamRole; labelKey: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: TeamRole.PLAYER, labelKey: 'invite.rolePlayer', icon: 'football-outline' },
  { value: TeamRole.PARENT, labelKey: 'invite.roleParent', icon: 'people-outline' },
]

const PHASE_OPTIONS: Array<{
  value: TeamAccessPhase
  labelKey: string
  descriptionKey: string
}> = [
  {
    value: TeamAccessPhase.FULL,
    labelKey: 'invite.phaseFull',
    descriptionKey: 'invite.phaseFullDescription',
  },
  {
    value: TeamAccessPhase.TRIAL,
    labelKey: 'invite.phaseTrial',
    descriptionKey: 'invite.phaseTrialDescription',
  },
]

export default function InviteScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>()
  const theme = useClubColors()
  const [groups, setGroups] = useState<TeamGroupResponse[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberResponse[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(activeTeamId)
  const [role, setRole] = useState<TeamRole>(TeamRole.PLAYER)
  const [phase, setPhase] = useState<TeamAccessPhase>(TeamAccessPhase.FULL)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [selectedPlayerUserId, setSelectedPlayerUserId] = useState<string | null>(null)
  const [guardianEmail, setGuardianEmail] = useState('')
  const [childName, setChildName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false)
  const dismissTarget = typeof returnTo === 'string' && returnTo.length > 0 ? returnTo : '/(tabs)'

  const handleClose = useCallback(() => {
    router.dismissTo(dismissTarget)
  }, [dismissTarget])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose()
      return true
    })

    return () => {
      subscription.remove()
    }
  }, [handleClose])

  useEffect(() => {
    if (!activeClub) return

    let isCancelled = false

    ;(async () => {
      try {
        const data = await api<TeamGroupResponse[]>(
          `/clubs/${activeClub.club.id}/team-groups`,
        )

        if (isCancelled) return
        setGroups(data || [])

        if (!selectedTeamId) {
          const firstTeam = data?.flatMap((group) => group.teams)?.[0]
          if (firstTeam) {
            setSelectedTeamId(firstTeam.id)
          }
        }
      } catch {
        if (!isCancelled) {
          Alert.alert(t('common.error'), t('invite.teamLoadError'))
        }
      } finally {
        if (!isCancelled) {
          setIsBootstrapping(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [activeClub, selectedTeamId, t])

  const teamOptions = useMemo(
    () =>
      groups.flatMap((group) =>
        group.teams.map((team) => ({
          ...team,
          groupDisplayName: group.displayName,
        })),
      ),
    [groups],
  )

  const selectedTeam = teamOptions.find((team) => team.id === selectedTeamId) || null
  const playerOptions = useMemo(
    () => teamMembers.filter((member) => member.role === 'PLAYER'),
    [teamMembers],
  )
  const selectedPlayer =
    playerOptions.find((member) => member.user.id === selectedPlayerUserId) || null

  useEffect(() => {
    if (!activeClub || !selectedTeamId) {
      setTeamMembers([])
      setSelectedPlayerUserId(null)
      return
    }

    let isCancelled = false

    ;(async () => {
      try {
        setIsLoadingPlayers(true)
        const data = await api<TeamMemberResponse[]>(
          `/clubs/${activeClub.club.id}/members?teamId=${selectedTeamId}`,
        )

        if (isCancelled) return
        setTeamMembers(data || [])
      } catch {
        if (!isCancelled) {
          setTeamMembers([])
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPlayers(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [activeClub, selectedTeamId])

  useEffect(() => {
    if (selectedPlayerUserId && !playerOptions.some((member) => member.user.id === selectedPlayerUserId)) {
      setSelectedPlayerUserId(null)
    }
  }, [playerOptions, selectedPlayerUserId])

  useEffect(() => {
    if (role !== 'PARENT') {
      setSelectedPlayerUserId(null)
      setChildName('')
    }

    if (role !== 'PLAYER') {
      setGuardianEmail('')
    }
  }, [role])

  const handleCreateInvite = async (deliveryChannel: 'EMAIL' | 'LINK') => {
    if (!activeClub || !selectedTeamId || !selectedTeam) return

    if (deliveryChannel === 'EMAIL' && !recipientEmail.trim().includes('@')) {
      Alert.alert(t('invite.recipientMissingTitle'), t('invite.recipientMissingBody'))
      return
    }

    if (role === 'PARENT' && !selectedPlayerUserId && !childName.trim()) {
      Alert.alert(
        t('invite.childTargetMissingTitle'),
        t('invite.childTargetMissingBody'),
      )
      return
    }

    setIsLoading(true)

    try {
      const invite = await api<CreatedInvite>(`/clubs/${activeClub.club.id}/invites`, {
        method: 'POST',
        body: {
          teamId: selectedTeamId,
          role,
          phase,
          deliveryChannel,
          recipientEmail: deliveryChannel === 'EMAIL' ? recipientEmail.trim().toLowerCase() : undefined,
          linkedPlayerUserId: selectedPlayerUserId || undefined,
          guardianEmail: guardianEmail.trim() || undefined,
          childName: selectedPlayerUserId ? undefined : childName.trim() || undefined,
        },
      })

      if (deliveryChannel === 'EMAIL') {
        Alert.alert(
          t('invite.emailSentTitle'),
          t('invite.emailSentBody', {
            email: recipientEmail.trim().toLowerCase(),
            teamName: selectedTeam.displayName,
          }),
        )
      } else {
        await Share.share({
          message: t('invite.shareScopedMessage', {
            clubName: activeClub.club.name,
            teamName: selectedTeam.displayName,
            link: invite.link,
          }),
        })
      }
    } catch {
      Alert.alert(t('invite.createErrorTitle'), t('invite.createErrorBody'))
    } finally {
      setIsLoading(false)
    }
  }

  if (!activeClub) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('invite.emptyWithoutClub')}</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('invite.screenTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t('invite.operationalEyebrow')}</Text>
        <Text style={styles.title}>{t('invite.composerTitle')}</Text>
        <Text style={styles.subtitle}>
          {t('invite.composerSubtitle', { clubName: activeClub.club.name })}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('invite.teamLabel')}</Text>
        {isBootstrapping ? (
          <ActivityIndicator color={theme.clubPrimary} />
        ) : teamOptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>{t('invite.noTeamsTitle')}</Text>
            <Text style={styles.emptyCardBody}>{t('invite.noTeamsBody')}</Text>
            <TouchableOpacity
              style={[styles.inlineButton, { borderColor: theme.clubPrimary }]}
              onPress={() => router.push('/team-management')}
            >
              <Text style={[styles.inlineButtonText, { color: theme.clubPrimary }]}>
                {t('invite.openTeamManagement')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.optionGrid}>
            {teamOptions.map((team) => {
              const isActive = team.id === selectedTeamId
              return (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.optionCard,
                    isActive && {
                      borderColor: theme.clubPrimary,
                      backgroundColor: theme.clubPrimaryLight,
                    },
                  ]}
                  onPress={() => setSelectedTeamId(team.id)}
                >
                  <Text style={styles.optionTitle}>{team.displayName}</Text>
                  <Text style={styles.optionBody}>
                    {team.groupDisplayName}
                    {team.leagueName ? ` · ${team.leagueName}` : ''}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('invite.roleLabel')}</Text>
        <View style={styles.segmentRow}>
          {ROLE_OPTIONS.map((option) => {
            const isActive = option.value === role
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.segment,
                  isActive && {
                    borderColor: theme.clubPrimary,
                    backgroundColor: theme.clubPrimaryLight,
                  },
                ]}
                onPress={() => setRole(option.value)}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={isActive ? theme.clubPrimary : neutralColors.textSecondary}
                />
                <Text style={styles.segmentLabel}>{t(option.labelKey)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('invite.phaseLabel')}</Text>
        <View style={styles.optionGrid}>
          {PHASE_OPTIONS.map((option) => {
            const isActive = option.value === phase
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionCard,
                  isActive && {
                    borderColor: phase === 'TRIAL' ? semanticColors.warning : theme.clubPrimary,
                    backgroundColor:
                      phase === 'TRIAL' ? `${semanticColors.warning}12` : theme.clubPrimaryLight,
                  },
                ]}
                onPress={() => setPhase(option.value)}
              >
                <Text style={styles.optionTitle}>{t(option.labelKey)}</Text>
                <Text style={styles.optionBody}>{t(option.descriptionKey)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('invite.recipientLabel')}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder={t('invite.recipientPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          value={recipientEmail}
          onChangeText={setRecipientEmail}
        />

        {role === 'PLAYER' ? (
          <TextInput
            style={[styles.input, styles.spacedInput]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={t('invite.guardianPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
            value={guardianEmail}
            onChangeText={setGuardianEmail}
          />
        ) : null}

        {role === 'PARENT' ? (
          <View style={styles.childAssignmentSection}>
            <Text style={styles.childHint}>{t('invite.childAssignmentHint')}</Text>
            {isLoadingPlayers ? (
              <ActivityIndicator color={theme.clubPrimary} style={styles.childPickerLoading} />
            ) : playerOptions.length > 0 ? (
              <View style={styles.optionGrid}>
                {playerOptions.map((member) => {
                  const isSelected = member.user.id === selectedPlayerUserId
                  return (
                    <TouchableOpacity
                      key={member.user.id}
                      style={[
                        styles.optionCard,
                        isSelected && {
                          borderColor: theme.clubPrimary,
                          backgroundColor: theme.clubPrimaryLight,
                        },
                      ]}
                      onPress={() =>
                        setSelectedPlayerUserId((current) =>
                          current === member.user.id ? null : member.user.id,
                        )
                      }
                    >
                      <Text style={styles.optionTitle}>{member.user.name}</Text>
                      <Text style={styles.optionBody}>
                        {isSelected
                          ? t('invite.childLinkedSelected')
                          : t('invite.childLinkedCta')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ) : (
              <Text style={styles.childHint}>{t('invite.childNoPlayers')}</Text>
            )}

            {!selectedPlayer ? (
              <TextInput
                style={[styles.input, styles.spacedInput]}
                placeholder={t('invite.childNamePlaceholder')}
                placeholderTextColor={neutralColors.textTertiary}
                value={childName}
                onChangeText={setChildName}
              />
            ) : (
              <View style={styles.linkedChildCard}>
                <Text style={styles.linkedChildLabel}>{t('invite.childLinkedLabel')}</Text>
                <Text style={styles.linkedChildName}>{selectedPlayer.user.name}</Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {selectedTeam ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryEyebrow}>{t('invite.summaryLabel')}</Text>
        <Text style={styles.summaryTitle}>{selectedTeam.displayName}</Text>
          <Text style={styles.summaryBody}>
            {selectedTeam.groupDisplayName}
            {phase === TeamAccessPhase.TRIAL
              ? ` · ${t('invite.phaseTrial')}`
              : ` · ${t('invite.phaseFull')}`}
            {role === 'PARENT'
              ? ` · ${
                  selectedPlayer?.user.name || childName.trim() || t('invite.childUnassignedShort')
                }`
              : ''}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: theme.clubPrimary },
          isLoading && styles.buttonDisabled,
        ]}
        onPress={() => void handleCreateInvite('EMAIL')}
        disabled={isLoading || !selectedTeamId}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('invite.sendEmail')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => void handleCreateInvite('LINK')}
        disabled={isLoading || !selectedTeamId}
      >
        <Text style={styles.secondaryButtonText}>{t('invite.shareLink')}</Text>
      </TouchableOpacity>
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
  hero: { marginBottom: 28, gap: 6 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  title: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  subtitle: {
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
  optionGrid: { gap: 10 },
  optionCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 14,
    gap: 4,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  optionBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segment: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    backgroundColor: neutralColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: neutralColors.textPrimary,
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
  childAssignmentSection: { gap: 10 },
  childHint: {
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  childPickerLoading: {
    alignSelf: 'flex-start',
  },
  linkedChildCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    backgroundColor: neutralColors.surface,
    padding: 14,
    gap: 4,
  },
  linkedChildLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  linkedChildName: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    marginBottom: 20,
    gap: 4,
  },
  summaryEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  summaryBody: {
    fontSize: 14,
    color: neutralColors.textSecondary,
  },
  primaryButton: {
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
  secondaryButton: {
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: neutralColors.borderStrong,
    backgroundColor: neutralColors.surface,
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  buttonDisabled: { opacity: 0.6 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: neutralColors.background,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: neutralColors.textSecondary,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 8,
  },
  emptyCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  emptyCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  inlineButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  inlineButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
