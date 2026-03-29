import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { FreeAgentProfile } from '@anstoss/shared'
import type { TrialInvite } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { ModalHeader } from '../../src/components/ModalHeader'
import { SelectionSheet } from '../../src/components/SelectionSheet'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { neutralColors } from '../../src/theme/tokens'

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
  const theme = useClubColors()
  const [profile, setProfile] = useState<FreeAgentProfile | null>(null)
  const [teams, setTeams] = useState<TeamChoice[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [expiryDays, setExpiryDays] = useState<number>(7)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [teamSheetOpen, setTeamSheetOpen] = useState(false)

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
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('transferList.detailError'),
      )
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

  return (
    <View style={styles.container}>
      <ModalHeader title={t('transferList.profileTitle')} />

      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={theme.clubPrimary} />
        </View>
      ) : profile ? (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.clubPrimaryLight }]}>
                  <Text style={[styles.avatarInitial, { color: theme.clubPrimary }]}>
                    {profile.user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.heroCopy}>
                <Text style={styles.name}>{profile.user.name}</Text>
                <Text style={styles.meta}>
                  {[profile.position, profile.city].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.meta}>
                  {t(`freeAgent.visibilityLabel.${profile.visibility}`)}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('freeAgent.bio')}</Text>
              <Text style={styles.sectionBody}>
                {profile.bio || t('transferList.noBio')}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('freeAgent.experienceTitle')}</Text>
              {profile.experience.length === 0 ? (
                <Text style={styles.sectionBody}>{t('freeAgent.experienceEmpty')}</Text>
              ) : (
                profile.experience.map((entry) => (
                  <View key={entry.id} style={styles.experienceRow}>
                    <Text style={styles.experienceClub}>{entry.clubName}</Text>
                    <Text style={styles.experienceMeta}>
                      {entry.roleLabel}
                      {entry.fromYear || entry.toYear
                        ? ` · ${entry.fromYear || '...'}-${entry.toYear || t('transferList.now')}`
                        : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {isAdmin ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('transferList.inviteSectionTitle')}</Text>
                {teams.length === 0 ? (
                  <Text style={styles.sectionBody}>{t('transferList.noTeamsBody')}</Text>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.selector}
                      onPress={() => setTeamSheetOpen(true)}
                    >
                      <View>
                        <Text style={styles.selectorLabel}>{t('transferList.teamLabel')}</Text>
                        <Text style={styles.selectorValue}>
                          {selectedTeam?.displayName || t('transferList.selectTeam')}
                        </Text>
                      </View>
                      <Text style={styles.selectorMeta}>
                        {selectedTeam?.groupName || ''}
                      </Text>
                    </TouchableOpacity>

                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={message}
                      onChangeText={setMessage}
                      placeholder={t('transferList.messagePlaceholder')}
                      placeholderTextColor={neutralColors.textTertiary}
                      multiline
                      textAlignVertical="top"
                    />

                    <View style={styles.expiryRow}>
                      {EXPIRY_OPTIONS.map((days) => {
                        const active = days === expiryDays
                        return (
                          <TouchableOpacity
                            key={days}
                            style={[
                              styles.expiryChip,
                              active && {
                                borderColor: theme.clubPrimary,
                                backgroundColor: `${theme.clubPrimary}14`,
                              },
                            ]}
                            onPress={() => setExpiryDays(days)}
                          >
                            <Text
                              style={[
                                styles.expiryChipText,
                                active && { color: theme.clubPrimary },
                              ]}
                            >
                              {t('transferList.expiryOption', { count: days })}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        { backgroundColor: theme.clubPrimary },
                        isSending && styles.disabledButton,
                      ]}
                      onPress={() => void sendTrialInvite()}
                      disabled={!selectedTeamId || isSending}
                    >
                      {isSending ? (
                        <ActivityIndicator color={neutralColors.textInverse} />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {t('transferList.sendInvite')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : null}
          </ScrollView>

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
        <View style={styles.state}>
          <Text style={styles.stateBody}>{t('transferList.detailError')}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  stateBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: neutralColors.textSecondary,
  },
  hero: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  meta: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  section: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 14,
    backgroundColor: neutralColors.surface,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  experienceRow: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  experienceClub: {
    fontSize: 15,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  experienceMeta: {
    marginTop: 2,
    fontSize: 13,
    color: neutralColors.textSecondary,
  },
  selector: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 10,
    backgroundColor: neutralColors.background,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectorValue: {
    fontSize: 15,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  selectorMeta: {
    fontSize: 13,
    color: neutralColors.textSecondary,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 10,
    backgroundColor: neutralColors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: neutralColors.textPrimary,
  },
  textarea: {
    minHeight: 120,
  },
  expiryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  expiryChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiryChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: neutralColors.textInverse,
  },
  disabledButton: {
    opacity: 0.7,
  },
})
