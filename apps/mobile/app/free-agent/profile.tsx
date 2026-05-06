/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as Sharing from 'expo-sharing'
import { captureRef } from 'react-native-view-shot'
import { Video, ResizeMode } from 'expo-av'
import { PlayerCard } from '../../src/components/wizard/PlayerCard'
import {
  FreeAgentVisibility,
  PlayerPosition,
  PreferredFoot,
  TrialInviteStatus,
  type FreeAgentMediaEntry,
  type FreeAgentProfile,
  type TrialInvite,
} from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { api, API_URL } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { ModalHeader } from '../../src/components/ModalHeader'
import { Screen, Button, Text, Icon } from '../../src/components/ui'
import { fontSize, space, radius, fonts, lineHeight, hairline } from '../../src/theme/tokens'
import { formatGermanShortDate } from '../../src/utils/germanDate'

const AVATAR_SIZE = 512
const PHOTO_MAX = 6
const VIDEO_MAX = 2

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

type PresignResp = {
  enabled: boolean
  uploadUrl: string | null
  publicUrl: string | null
  objectKey: string
}

export default function FreeAgentProfileScreen() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatarUrl || null)
  const [position, setPosition] = useState<PlayerPosition | null>(null)
  const [preferredFoot, setPreferredFoot] = useState<PreferredFoot | null>(null)
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')
  const [isOnTransferList, setIsOnTransferList] = useState(false)
  const [visibility, setVisibility] = useState<FreeAgentVisibility>(FreeAgentVisibility.PRIVATE)
  const [experience, setExperience] = useState<ExperienceDraft[]>([])
  const [media, setMedia] = useState<FreeAgentMediaEntry[]>([])
  const [trialInvites, setTrialInvites] = useState<TrialInvite[]>([])
  const [decisionInviteId, setDecisionInviteId] = useState<string | null>(null)
  const [isExportingCard, setIsExportingCard] = useState(false)
  const cardRef = useRef<View>(null)
  // Tab swap below the hero — compresses the long-scroll into 3 focused
  // sections so users don't have to scroll through 10 cards to find a field.
  const [activeTab, setActiveTab] = useState<'identity' | 'showcase' | 'trials'>(
    'identity',
  )

  const photos = useMemo(() => media.filter((m) => m.type === 'PHOTO'), [media])
  const videos = useMemo(() => media.filter((m) => m.type === 'VIDEO'), [media])

  const completion = useMemo(() => {
    let filled = 0
    let total = 6
    if (avatarUri) filled++
    if (position) filled++
    if (preferredFoot) filled++
    if (city.trim().length > 1) filled++
    if (bio.trim().length > 0) filled++
    if (photos.length > 0 || videos.length > 0) filled++
    return Math.round((filled / total) * 100)
  }, [avatarUri, position, preferredFoot, city, bio, photos.length, videos.length])

  const statusLabel = isOnTransferList
    ? visibility === FreeAgentVisibility.PUBLIC
      ? t('freeAgent.statusLive', { defaultValue: 'Live on marketplace' })
      : t('freeAgent.statusListed', { defaultValue: 'Listed (limited)' })
    : t('freeAgent.statusDraft', { defaultValue: 'Draft' })

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
        setMedia([])
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

  const hydrateFromProfile = (profile: FreeAgentProfile | null | undefined) => {
    // Defensive: server may return empty body (204) or the e2e mock may
    // return undefined when an endpoint isn't wired. Bail instead of
    // crashing on `profile.id`.
    if (!profile || typeof profile !== 'object') return
    setProfileId(profile.id ?? null)
    setAvatarUri(profile.avatarUrl ?? null)
    setPosition(profile.position ?? null)
    setPreferredFoot(profile.preferredFoot ?? null)
    setCity(profile.city || '')
    setBio(profile.bio || '')
    setIsOnTransferList(!!profile.isOnTransferList)
    setVisibility(profile.visibility ?? FreeAgentVisibility.PRIVATE)
    setExperience(
      (profile.experience ?? []).map((entry) => ({
        id: entry.id,
        clubName: entry.clubName,
        roleLabel: entry.roleLabel,
        fromYear: entry.fromYear ? String(entry.fromYear) : '',
        toYear: entry.toYear ? String(entry.toYear) : '',
      })),
    )
    setMedia(profile.media ?? [])
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

    if (result.canceled || !result.assets[0]) return

    setIsUploadingAvatar(true)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.PNG },
      )

      const presign = await api<PresignResp>('/me/avatar/presign', {
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

  const pickPhoto = async () => {
    if (photos.length >= PHOTO_MAX) {
      Alert.alert(t('freeAgent.mediaCap', { defaultValue: 'Limit reached' }))
      return
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('freeAgent.photoPermissionDenied'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    setIsUploadingMedia(true)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      )
      const created = await uploadMediaAsset(manipulated.uri, 'PHOTO', 'image/jpeg')
      if (created) setMedia((prev) => [...prev, created])
    } catch {
      Alert.alert(t('common.error'), t('freeAgent.uploadFailed'))
    } finally {
      setIsUploadingMedia(false)
    }
  }

  const pickVideo = async () => {
    if (videos.length >= VIDEO_MAX) {
      Alert.alert(t('freeAgent.mediaCap', { defaultValue: 'Limit reached' }))
      return
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('freeAgent.photoPermissionDenied'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 0.7,
      videoMaxDuration: 60,
    })
    if (result.canceled || !result.assets[0]) return
    setIsUploadingMedia(true)
    try {
      const created = await uploadMediaAsset(result.assets[0].uri, 'VIDEO', 'video/mp4')
      if (created) setMedia((prev) => [...prev, created])
    } catch {
      Alert.alert(t('common.error'), t('freeAgent.uploadFailed'))
    } finally {
      setIsUploadingMedia(false)
    }
  }

  async function uploadMediaAsset(
    localUri: string,
    type: 'PHOTO' | 'VIDEO',
    contentType: string,
  ): Promise<FreeAgentMediaEntry | null> {
    const presign = await api<PresignResp>(
      '/me/free-agent-profile/media/presign',
      { method: 'POST', body: { type, contentType } },
    )
    if (!presign.enabled || !presign.uploadUrl || !presign.publicUrl) {
      Alert.alert(t('common.error'), t('freeAgent.uploadNotAvailable'))
      return null
    }
    const fileResp = await fetch(localUri)
    const blob = await fileResp.blob()
    const putResp = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    })
    if (!putResp.ok) {
      Alert.alert(t('common.error'), t('freeAgent.uploadFailed'))
      return null
    }
    const created = await api<FreeAgentMediaEntry>(
      '/me/free-agent-profile/media',
      { method: 'POST', body: { type, url: presign.publicUrl } },
    )
    return created
  }

  const removeMedia = async (mediaId: string) => {
    const previous = media
    setMedia((prev) => prev.filter((m) => m.id !== mediaId))
    try {
      await api(`/me/free-agent-profile/media/${mediaId}`, { method: 'DELETE' })
    } catch {
      setMedia(previous)
      Alert.alert(t('common.error'), t('freeAgent.removeMediaFailed', {
        defaultValue: 'Could not remove that.',
      }))
    }
  }

  const sharePlayerCard = async () => {
    if (isExportingCard) return
    setIsExportingCard(true)
    const fallbackText = profileLink()
    // Try the PNG path. If any native module along the way (view-shot,
    // expo-sharing) is missing — common in Expo Go and pre-rebuilt dev
    // clients — fall back to text-only share so the user always gets a
    // share sheet. captureRef + Sharing.isAvailableAsync both throw
    // synchronously when their underlying native module isn't linked.
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      })

      let sharingAvailable = false
      try {
        sharingAvailable = await Sharing.isAvailableAsync()
      } catch {
        sharingAvailable = false
      }

      if (sharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: t('freeAgent.shareCard', {
            defaultValue: 'Share player card',
          }),
        })
      } else {
        await Share.share({ url: uri, message: fallbackText })
      }
    } catch (err) {
      if (__DEV__) console.warn('[player-card] PNG export failed, falling back', err)
      try {
        await Share.share({ message: fallbackText })
      } catch {
        // user cancelled
      }
    } finally {
      setIsExportingCard(false)
    }
  }

  const profileLink = () => {
    const link = profileId
      ? `${API_URL.replace(/\/$/, '')}/free-agents/${profileId}`
      : null
    const lines = [
      `⚽ ${user?.name || 'Player'}`,
      position ? `Position: ${position}` : null,
      preferredFoot
        ? `${t('freeAgent.preferredFoot')}: ${t(`freeAgent.foot.${preferredFoot}`)}`
        : null,
      city ? `📍 ${city}` : null,
      '',
      bio || '—',
      '',
      link,
      `— Anstoss player marketplace`,
    ].filter(Boolean)
    return lines.join('\n')
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
        entry.id === id ? { ...entry, [key]: value } : entry,
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
      header={<ModalHeader title={t('freeAgent.title')} onClose={() => router.replace('/(tabs)')} />}
      scroll
      padded={false}
    >
      <View style={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        {/* Hero — avatar + status pill + completion bar */}
        <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <View
                style={[
                  styles.statusPill,
                  {
                    borderColor: isOnTransferList ? c.primary : c.borderDefault,
                    backgroundColor: isOnTransferList ? c.primary50 : c.surfaceSunken,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOnTransferList ? c.primary : c.textTertiary },
                  ]}
                />
                <Text
                  style={[
                    styles.statusPillText,
                    { color: isOnTransferList ? c.primary : c.textSecondary },
                  ]}
                >
                  {statusLabel.toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={2}>
                {user?.name || t('home.fallbackName')}
              </Text>
              <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={3}>
                {t('freeAgent.subtitle')}
              </Text>
            </View>
            <Pressable
              style={[styles.avatarRing, { borderColor: c.primary }]}
              onPress={pickAvatar}
              disabled={isUploadingAvatar}
              accessibilityRole="button"
              accessibilityLabel={t('freeAgent.changeAvatar', { defaultValue: 'Change photo' })}
            >
              <View style={[styles.avatarInner, { backgroundColor: c.primary50 }]}>
                {isUploadingAvatar ? (
                  <ActivityIndicator color={c.primary} />
                ) : avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                ) : (
                  <Text style={[styles.avatarText, { color: c.primary }]}>
                    {(user?.name || 'P').charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={[styles.avatarEdit, { backgroundColor: c.textPrimary }]}>
                <Icon name="camera" size={12} color={c.surface} />
              </View>
            </Pressable>
          </View>
          <View style={styles.completionRow}>
            <View style={[styles.completionTrack, { backgroundColor: c.borderDefault }]}>
              <View
                style={[
                  styles.completionFill,
                  { width: `${completion}%`, backgroundColor: c.primary },
                ]}
              />
            </View>
            <Text style={[styles.completionPct, { color: c.textPrimary }]}>{completion}%</Text>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              accessibilityRole="button"
              onPress={sharePlayerCard}
              disabled={isExportingCard}
              style={({ pressed }) => [
                styles.shareBtn,
                { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
                pressed && { opacity: 0.85 },
                isExportingCard && { opacity: 0.6 },
              ]}
            >
              {isExportingCard ? (
                <ActivityIndicator size="small" color={c.textPrimary} />
              ) : (
                <Icon name="square.and.arrow.up" size={14} color={c.textPrimary} />
              )}
              <Text style={[styles.shareLabel, { color: c.textPrimary }]}>
                {t('freeAgent.shareCard', { defaultValue: 'Share player card' })}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tab strip — replaces the long-scroll with 3 focused sections.
            Trial badge surfaces pending invites without forcing a tab switch. */}
        <View style={styles.tabStrip}>
          {([
            { id: 'identity', label: t('freeAgent.tabIdentity', { defaultValue: 'Identity' }) },
            { id: 'showcase', label: t('freeAgent.tabShowcase', { defaultValue: 'Showcase' }) },
            { id: 'trials', label: t('freeAgent.tabTrials', { defaultValue: 'Trials' }), badge: pendingInvites.length },
          ] as const).map((tab) => {
            const active = activeTab === tab.id
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.tabBtn,
                  {
                    backgroundColor: active ? c.textPrimary : c.surface,
                    borderColor: active ? c.textPrimary : c.borderDefault,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? c.surface : c.textPrimary },
                  ]}
                >
                  {tab.label}
                </Text>
                {'badge' in tab && tab.badge && tab.badge > 0 ? (
                  <View
                    style={[
                      styles.tabBadge,
                      { backgroundColor: active ? c.surface : c.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        { color: active ? c.textPrimary : c.surface },
                      ]}
                    >
                      {tab.badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </View>

        {activeTab === 'identity' ? (
          <>
        {/* Quick toggles */}
        <View style={[styles.section, { borderColor: c.borderDefault, backgroundColor: c.surface }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={[styles.toggleTitle, { color: c.textPrimary }]}>
                {t('freeAgent.transferList')}
              </Text>
              <Text style={[styles.toggleHint, { color: c.textSecondary }]}>
                {isOnTransferList
                  ? t('freeAgent.transferListOn')
                  : t('freeAgent.transferListOff')}
              </Text>
            </View>
            <Switch
              value={isOnTransferList}
              onValueChange={setIsOnTransferList}
              trackColor={{ false: c.borderDefault, true: c.primary }}
              thumbColor={c.surface}
            />
          </View>
          <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
          <View style={styles.visibilityRow}>
            <Text style={[styles.toggleTitle, { color: c.textPrimary }]}>
              {t('freeAgent.visibility')}
            </Text>
            <View style={styles.segmentedRow}>
              {VISIBILITY_OPTIONS.map((value) => {
                const active = value === visibility
                return (
                  <Pressable
                    key={value}
                    onPress={() => setVisibility(value)}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: active ? c.primary : 'transparent',
                        borderColor: active ? c.primary : c.borderDefault,
                      },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        { color: active ? c.surface : c.textPrimary },
                      ]}
                    >
                      {t(`freeAgent.visibilityShort.${value}`, {
                        defaultValue:
                          value === FreeAgentVisibility.PUBLIC
                            ? 'Public'
                            : value === FreeAgentVisibility.CLUB_ONLY
                              ? 'Clubs'
                              : 'Private',
                      })}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>

        {/* Position chips */}
        <Section title={t('freeAgent.position')} c={c}>
          <ChipRow
            values={POSITION_OPTIONS}
            selectedValue={position}
            onSelect={(value) => setPosition(value)}
            getLabel={(value) => t(`freeAgent.positionShort.${value}`)}
            primary={c.primary}
            surface={c.surface}
            border={c.borderDefault}
            textPrimary={c.textPrimary}
          />
        </Section>

        <Section title={t('freeAgent.preferredFoot')} c={c}>
          <ChipRow
            values={FOOT_OPTIONS}
            selectedValue={preferredFoot}
            onSelect={(value) => setPreferredFoot(value)}
            getLabel={(value) => t(`freeAgent.foot.${value}`)}
            primary={c.primary}
            surface={c.surface}
            border={c.borderDefault}
            textPrimary={c.textPrimary}
          />
        </Section>

        <Section title={t('freeAgent.city')} c={c}>
          <View
            style={[
              styles.iconInputWrap,
              { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
            ]}
          >
            <Icon name="mappin.and.ellipse" size={16} color={c.textTertiary} />
            <TextInput
              style={[styles.iconInputText, { color: c.textPrimary }]}
              value={city}
              onChangeText={setCity}
              placeholder={t('freeAgent.cityPlaceholder')}
              placeholderTextColor={c.textTertiary}
            />
          </View>
        </Section>

        <Section title={t('freeAgent.bio')} c={c}>
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken, color: c.textPrimary },
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
          </>
        ) : null}

        {activeTab === 'showcase' ? (
          <>
        {/* Photo evidence */}
        <Section
          title={t('freeAgent.photosTitle', { defaultValue: 'Photos' })}
          description={t('freeAgent.photosBody', {
            defaultValue: 'Up to {{n}} action shots — clubs scout faster with visuals.',
            n: PHOTO_MAX,
          })}
          actionLabel={
            photos.length < PHOTO_MAX
              ? t('freeAgent.addPhoto', { defaultValue: '+ Add' })
              : undefined
          }
          onAction={photos.length < PHOTO_MAX ? pickPhoto : undefined}
          c={c}
        >
          {photos.length === 0 ? (
            <Pressable
              onPress={pickPhoto}
              style={[
                styles.uploadTile,
                { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
              ]}
              accessibilityRole="button"
              disabled={isUploadingMedia}
            >
              {isUploadingMedia ? (
                <ActivityIndicator color={c.primary} />
              ) : (
                <>
                  <Icon name="photo" size={24} color={c.textTertiary} />
                  <Text style={[styles.uploadTileText, { color: c.textSecondary }]}>
                    {t('freeAgent.photosEmpty', {
                      defaultValue: 'Add your first photo',
                    })}
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((p) => (
                <View key={p.id} style={styles.photoTile}>
                  <Image source={{ uri: p.url }} style={styles.photoImg} />
                  <Pressable
                    onPress={() => removeMedia(p.id)}
                    style={[styles.photoRemove, { backgroundColor: c.textPrimary }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                  >
                    <Icon name="xmark" size={12} color={c.surface} />
                  </Pressable>
                </View>
              ))}
              {photos.length < PHOTO_MAX ? (
                <Pressable
                  onPress={pickPhoto}
                  style={[
                    styles.photoAddTile,
                    { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
                  ]}
                  disabled={isUploadingMedia}
                >
                  {isUploadingMedia ? (
                    <ActivityIndicator color={c.primary} />
                  ) : (
                    <Icon name="plus" size={20} color={c.textTertiary} />
                  )}
                </Pressable>
              ) : null}
            </View>
          )}
        </Section>

        {/* Video evidence */}
        <Section
          title={t('freeAgent.videosTitle', { defaultValue: 'Highlight videos' })}
          description={t('freeAgent.videosBody', {
            defaultValue: 'Up to {{n}} short clips · max 60s each.',
            n: VIDEO_MAX,
          })}
          actionLabel={
            videos.length < VIDEO_MAX
              ? t('freeAgent.addVideo', { defaultValue: '+ Add' })
              : undefined
          }
          onAction={videos.length < VIDEO_MAX ? pickVideo : undefined}
          c={c}
        >
          {videos.length === 0 ? (
            <Pressable
              onPress={pickVideo}
              style={[
                styles.uploadTile,
                { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
              ]}
              accessibilityRole="button"
              disabled={isUploadingMedia}
            >
              {isUploadingMedia ? (
                <ActivityIndicator color={c.primary} />
              ) : (
                <>
                  <Icon name="play.rectangle.fill" size={28} color={c.textTertiary} />
                  <Text style={[styles.uploadTileText, { color: c.textSecondary }]}>
                    {t('freeAgent.videosEmpty', {
                      defaultValue: 'Add a highlight clip',
                    })}
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={styles.videoList}>
              {videos.map((v) => (
                <View
                  key={v.id}
                  style={[styles.videoCard, { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken }]}
                >
                  <Video
                    source={{ uri: v.url }}
                    style={styles.videoPlayer}
                    useNativeControls
                    resizeMode={ResizeMode.COVER}
                  />
                  <Pressable
                    onPress={() => removeMedia(v.id)}
                    style={[styles.videoRemove, { backgroundColor: c.textPrimary }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                  >
                    <Icon name="trash" size={12} color={c.surface} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
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
                  { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
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
                    { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
                  ]}
                  value={entry.clubName}
                  onChangeText={(value) => updateExperience(entry.id, 'clubName', value)}
                  placeholder={t('freeAgent.experienceClub')}
                  placeholderTextColor={c.textTertiary}
                />
                <TextInput
                  style={[
                    styles.input,
                    { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
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
                      { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
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
                      { borderColor: c.borderDefault, backgroundColor: c.surface, color: c.textPrimary },
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
          </>
        ) : null}

        {activeTab === 'trials' ? (
          <>
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
                  { borderColor: c.borderDefault, backgroundColor: c.surfaceSunken },
                ]}
              >
                <View style={styles.inviteHeader}>
                  <View>
                    <Text style={[styles.inviteClub, { color: c.textPrimary }]} numberOfLines={1}>
                      {invite.club?.name ?? ''}
                    </Text>
                    <Text style={[styles.inviteTeam, { color: c.textSecondary }]} numberOfLines={1}>
                      {invite.team?.displayName ?? ''}
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
          </>
        ) : null}
      </View>

      {/* Offscreen render target for the shareable PNG. Positioned far
          off-screen so it never paints into the visible layout but
          react-native-view-shot can still capture it via captureRef. */}
      <View pointerEvents="none" style={styles.offscreen}>
        <PlayerCard
          ref={cardRef}
          name={user?.name || 'Player'}
          position={position}
          preferredFoot={preferredFoot}
          city={city.trim() || null}
          bio={bio.trim() || null}
          avatarUrl={avatarUri}
          experienceCount={experience.filter((e) => e.clubName.trim()).length}
          heroPhotoUrl={photos[0]?.url || null}
          isOnTransferList={isOnTransferList}
          photoCount={photos.length}
          videoCount={videos.length}
          profileUrl={
            profileId
              ? `${API_URL.replace(/\/$/, '')}/free-agents/${profileId}`
              : null
          }
        />
      </View>

      {/* Sticky save bar */}
      <View
        style={[
          styles.saveBar,
          {
            paddingBottom: insets.bottom + space.sm,
            backgroundColor: c.surface,
            borderTopColor: c.borderDefault,
          },
        ]}
      >
        <Button
          label={t('freeAgent.save')}
          variant="filled"
          size="lg"
          fullWidth
          loading={isSaving}
          onPress={() => void saveProfile()}
        />
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
            <Text style={[styles.sectionAction, { color: c.primary }]} numberOfLines={1}>
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
  primary,
  surface,
  border,
  textPrimary,
}: {
  values: readonly T[]
  selectedValue: T | null
  onSelect: (value: T) => void
  getLabel: (value: T) => string
  primary: string
  surface: string
  border: string
  textPrimary: string
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
              {
                borderColor: active ? primary : border,
                backgroundColor: active ? primary : surface,
              },
            ]}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityLabel={getLabel(value)}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? surface : textPrimary },
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
    <View style={[styles.inlinePill, { borderColor: `${color}33`, backgroundColor: `${color}10` }]}>
      <Text style={[styles.inlinePillText, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stateSpinner: { marginTop: space['3xl'] },
  content: {
    paddingHorizontal: space.md,
    gap: space.md,
  },
  hero: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  heroCopy: { flex: 1, gap: 6 },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  title: {
    marginTop: 4,
    fontSize: 26,
    fontFamily: fonts.heading,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    fontSize: 32,
    fontFamily: fonts.heading,
    fontWeight: '800',
  },
  avatarEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  completionTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  completionFill: { height: '100%', borderRadius: 3 },
  completionPct: {
    fontFamily: fonts.data,
    fontSize: fontSize.xs,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  heroActions: { flexDirection: 'row', gap: space.sm },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  shareLabel: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  section: {
    borderWidth: hairline,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  sectionCopy: { flex: 1, gap: space.xs },
  sectionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
    lineHeight: lineHeight.md,
    fontWeight: '700',
  },
  sectionDescription: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
  sectionAction: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  toggleCopy: { flex: 1, gap: 2 },
  toggleTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  toggleHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  divider: { height: hairline },
  visibilityRow: { gap: space.sm },
  segmentedRow: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  segmentText: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    minHeight: 40,
    borderRadius: radius.full,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  iconInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  iconInputText: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  input: {
    minHeight: 52,
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  textarea: { minHeight: 120 },
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
  uploadTile: {
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  uploadTileText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  photoTile: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddTile: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoList: { gap: space.sm },
  videoCard: {
    borderWidth: hairline,
    borderRadius: radius.md,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  videoPlayer: { flex: 1 },
  videoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  experienceCard: {
    borderWidth: hairline,
    borderRadius: radius.md,
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
    fontFamily: fonts.heading,
    fontWeight: '700',
  },
  yearRow: { flexDirection: 'row', gap: space.sm },
  yearInput: { flex: 1 },
  inviteCard: {
    borderWidth: hairline,
    borderRadius: radius.md,
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
    fontFamily: fonts.heading,
    fontWeight: '700',
  },
  inviteTeam: {
    marginTop: 2,
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
  inviteActions: { flexDirection: 'row', gap: space.sm },
  inlinePill: {
    minHeight: 28,
    borderRadius: radius.full,
    borderWidth: hairline,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlinePillText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tabStrip: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: space.xs,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  tabLabel: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontFamily: fonts.data,
    fontSize: 11,
    fontWeight: '800',
  },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: hairline,
  },
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    width: 540,
    height: 960,
    opacity: 0,
  },
})
