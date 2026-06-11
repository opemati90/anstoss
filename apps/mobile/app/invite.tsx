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
import { FormInput } from '../src/components/FormInput'
import { Screen, Button, Text, Icon, BottomSheet } from '../src/components/ui'
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

type RosterPlayer = {
  name: string
  jerseyNumber: number | null
  externalPlayerId: string | null
  selected: boolean
  email: string
}

const ROLE_OPTIONS: Array<{ value: TeamRole; labelKey: string; icon: string }> = [
  { value: TeamRole.PLAYER, labelKey: 'invite.rolePlayer', icon: 'figure.soccer' },
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
        const safeData = (data || []).filter(
          (member): member is TeamMemberResponse => Boolean(member?.user?.id),
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

  // ─── fussball.de roster import ─────────────────────────────────────
  // When a team has a fussball.de link, fetch the roster on demand and
  // let the admin tick names to bulk-create invites. Roster results are
  // cached per teamId so repeated taps don't re-scrape.
  const [teamLinkId, setTeamLinkId] = useState<string | null>(null)
  const [rosterImportVisible, setRosterImportVisible] = useState(false)
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedTeamId) {
      setTeamLinkId(null)
      return
    }
    let isCancelled = false
    ;(async () => {
      try {
        const links = await api<Array<{ id: string; provider: string }>>(
          `/integrations/fussball/team-links?teamId=${selectedTeamId}`,
        )
        if (isCancelled) return
        const link = (links || []).find((l) => l.provider === 'API_FUSSBALL')
        setTeamLinkId(link?.id ?? null)
      } catch {
        if (!isCancelled) setTeamLinkId(null)
      }
    })()
    return () => {
      isCancelled = true
    }
  }, [selectedTeamId])

  const [rosterSource, setRosterSource] = useState<
    'team_page' | 'recent_lineup' | 'empty' | null
  >(null)

  const openRosterImport = async () => {
    if (!teamLinkId) return
    setRosterImportVisible(true)
    if (rosterPlayers.length > 0) return
    setRosterLoading(true)
    setRosterError(null)
    try {
      const data = await api<{
        players: Array<{
          name: string
          jerseyNumber: number | null
          externalPlayerId: string | null
        }>
        rawCount: number
        externalUrl: string
        source?: 'team_page' | 'recent_lineup' | 'empty'
      }>(`/integrations/fussball/team-links/${teamLinkId}/roster`)
      setRosterPlayers(
        (data.players || []).map((p) => ({
          ...p,
          selected: false,
          email: '',
        })),
      )
      setRosterSource(data.source ?? null)
      if ((data.players?.length ?? 0) === 0) {
        setRosterError(
          t('invite.rosterEmpty', {
            defaultValue:
              "Couldn't read the squad page automatically. Open it on fussball.de and paste names below.",
          }),
        )
      }
    } catch {
      setRosterError(
        t('invite.rosterError', {
          defaultValue:
            "Couldn't fetch the fussball.de roster. Try again or paste names manually.",
        }),
      )
    } finally {
      setRosterLoading(false)
    }
  }

  const toggleRosterPlayer = (id: string) => {
    setRosterPlayers((prev) =>
      prev.map((p) =>
        (p.externalPlayerId || p.name) === id ? { ...p, selected: !p.selected } : p,
      ),
    )
  }

  const updateRosterPlayerEmail = (id: string, email: string) => {
    setRosterPlayers((prev) =>
      prev.map((p) =>
        (p.externalPlayerId || p.name) === id ? { ...p, email } : p,
      ),
    )
  }

  const applyRosterEmailsToBulk = () => {
    const emails = rosterPlayers
      .filter((p) => p.selected && p.email.trim() && isValidEmail(p.email.trim()))
      .map((p) => p.email.trim())
    if (emails.length === 0) return
    const merged = [
      ...recipientEmails,
      ...emails.filter((e) => !recipientEmails.includes(e)),
    ]
    setRecipientEmail(merged.join('\n'))
    setRosterImportVisible(false)
  }

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
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {t('invite.heroTitle', { defaultValue: 'Invite players' })}
        </Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          {t('invite.heroSubtitle', {
            defaultValue: 'Pick a squad, drop email addresses (one per line), send.',
          })}
        </Text>
      </View>

      {/* Step indicator — three dots, current one filled, prior ones
          show a checkmark colour. Compact, lives directly under the
          hero. */}
      <View style={styles.stepIndicator}>
        {[1, 2, 3].map((n) => {
          const isCurrent = n === step
          const isDone = n < step
          return (
            <View
              key={n}
              style={[
                styles.stepDot,
                {
                  backgroundColor: isCurrent
                    ? c.primary
                    : isDone
                      ? c.primary50 ?? c.surfaceSunken
                      : c.surfaceSunken,
                  borderColor: isCurrent || isDone ? c.primary : c.borderDefault,
                },
              ]}
            >
              <Text
                variant="caption1"
                weight="semibold"
                style={{
                  color: isCurrent
                    ? c.surface
                    : isDone
                      ? c.primary
                      : c.textTertiary,
                }}
              >
                {n}
              </Text>
            </View>
          )
        })}
        <Text variant="footnote" color="secondary" style={styles.stepCaption}>
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
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
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
              { borderColor: c.borderDefault, backgroundColor: c.surface },
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
                  onPress={() => {
                    setSelectedTeamId(team.id)
                    // Auto-collapse so the rest of the form (role,
                    // phase, recipients) becomes the focal point.
                    setTeamPickerOpen(false)
                  }}
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
        <View style={styles.segmentRow}>
          {PHASE_OPTIONS.map((option) => {
            const isActive = option.value === phase
            const tint =
              option.value === TeamAccessPhase.TRIAL ? c.warning : c.primary
            return (
              <Pressable
                key={option.value}
                style={[
                  styles.segment,
                  {
                    borderColor: isActive ? tint : c.borderDefault,
                    backgroundColor: isActive
                      ? option.value === TeamAccessPhase.TRIAL
                        ? `${c.warning}10`
                        : c.primary50
                      : c.surface,
                  },
                ]}
                onPress={() => setPhase(option.value)}
                accessibilityRole="button"
                accessibilityLabel={t(option.labelKey)}
              >
                <Text style={[styles.segmentLabel, { color: c.textPrimary }]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={[styles.helperLine, { color: c.textTertiary }]}>
          {t(
            phase === TeamAccessPhase.TRIAL
              ? 'invite.phaseTrialDescription'
              : 'invite.phaseFullDescription',
          )}
        </Text>
      </View>
      </>
      ) : null}

      {step === 2 ? (
      <View style={styles.section}>
        {teamLinkId && supportsBulkRecipients ? (
          <Pressable
            onPress={() => void openRosterImport()}
            accessibilityRole="button"
            accessibilityLabel={t('invite.importRosterCta', {
              defaultValue: 'Import roster from fussball.de',
            })}
            style={({ pressed }) => [
              styles.importBanner,
              { borderColor: c.primary, backgroundColor: c.primary50 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Icon name="square.and.arrow.down" size={18} color={c.primary} />
            <View style={styles.importBannerCopy}>
              <Text style={[styles.importBannerTitle, { color: c.textPrimary }]}>
                {t('invite.importRosterCta', {
                  defaultValue: 'Import roster from fussball.de',
                })}
              </Text>
              <Text style={[styles.importBannerSub, { color: c.textSecondary }]}>
                {t('invite.importRosterSub', {
                  defaultValue: 'Pull squad list, tick names, send all at once.',
                })}
              </Text>
            </View>
            <Icon name="chevron.right" size={14} color={c.primary} />
          </Pressable>
        ) : null}

        <FormInput
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
                <Text style={[styles.recipientPreviewText, { color: c.textSecondary }]}>
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
                <Text style={[styles.recipientPreviewText, { color: c.textTertiary }]}>
                  +{recipientEmails.length - 6}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {role === 'PLAYER' ? (
          <View style={styles.spacedInput}>
            <FormInput
              label={t('invite.guardianLabel')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder={t('invite.guardianPlaceholder')}
              value={guardianEmail}
              onChangeText={setGuardianEmail}
            />
          </View>
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
      ) : null}

      {step === 3 ? (
        <>
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
              <Text style={[styles.summaryBody, { color: c.textSecondary, marginTop: space.xs }]}>
                {recipientEmails.length > 0
                  ? t('invite.summaryRecipients', {
                      defaultValue: '{{count}} recipient(s)',
                      count: recipientEmails.length,
                    })
                  : t('invite.summaryNoRecipients', {
                      defaultValue: 'No recipients yet — go back to step 2.',
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
            onPress={() => setStep(((step - 1) as Step))}
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
              (step === 1 && !selectedTeamId) ||
              (step === 2 && recipientEmails.length === 0)
            }
            onPress={() => setStep(((step + 1) as Step))}
            accessibilityLabel={t('invite.stepNext', { defaultValue: 'Next' })}
            style={styles.stepNavBtn}
          />
        ) : null}
      </View>

      <BottomSheet
        visible={rosterImportVisible}
        onClose={() => setRosterImportVisible(false)}
        heightPct="auto"
      >
        <View style={styles.rosterSheet}>
          <Text variant="title2" weight="bold" color="primary" style={styles.rosterTitle}>
            {t('invite.rosterTitle', { defaultValue: 'Squad from fussball.de' })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.rosterSubtitle}>
            {t('invite.rosterSubtitle', {
              defaultValue:
                'Tick the players you have an email for, drop the address, send all at once.',
            })}
          </Text>
          {rosterSource === 'recent_lineup' ? (
            <Text variant="caption2" color="tertiary" style={styles.rosterSourceHint}>
              {t('invite.rosterSourceLineup', {
                defaultValue:
                  'Pulled from your most recent fussball.de match lineup. Names that didn’t play yet won’t show up.',
              })}
            </Text>
          ) : null}

          {rosterLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: space.lg }} />
          ) : rosterError ? (
            <Text style={[styles.rosterError, { color: c.textSecondary }]}>
              {rosterError}
            </Text>
          ) : (
            <View style={styles.rosterList}>
              {rosterPlayers.map((player) => {
                const id = player.externalPlayerId || player.name
                return (
                  <View
                    key={id}
                    style={[styles.rosterRow, { borderColor: c.borderDefault }]}
                  >
                    <Pressable
                      onPress={() => toggleRosterPlayer(id)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: player.selected }}
                      style={[
                        styles.rosterCheckbox,
                        {
                          borderColor: player.selected ? c.primary : c.borderDefault,
                          backgroundColor: player.selected ? c.primary : 'transparent',
                        },
                      ]}
                    >
                      {player.selected ? (
                        <Icon name="checkmark" size={11} color="inverse" />
                      ) : null}
                    </Pressable>
                    <View style={styles.rosterRowBody}>
                      <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
                        {player.jerseyNumber ? `#${player.jerseyNumber} · ` : ''}
                        {player.name}
                      </Text>
                      <TextInput
                        value={player.email}
                        onChangeText={(value) => updateRosterPlayerEmail(id, value)}
                        placeholder={t('invite.rosterEmailPlaceholder', {
                          defaultValue: 'email@example.com',
                        })}
                        placeholderTextColor={c.textTertiary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        style={[
                          styles.rosterEmailInput,
                          {
                            borderColor: c.borderDefault,
                            color: c.textPrimary,
                            backgroundColor: c.surfaceSunken,
                          },
                        ]}
                        editable={player.selected}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          <Button
            label={t('invite.rosterApply', {
              defaultValue: 'Add {{count}} to invites',
              count: rosterPlayers.filter(
                (p) => p.selected && p.email.trim() && isValidEmail(p.email.trim()),
              ).length,
            })}
            variant="filled"
            size="lg"
            fullWidth
            disabled={
              rosterPlayers.filter(
                (p) => p.selected && p.email.trim() && isValidEmail(p.email.trim()),
              ).length === 0
            }
            onPress={applyRosterEmailsToBulk}
          />
        </View>
      </BottomSheet>
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
  teamSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    gap: space.md,
  },
  teamSummaryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.lg,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCaption: {
    marginLeft: space.xs,
    flex: 1,
    minWidth: 0,
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
  multilineInput: {
    minHeight: 88,
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
  helperLine: {
    marginTop: space.xs,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  importBanner: {
    marginTop: space.sm,
    marginBottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderStyle: 'dashed',
  },
  importBannerCopy: { flex: 1 },
  importBannerTitle: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  importBannerSub: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
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
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  rosterSheet: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  rosterTitle: { marginTop: space.sm },
  rosterSourceHint: { fontStyle: 'italic' },
  rosterSubtitle: { lineHeight: 18 },
  rosterError: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    paddingVertical: space.lg,
    textAlign: 'center',
  },
  rosterList: {
    gap: space.sm,
    maxHeight: 360,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: hairline,
  },
  rosterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: space.xs,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space['2xs'],
  },
  rosterRowBody: { flex: 1, gap: space.xs },
  rosterEmailInput: {
    borderWidth: hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
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
