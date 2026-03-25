import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { api } from '../src/api/client'
import { neutralColors, semanticColors } from '../src/theme/tokens'

type InviteInfo = {
  club: {
    id: string
    name: string
    primaryColor: string
    badgeUrl: string | null
  }
  expiresAt: string
}

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { isSignedIn, refreshUser } = useAuth()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setError('No invite code provided')
      setLoading(false)
      return
    }
    api<InviteInfo>(`/invites/${code}`)
      .then(setInvite)
      .catch((err) => setError(err.message || 'Invalid or expired invite'))
      .finally(() => setLoading(false))
  }, [code])

  const handleRedeem = async () => {
    if (!code) return
    if (!isSignedIn) {
      // Redirect to sign-in, then come back
      router.replace(`/(auth)/sign-in`)
      return
    }
    setRedeeming(true)
    try {
      await api(`/invites/${code}/redeem`, { method: 'POST' })
      await refreshUser()
      Alert.alert('Welcome!', `You've joined ${invite?.club.name}!`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ])
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to join club')
    } finally {
      setRedeeming(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A4A48" />
      </View>
    )
  }

  if (error || !invite) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
          </TouchableOpacity>
          <Ionicons name="alert-circle-outline" size={64} color={semanticColors.error} />
          <Text style={styles.errorTitle}>Invalid Invite</Text>
          <Text style={styles.errorText}>{error || 'This invite link is expired or invalid.'}</Text>
        </View>
      </View>
    )
  }

  const clubColor = invite.club.primaryColor || '#4A4A48'

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={neutralColors.textPrimary} />
        </TouchableOpacity>

        <View style={[styles.badgeCircle, { backgroundColor: clubColor }]}>
          <Text style={styles.badgeInitial}>
            {invite.club.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <Text style={styles.title}>You're invited!</Text>
        <Text style={styles.clubName}>{invite.club.name}</Text>
        <Text style={styles.subtitle}>
          {isSignedIn
            ? 'Tap below to join this club.'
            : 'Sign in to join this club.'}
        </Text>

        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: clubColor }, redeeming && { opacity: 0.6 }]}
          onPress={handleRedeem}
          disabled={redeeming}
        >
          {redeeming ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.joinBtnText}>
              {isSignedIn ? 'Join Club' : 'Sign In & Join'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background, justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 32 },
  closeBtn: { position: 'absolute', top: -100, left: 0 },
  badgeCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  badgeInitial: { fontSize: 36, fontWeight: '700', color: '#FFF' },
  title: { fontSize: 14, fontWeight: '600', color: neutralColors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  clubName: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: neutralColors.textSecondary, textAlign: 'center', marginBottom: 32 },
  joinBtn: { height: 52, borderRadius: 8, justifyContent: 'center', alignItems: 'center', width: '100%' },
  joinBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  errorTitle: { fontSize: 22, fontWeight: '700', color: neutralColors.textPrimary, marginTop: 16 },
  errorText: { fontSize: 16, color: neutralColors.textSecondary, textAlign: 'center', marginTop: 8 },
})
