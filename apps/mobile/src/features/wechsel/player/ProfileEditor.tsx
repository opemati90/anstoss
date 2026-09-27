import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  View,
} from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import {
  FreeAgentVisibility,
  type FreeAgentMediaEntry,
  type FreeAgentProfile,
} from '@anstoss/shared'
import { api } from '../../../api/client'
import { useAuth } from '../../../context/AuthContext'
import { useClubColors } from '../../../context/ClubThemeContext'
import { ErrorState } from '../../../components/ErrorState'
import { FormInput } from '../../../components/FormInput'
import {
  Avatar,
  Banner,
  BottomSheet,
  Button,
  FilterChipRow,
  Icon,
  SectionGroup,
  SegmentedControl,
  Text,
} from '../../../components/ui'
import {
  hairline,
  RADIUS_FULL,
  RADIUS_MD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXL,
} from '../../../theme/tokens'
import { ensurePickerMediaAccess } from '../../../utils/mediaPermissions'
import { paths, wechselApi } from '../api'
import { DatePickerSheet } from '../components/DatePickerSheet'
import { CardListSkeleton } from '../components/Primitives'
import { apiErrorMessage } from '../components/Sheets'
import {
  ageFromDob,
  formatDate,
  fromIsoDate,
  LEAGUE_OPTIONS,
  leagueLabel,
  POSITIONS,
  positionLabel,
  toIsoDate,
} from '../format'
import { invalidateApi, useApiQuery } from '../query'

const FEET = ['LEFT', 'RIGHT', 'BOTH'] as const
const RADII = [10, 25, 50, 100] as const
const PHOTO_MAX = 6
const VIDEO_MAX = 2

type Draft = {
  position: (typeof POSITIONS)[number] | null
  preferredFoot: (typeof FEET)[number] | null
  highestLeague: string | null
  currentClubName: string
  availableFrom: string | null
  postalCode: string
  city: string
  searchRadiusKm: number
  bio: string
  isOnTransferList: boolean
  visibility: FreeAgentVisibility
  experience: Array<{ key: string; clubName: string; roleLabel: string; fromYear: string; toYear: string }>
}

function draftFrom(profile: FreeAgentProfile | null): Draft {
  return {
    position: (profile?.position as Draft['position']) ?? null,
    preferredFoot: (profile?.preferredFoot as Draft['preferredFoot']) ?? null,
    highestLeague: profile?.highestLeague ?? null,
    currentClubName: profile?.currentClubName ?? '',
    availableFrom: profile?.availableFrom ?? null,
    postalCode: profile?.postalCode ?? '',
    city: profile?.city ?? '',
    searchRadiusKm: profile?.searchRadiusKm ?? 25,
    bio: profile?.bio ?? '',
    isOnTransferList: profile?.isOnTransferList ?? true,
    // Public listings from before the revamp read as "Vereine".
    visibility:
      profile?.visibility === FreeAgentVisibility.PRIVATE
        ? FreeAgentVisibility.PRIVATE
        : FreeAgentVisibility.CLUB_ONLY,
    experience: (profile?.experience ?? []).map((entry) => ({
      key: entry.id,
      clubName: entry.clubName,
      roleLabel: entry.roleLabel,
      fromYear: entry.fromYear ? String(entry.fromYear) : '',
      toYear: entry.toYear ? String(entry.toYear) : '',
    })),
  }
}

function toBody(draft: Draft) {
  const year = (value: string) => (/^\d{4}$/.test(value.trim()) ? Number(value.trim()) : null)
  return {
    position: draft.position,
    preferredFoot: draft.preferredFoot,
    highestLeague: draft.highestLeague,
    currentClubName: draft.currentClubName.trim() || null,
    availableFrom: draft.availableFrom,
    postalCode: /^\d{5}$/.test(draft.postalCode) ? draft.postalCode : null,
    city: draft.city.trim().length >= 2 ? draft.city.trim() : null,
    searchRadiusKm: draft.searchRadiusKm,
    bio: draft.bio.trim() || null,
    isOnTransferList: draft.isOnTransferList,
    visibility: draft.visibility,
    experience: draft.experience
      .filter((entry) => entry.clubName.trim() && entry.roleLabel.trim())
      .map((entry, index) => ({
        clubName: entry.clubName.trim(),
        roleLabel: entry.roleLabel.trim(),
        fromYear: year(entry.fromYear),
        toYear: year(entry.toYear),
        sortOrder: index,
      })),
  }
}

