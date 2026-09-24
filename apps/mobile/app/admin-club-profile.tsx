import { useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useTranslation } from 'react-i18next'
import type { AssetPresignResponse } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { api, ApiError } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { FormInput } from '../src/components/FormInput'
import { Button, Screen, SectionGroup, Text, getInitials } from '../src/components/ui'
import { ensurePickerMediaAccess } from '../src/utils/mediaPermissions'
import { CLUB_COLOR_PRESETS } from '../src/theme/clubColorPresets'
import { hairline, RADIUS_XL, RADIUS_FULL, space } from '../src/theme/tokens'

const BADGE_SIZE = 512

/**
 * Vereinsprofil & Farben — name, crest and the one club colour the whole
 * app is tinted with. PATCH /clubs/:clubId (ADMIN+).
 */
export default function AdminClubProfileScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { activeClub, refreshUser } = useAuth()
  const club = activeClub?.club
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER || activeClub?.role === MembershipRole.ADMIN

  const [name, setName] = useState(club?.name ?? '')
  const [color, setColor] = useState<string>(club?.primaryColor ?? CLUB_COLOR_PRESETS[0])
  const [badgeUri, setBadgeUri] = useState<string | null>(club?.badgeUrl ?? null)
  const [badgeDirty, setBadgeDirty] = useState(false)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  const header = <ModalHeader title={t('verein.settings.profile')} mode="back" />

  if (!club || !isAdmin) {
    return (
      <Screen header={header} padded={false}>
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  const nameError = name.trim().length < 2 ? t('verein.profile.nameTooShort') : null
  const dirty =
    name.trim() !== club.name || color.toLowerCase() !== (club.primaryColor ?? '').toLowerCase() || badgeDirty

  const pickBadge = async () => {
    const hasAccess = await ensurePickerMediaAccess()
    if (!hasAccess) {
      Alert.alert(t('common.error'), t('club.badgePermissionDenied'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setPicking(true)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: BADGE_SIZE, height: BADGE_SIZE } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.PNG },
      )
      setBadgeUri(manipulated.uri)
      setBadgeDirty(true)
    } catch {
      Alert.alert(t('common.error'), t('club.badgeProcessingError'))
    } finally {
      setPicking(false)
    }
  }

  const uploadBadge = async (uri: string): Promise<string | null> => {
    const blob = await (await fetch(uri)).blob()
    const presign = await api<AssetPresignResponse>(`/clubs/${club.id}/assets/presign`, {
      method: 'POST',
      body: {
        filename: `badge-${Date.now()}.png`,
        contentType: 'image/png',
        kind: 'club_badge',
        sizeBytes: blob.size,
      },
    })
    if (!presign.enabled || !presign.uploadUrl || !presign.publicUrl) return null
    await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    })
    return presign.publicUrl
  }

  const save = async () => {
    if (nameError || !dirty) return
    setSaving(true)
    try {
      const body: { name?: string; primaryColor?: string; badgeUrl?: string } = {}
      if (name.trim() !== club.name) body.name = name.trim()
      if (color.toLowerCase() !== (club.primaryColor ?? '').toLowerCase()) body.primaryColor = color
      if (badgeDirty && badgeUri) {
        const url = await uploadBadge(badgeUri)
        if (url) body.badgeUrl = url
      }
      if (Object.keys(body).length > 0) {
        await api(`/clubs/${club.id}`, { method: 'PATCH', body })
        await refreshUser(undefined, { preferredClubId: club.id })
      }
      router.back()
    } catch (error) {
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        error instanceof ApiError && error.message ? error.message : t('verein.profile.saveError'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen header={header} scroll={false} padded={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.badgeBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('verein.profile.changeCrest')}
            onPress={() => void pickBadge()}
            disabled={picking}
            android_ripple={{ color: c.borderSubtle }}
            style={({ pressed }) => [
              styles.badge,
              { borderColor: c.borderDefault, backgroundColor: badgeUri ? c.surface : color },
              pressed && styles.pressed,
            ]}
          >
            {picking ? (
              <ActivityIndicator color={c.textInverse} />
            ) : badgeUri ? (
              <Image source={{ uri: badgeUri }} style={styles.badgeImage} />
            ) : (
              <Text variant="title1" weight="bold" color="inverse">
                {getInitials(name || club.name)}
              </Text>
            )}
          </Pressable>
          <Button
            label={t('verein.profile.changeCrest')}
            variant="plain"
            size="sm"
            onPress={() => void pickBadge()}
            disabled={picking}
          />
        </View>

        <FormInput
          label={t('verein.profile.name')}
          value={name}
          onChangeText={setName}
          error={name.length > 0 ? nameError : null}
          autoCapitalize="words"
          accessibilityLabel={t('verein.profile.name')}
        />

        <SectionGroup header={t('verein.profile.color')} footer={t('verein.profile.colorHint')}>
          <View style={styles.swatches}>
            {CLUB_COLOR_PRESETS.map((swatch, index) => {
              const selected = swatch.toLowerCase() === color.toLowerCase()
              return (
                <Pressable
                  key={swatch}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t('verein.profile.colorOption', {
                    index: index + 1,
                    total: CLUB_COLOR_PRESETS.length,
                  })}
                  onPress={() => setColor(swatch)}
                  android_ripple={{ color: c.borderSubtle, borderless: true }}
                  style={[
                    styles.swatch,
                    { borderColor: selected ? c.textPrimary : 'transparent' },
                  ]}
                >
                  <View style={[styles.swatchFill, { backgroundColor: swatch }]} />
                </Pressable>
              )
            })}
          </View>
        </SectionGroup>

        <Button
          label={t('common.save')}
          variant="filled"
          size="lg"
          fullWidth
          loading={saving}
          disabled={saving || !dirty || Boolean(nameError)}
          onPress={() => void save()}
        />
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space['2xl'],
    gap: space.lg,
  },
  badgeBlock: { alignItems: 'center', gap: space.sm },
  badge: {
    width: 96,
    height: 96,
    borderRadius: RADIUS_XL,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  pressed: { opacity: 0.85 },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm + space.xs,
    padding: space.md,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_FULL,
    borderWidth: 2,
    padding: space.xs,
  },
  swatchFill: { flex: 1, borderRadius: RADIUS_FULL },
})
