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
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { neutralColors, semanticColors, fontSize, fontWeight, space, radius, fonts, lineHeight } from '../../src/theme/tokens'
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

const FOOT_OPTIONS = [
  PreferredFoot.LEFT,
  PreferredFoot.RIGHT,
  PreferredFoot.BOTH,
]

const VISIBILITY_OPTIONS = [
  FreeAgentVisibility.PUBLIC,
  FreeAgentVisibility.CLUB_ONLY,
  FreeAgentVisibility.PRIVATE,
]

export default function FreeAgentProfileScreen() {
  const { t } = useTranslation()
  const { user, activeClub, refreshUser } = useAuth()
  const theme = useClubColors()
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
  const [visibility, setVisibility] = useState<FreeAgentVisibility>(
    FreeAgentVisibility.PRIVATE,
  )
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

  const updateExperience = (
    id: string,
    key: keyof ExperienceDraft,
    value: string,
  ) => {
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
      <View style={styles.stateContainer}>
        <ModalHeader title={t('freeAgent.title')} />
        <ActivityIndicator style={styles.stateSpinner} color={theme.clubPrimary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
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

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{t('freeAgent.eyebrow')}</Text>
            <Text style={styles.title}>{user?.name || t('home.fallbackName')}</Text>
            <Text style={styles.subtitle}>{t('freeAgent.subtitle')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}
            onPress={pickAvatar}
            disabled={isUploadingAvatar}
            accessibilityRole="button"
            accessibilityLabel={t('freeAgent.changeAvatar')}
          >
            {isUploadingAvatar ? (
              <ActivityIndicator color={theme.clubPrimary} />
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>
                {(user?.name || 'P').charAt(0).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Section title={t('freeAgent.position')}>
          <ChipRow
            values={POSITION_OPTIONS}
            selectedValue={position}
            onSelect={(value) => setPosition(value)}
            getLabel={(value) => t(`freeAgent.positionShort.${value}`)}
            selectedColor={theme.clubPrimary}
          />
        </Section>

        <Section title={t('freeAgent.preferredFoot')}>
          <ChipRow
            values={FOOT_OPTIONS}
            selectedValue={preferredFoot}
            onSelect={(value) => setPreferredFoot(value)}
            getLabel={(value) => t(`freeAgent.foot.${value}`)}
            selectedColor={theme.clubPrimary}
          />
        </Section>

        <Section title={t('freeAgent.city')}>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder={t('freeAgent.cityPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
          />
        </Section>

        <Section title={t('freeAgent.bio')}>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={bio}
            onChangeText={setBio}
            placeholder={t('freeAgent.bioPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
            multiline
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.helperText}>{bio.trim().length}/500</Text>
        </Section>

        <Section title={t('freeAgent.transferList')}>
          <ChipRow
            values={['ON', 'OFF'] as const}
            selectedValue={isOnTransferList ? 'ON' : 'OFF'}
            onSelect={(value) => setIsOnTransferList(value === 'ON')}
            getLabel={(value) =>
              value === 'ON' ? t('freeAgent.transferListOn') : t('freeAgent.transferListOff')
            }
            selectedColor={theme.clubPrimary}
          />
        </Section>

        <Section title={t('freeAgent.visibility')}>
          <ChipRow
            values={VISIBILITY_OPTIONS}
            selectedValue={visibility}
            onSelect={(value) => setVisibility(value)}
            getLabel={(value) => t(`freeAgent.visibilityLabel.${value}`)}
            selectedColor={theme.clubPrimary}
          />
        </Section>

        <Section
          title={t('freeAgent.experienceTitle')}
          actionLabel={t('freeAgent.addExperience')}
          onAction={addExperience}
        >
          {experience.length === 0 ? (
            <Text style={styles.emptyCopy}>{t('freeAgent.experienceEmpty')}</Text>
          ) : (
            experience.map((entry) => (
              <View key={entry.id} style={styles.experienceCard}>
                <View style={styles.experienceHeader}>
                  <Text style={styles.experienceTitle}>
                    {entry.clubName || t('freeAgent.newExperience')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => removeExperience(entry.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('freeAgent.removeExperience')}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={semanticColors.error}
                    />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={entry.clubName}
                  onChangeText={(value) => updateExperience(entry.id, 'clubName', value)}
                  placeholder={t('freeAgent.experienceClub')}
                  placeholderTextColor={neutralColors.textTertiary}
                />
                <TextInput
                  style={styles.input}
                  value={entry.roleLabel}
                  onChangeText={(value) => updateExperience(entry.id, 'roleLabel', value)}
                  placeholder={t('freeAgent.experienceRole')}
                  placeholderTextColor={neutralColors.textTertiary}
                />
                <View style={styles.yearRow}>
                  <TextInput
                    style={[styles.input, styles.yearInput]}
                    value={entry.fromYear}
                    onChangeText={(value) => updateExperience(entry.id, 'fromYear', value)}
                    placeholder={t('freeAgent.experienceFrom')}
                    placeholderTextColor={neutralColors.textTertiary}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.yearInput]}
                    value={entry.toYear}
                    onChangeText={(value) => updateExperience(entry.id, 'toYear', value)}
                    placeholder={t('freeAgent.experienceTo')}
                    placeholderTextColor={neutralColors.textTertiary}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            ))
          )}
        </Section>

        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: theme.clubPrimary },
            isSaving && styles.disabledButton,
          ]}
          onPress={() => void saveProfile()}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={t('freeAgent.save')}
        >
          {isSaving ? (
            <ActivityIndicator color={neutralColors.textInverse} />
          ) : (
            <Text style={styles.saveButtonText}>{t('freeAgent.save')}</Text>
          )}
        </TouchableOpacity>

        <Section
          title={t('freeAgent.trialInvitesTitle')}
          description={t('freeAgent.trialInvitesBody', {
            count: pendingInvites.length,
          })}
        >
          {trialInvites.length === 0 ? (
            <Text style={styles.emptyCopy}>{t('freeAgent.trialInvitesEmpty')}</Text>
          ) : (
            trialInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                <View style={styles.inviteHeader}>
                  <View>
                    <Text style={styles.inviteClub}>{invite.club.name}</Text>
                    <Text style={styles.inviteTeam}>{invite.team.displayName}</Text>
                  </View>
                  <StatusPill
                    label={t(`freeAgent.trialStatus.${invite.status}`)}
                    color={
                      invite.status === TrialInviteStatus.ACCEPTED
                        ? semanticColors.success
                        : invite.status === TrialInviteStatus.DECLINED
                          ? semanticColors.error
                          : invite.status === TrialInviteStatus.EXPIRED
                            ? neutralColors.textSecondary
                            : theme.clubPrimary
                    }
                  />
                </View>
                {invite.message ? (
                  <Text style={styles.inviteMessage}>{invite.message}</Text>
                ) : null}
                <Text style={styles.inviteMeta}>
                  {t('freeAgent.expiresOn', {
                    date: formatGermanShortDate(invite.expiresAt),
                  })}
                </Text>

                {invite.status === TrialInviteStatus.PENDING ? (
                  <View style={styles.inviteActions}>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() =>
                        void handleTrialDecision(invite.id, TrialInviteStatus.DECLINED)
                      }
                      disabled={decisionInviteId === invite.id}
                      accessibilityRole="button"
                      accessibilityLabel={t('freeAgent.decline')}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {t('freeAgent.decline')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        { backgroundColor: theme.clubPrimary },
                      ]}
                      onPress={() =>
                        void handleTrialDecision(invite.id, TrialInviteStatus.ACCEPTED)
                      }
                      disabled={decisionInviteId === invite.id}
                      accessibilityRole="button"
                      accessibilityLabel={t('freeAgent.accept')}
                    >
                      {decisionInviteId === invite.id ? (
                        <ActivityIndicator color={neutralColors.textInverse} />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {t('freeAgent.accept')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Section>
      </ScrollView>
    </View>
  )
}

function Section({
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
          >
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </TouchableOpacity>
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
}: {
  values: readonly T[]
  selectedValue: T | null
  onSelect: (value: T) => void
  getLabel: (value: T) => string
  selectedColor: string
}) {
  return (
    <View style={styles.chipRow}>
      {values.map((value) => {
        const active = value === selectedValue
        return (
          <TouchableOpacity
            key={value}
            style={[
              styles.chip,
              active && { borderColor: selectedColor, backgroundColor: `${selectedColor}14` },
            ]}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityLabel={getLabel(value)}
          >
            <Text
              style={[
                styles.chipText,
                active && { color: selectedColor },
              ]}
            >
              {getLabel(value)}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.statusPill, { borderColor: `${color}33`, backgroundColor: `${color}10` }]}>
      <Text style={[styles.statusPillText, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  stateContainer: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
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
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: neutralColors.textTertiary,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
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
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  section: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: space.md,
    backgroundColor: neutralColors.surface,
    padding: space.md,
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
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  sectionAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.background,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    backgroundColor: neutralColors.background,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
  },
  textarea: {
    minHeight: 140,
  },
  helperText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
    textAlign: 'right',
  },
  emptyCopy: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  experienceCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.background,
    padding: space.md,
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
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  yearRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  yearInput: {
    flex: 1,
  },
  saveButton: {
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  disabledButton: {
    opacity: 0.7,
  },
  inviteCard: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.background,
    padding: space.md,
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
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  inviteTeam: {
    marginTop: space['2xs'],
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  inviteMessage: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textPrimary,
  },
  inviteMeta: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.surface,
  },
  secondaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  statusPill: {
    minHeight: 30,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    textTransform: 'uppercase',
  },
})
