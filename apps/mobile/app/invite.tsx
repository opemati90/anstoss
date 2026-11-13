import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import QRCode from 'react-native-qrcode-svg'
import { TeamAccessPhase, TeamRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { FormInput } from '../src/components/FormInput'
import { Screen, Button, Text, BottomSheet, Icon, SoftIcon } from '../src/components/ui'
import { isValidEmail } from '../src/utils/email'
import {
  space,
  radius,
  TAB_BAR_CLEARANCE,
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_MD,
  SPACING_XL,
} from '../src/theme/tokens'
import { BORDER_DEFAULT, QR_BACKGROUND, QR_FOREGROUND } from '../src/theme/colors'

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

type InviteCampaign = {
  id: string
  code: string
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'REVOKED'
  useCount: number
  maxUses: number
  expiresAt: string
  team: { id: string; displayName: string }
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
  const { activeClub, activeTeamId, isLoading: authIsLoading } = useAuth()
  const { returnTo, mode } = useLocalSearchParams<{ returnTo?: string; mode?: string }>()
  const c = useClubColors()
  const [groups, setGroups] = useState<TeamGroupResponse[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberResponse[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(activeTeamId)
  const isCoachInvite = mode === 'coach'
  const [role, setRole] = useState<TeamRole>(
    isCoachInvite ? TeamRole.ASSISTANT_COACH : TeamRole.PLAYER,
  )
  const [phase, setPhase] = useState<TeamAccessPhase>(TeamAccessPhase.FULL)
  // Once a team is selected, collapse the team grid into a 1-line summary
  // chip so the screen shrinks. Tapping "Change" re-expands it. Default
  // behaviour: collapsed if a team came in pre-selected from the route
  // params (`activeTeamId`), expanded otherwise so the user is guided
  // straight to picking one.
  const [teamPickerOpen, setTeamPickerOpen] = useState(!activeTeamId)
  // 3-step flow:
  //   1. Squad assignment — team + role + phase (the WHO).
  //   2. Recipients — emails (+ guardian for parent / child for parent).
  //   3. Review + send — final summary and the two CTAs.
  // Each step gets its own chunk of the existing form rendered; nav
  // buttons + step indicator live at top/bottom respectively.
  type Step = 1 | 2 | 3
  const [step, setStep] = useState<Step>(1)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [selectedPlayerUserId, setSelectedPlayerUserId] = useState<string | null>(null)
  const [childName, setChildName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [campaigns, setCampaigns] = useState<InviteCampaign[]>([])
  const [qrCampaign, setQrCampaign] = useState<InviteCampaign | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false)
  const dismissTarget = typeof returnTo === 'string' && returnTo.length > 0 ? returnTo : '/(tabs)'
  const canInvite = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

  const loadCampaigns = useCallback(async () => {
    if (!activeClub) return
    try {
      const rows = await api<InviteCampaign[]>(
        `/clubs/${activeClub.club.id}/invite-campaigns`,
      )
      setCampaigns(rows.filter((row) => row.status === 'ACTIVE' || row.status === 'PAUSED'))
    } catch {
      setCampaigns([])
    }
  }, [activeClub])

  useEffect(() => {
    void loadCampaigns()
  }, [loadCampaigns])

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
  const campaignLink = useCallback(
    (campaign: InviteCampaign) =>
      activeClub
        ? `https://anstoss.io/join/${encodeURIComponent(activeClub.club.slug)}/${encodeURIComponent(campaign.code)}`
        : '',
    [activeClub],
  )
  const supportsBulkRecipients =
    role === TeamRole.PLAYER ||
    role === TeamRole.HEAD_COACH ||
    role === TeamRole.ASSISTANT_COACH
  const playerOptions = useMemo(
    () => teamMembers.filter((member) => member?.role === 'PLAYER' && member?.user?.id),
    [teamMembers],
  )
  const selectedPlayer =
    playerOptions.find((member) => member.user?.id === selectedPlayerUserId) || null

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
        const safeData = (data || []).filter((member): member is TeamMemberResponse =>
          Boolean(member?.user?.id),
        )
        setTeamMembers(safeData)
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
      !playerOptions.some((member) => member.user?.id === selectedPlayerUserId)
    ) {
      setSelectedPlayerUserId(null)
    }
  }, [playerOptions, selectedPlayerUserId])

  const handleCreateInvite = async (deliveryChannel: 'EMAIL' | 'LINK') => {
    if (!activeClub || !selectedTeamId || !selectedTeam) return

    if (
      deliveryChannel === 'EMAIL' &&
      (recipientEmails.length === 0 || recipientEmails.some((value) => !isValidEmail(value)))
    ) {
      Alert.alert(t('invite.recipientMissingTitle'), t('invite.recipientMissingBody'))
      return
    }

    if (role === TeamRole.PARENT && !selectedPlayerUserId && !childName.trim()) {
      Alert.alert(t('invite.childTargetMissingTitle'), t('invite.childTargetMissingBody'))
      return
    }

    setIsLoading(true)

    try {
      if (deliveryChannel === 'LINK') {
        if (role !== TeamRole.PLAYER) {
          Alert.alert(t('common.error'), t('invite.childTargetMissingBody'))
          return
        }
        const campaign = await api<InviteCampaign>(
          `/clubs/${activeClub.club.id}/invite-campaigns`,
          {
            method: 'POST',
            body: {
              teamId: selectedTeamId,
              type: 'APPROVAL_REQUIRED',
              role,
              maxUses: 50,
              expiresInDays: 14,
            },
          },
        )
        await loadCampaigns()
        setQrCampaign(campaign)
        return
      }
      const recipients = deliveryChannel === 'EMAIL' ? recipientEmails : [undefined]
      let sharedInvite: CreatedInvite | null = null
      let successfulRecipients = 0
      let failedRecipients = 0

      for (const recipient of recipients) {
        try {
          const invite = await api<CreatedInvite>(`/clubs/${activeClub.club.id}/invites`, {
            method: 'POST',
            body: {
              teamId: selectedTeamId,
              role,
              phase,
              deliveryChannel,
              recipientEmail: deliveryChannel === 'EMAIL' ? recipient : undefined,
              linkedPlayerUserId:
                role === TeamRole.PARENT ? selectedPlayerUserId || undefined : undefined,
              childName:
                role === TeamRole.PARENT && !selectedPlayerUserId
                  ? childName.trim() || undefined
                  : undefined,
            },
          })
          sharedInvite = invite
          successfulRecipients += 1
        } catch {
          failedRecipients += 1
        }
      }

      if (deliveryChannel === 'EMAIL') {
        if (failedRecipients > 0) {
          Alert.alert(
            t('invite.createErrorTitle'),
            `${successfulRecipients}/${recipients.length} · ${t('invite.createErrorBody')}`,
          )
          return
        }
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

  const revokeCampaign = async (campaign: InviteCampaign) => {
    if (!activeClub) return
    setIsLoading(true)
    try {
      await api(`/clubs/${activeClub.club.id}/invite-campaigns/${campaign.id}/revoke`, {
        method: 'POST',
        body: {},
      })
      await loadCampaigns()
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.tryAgain'))
    } finally {
      setIsLoading(false)
    }
  }

  const shareCampaign = async (campaign: InviteCampaign) => {
    if (!activeClub) return
    await Share.share({
      message: t('invite.shareScopedMessage', {
        clubName: activeClub.club.name,
        teamName: campaign.team.displayName,
        link: campaignLink(campaign),
      }),
    })
  }

  if (!activeClub && authIsLoading) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    )
  }

  if (!activeClub) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: c.background }]}>
        <Text variant="body" color="secondary" style={styles.emptyText}>
          {t('invite.emptyWithoutClub')}
        </Text>
      </View>
    )
  }

  if (!canInvite) {
    return (
      <Screen header={<ModalHeader title={t('invite.screenTitle')} onClose={handleClose} />}>
        <View style={[styles.emptyContainer]}>
          <View
            style={[
              styles.emptyCard,
              { borderColor: 'transparent', backgroundColor: c.surface },
            ]}
          >
            <Text variant="headline" weight="semibold" color="primary">
              {t('invite.accessDeniedTitle')}
            </Text>
            <Text variant="footnote" color="secondary">
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
      header={<ModalHeader onClose={handleClose} />}
      tabBarClearance
      contentStyle={styles.content}
    >
      <View style={styles.hero}>
        <Text variant="title1" color="primary" accessibilityRole="header" style={styles.title}>
          {isCoachInvite
            ? t('clubStaff.inviteCoach', { defaultValue: 'Invite coach' })
            : t('invite.heroTitle', { defaultValue: 'Invite players' })}
        </Text>
        <Text variant="body" color="secondary">
          {isCoachInvite
            ? t('clubStaff.inviteCoachBody', {
                defaultValue: 'Send a personal email invitation and choose the team role.',
              })
            : t('invite.heroSubtitle', {
                defaultValue: 'Pick a squad, drop email addresses (one per line), send.',
              })}
        </Text>
      </View>

      {campaigns.length > 0 ? (
        <View style={[styles.section, styles.campaignSection]}>
          <Text variant="label" style={styles.sectionLabel}>
            {t('invite.activeLinks', { defaultValue: 'Active join links' })}
          </Text>
          {campaigns.map((campaign) => (
            <View
              key={campaign.id}
              style={[styles.codeCard, { backgroundColor: c.surface }]}
              testID={`invite-campaign-${campaign.id}`}
            >
              <Text variant="dataLarge" color="primary" style={styles.codeValue} selectable>
                {campaign.code}
              </Text>
              <Text variant="caption1" color="secondary" align="center">
                {t('invite.campaignMeta', {
                  defaultValue: '{{team}} · valid until {{date}} · {{used}}/{{max}} used',
                  team: campaign.team.displayName,
                  date: new Date(campaign.expiresAt).toLocaleDateString(),
                  used: campaign.useCount,
                  max: campaign.maxUses,
                })}
              </Text>
              <View style={styles.codeActions}>
                <Button
                  label={t('invite.share', { defaultValue: 'Share' })}
                  variant="accent"
                  size="md"
                  leftIcon={<Icon name="square.and.arrow.up" size={18} color={c.onAccent} />}
                  onPress={() => void shareCampaign(campaign)}
                  style={styles.codeAction}
                />
                <Button
                  label={t('invite.showQr', { defaultValue: 'QR' })}
                  variant="bordered"
                  size="md"
                  leftIcon={<Icon name="qrcode" size={18} color={c.textPrimary} />}
                  onPress={() => setQrCampaign(campaign)}
                  style={styles.codeAction}
                />
              </View>
              <Button
                label={t('invite.revokeLink', { defaultValue: 'Revoke' })}
                variant="plain"
                size="sm"
                onPress={() => void revokeCampaign(campaign)}
              />
            </View>
          ))}
        </View>
      ) : null}

      {!isCoachInvite && selectedTeamId ? (
        <View style={[styles.rowGroup, { backgroundColor: c.surface }]}>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/add-members', params: { teamId: selectedTeamId } })
            }
            accessibilityRole="button"
            accessibilityLabel={t('invite.addRosterTitle', { defaultValue: 'Add the squad yourself' })}
            style={[styles.groupRow, { borderBottomColor: c.borderSubtle, borderBottomWidth: hairline }]}
            testID="invite-add-members"
          >
            <SoftIcon name="person.badge.plus" />
            <View style={styles.groupRowCopy}>
              <Text variant="subheadline" weight="semibold">
                {t('invite.addRosterTitle', { defaultValue: 'Add the squad yourself' })}
              </Text>
              <Text variant="caption1" color="secondary">
                {t('invite.addRosterBody', {
                  defaultValue: 'Optional: enter players yourself',
                })}
              </Text>
            </View>
            <Icon name="chevron.right" size={16} color={c.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/fussball-link')}
            accessibilityRole="button"
            accessibilityLabel={t('invite.fussballTitle', {
              defaultValue: 'Get the squad from fussball.de',
            })}
            style={styles.groupRow}
            testID="invite-fussball-link"
          >
            <SoftIcon name="link" />
            <View style={styles.groupRowCopy}>
              <Text variant="subheadline" weight="semibold">
                {t('invite.fussballTitle', { defaultValue: 'Get the squad from fussball.de' })}
              </Text>
              <Text variant="caption1" color="secondary">
                {t('invite.fussballBody', { defaultValue: 'Fixtures and table included' })}
              </Text>
            </View>
            <Icon name="chevron.right" size={16} color={c.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Step indicator — three dots, current one filled, prior ones
          show a checkmark colour. Compact, lives directly under the
          hero. */}
      <View
        style={styles.stepIndicator}
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 3, now: step }}
      >
        <Text variant="caption1" weight="semibold" color="secondary">
          {t('onboardingFlow.progressA11y', { current: step, total: 3 })}
        </Text>
        <Text variant="headline" weight="bold">
          {step === 1
            ? t('invite.step1Title', { defaultValue: 'Pick squad' })
            : step === 2
              ? t('invite.step2Title', { defaultValue: 'Add recipients' })
              : t('invite.step3Title', { defaultValue: 'Review & send' })}
        </Text>
      </View>

      {step === 1 ? (
        <>
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionLabel}>
              {t('invite.teamLabel')}
            </Text>
            {/* Collapsed-team summary chip. Shows up once a team is picked.
            Tapping "Change" toggles the grid back on so the user can
            switch teams without scrolling the whole picker. */}
            {selectedTeam && !teamPickerOpen ? (
              <Pressable
                onPress={() => setTeamPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('invite.changeTeam', {
                  defaultValue: 'Change team',
                })}
                style={[
                  styles.teamSummary,
                  { borderColor: 'transparent', backgroundColor: c.surface },
                ]}
              >
                <View style={styles.teamSummaryText}>
                  <Text variant="body" color="primary" weight="medium" numberOfLines={1}>
                    {selectedTeam.displayName}
                  </Text>
                  <Text variant="footnote" color="secondary" numberOfLines={1}>
                    {selectedTeam.groupDisplayName}
                    {selectedTeam.leagueName ? ` · ${selectedTeam.leagueName}` : ''}
                  </Text>
                </View>
                <Text variant="footnote" color="tint" weight="semibold">
                  {t('common.change', { defaultValue: 'Change' })}
                </Text>
              </Pressable>
            ) : isBootstrapping ? (
              <ActivityIndicator color={c.primary} />
            ) : teamOptions.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                      { borderColor: 'transparent', backgroundColor: c.surface },
                ]}
              >
                <Text variant="headline" weight="semibold" color="primary">
                  {t('invite.noTeamsTitle')}
                </Text>
                <Text variant="footnote" color="secondary">
                  {t('invite.noTeamsBody')}
                </Text>
                <Pressable
                  style={[styles.inlineButton, { borderColor: c.primary }]}
                  onPress={() => router.push('/team-management')}
                  accessibilityRole="button"
                  accessibilityLabel={t('invite.openTeamManagement')}
                >
                  <Text variant="footnote" weight="semibold" color="tint">
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
                        { borderColor: 'transparent', backgroundColor: c.surface },
                        isActive && { borderColor: c.ink },
                      ]}
                      onPress={() => {
                        setSelectedTeamId(team.id)
                        // Auto-collapse so the rest of the form (role,
                        // phase, recipients) becomes the focal point.
                        setTeamPickerOpen(false)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={team.displayName}
                    >
                      <Text variant="callout" weight="semibold" color="primary">
                        {team.displayName}
                      </Text>
                      <Text variant="footnote" color="secondary">
                        {team.groupDisplayName}
                        {team.leagueName ? ` · ${team.leagueName}` : ''}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>

          {isCoachInvite ? (
            <View style={styles.section}>
              <Text variant="label" style={styles.sectionLabel}>
                {t('invite.coachRoleLabel', { defaultValue: 'COACH ROLE' })}
              </Text>
              <View style={styles.segmentRow}>
                {[
                  {
                    value: TeamRole.HEAD_COACH,
                    label: t('teamRoles.HEAD_COACH', { defaultValue: 'Head coach' }),
                  },
                  {
                    value: TeamRole.ASSISTANT_COACH,
                    label: t('teamRoles.ASSISTANT_COACH', { defaultValue: 'Assistant coach' }),
                  },
                ].map((option) => {
                  const isActive = role === option.value
                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.segment,
                        { borderColor: c.borderStrong, backgroundColor: 'transparent' },
                        isActive && { borderColor: c.ink, backgroundColor: c.ink },
                      ]}
                      onPress={() => setRole(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={option.label}
                    >
                      <Text
                        variant="callout"
                        weight={isActive ? 'semibold' : 'medium'}
                        color={isActive ? c.onInk : 'primary'}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text variant="caption1" color="tertiary" style={styles.helperLine}>
                {t('invite.coachRoleHelp', {
                  defaultValue:
                    'The coach receives access only to this team. Club-wide admin rights are separate.',
                })}
              </Text>
            </View>
          ) : null}

          {!isCoachInvite ? (
          <View style={styles.section}>
            <Text variant="label" style={styles.sectionLabel}>
              {t('invite.phaseLabel')}
            </Text>
            <View style={styles.segmentRow}>
              {PHASE_OPTIONS.map((option) => {
                const isActive = option.value === phase
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.segment,
                      { borderColor: c.borderStrong, backgroundColor: 'transparent' },
                      isActive && { borderColor: c.ink, backgroundColor: c.ink },
                    ]}
                    onPress={() => setPhase(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={t(option.labelKey)}
                  >
                    <Text
                      variant="callout"
                      weight={isActive ? 'semibold' : 'medium'}
                      color={isActive ? c.onInk : 'primary'}
                    >
                      {t(option.labelKey)}
                    </Text>
                    {option.value === TeamAccessPhase.TRIAL ? (
                      <View
                        style={[
                          styles.trialDot,
                          { backgroundColor: isActive ? c.onInk : c.warning },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
            <Text variant="caption1" color="tertiary" style={styles.helperLine}>
              {t(
                phase === TeamAccessPhase.TRIAL
                  ? 'invite.phaseTrialDescription'
                  : 'invite.phaseFullDescription',
              )}
            </Text>
          </View>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <View style={styles.section}>
          <FormInput
            testID="invite-recipient-input"
            label={
              supportsBulkRecipients
                ? t('invite.recipientLabelBulk', {
                    defaultValue: 'EMAILS · ONE PER LINE OR COMMA-SEPARATED',
                  })
                : t('invite.recipientLabel')
            }
            style={supportsBulkRecipients ? styles.multilineInput : undefined}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={
              supportsBulkRecipients
                ? t('invite.recipientPlaceholderBulk', {
                    defaultValue: 'kai@example.com\ntim@example.com\nlukas@example.com',
                  })
                : t('invite.recipientPlaceholder')
            }
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            multiline={supportsBulkRecipients}
            numberOfLines={supportsBulkRecipients ? 4 : 1}
          />
          {role === TeamRole.PLAYER ? (
            <Button
              label={t('invite.createQrInstead', { defaultValue: 'Create QR without emails' })}
              variant="bordered"
              size="lg"
              fullWidth
              loading={isLoading}
              disabled={isLoading || !selectedTeamId}
              onPress={() => void handleCreateInvite('LINK')}
              accessibilityLabel={t('invite.createQrInstead', {
                defaultValue: 'Create QR without emails',
              })}
              style={styles.qrAlternativeButton}
            />
          ) : null}
          {supportsBulkRecipients && recipientEmails.length > 0 ? (
            <View style={styles.recipientPreviewRow}>
              {recipientEmails.slice(0, 6).map((email) => (
                <View
                  key={email}
                  style={[
                    styles.recipientPreviewChip,
                    { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
                  ]}
                >
                  <Text variant="caption1" color="secondary" style={styles.recipientPreviewText}>
                    {email}
                  </Text>
                </View>
              ))}
              {recipientEmails.length > 6 ? (
                <View
                  style={[
                    styles.recipientPreviewChip,
                    { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
                  ]}
                >
                  <Text variant="caption1" color="tertiary" style={styles.recipientPreviewText}>
                    +{recipientEmails.length - 6}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {role === TeamRole.PARENT ? (
            <View style={styles.childAssignmentSection}>
              <Text variant="footnote" color="secondary">
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
                          { borderColor: 'transparent', backgroundColor: c.surface },
                          isSelected && { borderColor: c.ink },
                        ]}
                        onPress={() =>
                          setSelectedPlayerUserId((current) =>
                            current === member.user.id ? null : member.user.id,
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={member.user.name}
                      >
                        <Text variant="callout" weight="semibold" color="primary">
                          {member.user.name}
                        </Text>
                        <Text variant="footnote" color="secondary">
                          {isSelected
                            ? t('invite.childLinkedSelected')
                            : t('invite.childLinkedCta')}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : (
                <Text variant="footnote" color="secondary">
                  {t('invite.childNoPlayers')}
                </Text>
              )}

              {!selectedPlayer ? (
                <FormInput
                  label={t('invite.childLabel')}
                  placeholder={t('invite.childNamePlaceholder')}
                  value={childName}
                  onChangeText={setChildName}
                />
              ) : (
                <View
                  style={[
                    styles.linkedChildCard,
                    { borderColor: 'transparent', backgroundColor: c.surface },
                  ]}
                >
                  <Text variant="label">
                    {t('invite.childLinkedLabel')}
                  </Text>
                  <Text variant="headline" weight="semibold" color="primary">
                    {selectedPlayer.user.name}
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {step === 3 ? (
        <>
          {selectedTeam ? (
            <View
              style={[
                styles.summaryCard,
                  { borderColor: 'transparent', backgroundColor: c.surface },
              ]}
            >
              <Text variant="label">
                {t('invite.summaryLabel')}
              </Text>
              <Text variant="title3" weight="semibold" color="primary">
                {selectedTeam.displayName}
              </Text>
              <Text variant="footnote" color="secondary">
                {selectedTeam.groupDisplayName}
                {isCoachInvite
                  ? ` · ${t(`teamRoles.${role}`)}`
                  : phase === TeamAccessPhase.TRIAL
                    ? ` · ${t('invite.phaseTrial')}`
                    : ` · ${t('invite.phaseFull')}`}
                {role === TeamRole.PARENT
                  ? ` · ${
                      selectedPlayer?.user.name ||
                      childName.trim() ||
                      t('invite.childUnassignedShort')
                    }`
                  : ''}
              </Text>
              <Text variant="footnote" color="secondary" style={styles.summaryBodySpaced}>
                {recipientEmails.length > 0
                  ? t('invite.summaryRecipients', {
                      defaultValue: 'Recipients: {{count}}',
                      count: recipientEmails.length,
                    })
                  : t('invite.summaryNoRecipients', {
                      defaultValue: 'No recipients yet. Go back to step 2.',
                    })}
              </Text>
            </View>
          ) : null}

          <Button
            label={t('invite.sendEmail')}
            variant="filled"
            size="lg"
            fullWidth
            loading={isLoading}
            disabled={isLoading || !selectedTeamId || recipientEmails.length === 0}
            onPress={() => void handleCreateInvite('EMAIL')}
            accessibilityLabel={t('invite.sendEmail')}
          />

          {role === TeamRole.PLAYER ? (
            <Button
              label={t('invite.createQrLink', { defaultValue: 'Create QR & link' })}
              variant="secondary"
              size="lg"
              fullWidth
              disabled={isLoading || !selectedTeamId}
              onPress={() => void handleCreateInvite('LINK')}
              accessibilityLabel={t('invite.shareLink')}
              style={styles.secondaryButtonSpacing}
            />
          ) : null}
        </>
      ) : null}

      {/* Step nav — Back/Next on steps 1 and 2. Step 3 has its own
          Send + Share CTAs above and a single Back button below. */}
      <View style={styles.stepNavRow}>
        {step > 1 ? (
          <Button
            label={t('invite.stepBack', { defaultValue: 'Back' })}
            variant="secondary"
            size="lg"
            onPress={() => setStep((step - 1) as Step)}
            accessibilityLabel={t('invite.stepBack', { defaultValue: 'Back' })}
            style={styles.stepNavBtn}
          />
        ) : null}
        {step < 3 ? (
          <Button
            label={t('invite.stepNext', { defaultValue: 'Next' })}
            variant="filled"
            size="lg"
            disabled={
              (step === 1 && !selectedTeamId) || (step === 2 && recipientEmails.length === 0)
            }
            onPress={() => setStep((step + 1) as Step)}
            accessibilityLabel={t('invite.stepNext', { defaultValue: 'Next' })}
            style={styles.stepNavBtn}
          />
        ) : null}
      </View>

      <BottomSheet
        visible={qrCampaign != null}
        onClose={() => setQrCampaign(null)}
        heightPct={88}
        paddingBottom={0}
      >
        {qrCampaign ? (
          <ScrollView
            contentContainerStyle={styles.qrSheet}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.qrTitleBlock}>
              <Text variant="title3" weight="bold" color="primary" style={styles.qrTitle}>
                {t('invite.qrTitle', { defaultValue: 'Scan to request a place' })}
              </Text>
              <Text variant="footnote" color="secondary" style={styles.qrSubtitle}>
                {t('invite.qrSubtitle', {
                  defaultValue:
                    'Players scan this code, complete their details, and send an approval request to {{team}}.',
                  team: qrCampaign.team.displayName,
                })}
              </Text>
            </View>
            <View
              style={[
                styles.qrCodeFrame,
                { backgroundColor: QR_BACKGROUND, borderColor: BORDER_DEFAULT },
              ]}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('invite.qrAccessibilityLabel', {
                defaultValue: 'Join-request QR code for {{team}}',
                team: qrCampaign.team.displayName,
              })}
            >
              <QRCode
                value={campaignLink(qrCampaign)}
                size={196}
                quietZone={12}
                color={QR_FOREGROUND}
                backgroundColor={QR_BACKGROUND}
              />
            </View>
            <View style={[styles.manualCode, { backgroundColor: c.surfaceMuted }]}>
              <Text variant="label">
                {t('invite.manualCodeLabel', { defaultValue: 'Manual code' })}
              </Text>
              <Text variant="dataLarge" color="primary" style={styles.manualCodeValue}>
                {qrCampaign.code}
              </Text>
            </View>
            <Button
              label={t('invite.shareLink')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() => void shareCampaign(qrCampaign)}
            />
          </ScrollView>
        ) : null}
      </BottomSheet>

    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, paddingBottom: TAB_BAR_CLEARANCE },
  hero: { marginBottom: space.xl, gap: space.xs },
  title: { letterSpacing: -0.3 },
  section: { marginBottom: space.lg },
  sectionLabel: { marginBottom: space.sm },
  teamSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    gap: space.md,
  },
  teamSummaryText: {
    flex: 1,
    minWidth: 0,
    gap: space['2xs'],
  },
  stepIndicator: {
    gap: space['2xs'],
    marginBottom: space.lg,
  },
  stepNavRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  stepNavBtn: {
    flexGrow: 1,
    flexBasis: 0,
  },
  optionGrid: { gap: space.sm },
  optionCard: {
    borderWidth: 2,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space['2xs'],
  },
  segmentRow: { flexDirection: 'row', gap: space.sm },
  segment: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  trialDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  multilineInput: {
    minHeight: 88,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  childAssignmentSection: { gap: space.sm },
  childPickerLoading: {
    alignSelf: 'flex-start',
  },
  linkedChildCard: {
    borderWidth: hairline,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space['2xs'],
  },
  summaryCard: {
    borderWidth: hairline,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: space.md,
    marginBottom: space.lg,
    gap: space.xs,
  },
  summaryBodySpaced: { marginTop: space.xs },
  secondaryButtonSpacing: {
    marginTop: space.sm,
  },
  qrAlternativeButton: {
    marginTop: space.sm,
  },
  helperLine: {
    marginTop: space.xs,
  },
  recipientPreviewRow: {
    marginTop: space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  recipientPreviewChip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  recipientPreviewText: {
    letterSpacing: 0.2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  emptyText: {
    textAlign: 'center',
  },
  emptyCard: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.sm,
  },
  inlineButton: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    height: 44,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  campaignSection: { gap: space.sm },
  codeCard: {
    borderRadius: RADIUS_CARD + 4,
    borderCurve: 'continuous',
    padding: SPACING_XL + 2,
    alignItems: 'center',
    gap: SPACING_MD,
  },
  codeValue: { letterSpacing: 5, textAlign: 'center' },
  codeActions: { flexDirection: 'row', gap: SPACING_MD - 2, alignSelf: 'stretch' },
  codeAction: { flex: 1 },
  rowGroup: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    marginBottom: space.lg,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 60,
    paddingVertical: SPACING_MD,
  },
  groupRowCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
  qrSheet: {
    paddingTop: space.md,
    paddingBottom: space.xl,
    alignItems: 'center',
    gap: space.md,
  },
  qrTitleBlock: { alignItems: 'center', gap: space.sm, paddingTop: space.sm },
  qrTitle: { textAlign: 'center' },
  qrSubtitle: { textAlign: 'center', maxWidth: 320 },
  qrCodeFrame: {
    width: 228,
    height: 228,
    borderWidth: hairline,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualCode: {
    width: '100%',
    minHeight: 64,
    borderRadius: RADIUS_CARD,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  manualCodeValue: { letterSpacing: 5 },
})
