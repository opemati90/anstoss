import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useTranslation } from 'react-i18next'
import type { AssetPresignResponse } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import {
  Button,
  Icon,
  ListRow,
  Screen,
  SectionGroup,
  SettingsIcon,
  SettingsIconTint,
  Text,
} from '../src/components/ui'
import { FormInput } from '../src/components/FormInput'
import { useEntitlements } from '../src/hooks/useEntitlements'
import { PaywallSheet } from '../src/components/billing/PaywallSheet'
import { hairline, radius, space } from '../src/theme/tokens'

type SponsorRow = {
  id: string
  name: string
  logoUrl: string
  linkUrl: string | null
  displayOrder: number
}

const LOGO_SIZE = 512

export default function AdminSponsorsScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const entitlements = useEntitlements()

  const clubId = activeClub?.club.id ?? null
  const isAdmin =
    activeClub?.role === MembershipRole.OWNER ||
    activeClub?.role === MembershipRole.ADMIN

  const [sponsors, setSponsors] = useState<SponsorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<SponsorRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [paywallVisible, setPaywallVisible] = useState(false)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true)
    try {
      const rows = await api<SponsorRow[]>(`/clubs/${clubId}/sponsors`)
      setSponsors(Array.isArray(rows) ? rows : [])
    } catch {
      setSponsors([])
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  const hasPlus = entitlements.has('sponsor_logos')

  const openAdd = () => {
    if (!hasPlus) {
      setPaywallVisible(true)
      return
    }
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (sponsor: SponsorRow) => {
    if (!hasPlus) {
      setPaywallVisible(true)
      return
    }
    setEditing(sponsor)
    setShowForm(true)
  }

  const removeSponsor = (sponsor: SponsorRow) => {
    Alert.alert(t('sponsors.deleteConfirm'), sponsor.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (!clubId) return
          try {
            await api(`/clubs/${clubId}/sponsors/${sponsor.id}`, {
              method: 'DELETE',
            })
            await load()
          } catch (err) {
            Alert.alert(
              t('common.error'),
              err instanceof ApiError && err.message
                ? err.message
                : t('errors.loadFailed', { defaultValue: 'Something went wrong' }),
            )
          }
        },
      },
    ])
  }

  if (!isAdmin) {
    return (
      <Screen
        header={<ModalHeader title={t('sponsors.title')} mode="back" />}
        scroll={false}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied')}
          description={t('common.accessDeniedDescription')}
        />
      </Screen>
    )
  }

  if (showForm) {
    return (
      <SponsorForm
        clubId={clubId ?? ''}
        sponsor={editing}
        onCancel={() => setShowForm(false)}
        onSaved={async () => {
          setShowForm(false)
          await load()
        }}
      />
    )
  }

  return (
    <Screen
      header={<ModalHeader title={t('sponsors.title')} mode="back" />}
      scroll={false}
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <SectionGroup style={styles.section}>
          <ListRow
            left={
              <SettingsIcon
                name="plus.circle.fill"
                tint={SettingsIconTint.blue}
              />
            }
            title={t('sponsors.add')}
            showChevron
            onPress={openAdd}
          />
        </SectionGroup>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : sponsors.length === 0 ? (
          <View style={styles.section}>
            <EmptyState
              icon="photo.fill"
              title={t('sponsors.title')}
              description={t('sponsors.empty')}
            />
          </View>
        ) : (
          <SectionGroup
            header={t('sponsors.activeHeader', { defaultValue: 'Active sponsors' })}
            footer={t('sponsors.activeFooter', {
              defaultValue: 'Tap to edit. Long-press to remove.',
            })}
            style={styles.section}
          >
            {sponsors.map((sponsor) => (
              <ListRow
                key={sponsor.id}
                title={sponsor.name}
                subtitle={sponsor.linkUrl ?? undefined}
                left={
                  <View
                    style={[
                      styles.thumb,
                      { backgroundColor: c.surface },
                    ]}
                  >
                    <Image
                      source={{ uri: sponsor.logoUrl }}
                      style={styles.thumbImage}
                    />
                  </View>
                }
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                    onPress={() => removeSponsor(sponsor)}
                    hitSlop={12}
                    style={styles.iconBtn}
                  >
                    <Icon name="trash" size="md" color="tertiary" />
                  </Pressable>
                }
                showChevron
                onPress={() => openEdit(sponsor)}
              />
            ))}
          </SectionGroup>
        )}
      </ScrollView>

      <PaywallSheet
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        triggerFeature="sponsor_logos"
        onUpgradeStarted={() => void entitlements.refresh()}
      />
    </Screen>
  )
}

type SponsorFormProps = {
  clubId: string
  sponsor: SponsorRow | null
  onCancel: () => void
  onSaved: () => void
}

