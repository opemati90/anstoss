import { useState } from 'react'
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { fontSize, space, radius, fonts, hairline } from '../src/theme/tokens'

const AVATAR_SIZE = 512

export default function EditProfileScreen() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const c = useClubColors()
  const [isLoading, setIsLoading] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  const [name, setName] = useState(user?.name || '')
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatarUrl || null)

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('editProfile.photoPermissionDenied'))
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

      const presign = await api<{
        enabled: boolean
        uploadUrl: string | null
        publicUrl: string | null
      }>('/me/avatar/presign', {
        method: 'POST',
        body: { filename: 'avatar.png', contentType: 'image/png' },
      })

      if (presign.enabled && presign.uploadUrl && presign.publicUrl) {
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
      } else {
        Alert.alert(t('common.error'), t('editProfile.uploadNotAvailable'))
      }
    } catch {
      Alert.alert(t('common.error'), t('editProfile.uploadFailed'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(t('editProfile.nameRequired'), t('editProfile.nameRequiredBody'))
      return
    }

    setIsLoading(true)
    try {
      await api('/me', {
        method: 'PATCH',
        body: { name: name.trim() },
      })
      await refreshUser()
      router.back()
    } catch (err) {
      Alert.alert(
        t('common.error'),
        err instanceof Error ? err.message : t('editProfile.saveFailed'),
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Screen header={<ModalHeader title={t('editProfile.title')} />} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.profileCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={styles.avatarSection}>
            <Pressable
              style={[styles.avatar, { backgroundColor: c.clubPrimaryLight }]}
              onPress={pickAvatar}
              disabled={isUploadingAvatar}
              accessibilityRole="button"
              accessibilityLabel={t('editProfile.changePhoto')}
            >
              {isUploadingAvatar ? (
                <ActivityIndicator color={c.clubPrimary} />
              ) : avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarText, { color: c.clubPrimary }]}>
                  {(name || 'P').charAt(0).toUpperCase()}
                </Text>
              )}
              <View style={[styles.editBadge, { backgroundColor: c.clubPrimary, borderColor: c.background }]}>
                <Icon name="camera.fill" size="md" color={c.textInverse} />
              </View>
            </Pressable>
            <Text style={[styles.avatarHint, { color: c.textTertiary }]}>{t('editProfile.changePhoto')}</Text>
          </View>
        </View>

        <View style={[styles.formCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.label, { color: c.textPrimary }]}>{t('editProfile.nameLabel')}</Text>
          <TextInput
            style={[styles.input, { borderColor: c.border, color: c.textPrimary, backgroundColor: c.background }]}
            value={name}
            onChangeText={setName}
            placeholder={t('editProfile.namePlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={100}
            autoCapitalize="words"
          />

          <View style={[styles.fieldDivider, { backgroundColor: c.border }]} />

          <Text style={[styles.label, { color: c.textPrimary }]}>{t('editProfile.emailLabel')}</Text>
          <View style={[styles.input, styles.readOnly, { borderColor: c.border, backgroundColor: c.background }]}>
            <Text style={[styles.readOnlyText, { color: c.textTertiary }]}>{user?.email}</Text>
          </View>
          <Text style={[styles.hint, { color: c.textTertiary }]}>{t('editProfile.emailHint')}</Text>
        </View>

        <View style={styles.saveWrap}>
          <Button
            label={t('editProfile.save')}
            variant="filled"
            size="lg"
            onPress={handleSave}
            loading={isLoading}
            disabled={isLoading}
            fullWidth
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: space['2xl'], gap: space.md },
  profileCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md + 2,
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md + 2,
  },
  avatarSection: { alignItems: 'center' },
  avatar: { width: 96, height: 96, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarText: { fontSize: fontSize['2xl'], fontFamily: fonts.heading },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 30, height: 30, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  avatarHint: { fontSize: fontSize.sm, fontFamily: fonts.body, marginTop: space.sm },
  label: { fontSize: fontSize.sm, fontFamily: fonts.label, marginBottom: space.sm },
  input: {
    height: 52, borderWidth: hairline, borderRadius: radius.lg,
    paddingHorizontal: space.md, fontSize: fontSize.md, fontFamily: fonts.body,
  },
  fieldDivider: {
    height: hairline,
    marginVertical: space.md + 2,
  },
  readOnly: { justifyContent: 'center' },
  readOnlyText: { fontSize: fontSize.md, fontFamily: fonts.body },
  hint: { fontSize: fontSize.sm, fontFamily: fonts.body, marginTop: space.xs },
  saveWrap: { marginTop: space.sm },
})
