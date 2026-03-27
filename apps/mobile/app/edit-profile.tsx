import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors } from '../src/theme/tokens'

const AVATAR_SIZE = 512

export default function EditProfileScreen() {
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const theme = useClubColors()
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
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('editProfile.saveFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}
            onPress={pickAvatar}
            disabled={isUploadingAvatar}
          >
            {isUploadingAvatar ? (
              <ActivityIndicator color={theme.clubPrimary} />
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>
                {(name || 'P').charAt(0).toUpperCase()}
              </Text>
            )}
            <View style={[styles.editBadge, { backgroundColor: theme.clubPrimary }]}>
              <Ionicons name="camera" size={14} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>{t('editProfile.changePhoto')}</Text>
        </View>

        {/* Name */}
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={neutralColors.textTertiary}
          maxLength={100}
          autoCapitalize="words"
        />

        {/* Email (read-only) */}
        <Text style={styles.label}>Email</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText}>{user?.email}</Text>
        </View>
        <Text style={styles.hint}>Email is managed by your login provider and cannot be changed here.</Text>

        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: theme.clubPrimary },
            isLoading && { opacity: 0.6 },
          ]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary },
  content: { padding: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarText: { fontSize: 32, fontWeight: '700' },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: neutralColors.background,
  },
  avatarHint: { fontSize: 13, color: neutralColors.textTertiary, marginTop: 6 },
  label: { fontSize: 14, fontWeight: '600', color: neutralColors.textPrimary, marginTop: 16, marginBottom: 6 },
  input: {
    height: 52, borderWidth: 1, borderColor: neutralColors.border, borderRadius: 8,
    paddingHorizontal: 16, fontSize: 16, color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  readOnly: { justifyContent: 'center', backgroundColor: neutralColors.background },
  readOnlyText: { fontSize: 16, color: neutralColors.textTertiary },
  hint: { fontSize: 13, color: neutralColors.textTertiary, marginTop: 4 },
  saveButton: { height: 52, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
})
