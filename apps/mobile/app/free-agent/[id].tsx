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
import { Screen, Button, Text, BottomSheet, Icon } from '../../src/components/ui'
import {
  fontSize,
  space,
  radius,
  fonts,
  lineHeight,
  hairline,
  elevation,
} from '../../src/theme/tokens'

function withAlpha(hex: string, alpha: number): string {
  // Tolerant alpha helper: works for #RGB, #RRGGBB, and rgb()/rgba() inputs.
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body)
        .split(',')
        .map((p) => p.trim())
        .slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

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
  const [, setLoadFailed] = useState(false)
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
      <Text variant="subheadline" color="secondary" style={styles.bodyText}>
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
                    backgroundColor: withAlpha(c.primary, 0.08),
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
    <Screen header={<ModalHeader mode="back" title={t('transferList.profileTitle')} />} padded={false}>
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
            {/* Hero — name as the large title, key facts as quiet meta */}
            <View style={styles.hero}>
              <View style={styles.heroRow}>
                {profile.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: withAlpha(c.primary, 0.12) }]}>
                    <Text variant="title2" weight="bold" style={{ color: c.primary }}>
                      {(profile.user?.name ?? 'P').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.heroCopy}>
                  <Text variant="title2" weight="semibold" color="primary" style={styles.name} numberOfLines={2}>
                    {profile.user?.name ?? ''}
                  </Text>
                  {[profile.position, profile.city].filter(Boolean).length > 0 ? (
                    <Text variant="footnote" color="secondary" numberOfLines={1}>
                      {[profile.position, profile.city].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                  <View style={styles.heroMetaRow}>
                    <Icon name="eye" size={13} color="tertiary" />
                    <Text variant="caption1" color="tertiary">
                      {t(`freeAgent.visibilityLabel.${profile.visibility}`)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* About — eyebrow + grouped content in the one card language */}
            <View style={styles.sectionGroup}>
              <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                {t('freeAgent.bio').toUpperCase()}
              </Text>
              <View
                style={[
                  styles.section,
                  elevation.card,
                  { borderColor: c.borderDefault, backgroundColor: c.surface },
                ]}
              >
                <Text variant="subheadline" color="secondary" style={styles.bodyText}>
                  {profile.bio || t('transferList.noBio')}
                </Text>
              </View>
            </View>

            {/* Experience */}
            <View style={styles.sectionGroup}>
              <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                {t('freeAgent.experienceTitle').toUpperCase()}
              </Text>
              <View
                style={[
                  styles.section,
                  elevation.card,
                  { borderColor: c.borderDefault, backgroundColor: c.surface },
                ]}
              >
                {profile.experience.length === 0 ? (
                  <Text variant="subheadline" color="secondary" style={styles.bodyText}>
                    {t('freeAgent.experienceEmpty')}
                  </Text>
                ) : (
                  profile.experience.map((entry, index) => (
                    <View
                      key={entry.id}
                      style={[
                        styles.experienceRow,
                        index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle ?? c.borderDefault },
                      ]}
                    >
                      <Text variant="callout" color="primary" numberOfLines={1}>
                        {entry.clubName}
                      </Text>
                      <Text variant="footnote" color="secondary">
                        {entry.roleLabel}
                        {entry.fromYear || entry.toYear
                          ? ` · ${entry.fromYear || '...'}-${entry.toYear || t('transferList.now')}`
                          : ''}
                      </Text>
                    </View>
                  ))
                )}
              </View>
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
    gap: space.lg,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  hero: {
    paddingTop: space.sm,
  },
  heroRow: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  name: {
    letterSpacing: -0.3,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    marginTop: space['2xs'],
  },
  sectionGroup: { gap: space.sm },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: fontSize.xs,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginLeft: space.xs,
  },
  section: {
    borderWidth: hairline,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  bodyText: {
    lineHeight: lineHeight.sm,
  },
  experienceRow: {
    paddingVertical: space.sm,
  },
  stickyFooter: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: hairline,
  },
  sheetContent: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    marginBottom: space.sm,
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
