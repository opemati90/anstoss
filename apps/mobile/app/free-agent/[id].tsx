import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { FreeAgentProfile } from '@anstoss/shared'
import type { TrialInvite } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { ModalHeader } from '../../src/components/ModalHeader'
import { SelectionSheet } from '../../src/components/SelectionSheet'
import { ErrorState } from '../../src/components/ErrorState'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Screen, Button, Text, BottomSheet } from '../../src/components/ui'
import {
  fontSize,
  space,
  radius,
  fonts,
  lineHeight,
  hairline,
  SCREEN_PADDING,
  SPACING_MD,
  SPACING_LG,
  SPACING_SM,
} from '../../src/theme/tokens'

type TeamChoice = {
  id: string
  displayName: string
  groupName: string
}

const EXPIRY_OPTIONS = [3, 7, 14]

export default function FreeAgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>()
  const profileId = Array.isArray(id) ? id[0] : id
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const [profile, setProfile] = useState<FreeAgentProfile | null>(null)
  const [teams, setTeams] = useState<TeamChoice[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [expiryDays, setExpiryDays] = useState<number>(7)
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [teamSheetOpen, setTeamSheetOpen] = useState(false)
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false)

  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

  const loadScreen = useCallback(async () => {
    if (!profileId) return

    setIsLoading(true)
    try {
      const freeAgent = await api<FreeAgentProfile>(`/free-agents/${profileId}`)
      setProfile(freeAgent)

      if (activeClub?.club.id && isAdmin) {
        const groups = await api<
          Array<{
            id: string
            displayName: string
            teams: Array<{ id: string; displayName: string }>
          }>
        >(`/clubs/${activeClub.club.id}/team-groups`)

        const flattenedTeams = (groups || []).flatMap((group) =>
          group.teams.map((team) => ({
            id: team.id,
            displayName: team.displayName,
            groupName: group.displayName,
          })),
        )

        setTeams(flattenedTeams)
        setSelectedTeamId(flattenedTeams[0]?.id || '')
      }
    } catch {
      setLoadFailed(true)
    } finally {
      setIsLoading(false)
    }
  }, [activeClub?.club.id, isAdmin, profileId, t])

  useEffect(() => {
    void loadScreen()
  }, [loadScreen])

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [selectedTeamId, teams],
  )

  const sendTrialInvite = async () => {
    if (!activeClub?.club.id || !selectedTeamId || !profileId) {
      return
    }

    setIsSending(true)
    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiryDays)

      await api<TrialInvite>(`/clubs/${activeClub.club.id}/trial-invites`, {
        method: 'POST',
        body: {
          freeAgentProfileId: profileId,
          teamId: selectedTeamId,
          message: message.trim() || undefined,
          expiresAt: expiresAt.toISOString(),
        },
      })

      Alert.alert(t('transferList.inviteSentTitle'), t('transferList.inviteSentBody'))
      setMessage('')
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('transferList.inviteSendError'),
      )
    } finally {
      setIsSending(false)
    }
  }

  // Invite form content — rendered inside the BottomSheet
  const inviteFormContent =
    teams.length === 0 ? (
      <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
        {t('transferList.noTeamsBody')}
      </Text>
    ) : (
      <>
        <Pressable
          style={[
            styles.selector,
            { borderColor: c.borderDefault, backgroundColor: c.background },
          ]}
          onPress={() => setTeamSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('transferList.selectTeam')}
        >
          <View>
            <Text style={[styles.selectorLabel, { color: c.textTertiary }]}>
              {t('transferList.teamLabel')}
            </Text>
            <Text style={[styles.selectorValue, { color: c.textPrimary }]}>
              {selectedTeam?.displayName || t('transferList.selectTeam')}
            </Text>
          </View>
          <Text style={[styles.selectorMeta, { color: c.textSecondary }]}>
            {selectedTeam?.groupName || ''}
          </Text>
        </Pressable>

        <TextInput
          style={[
            styles.input,
            styles.textarea,
            {
              borderColor: c.borderDefault,
              backgroundColor: c.background,
              color: c.textPrimary,
            },
          ]}
          value={message}
          onChangeText={setMessage}
          placeholder={t('transferList.messagePlaceholder')}
          placeholderTextColor={c.textTertiary}
          multiline
          textAlignVertical="top"
        />

        <View style={styles.expiryRow}>
          {EXPIRY_OPTIONS.map((days) => {
            const active = days === expiryDays
            return (
              <Pressable
                key={days}
                style={[
                  styles.expiryChip,
                  { borderColor: c.borderDefault, backgroundColor: c.background },
                  active && {
                    borderColor: c.primary,
                    backgroundColor: `${c.primary}14`,
                  },
                ]}
                onPress={() => setExpiryDays(days)}
                accessibilityRole="button"
                accessibilityLabel={t('transferList.expiryOption', { count: days })}
              >
                <Text
                  style={[
                    styles.expiryChipText,
                    { color: c.textPrimary },
                    active ? { color: c.primary } : {},
                  ]}
                >
                  {t('transferList.expiryOption', { count: days })}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Button
          label={t('transferList.sendInvite')}
          variant="filled"
          size="lg"
          fullWidth
          loading={isSending}
          disabled={!selectedTeamId || isSending}
          onPress={() => void sendTrialInvite()}
        />
      </>
    )

  return (
    <Screen header={<ModalHeader title={t('transferList.profileTitle')} />} padded={false}>
      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : profile ? (
        <>
          {/* Clean profile scroll — no invite form card */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: c.primary50 }]}>
                  <Text style={[styles.avatarInitial, { color: c.primary }]}>
                    {(profile.user?.name ?? 'P').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.heroCopy}>
                <Text style={[styles.name, { color: c.textPrimary }]}>
                  {profile.user?.name ?? ''}
                </Text>
                <Text style={[styles.meta, { color: c.textSecondary }]}>
                  {[profile.position, profile.city].filter(Boolean).join(' · ')}
                </Text>
                <Text style={[styles.meta, { color: c.textSecondary }]}>
                  {t(`freeAgent.visibilityLabel.${profile.visibility}`)}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.section,
                { borderColor: c.borderDefault, backgroundColor: c.surface },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                {t('freeAgent.bio')}
              </Text>
              <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
                {profile.bio || t('transferList.noBio')}
              </Text>
            </View>

            <View
              style={[
                styles.section,
                { borderColor: c.borderDefault, backgroundColor: c.surface },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
                {t('freeAgent.experienceTitle')}
              </Text>
              {profile.experience.length === 0 ? (
                <Text style={[styles.sectionBody, { color: c.textSecondary }]}>
                  {t('freeAgent.experienceEmpty')}
                </Text>
              ) : (
                profile.experience.map((entry) => (
                  <View
                    key={entry.id}
                    style={[styles.experienceRow, { borderTopColor: c.borderDefault }]}
                  >
                    <Text style={[styles.experienceClub, { color: c.textPrimary }]}>
                      {entry.clubName}
                    </Text>
                    <Text style={[styles.experienceMeta, { color: c.textSecondary }]}>
                      {entry.roleLabel}
                      {entry.fromYear || entry.toYear
                        ? ` · ${entry.fromYear || '...'}-${entry.toYear || t('transferList.now')}`
                        : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          {/* Sticky primary CTA at the bottom — opens invite BottomSheet */}
          {isAdmin ? (
            <View
              style={[
                styles.stickyFooter,
                {
                  backgroundColor: c.background,
                  borderTopColor: c.borderDefault,
                },
              ]}
            >
              <Button
                label={t('freeAgent.sendTrialInvite', { defaultValue: 'Send trial invite' })}
                variant="filled"
                size="lg"
                fullWidth
                onPress={() => setInviteSheetOpen(true)}
              />
            </View>
          ) : null}

          {/* Invite form in a BottomSheet — keeps profile scroll clean */}
          {isAdmin ? (
            <BottomSheet
              visible={inviteSheetOpen}
              onClose={() => setInviteSheetOpen(false)}
              heightPct="auto"
            >
              <ScrollView
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>
                  {t('transferList.inviteSectionTitle')}
                </Text>
                {inviteFormContent}
              </ScrollView>
            </BottomSheet>
          ) : null}

          <SelectionSheet
            visible={teamSheetOpen}
            title={t('transferList.selectTeam')}
            options={teams.map((team) => ({
              label: team.displayName,
              value: team.id,
              description: team.groupName,
            }))}
            selectedValue={selectedTeamId}
            onSelect={setSelectedTeamId}
            onClose={() => setTeamSheetOpen(false)}
          />
        </>
      ) : (
        <ErrorState
          message={t('transferList.detailError')}
          onRetry={() => void loadScreen()}
          fillContainer
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  stateBody: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
  hero: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
  },
  avatarFallback: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: fontSize['3xl'],
    fontFamily: fonts.heading,
  },
  heroCopy: {
    flex: 1,
    gap: space.sm,
  },
  name: {
    fontSize: fontSize['3xl'],
    fontFamily: fonts.heading,
  },
  meta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  section: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  sectionBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  experienceRow: {
    paddingVertical: space.sm,
    borderTopWidth: hairline,
  },
  experienceClub: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  experienceMeta: {
    marginTop: space['2xs'],
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  stickyFooter: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_LG,
    borderTopWidth: hairline,
  },
  sheetContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_LG,
    gap: SPACING_SM,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    marginBottom: SPACING_SM,
  },
  selector: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.xs,
  },
  selectorLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  selectorValue: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  selectorMeta: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  input: {
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  textarea: {
    minHeight: 120,
  },
  expiryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  expiryChip: {
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiryChipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
})