function SponsorForm({ clubId, sponsor, onCancel, onSaved }: SponsorFormProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [name, setName] = useState(sponsor?.name ?? '')
  const [linkUrl, setLinkUrl] = useState(sponsor?.linkUrl ?? '')
  const [logoUri, setLogoUri] = useState<string | null>(sponsor?.logoUrl ?? null)
  const [logoDirty, setLogoDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pickerBusy, setPickerBusy] = useState(false)

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        t('common.error'),
        t('club.badgePermissionDenied', {
          defaultValue: 'Photo library access is required to upload a logo.',
        }),
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setPickerBusy(true)
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: LOGO_SIZE, height: LOGO_SIZE } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.PNG },
      )
      setLogoUri(manipulated.uri)
      setLogoDirty(true)
    } catch {
      Alert.alert(
        t('common.error'),
        t('club.badgeProcessingError', {
          defaultValue: "Couldn't process the image.",
        }),
      )
    } finally {
      setPickerBusy(false)
    }
  }

  const save = async () => {
    if (!clubId) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      Alert.alert(t('common.error'), t('sponsors.namePlaceholder'))
      return
    }
    if (!logoUri) {
      Alert.alert(t('common.error'), t('sponsors.uploadLogo'))
      return
    }

    setSaving(true)
    try {
      let finalLogoUrl = logoUri

      // Only re-upload if the logo changed (or if this is a new sponsor).
      if (logoDirty || !sponsor) {
        const presign = await api<AssetPresignResponse>(
          `/clubs/${clubId}/assets/presign`,
          {
            method: 'POST',
            body: {
              filename: `sponsor-${Date.now()}.png`,
              contentType: 'image/png',
              kind: 'sponsor_logo',
            },
          },
        )
        if (presign.enabled && presign.uploadUrl && presign.publicUrl) {
          const imageResponse = await fetch(logoUri)
          const blob = await imageResponse.blob()
          await fetch(presign.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
            body: blob,
          })
          finalLogoUrl = presign.publicUrl
        } else if (!sponsor) {
          // R2 disabled in dev — fall back to the local URI so the row
          // still appears. Logo won't survive a restart, but the flow
          // round-trips end-to-end for testing.
          finalLogoUrl = logoUri
        }
      }

      const body = {
        name: trimmedName,
        logoUrl: finalLogoUrl,
        linkUrl: linkUrl.trim() ? linkUrl.trim() : null,
      }

      if (sponsor) {
        await api(`/clubs/${clubId}/sponsors/${sponsor.id}`, {
          method: 'PATCH',
          body,
        })
      } else {
        await api(`/clubs/${clubId}/sponsors`, {
          method: 'POST',
          body,
        })
      }

      onSaved()
    } catch (err) {
      Alert.alert(
        t('common.error'),
        err instanceof ApiError && err.message
          ? err.message
          : t('errors.loadFailed', { defaultValue: 'Something went wrong' }),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen
      header={<ModalHeader title={t('sponsors.title')} mode="back" />}
      scroll={false}
      padded={false}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sponsors.uploadLogo')}
          onPress={pickLogo}
          disabled={pickerBusy}
          style={[
            styles.uploadPicker,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {pickerBusy ? (
            <ActivityIndicator color={c.primary} />
          ) : logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.uploadPreview} />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Icon name="photo" size="xl" color="tertiary" />
              <Text variant="caption2" color="tertiary">
                {t('sponsors.uploadLogo')}
              </Text>
            </View>
          )}
        </Pressable>

        <FormInput
          label={t('sponsors.namePlaceholder')}
          value={name}
          onChangeText={setName}
          placeholder={t('sponsors.namePlaceholder')}
          accessibilityLabel={t('sponsors.namePlaceholder')}
        />

        <FormInput
          label={t('sponsors.linkPlaceholder')}
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder={t('sponsors.linkPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel={t('sponsors.linkPlaceholder')}
        />

        <View style={styles.formActions}>
          <Button
            variant="ghost"
            onPress={onCancel}
            label={t('common.cancel')}
            accessibilityLabel={t('common.cancel')}
          />
          <Button
            variant="primary"
            onPress={save}
            loading={saving}
            disabled={saving}
            label={t('common.save')}
            accessibilityLabel={t('common.save')}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.md,
    paddingBottom: space['3xl'] + space.lg,
    gap: space.lg,
  },
  section: {
    paddingHorizontal: space.md,
  },
  center: { padding: space.xl, alignItems: 'center' },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  iconBtn: { padding: space.xs },
  ctaWrap: { marginTop: space.md },
  uploadPicker: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPreview: { width: '100%', height: '100%', resizeMode: 'contain' },
  uploadPlaceholder: { alignItems: 'center', gap: space.xs },
  formActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
    justifyContent: 'flex-end',
  },
})