type PresignResp = { enabled: boolean; uploadUrl: string | null; publicUrl: string | null }

/**
 * The free agent's player profile: what clubs see in the Spielersuche.
 * Used by the Profil tab and the standalone /free-agent/profile route.
 */
export function ProfileEditor({ contentStyle }: { contentStyle?: object }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const { user, refreshUser } = useAuth()
  const query = useApiQuery<FreeAgentProfile | null>(paths.myProfile)
  const [draft, setDraft] = useState<Draft>(() => draftFrom(null))
  const [baseline, setBaseline] = useState<string>(JSON.stringify(toBody(draftFrom(null))))
  const [media, setMedia] = useState<FreeAgentMediaEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'media' | null>(null)
  const [sheet, setSheet] = useState<'league' | 'available' | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const draftRef = useRef(draft)
  draftRef.current = draft
  const baselineRef = useRef(baseline)
  baselineRef.current = baseline

  // Server data replaces the form only while there are no unsaved edits, so
  // a background refetch never wipes what the player is typing.
  useEffect(() => {
    if (query.data === undefined) return
    setMedia(query.data?.media ?? [])
    const unsaved = JSON.stringify(toBody(draftRef.current)) !== baselineRef.current
    const next = draftFrom(query.data)
    setBaseline(JSON.stringify(toBody(next)))
    if (!unsaved) setDraft(next)
  }, [query.data])

  const exists = Boolean(query.data)
  // Review fixes: under-16s get no profile (H2); 16–17 no media, clubs only;
  // the editor never turns a club member into a free agent (L5).
  const age = ageFromDob(user?.dateOfBirth)
  const isUnder16 = age !== null && age < 16
  const isMinor = age !== null && age < 18
  const isFreeAgent = user?.registrationRole === 'FREE_AGENT'
  const [deleting, setDeleting] = useState(false)
  const dirty = JSON.stringify(toBody(draft)) !== baseline || !exists
  const plzInvalid = draft.postalCode.length > 0 && !/^\d{5}$/.test(draft.postalCode)
  const photos = useMemo(() => media.filter((entry) => entry.type === 'PHOTO'), [media])
  const videos = useMemo(() => media.filter((entry) => entry.type === 'VIDEO'), [media])
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSavedAt(null)
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    try {
      if (!isFreeAgent || isUnder16) return
      await wechselApi.saveProfile(exists, toBody(draft))
      // Treat the saved form as clean so the refetch below can hydrate it.
      setBaseline(JSON.stringify(toBody(draft)))
      baselineRef.current = JSON.stringify(toBody(draft))
      invalidateApi(paths.myProfile, '/player-searches')
      setSavedAt(Date.now())
    } catch (error) {
      Alert.alert(t('common.error'), apiErrorMessage(t, error))
    } finally {
      setSaving(false)
    }
  }

  const pickAvatar = async () => {
    if (!(await ensurePickerMediaAccess())) {
      Alert.alert(t('common.error'), t('spielerprofil.photoPermission'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setUploading('avatar')
    try {
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )
      const blob = await (await fetch(resized.uri)).blob()
      const presign = await api<PresignResp>('/me/avatar/presign', {
        method: 'POST',
        body: { filename: 'player-avatar.jpg', contentType: 'image/jpeg', sizeBytes: blob.size },
      })
      if (!presign.enabled || !presign.uploadUrl || !presign.publicUrl) {
        Alert.alert(t('common.error'), t('spielerprofil.uploadUnavailable'))
        return
      }
      await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
      await api('/me', { method: 'PATCH', body: { avatarUrl: presign.publicUrl } })
      await refreshUser()
    } catch {
      Alert.alert(t('common.error'), t('spielerprofil.uploadFailed'))
    } finally {
      setUploading(null)
    }
  }

  const addMedia = async (type: 'PHOTO' | 'VIDEO') => {
    if (!exists) {
      Alert.alert(t('spielerprofil.saveFirstTitle'), t('spielerprofil.saveFirstBody'))
      return
    }
    if ((type === 'PHOTO' ? photos.length >= PHOTO_MAX : videos.length >= VIDEO_MAX)) {
      Alert.alert(t('spielerprofil.mediaLimit', { count: type === 'PHOTO' ? PHOTO_MAX : VIDEO_MAX }))
      return
    }
    if (!(await ensurePickerMediaAccess())) {
      Alert.alert(t('common.error'), t('spielerprofil.photoPermission'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [type === 'PHOTO' ? 'images' : 'videos'],
      quality: 0.8,
      videoMaxDuration: 60,
    })
    if (result.canceled || !result.assets[0]) return
    setUploading('media')
    try {
      let uri = result.assets[0].uri
      let contentType = type === 'PHOTO' ? 'image/jpeg' : 'video/mp4'
      if (type === 'PHOTO') {
        const resized = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1200 } }], {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        })
        uri = resized.uri
      } else if (result.assets[0].mimeType) {
        contentType = result.assets[0].mimeType
      }
      const blob = await (await fetch(uri)).blob()
      const presign = await api<PresignResp>('/me/free-agent-profile/media/presign', {
        method: 'POST',
        body: { type, contentType, sizeBytes: blob.size },
      })
      if (!presign.enabled || !presign.uploadUrl || !presign.publicUrl) {
        Alert.alert(t('common.error'), t('spielerprofil.uploadUnavailable'))
        return
      }
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      })
      if (!put.ok) throw new Error('upload failed')
      const created = await api<FreeAgentMediaEntry>('/me/free-agent-profile/media', {
        method: 'POST',
        body: { type, url: presign.publicUrl },
      })
      setMedia((current) => [...current, created])
    } catch {
      Alert.alert(t('common.error'), t('spielerprofil.uploadFailed'))
    } finally {
      setUploading(null)
    }
  }

  /** GDPR: the owner can always delete their card (also after a role change). */
  const deleteProfile = () => {
    Alert.alert(t('spielerprofil.deleteTitle'), t('spielerprofil.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('spielerprofil.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          try {
            await wechselApi.deleteProfile()
            invalidateApi(paths.myProfile, paths.myTrials, '/player-searches')
            await refreshUser().catch(() => undefined)
          } catch (error) {
            Alert.alert(t('common.error'), apiErrorMessage(t, error))
          } finally {
            setDeleting(false)
          }
        },
      },
    ])
  }

  const removeMedia = (entry: FreeAgentMediaEntry) => {
    Alert.alert(t('spielerprofil.mediaRemoveTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          const previous = media
          setMedia((current) => current.filter((item) => item.id !== entry.id))
          try {
            await api(`/me/free-agent-profile/media/${entry.id}`, { method: 'DELETE' })
          } catch {
            setMedia(previous)
            Alert.alert(t('common.error'), t('spielerprofil.mediaRemoveFailed'))
          }
        },
      },
    ])
  }

  if (query.isLoading) {
    return (
      <View style={[styles.content, contentStyle]}>
        <CardListSkeleton rows={3} />
      </View>
    )
  }
  if (query.error && query.data === undefined) {
    return (
      <View style={[styles.content, contentStyle]}>
        <ErrorState
          message={t('spielerprofil.loadError')}
          hint={apiErrorMessage(t, query.error)}
          onRetry={() => void query.refetch()}
        />
      </View>
    )
  }

  const available =
    draft.availableFrom && fromIsoDate(draft.availableFrom).getTime() > Date.now()
      ? fromIsoDate(draft.availableFrom)
      : null

  const deleteButton = exists ? (
    <Button
      label={t('spielerprofil.delete')}
      variant="bordered"
      onPress={deleteProfile}
      loading={deleting}
      disabled={deleting}
      fullWidth
    />
  ) : null

  if (isUnder16 || !isFreeAgent) {
    return (
      <View style={[styles.content, contentStyle]}>
        <Banner
          tone="info"
          icon="info.circle"
          title={isUnder16 ? t('spielerprofil.under16Title') : t('spielerprofil.notFreeAgentTitle')}
          description={isUnder16 ? t('spielerprofil.under16Body') : t('spielerprofil.notFreeAgentBody')}
        />
        {deleteButton}
      </View>
    )
  }

  return (
    <View style={[styles.content, contentStyle]}>
      <View style={styles.hero}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('spielerprofil.changePhoto')}
          onPress={() => void pickAvatar()}
          android_ripple={{ color: c.borderSubtle, borderless: true }}
          style={styles.avatarButton}
        >
          <Avatar size="xl" src={user?.avatarUrl} fallbackText={user?.name ?? ''} />
          <View style={[styles.avatarBadge, { backgroundColor: c.primary, borderColor: c.background }]}>
            {uploading === 'avatar' ? (
              <ActivityIndicator size="small" color={c.textInverse} />
            ) : (
              <Icon name="camera.fill" size="sm" color="inverse" />
            )}
          </View>
        </Pressable>
        <Text variant="title2" color="primary" align="center">
          {user?.name}
        </Text>
        <Text variant="subheadline" color="secondary" align="center">
          {draft.isOnTransferList && draft.visibility !== FreeAgentVisibility.PRIVATE
            ? t('spielerprofil.statusVisible')
            : t('spielerprofil.statusHidden')}
        </Text>
      </View>

      <SectionGroup footer={t('spielerprofil.visibilityHint')}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text variant="body" color="primary">
              {t('spielerprofil.searchActive')}
            </Text>
            <Text variant="footnote" color="secondary">
              {t('spielerprofil.searchActiveHint')}
            </Text>
          </View>
          <Switch
            value={draft.isOnTransferList}
            onValueChange={(value) => set('isOnTransferList', value)}
            trackColor={{ true: c.primary, false: c.borderStrong }}
            accessibilityLabel={t('spielerprofil.searchActive')}
          />
        </View>
        <View style={styles.field}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('spielerprofil.visibility')}
          </Text>
          <SegmentedControl
            fullWidth
            segments={[
              { key: FreeAgentVisibility.CLUB_ONLY, label: t('spielerprofil.visibilityClubs') },
              { key: FreeAgentVisibility.PRIVATE, label: t('spielerprofil.visibilityPrivate') },
            ]}
            value={draft.visibility}
            onChange={(value) => set('visibility', value)}
          />
        </View>
      </SectionGroup>

      <SectionGroup header={t('spielerprofil.sectionPlayer')}>
        <View style={styles.field}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('spielerprofil.fieldPosition')}
          </Text>
          <FilterChipRow
            wrap
            singleSelect
            chips={POSITIONS.map((key) => ({ key, label: positionLabel(t, key) ?? key }))}
            selected={draft.position}
            onToggle={(key) => set('position', key)}
          />
        </View>
        <View style={styles.field}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('spielerprofil.fieldFoot')}
          </Text>
          <FilterChipRow
            wrap
            singleSelect
            chips={FEET.map((key) => ({ key, label: t(`spielerprofil.foot.${key}`) }))}
            selected={draft.preferredFoot}
            onToggle={(key) => set('preferredFoot', key)}
          />
        </View>
        <PickerRow
          label={t('spielerprofil.fieldLeague')}
          value={leagueLabel(t, draft.highestLeague) ?? t('spielerprofil.choose')}
          onPress={() => setSheet('league')}
        />
        <View style={styles.field}>
          <FormInput
            label={t('spielerprofil.fieldCurrentClub')}
            value={draft.currentClubName}
            onChangeText={(value) => set('currentClubName', value)}
            placeholder={t('spielerprofil.currentClubPlaceholder')}
            maxLength={100}
          />
        </View>
        <PickerRow
          label={t('spielerprofil.fieldAvailableFrom')}
          value={available ? formatDate(available) : t('spielerprofil.availableNow')}
          onPress={() => setSheet('available')}
        />
      </SectionGroup>

      <SectionGroup header={t('spielerprofil.sectionArea')} footer={t('spielerprofil.areaHint')}>
        <View style={[styles.field, styles.row]}>
          <View style={styles.plz}>
            <FormInput
              label={t('spielerprofil.fieldPostalCode')}
              value={draft.postalCode}
              onChangeText={(value) => set('postalCode', value.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              maxLength={5}
              error={plzInvalid ? t('spielerprofil.postalCodeInvalid') : null}
            />
          </View>
          <View style={styles.flex}>
            <FormInput
              label={t('spielerprofil.fieldCity')}
              value={draft.city}
              onChangeText={(value) => set('city', value)}
              maxLength={80}
            />
          </View>
        </View>
        <View style={styles.field}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('spielerprofil.fieldRadius')}
          </Text>
          <FilterChipRow
            wrap
            singleSelect
            chips={RADII.map((km) => ({ key: String(km), label: t('wechsel.radiusKm', { km }) }))}
            selected={String(draft.searchRadiusKm)}
            onToggle={(key) => set('searchRadiusKm', Number(key))}
          />
        </View>
      </SectionGroup>

      <SectionGroup header={t('spielerprofil.sectionAbout')}>
        <View style={styles.field}>
          <FormInput
            label={t('spielerprofil.fieldBio')}
            value={draft.bio}
            onChangeText={(value) => set('bio', value)}
            placeholder={t('spielerprofil.bioPlaceholder')}
            multiline
            maxLength={500}
            style={styles.textarea}
          />
        </View>
      </SectionGroup>

      <SectionGroup header={t('spielerprofil.sectionStations')}>
        {draft.experience.map((entry, index) => (
          <View key={entry.key} style={styles.field}>
            <View style={styles.stationHeader}>
              <Text variant="subheadline" weight="semibold" color="secondary" style={styles.flex}>
                {t('spielerprofil.stationN', { n: index + 1 })}
              </Text>
              <Button
                label={t('common.delete')}
                variant="plain"
                size="sm"
                onPress={() =>
                  set(
                    'experience',
                    draft.experience.filter((item) => item.key !== entry.key),
                  )
                }
              />
            </View>
            <FormInput
              label={t('spielerprofil.fieldStationClub')}
              value={entry.clubName}
              onChangeText={(value) =>
                set(
                  'experience',
                  draft.experience.map((item) => (item.key === entry.key ? { ...item, clubName: value } : item)),
                )
              }
              maxLength={100}
            />
            <FormInput
              label={t('spielerprofil.fieldStationRole')}
              value={entry.roleLabel}
              onChangeText={(value) =>
                set(
                  'experience',
                  draft.experience.map((item) => (item.key === entry.key ? { ...item, roleLabel: value } : item)),
                )
              }
              placeholder={t('spielerprofil.stationRolePlaceholder')}
              maxLength={80}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <FormInput
                  label={t('spielerprofil.fieldFrom')}
                  value={entry.fromYear}
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(value) =>
                    set(
                      'experience',
                      draft.experience.map((item) =>
                        item.key === entry.key ? { ...item, fromYear: value.replace(/\D/g, '') } : item,
                      ),
                    )
                  }
                />
              </View>
              <View style={styles.flex}>
                <FormInput
                  label={t('spielerprofil.fieldTo')}
                  value={entry.toYear}
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(value) =>
                    set(
                      'experience',
                      draft.experience.map((item) =>
                        item.key === entry.key ? { ...item, toYear: value.replace(/\D/g, '') } : item,
                      ),
                    )
                  }
                />
              </View>
            </View>
          </View>
        ))}
        <View style={styles.field}>
          <Button
            label={t('spielerprofil.addStation')}
            variant="plain"
            leftIcon={<Icon name="plus" size="sm" color="tint" />}
            disabled={draft.experience.length >= 10}
            onPress={() =>
              set('experience', [
                ...draft.experience,
                { key: `new-${Date.now()}`, clubName: '', roleLabel: '', fromYear: '', toYear: '' },
              ])
            }
          />
        </View>
      </SectionGroup>

      {isMinor ? (
        <Banner
          tone="info"
          icon="lock.shield"
          title={t('spielerprofil.minorTitle')}
          description={t('spielerprofil.minorBody')}
        />
      ) : (
      <SectionGroup header={t('spielerprofil.sectionMedia')} footer={t('spielerprofil.mediaHint')}>
        <View style={styles.field}>
          <View style={styles.mediaGrid}>
            {media.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={t('spielerprofil.mediaRemoveA11y')}
                onLongPress={() => removeMedia(entry)}
                onPress={() => removeMedia(entry)}
                style={[styles.mediaTile, { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle }]}
              >
                {entry.type === 'PHOTO' ? (
                  <Image source={{ uri: entry.url }} style={styles.mediaImage} accessibilityIgnoresInvertColors />
                ) : (
                  <Icon name="play.circle.fill" size="xl" color="secondary" />
                )}
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <Button
              label={t('spielerprofil.addPhoto')}
              variant="bordered"
              size="sm"
              leftIcon={<Icon name="photo" size="sm" color="secondary" />}
              disabled={uploading !== null}
              loading={uploading === 'media'}
              onPress={() => void addMedia('PHOTO')}
            />
            <Button
              label={t('spielerprofil.addVideo')}
              variant="bordered"
              size="sm"
              leftIcon={<Icon name="play" size="sm" color="secondary" />}
              disabled={uploading !== null}
              onPress={() => void addMedia('VIDEO')}
            />
          </View>
        </View>
      </SectionGroup>
      )}

      <View style={styles.saveBar}>
        {savedAt && !dirty ? (
          <Text variant="footnote" color="success" align="center">
            {t('spielerprofil.saved')}
          </Text>
        ) : null}
        <Button
          label={exists ? t('common.save') : t('spielerprofil.create')}
          onPress={() => void save()}
          disabled={!dirty || saving || plzInvalid}
          loading={saving}
          fullWidth
        />
        {deleteButton}
      </View>

      <BottomSheet visible={sheet === 'league'} onClose={() => setSheet(null)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('spielerprofil.fieldLeague')}
          </Text>
          <FilterChipRow
            wrap
            singleSelect
            chips={LEAGUE_OPTIONS.map((key) => ({ key: key as string, label: leagueLabel(t, key) ?? key }))}
            selected={draft.highestLeague}
            onToggle={(key) => {
              set('highestLeague', key)
              setSheet(null)
            }}
          />
        </View>
      </BottomSheet>

      <DatePickerSheet
        visible={sheet === 'available'}
        title={t('spielerprofil.fieldAvailableFrom')}
        value={available}
        minimumDate={new Date()}
        onClose={() => setSheet(null)}
        onConfirm={(date) => {
          set('availableFrom', toIsoDate(date))
          setSheet(null)
        }}
        onClear={() => {
          set('availableFrom', null)
          setSheet(null)
        }}
      />
    </View>
  )
}

function PickerRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const c = useClubColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      android_ripple={{ color: c.borderSubtle }}
      style={({ pressed }) => [styles.pickerRow, pressed && { backgroundColor: c.surfaceSunken }]}
    >
      <View style={styles.flex}>
        <Text variant="footnote" color="secondary">
          {label}
        </Text>
        <Text variant="body" color="primary">
          {value}
        </Text>
      </View>
      <Icon name="chevron.right" size="sm" color="tertiary" />
    </Pressable>
  )
}

/** Pull-to-refresh control bound to the profile query. */
export function useProfileRefreshControl() {
  const c = useClubColors()
  const query = useApiQuery<FreeAgentProfile | null>(paths.myProfile)
  return (
    <RefreshControl
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      tintColor={c.textTertiary}
    />
  )
}

const styles = StyleSheet.create({
  content: { gap: SPACING_LG, paddingBottom: SPACING_XXL },
  hero: { alignItems: 'center', gap: SPACING_XS, paddingVertical: SPACING_SM },
  avatarButton: { borderRadius: RADIUS_FULL, marginBottom: SPACING_SM },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: RADIUS_FULL,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  plz: { flexBasis: 120, flexGrow: 0 },
  field: { padding: SPACING_MD, gap: SPACING_SM },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    padding: SPACING_MD,
  },
  pickerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  stationHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING_SM },
  textarea: { minHeight: 110, paddingTop: SPACING_SM, textAlignVertical: 'top' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  mediaTile: {
    width: 88,
    height: 88,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaImage: { width: '100%', height: '100%' },
  saveBar: { gap: SPACING_SM },
  sheet: { gap: SPACING_LG, paddingBottom: SPACING_SM },
})
