import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors } from '../src/theme/tokens'

export default function InviteScreen() {
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const generateInvite = async () => {
    if (!activeClub) return
    setIsLoading(true)
    try {
      const data = await api<{ code: string }>(
        `/clubs/${activeClub.club.id}/invites`,
        { method: 'POST' },
      )
      setInviteCode(data.code)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create invite')
    } finally {
      setIsLoading(false)
    }
  }

  const shareInvite = async () => {
    if (!inviteCode || !activeClub) return
    const link = `https://anstoss.app/join/${inviteCode}`
    await Share.share({
      message: `Join ${activeClub.club.name} on Anstoss! Use this link to join:\n${link}`,
    })
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Players</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: theme.clubPrimaryLight }]}>
          <Ionicons name="person-add" size={40} color={theme.clubPrimary} />
        </View>

        <Text style={styles.title}>
          Invite to {activeClub?.club.name || 'your club'}
        </Text>
        <Text style={styles.subtitle}>
          Generate a shareable link. Players can join with one tap. Links expire after 7 days.
        </Text>

        {inviteCode ? (
          <View style={styles.codeSection}>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{inviteCode}</Text>
            </View>
            <TouchableOpacity
              style={[styles.shareButton, { backgroundColor: theme.clubPrimary }]}
              onPress={shareInvite}
            >
              <Ionicons name="share-outline" size={20} color="#FFF" />
              <Text style={styles.shareButtonText}>Share Invite Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.regenerateLink} onPress={generateInvite}>
              <Text style={styles.regenerateText}>Generate new code</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.generateButton, { backgroundColor: theme.clubPrimary }, isLoading && { opacity: 0.6 }]}
            onPress={generateInvite}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="link" size={20} color="#FFF" />
                <Text style={styles.generateButtonText}>Generate Invite Link</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
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
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 40 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', color: neutralColors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 15, color: neutralColors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  codeSection: { marginTop: 32, alignItems: 'center', width: '100%' },
  codeBox: {
    backgroundColor: neutralColors.surface, borderRadius: 12, borderWidth: 1,
    borderColor: neutralColors.border, paddingVertical: 20, paddingHorizontal: 32,
    marginBottom: 16,
  },
  codeText: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary, letterSpacing: 4, textAlign: 'center' },
  shareButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 52,
    borderRadius: 8, paddingHorizontal: 32, width: '100%', justifyContent: 'center',
  },
  shareButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  regenerateLink: { marginTop: 16, paddingVertical: 8 },
  regenerateText: { fontSize: 14, color: neutralColors.textSecondary, textDecorationLine: 'underline' },
  generateButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, borderRadius: 8,
    paddingHorizontal: 32, marginTop: 32, width: '100%', justifyContent: 'center',
  },
  generateButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
})
