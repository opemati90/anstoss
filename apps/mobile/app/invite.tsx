import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { TeamAccessPhase, TeamRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { isValidEmail } from '../src/utils/email'
import {
  fontSize,
  space,
  radius,
  fonts,
  lineHeight,
  TAB_BAR_CLEARANCE,
  hairline,
} from '../src/theme/tokens'

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

const ROLE_OPTIONS: Array<{ value: TeamRole; labelKey: string; icon: string }> = [
  { value: TeamRole.PLAYER, labelKey: 'invite.rolePlayer', icon: 'figure.soccer' },
  { value: TeamRole.PARENT, labelKey: 'invite.roleParent', icon: 'person.2' },
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
  const c = useClubColors()
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
        const data = await api<TeamGroupResponse[]>(`/clubs/${activeClub.club.id}/team-groups`)

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
    if (
      selectedPlayerUserId &&
      !playerOptions.some((member) => member.user.id === selectedPlayerUserId)
    ) {
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
      Alert.alert(t('invite.childTargetMissingTitle'), t('invite.childTargetMissingBody'))
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
      <View style={[styles.emptyContainer, { backgroundColor: c.background }]}>
        <Text style={[styles.emptyText, { color: c.textSecondary }]}>
          {t('invite.emptyWithoutClub')}
        </Text>
      </View>
    )
  }

  if (!canInvite) {
    return (
      <Screen header={<ModalHeader title={t('invite.screenTitle')} onClose={handleClose} />}>
        <View style={[styles.emptyContainer]}>
          <View style={[styles.emptyCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
            <Text style={[styles.emptyCardTitle, { color: c.textPrimary }]}>
              {t('invite.accessDeniedTitle')}
            </Text>
            <Text style={[styles.emptyCardBody, { color: c.textSecondary }]}>
              {t('invite.accessDeniedBody')}
            </Text>
          </View>
        </View>
      </Screen>
    )
  }

  return (
    <Screen
      scroll
      header={<ModalHeader title={t('invite.screenTitle')} onClose={handleClose} />}
      tabBarClearance
      contentStyle={styles.content}
    >
      <View style={styles.hero}>
        <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
          {t('invite.operationalEyebrow')}
        </Text>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('invite.composerTitle')}</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          {t('invite.composerSubtitle', { clubName: activeClub.club.name })}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('invite.teamLabel')}
        </Text>
        {isBootstrapping ? (
          <ActivityIndicator color={c.primary} />
        ) : teamOptions.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
            <Text style={[styles.emptyCardTitle, { color: c.textPrimary }]}>
              {t('invite.noTeamsTitle')}
            </Text>
            <Text style={[styles.emptyCardBody, { color: c.textSecondary }]}>
              {t('invite.noTeamsBody')}
            </Text>
            <Pressable
              style={[styles.inlineButton, { borderColor: c.primary }]}
              onPress={() => router.push('/team-management')}
              accessibilityRole="button"
              accessibilityLabel={t('invite.openTeamManagement')}
            >
              <Text style={[styles.inlineButtonText, { color: c.primary }]}>
                {t('invite.openTeamManagement')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.optionGrid}>
            {teamOptions.map((team) => {
              const isActive = team.id === selectedTeamId
              return (
                <Pressable
                  key={team.id}
                  style={[
                    styles.optionCard,
                    { borderColor: c.borderDefault, backgroundColor: c.surface },
                    isActive && {
                      borderColor: c.primary,
                      backgroundColor: c.primary50,
                    },
                  ]}
                  onPress={() => setSelectedTeamId(team.id)}
                  accessibilityRole="button"
                  accessibilityLabel={team.displayName}
                >
                  <Text style={[styles.optionTitle, { color: c.textPrimary }]}>
                    {team.displayName}
                  </Text>
                  <Text style={[styles.optionBody, { color: c.textSecondary }]}>
                    {team.groupDisplayName}
                    {team.leagueName ? ` · ${team.leagueName}` : ''}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('invite.roleLabel')}
        </Text>
        <View style={styles.segmentRow}>
          {ROLE_OPTIONS.map((option) => {
            const isActive = option.value === role
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.segment,
                  { borderColor: c.borderDefault, backgroundColor: c.surface },
                  isActive && {
                    borderColor: c.primary,
                    backgroundColor: c.primary50,
                  },
                ]}
                onPress={() => setRole(option.value)}
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
              >
                <Icon
                  name={option.icon}
                  size="sm"
                  color={isActive ? c.primary : c.textSecondary}
                />
                <Text style={[styles.segmentLabel, { color: c.textPrimary }]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('invite.phaseLabel')}
        </Text>
        <View style={styles.optionGrid}>
          {PHASE_OPTIONS.map((option) => {
            const isActive = option.value === phase
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.optionCard,
                  { borderColor: c.borderDefault, backgroundColor: c.surface },
                  isActive && {
                    borderColor: phase === 'TRIAL' ? c.warning : c.primary,
                    backgroundColor: phase === 'TRIAL' ? `${c.warning}12` : c.primary50,
                  },
                ]}
                onPress={() => setPhase(option.value)}
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
              >
                <Text style={[styles.optionTitle, { color: c.textPrimary }]}>
                  {t(option.labelKey)}
                </Text>
                <Text style={[styles.optionBody, { color: c.textSecondary }]}>
                  {t(option.descriptionKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('invite.recipientLabel')}
        </Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
            supportsBulkRecipients && styles.multilineInput,
          ]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder={t('invite.recipientPlaceholder')}
          placeholderTextColor={c.textTertiary}
          value={recipientEmail}
          onChangeText={setRecipientEmail}
          multiline={supportsBulkRecipients}
          numberOfLines={supportsBulkRecipients ? 3 : 1}
        />
        {supportsBulkRecipients ? (
          <>
            <Text style={[styles.bulkHint, { color: c.textSecondary }]}>
              {t('invite.recipientBulkHint')}
            </Text>
            {recipientEmails.length > 0 ? (
              <Text style={[styles.bulkCount, { color: c.textTertiary }]}>
                {t('invite.recipientBulkCount', { count: recipientEmails.length })}
              </Text>
            ) : null}
          </>
        ) : null}

        {role === 'PLAYER' ? (
          <TextInput
            style={[
              styles.input,
              styles.spacedInput,
              { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={t('invite.guardianPlaceholder')}
            placeholderTextColor={c.textTertiary}
            value={guardianEmail}
            onChangeText={setGuardianEmail}
          />
        ) : null}

        {role === 'PARENT' ? (
          <View style={styles.childAssignmentSection}>
            <Text style={[styles.childHint, { color: c.textSecondary }]}>
              {t('invite.childAssignmentHint')}
            </Text>
            {isLoadingPlayers ? (
              <ActivityIndicator color={c.primary} style={styles.childPickerLoading} />
            ) : playerOptions.length > 0 ? (
              <View style={styles.optionGrid}>
                {playerOptions.map((member) => {
                  const isSelected = member.user.id === selectedPlayerUserId
                  return (
                    <Pressable
                      key={member.user.id}
                      style={[
                        styles.optionCard,
                        { borderColor: c.borderDefault, backgroundColor: c.surface },
                        isSelected && {
                          borderColor: c.primary,
                          backgroundColor: c.primary50,
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
                      <Text style={[styles.optionTitle, { color: c.textPrimary }]}>
                        {member.user.name}
                      </Text>
                      <Text style={[styles.optionBody, { color: c.textSecondary }]}>
                        {isSelected ? t('invite.childLinkedSelected') : t('invite.childLinkedCta')}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ) : (
              <Text style={[styles.childHint, { color: c.textSecondary }]}>
                {t('invite.childNoPlayers')}
              </Text>
            )}

            {!selectedPlayer ? (
              <TextInput
                style={[
                  styles.input,
                  styles.spacedInput,
                  { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
                ]}
                placeholder={t('invite.childNamePlaceholder')}
                placeholderTextColor={c.textTertiary}
                value={childName}
                onChangeText={setChildName}
              />
            ) : (
              <View
                style={[
                  styles.linkedChildCard,
                  { borderColor: c.borderDefault, backgroundColor: c.surface },
                ]}
              >
                <Text style={[styles.linkedChildLabel, { color: c.textTertiary }]}>
                  {t('invite.childLinkedLabel')}
                </Text>
                <Text style={[styles.linkedChildName, { color: c.textPrimary }]}>
                  {selectedPlayer.user.name}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {selectedTeam ? (
        <View style={[styles.summaryCard, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
          <Text style={[styles.summaryEyebrow, { color: c.textTertiary }]}>
            {t('invite.summaryLabel')}
          </Text>
          <Text style={[styles.summaryTitle, { color: c.textPrimary }]}>
            {selectedTeam.displayName}
          </Text>
          <Text style={[styles.summaryBody, { color: c.textSecondary }]}>
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

      <Button
        label={t('invite.sendEmail')}
        variant="filled"
        size="lg"
        fullWidth
        loading={isLoading}
        disabled={isLoading || !selectedTeamId}
        onPress={() => void handleCreateInvite('EMAIL')}
        accessibilityLabel={t('invite.sendEmail')}
      />

      <Button
        label={t('invite.shareLink')}
        variant="secondary"
        size="lg"
        fullWidth
        disabled={isLoading || !selectedTeamId}
        onPress={() => void handleCreateInvite('LINK')}
        accessibilityLabel={t('invite.shareLink')}
        style={styles.secondaryButtonSpacing}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: TAB_BAR_CLEARANCE },
  hero: { marginBottom: space.xl, gap: space.sm },
  eyebrow: {
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
    fontFamily: fonts.label,
  },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  subtitle: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontFamily: fonts.body,
  },
  section: { marginBottom: space.lg },
  sectionLabel: {
    marginBottom: space.sm,
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
    fontFamily: fonts.label,
  },
  optionGrid: { gap: space.sm },
  optionCard: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
  },
  optionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  optionBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  segmentRow: { flexDirection: 'row', gap: space.sm },
  segment: {
    flex: 1,
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  segmentLabel: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  input: {
    height: 52,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
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
    fontFamily: fonts.body,
  },
  bulkCount: {
    marginTop: space.xs,
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
    fontFamily: fonts.label,
  },
  spacedInput: { marginTop: space.sm },
  childAssignmentSection: { gap: space.sm },
  childHint: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  childPickerLoading: {
    alignSelf: 'flex-start',
  },
  linkedChildCard: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
  },
  linkedChildLabel: {
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
    fontFamily: fonts.label,
  },
  linkedChildName: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  summaryCard: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
    gap: space.xs,
  },
  summaryEyebrow: {
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
    fontFamily: fonts.label,
  },
  summaryTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  summaryBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  secondaryButtonSpacing: {
    marginTop: space.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  emptyText: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  emptyCard: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  emptyCardTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  emptyCardBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  inlineButton: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    height: 44,
    borderRadius: radius.lg,
    borderWidth: hairline,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  inlineButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
})
