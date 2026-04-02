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
import { ModalHeader } from '../src/components/ModalHeader'
import { isValidEmail } from '../src/utils/email'
import { neutralColors, semanticColors, fontSize, space, radius, fonts, fontWeight, lineHeight, TAB_BAR_CLEARANCE } from '../src/theme/tokens'

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

function parseRecipientEmails(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

export default function InviteScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
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
  const canInvite =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

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
  const recipientEmails = useMemo(() => parseRecipientEmails(recipientEmail), [recipientEmail])
  const supportsBulkRecipients = role === TeamRole.PLAYER
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

    if (
      deliveryChannel === 'EMAIL' &&
      (recipientEmails.length === 0 || recipientEmails.some((value) => !isValidEmail(value)))
    ) {
      Alert.alert(t('invite.recipientMissingTitle'), t('invite.recipientMissingBody'))
      return
    }

    if (
      deliveryChannel === 'EMAIL' &&
      supportsBulkRecipients &&
      recipientEmails.length > 1 &&
      guardianEmail.trim()
    ) {
      Alert.alert(t('common.error'), t('invite.bulkGuardianConflict'))
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
      const recipients = deliveryChannel === 'EMAIL' ? recipientEmails : [undefined]
      let sharedInvite: CreatedInvite | null = null

      for (const recipient of recipients) {
        const invite = await api<CreatedInvite>(`/clubs/${activeClub.club.id}/invites`, {
          method: 'POST',
          body: {
            teamId: selectedTeamId,
            role,
            phase,
            deliveryChannel,
            recipientEmail: deliveryChannel === 'EMAIL' ? recipient : undefined,
            linkedPlayerUserId: selectedPlayerUserId || undefined,
            guardianEmail: guardianEmail.trim() || undefined,
            childName: selectedPlayerUserId ? undefined : childName.trim() || undefined,
          },
        })

        sharedInvite = invite
      }

      if (deliveryChannel === 'EMAIL') {
        Alert.alert(
          t('invite.emailSentTitle'),
          recipientEmails.length > 1
            ? t('invite.emailSentBodyMulti', {
                count: recipientEmails.length,
                teamName: selectedTeam.displayName,
              })
            : t('invite.emailSentBody', {
                email: recipientEmails[0],
                teamName: selectedTeam.displayName,
              }),
        )
      } else {
        await Share.share({
          message: t('invite.shareScopedMessage', {
            clubName: activeClub.club.name,
            teamName: selectedTeam.displayName,
            link: sharedInvite?.link || '',
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

  if (!canInvite) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('invite.screenTitle')} onClose={handleClose} />
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>{t('invite.accessDeniedTitle')}</Text>
            <Text style={styles.emptyCardBody}>{t('invite.accessDeniedBody')}</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('invite.screenTitle')} onClose={handleClose} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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
              accessibilityRole="button"
              accessibilityLabel={t('invite.openTeamManagement')}
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
                  accessibilityRole="button"
                  accessibilityLabel={team.displayName}
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
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
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
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
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
          style={[
            styles.input,
            supportsBulkRecipients && styles.multilineInput,
          ]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder={t('invite.recipientPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          value={recipientEmail}
          onChangeText={setRecipientEmail}
          multiline={supportsBulkRecipients}
          numberOfLines={supportsBulkRecipients ? 3 : 1}
        />
        {supportsBulkRecipients ? (
          <>
            <Text style={styles.bulkHint}>{t('invite.recipientBulkHint')}</Text>
            {recipientEmails.length > 0 ? (
              <Text style={styles.bulkCount}>
                {t('invite.recipientBulkCount', { count: recipientEmails.length })}
              </Text>
            ) : null}
          </>
        ) : null}

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
                      accessibilityRole="button"
                      accessibilityLabel={member.user.name}
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
        accessibilityRole="button"
        accessibilityLabel={t('invite.sendEmail')}
      >
        {isLoading ? (
          <ActivityIndicator color={neutralColors.textInverse} />
        ) : (
          <Text style={styles.primaryButtonText}>{t('invite.sendEmail')}</Text>
        )}
      </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => void handleCreateInvite('LINK')}
          disabled={isLoading || !selectedTeamId}
          accessibilityRole="button"
          accessibilityLabel={t('invite.shareLink')}
        >
          <Text style={styles.secondaryButtonText}>{t('invite.shareLink')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: space.lg, paddingBottom: TAB_BAR_CLEARANCE },
  hero: { marginBottom: space.xl, gap: space.sm },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
    fontFamily: fonts.label,
  },
  title: { fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: neutralColors.textPrimary, fontFamily: fonts.heading },
  subtitle: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  section: { marginBottom: space.lg },
  sectionLabel: {
    marginBottom: space.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
    fontFamily: fonts.label,
  },
  optionGrid: { gap: space.sm },
  optionCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.xs,
  },
  optionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
    fontFamily: fonts.label,
  },
  optionBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  segmentRow: { flexDirection: 'row', gap: space.sm },
  segment: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  segmentLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
    fontFamily: fonts.label,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    fontFamily: fonts.body,
  },
  multilineInput: {
    minHeight: 88,
    height: undefined,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  bulkHint: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  bulkCount: {
    marginTop: space.xs,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: fonts.label,
  },
  spacedInput: { marginTop: space.sm },
  childAssignmentSection: { gap: space.sm },
  childHint: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  childPickerLoading: {
    alignSelf: 'flex-start',
  },
  linkedChildCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.xs,
  },
  linkedChildLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
    fontFamily: fonts.label,
  },
  linkedChildName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
    fontFamily: fonts.heading,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    marginBottom: space.lg,
    gap: space.xs,
  },
  summaryEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
    fontFamily: fonts.label,
  },
  summaryTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    fontFamily: fonts.heading,
  },
  summaryBody: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  primaryButton: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textInverse,
    fontFamily: fonts.label,
  },
  secondaryButton: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: neutralColors.borderStrong,
    backgroundColor: neutralColors.surface,
    marginTop: space.sm,
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
    fontFamily: fonts.label,
  },
  buttonDisabled: { opacity: 0.6 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
    backgroundColor: neutralColors.background,
  },
  emptyText: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlign: 'center',
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  emptyCardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
    fontFamily: fonts.heading,
  },
  emptyCardBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  inlineButton: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  inlineButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
  },
})
