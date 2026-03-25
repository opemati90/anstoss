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
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors } from '../src/theme/tokens'

export default function EditProfileScreen() {
  const { user, refreshUser } = useAuth()
  const theme = useClubColors()
  const [isLoading, setIsLoading] = useState(false)

  const [name, setName] = useState(user?.name || '')

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.')
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
      Alert.alert('Error', err.message || 'Failed to update profile')
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
          <View style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}>
            <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>
              {(name || 'P').charAt(0).toUpperCase()}
            </Text>
          </View>
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
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 32, fontWeight: '700' },
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
