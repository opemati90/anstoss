import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import {
  FreeAgentVisibility,
  PlayerPosition,
  PreferredFoot,
  TrialInviteStatus,
  type FreeAgentProfile,
  type TrialInvite,
} from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { Screen, Button, Text, Icon } from '../../src/components/ui'
import { card, fontSize, space, radius, fonts, lineHeight, hairline } from '../../src/theme/tokens'
import { formatGermanShortDate } from '../../src/utils/germanDate'

const AVATAR_SIZE = 512

type ExperienceDraft = {
  id: string
  clubName: string
  roleLabel: string
  fromYear: string
  toYear: string
}

const POSITION_OPTIONS = [
  PlayerPosition.GK,
  PlayerPosition.DEF,
  PlayerPosition.MID,
  PlayerPosition.FWD,
]

const FOOT_OPTIONS = [PreferredFoot.LEFT, PreferredFoot.RIGHT, PreferredFoot.BOTH]

const VISIBILITY_OPTIONS = [
  FreeAgentVisibility.PUBLIC,
  FreeAgentVisibility.CLUB_ONLY,
  FreeAgentVisibility.PRIVATE,
]

export default function FreeAgentProfileScreen() {
  const { t } = useTranslation()
  const { user, activeClub, refreshUser } = useAuth()
  const c = useClubColors()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatarUrl || null)
  const [position, setPosition] = useState<PlayerPosition | null>(null)
  const [preferredFoot, setPreferredFoot] = useState<PreferredFoot | null>(null)
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [isOnTransferList, setIsOnTransferList] = useState(false)
  const [visibility, setVisibility] = useState<FreeAgentVisibility>(FreeAgentVisibility.PRIVATE)
  const [experience, setExperience] = useState<ExperienceDraft[]>([])
  const [trialInvites, setTrialInvites] = useState<TrialInvite[]>([])
  const [decisionInviteId, setDecisionInviteId] = useState<string | null>(null)

  const loadScreen = useCallback(async () => {
    setIsLoading(true)
    try {
      const [profile, invites] = await Promise.all([
        api<FreeAgentProfile | null>('/me/free-agent-profile').catch(() => null),
        api<TrialInvite[]>('/me/trial-invites').catch(() => []),
      ])

      setTrialInvites(invites || [])

      if (profile) {
        hydrateFromProfile(profile)
      } else {
        setProfileId(null)
        setPosition(null)
        setPreferredFoot(null)
        setCity('')
        setBio('')
        setIsOnTransferList(false)
        setVisibility(FreeAgentVisibility.PRIVATE)
        setExperience([])
      }
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('freeAgent.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadScreen()
  }, [loadScreen])

  const pendingInvites = useMemo(
    () => trialInvites.filter((invite) => invite.status === TrialInviteStatus.PENDING),
    [trialInvites],
  )

  const hydrateFromProfile = (profile: FreeAgentProfile) => {
    setProfileId(profile.id)
    setAvatarUri(profile.avatarUrl)
    setPosition(profile.position)
    setPreferredFoot(profile.preferredFoot)
    setCity(profile.city || '')
    setBio(profile.bio || '')
    setIsOnTransferList(profile.isOnTransferList)
    setVisibility(profile.visibility)
    setExperience(
      profile.experience.map((entry) => ({
        id: entry.id,
        clubName: entry.clubName,
        roleLabel: entry.roleLabel,
        fromYear: entry.fromYear ? String(entry.fromYear) : '',
        toYear: entry.toYear ? String(entry.toYear) : '',
      })),
    )
  }

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('freeAgent.photoPermissionDenied'))
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) {
      return
    }

    setIsUploadingAvatar(true)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.PNG },
      )

      const presign = await api<{
        enabled: boolean
        uploadUrl: string | null
        publicUrl: string | null
      }>('/me/avatar/presign', {
        method: 'POST',
        body: { filename: 'free-agent-avatar.png', contentType: 'image/png' },
      })

      if (!presign.enabled || !presign.uploadUrl || !presign.publicUrl) {
        Alert.alert(t('common.error'), t('freeAgent.uploadNotAvailable'))
        return
      }

      const imageResponse = await fetch(manipulated.uri)
      const blob = await imageResponse.blob()

      await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      })

      await api('/me', {
        method: 'PATCH',
        body: { avatarUrl: presign.publicUrl },
      })

      setAvatarUri(presign.publicUrl)
      await refreshUser()
    } catch {
      Alert.alert(t('common.error'), t('freeAgent.uploadFailed'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const saveProfile = async () => {
    const normalizedExperience = experience
      .map((entry, index) => ({
        clubName: entry.clubName.trim(),
        roleLabel: entry.roleLabel.trim(),
        fromYear: entry.fromYear.trim() ? Number(entry.fromYear.trim()) : null,
        toYear: entry.toYear.trim() ? Number(entry.toYear.trim()) : null,
        sortOrder: index,
      }))
      .filter((entry) => entry.clubName && entry.roleLabel)

    setIsSaving(true)
    try {
      if (user?.registrationRole !== 'FREE_AGENT') {
        await api('/me/registration-role', {
          method: 'PATCH',
          body: { registrationRole: 'FREE_AGENT' },
        })
        await refreshUser()
      }

      const endpoint = '/me/free-agent-profile'
      const method = profileId ? 'PATCH' : 'POST'
      const profile = await api<FreeAgentProfile>(endpoint, {
        method,
        body: {
          position,
          preferredFoot,
          city: city.trim() || null,
          bio: bio.trim() || null,
          isOnTransferList,
          visibility,
          experience: normalizedExperience,
        },
      })

      hydrateFromProfile(profile)
      Alert.alert(t('freeAgent.saveTitle'), t('freeAgent.saveBody'))
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('freeAgent.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const addExperience = () => {
    setExperience((current) => [
      ...current,
      {
        id: `draft-${Date.now()}-${current.length}`,
        clubName: '',
        roleLabel: '',
        fromYear: '',
        toYear: '',
      },
    ])
  }

  const updateExperience = (id: string, key: keyof ExperienceDraft, value: string) => {
    setExperience((current) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              [key]: value,
            }
          : entry,
      ),
    )
  }

  const removeExperience = (id: string) => {
    setExperience((current) => current.filter((entry) => entry.id !== id))
  }

  const handleTrialDecision = async (
    inviteId: string,
    status: TrialInviteStatus.ACCEPTED | TrialInviteStatus.DECLINED,
  ) => {
    setDecisionInviteId(inviteId)
    try {
      const updated = await api<TrialInvite>(`/trial-invites/${inviteId}`, {
        method: 'PATCH',
        body: { status },
      })
      setTrialInvites((current) =>
        current.map((invite) => (invite.id === inviteId ? updated : invite)),
      )
      await refreshUser()
    } catch (error) {
      Alert.alert(
        t('common.error'),
        error instanceof Error ? error.message : t('freeAgent.trialDecisionError'),
      )
    } finally {
      setDecisionInviteId(null)
    }
  }

  if (isLoading) {
    return (
      <Screen header={<ModalHeader title={t('freeAgent.title')} />} padded={false}>
        <ActivityIndicator style={styles.stateSpinner} color={c.primary} />
      </Screen>
    )
  }

  return (
    <Screen
      header={
        <ModalHeader
          title={t('freeAgent.title')}
          onClose={() => {
            if (activeClub) {
              router.back()
              return
            }
            router.replace('/club-setup')
          }}
        />
      }
      scroll
      padded={false}
    >
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={[styles.eyebrow, { color: c.textTertiary }]} numberOfLines={1}>
              {t('freeAgent.eyebrow')}
            </Text>
            <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={2}>
              {user?.name || t('home.fallbackName')}
            </Text>
            <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={3}>
              {t('freeAgent.subtitle')}
            </Text>
          </View>
          <Pressable
            style={[styles.avatar, { backgroundColor: c.primary50 }]}
            onPress={pickAvatar}
            disabled={isUploadingAvatar}
            accessibilityRole="button"
            accessibilityLabel={t('freeAgent.changeAvatar')}
          >
            {isUploadingAvatar ? (
              <ActivityIndicator color={c.primary} />
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: c.primary }]}>
                {(user?.name || 'P').charAt(0).toUpperCase()}
              </Text>
            )}
          </Pressable>
        </View>

        <Section title={t('freeAgent.position')} c={c}>
          <ChipRow
            values={POSITION_OPTIONS}
            selectedValue={position}
            onSelect={(value) => setPosition(value)}
            getLabel={(value) => t(`freeAgent.positionShort.${value}`)}
            selectedColor={c.primary}
            c={c}
          />
        </Section>

        <Section title={t('freeAgent.preferredFoot')} c={c}>
          <ChipRow
            values={FOOT_OPTIONS}
            selectedValue={preferredFoot}
            onSelect={(value) => setPreferredFoot(value)}
            getLabel={(value) => t(`freeAgent.foot.${value}`)}
            selectedColor={c.primary}
            c={c}
          />
        </Section>

        <Section title={t('freeAgent.city')} c={c}>
          <TextInput
            style={[
              styles.input,
              { borderColor: c.borderDefault, backgroundColor: c.background, color: c.textPrimary },
            ]}
            value={city}
            onChangeText={setCity}
            placeholder={t('freeAgent.cityPlaceholder')}
            placeholderTextColor={c.textTertiary}
          />
        </Section>

        <Section title={t('freeAgent.bio')} c={c}>
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              { borderColor: c.borderDefault, backgroundColor: c.background, color: c.textPrimary },
            ]}
            value={bio}
            onChangeText={setBio}
            placeholder={t('freeAgent.bioPlaceholder')}
            placeholderTextColor={c.textTertiary}
            multiline
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={[styles.helperText, { color: c.textTertiary }]}>
            {bio.trim().length}/500
          </Text>
        </Section>

        <Section title={t('freeAgent.transferList')} c={c}>
          <ChipRow
            values={['ON', 'OFF'] as const}
            selectedValue={isOnTransferList ? 'ON' : 'OFF'}
            onSelect={(value) => setIsOnTransferList(value === 'ON')}
            getLabel={(value) =>
              value === 'ON' ? t('freeAgent.transferListOn') : t('freeAgent.transferListOff')
            }
            selectedColor={c.primary}
            c={c}
          />
        </Section>

        <Section title={t('freeAgent.visibility')} c={c}>
          <ChipRow
            values={VISIBILITY_OPTIONS}
            selectedValue={visibility}
            onSelect={(value) => setVisibility(value)}
            getLabel={(value) => t(`freeAgent.visibilityLabel.${value}`)}
            selectedColor={c.primary}
            c={c}
          />
        </Section>

        <Section
          title={t('freeAgent.experienceTitle')}
          actionLabel={t('freeAgent.addExperience')}
          onAction={addExperience}
          c={c}
        >
          {experience.length === 0 ? (
            <Text style={[styles.emptyCopy, { color: c.textSecondary }]}>
              {t('freeAgent.experienceEmpty')}
            </Text>
          ) : (
            experience.map((entry) => (
              <View
                key={entry.id}
                style={[
                  styles.experienceCard,
                  { borderColor: c.borderDefault, backgroundColor: c.background },
                ]}
              >
                <View style={styles.experienceHeader}>
                  <Text
                    style={[styles.experienceTitle, { color: c.textPrimary }]}
                    numberOfLines={1}
                  >
                    {entry.clubName || t('freeAgent.newExperience')}
                  </Text>
                  <Pressable
                    onPress={() => removeExperience(entry.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('freeAgent.removeExperience')}
                  >
                    <Icon name="trash" size="md" color={c.error} />
                  </Pressable>
                </View>
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: c.borderDefault, backgroundColor: c.background, color: c.textPrimary },
                  ]}
                  value={entry.clubName}
                  onChangeText={(value) => updateExperience(entry.id, 'clubName', value)}
                  placeholder={t('freeAgent.experienceClub')}
                  placeholderTextColor={c.textTertiary}
                />
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: c.borderDefault, backgroundColor: c.background, color: c.textPrimary },
                  ]}
                  value={entry.roleLabel}
                  onChangeText={(value) => updateExperience(entry.id, 'roleLabel', value)}
                  placeholder={t('freeAgent.experienceRole')}
                  placeholderTextColor={c.textTertiary}
                />
                <View style={styles.yearRow}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.yearInput,
                      {
                        borderColor: c.borderDefault,
                        backgroundColor: c.background,
                        color: c.textPrimary,
                      },
                    ]}
                    value={entry.fromYear}
                    onChangeText={(value) => updateExperience(entry.id, 'fromYear', value)}
                    placeholder={t('freeAgent.experienceFrom')}
                    placeholderTextColor={c.textTertiary}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[
                      styles.input,
                      styles.yearInput,
                      {
                        borderColor: c.borderDefault,
                        backgroundColor: c.background,
                        color: c.textPrimary,
                      },
                    ]}
                    value={entry.toYear}
                    onChangeText={(value) => updateExperience(entry.id, 'toYear', value)}
                    placeholder={t('freeAgent.experienceTo')}
                    placeholderTextColor={c.textTertiary}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            ))
          )}
        </Section>

        <Button
          label={t('freeAgent.save')}
          variant="filled"
          size="lg"
          fullWidth
          loading={isSaving}
          onPress={() => void saveProfile()}
        />

        <Section
          title={t('freeAgent.trialInvitesTitle')}
          description={t('freeAgent.trialInvitesBody', {
            count: pendingInvites.length,
          })}
          c={c}
        >
          {trialInvites.length === 0 ? (
            <Text style={[styles.emptyCopy, { color: c.textSecondary }]}>
              {t('freeAgent.trialInvitesEmpty')}
            </Text>
          ) : (
            trialInvites.map((invite) => (
              <View
                key={invite.id}
                style={[
                  styles.inviteCard,
                  { borderColor: c.borderDefault, backgroundColor: c.background },
                ]}
              >
                <View style={styles.inviteHeader}>
                  <View>
                    <Text style={[styles.inviteClub, { color: c.textPrimary }]} numberOfLines={1}>
                      {invite.club.name}
                    </Text>
                    <Text style={[styles.inviteTeam, { color: c.textSecondary }]} numberOfLines={1}>
                      {invite.team.displayName}
                    </Text>
                  </View>
                  <InlineStatusPill
                    label={t(`freeAgent.trialStatus.${invite.status}`)}
                    color={
                      invite.status === TrialInviteStatus.ACCEPTED
                        ? c.success
                        : invite.status === TrialInviteStatus.DECLINED
                          ? c.error
                          : invite.status === TrialInviteStatus.EXPIRED
                            ? c.textSecondary
                            : c.primary
                    }
                  />
                </View>
                {invite.message ? (
                  <Text style={[styles.inviteMessage, { color: c.textPrimary }]} numberOfLines={3}>
                    {invite.message}
                  </Text>
                ) : null}
                <Text style={[styles.inviteMeta, { color: c.textTertiary }]}>
                  {t('freeAgent.expiresOn', {
                    date: formatGermanShortDate(invite.expiresAt),
                  })}
                </Text>

                {invite.status === TrialInviteStatus.PENDING ? (
                  <View style={styles.inviteActions}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label={t('freeAgent.decline')}
                        variant="secondary"
                        size="md"
                        fullWidth
                        onPress={() =>
                          void handleTrialDecision(invite.id, TrialInviteStatus.DECLINED)
                        }
                        disabled={decisionInviteId === invite.id}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label={t('freeAgent.accept')}
                        variant="filled"
                        size="md"
                        fullWidth
                        loading={decisionInviteId === invite.id}
                        onPress={() =>
                          void handleTrialDecision(invite.id, TrialInviteStatus.ACCEPTED)
                        }
                        disabled={decisionInviteId === invite.id}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </View>
    </Screen>
  )
}

type ClubColors = ReturnType<typeof useClubColors>

function Section({
  title,
  description,
  actionLabel,
  onAction,
  children,
  c,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children: React.ReactNode
  c: ClubColors
}) {
  return (
    <View style={[styles.section, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          {description ? (
            <Text style={[styles.sectionDescription, { color: c.textSecondary }]} numberOfLines={3}>
              {description}
            </Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
            <Text style={[styles.sectionAction, { color: c.textPrimary }]} numberOfLines={1}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  )
}

function ChipRow<T extends string>({
  values,
  selectedValue,
  onSelect,
  getLabel,
  selectedColor,
  c,
}: {
  values: readonly T[]
  selectedValue: T | null
  onSelect: (value: T) => void
  getLabel: (value: T) => string
  selectedColor: string
  c: ClubColors
}) {
  return (
    <View style={styles.chipRow}>
      {values.map((value) => {
        const active = value === selectedValue
        return (
          <Pressable
            key={value}
            style={[
              styles.chip,
              { borderColor: c.borderDefault, backgroundColor: c.background },
              active && { borderColor: selectedColor, backgroundColor: `${selectedColor}14` },
            ]}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityLabel={getLabel(value)}
          >
            <Text
              style={[
                styles.chipText,
                { color: c.textPrimary },
                active ? { color: selectedColor } : {},
              ]}
            >
              {getLabel(value)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function InlineStatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.statusPill, { borderColor: `${color}33`, backgroundColor: `${color}10` }]}>
      <Text style={[styles.statusPillText, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stateSpinner: {
    marginTop: space['3xl'],
  },
  content: {
    paddingHorizontal: space.md,
    paddingBottom: space['2xl'],
    gap: space.md,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  heroCopy: {
    flex: 1,
    gap: space.sm,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.lg,
    letterSpacing: -0.15,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: fontSize['2xl'],
    fontFamily: fonts.heading,
  },
  section: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.padding,
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  sectionCopy: {
    flex: 1,
    gap: space.xs,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.md,
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  sectionAction: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  input: {
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: card.radius,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  textarea: {
    minHeight: 140,
  },
  helperText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    textAlign: 'right',
  },
  emptyCopy: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  experienceCard: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.paddingCompact,
    gap: space.sm,
  },
  experienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  experienceTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  yearRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  yearInput: {
    flex: 1,
  },
  inviteCard: {
    borderWidth: hairline,
    borderRadius: card.radius,
    padding: card.paddingCompact,
    gap: space.sm,
  },
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  inviteClub: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
  inviteTeam: {
    marginTop: space['2xs'],
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
  },
  inviteMessage: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  inviteMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  statusPill: {
    minHeight: 30,
    borderRadius: radius.full,
    borderWidth: hairline,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
})
