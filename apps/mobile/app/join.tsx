import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { neutralColors, fontSize, fontWeight, space, radius, fonts } from '../src/theme/tokens'

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
  const { t } = useTranslation()
  const { isSignedIn, refreshUser } = useAuth()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setError(t('join.noCode'))
      setLoading(false)
      return
    }
    api<InviteInfo>(`/invites/${code}`)
      .then(setInvite)
      .catch((err) => setError(err.message || t('join.invalidInvite')))
      .finally(() => setLoading(false))
  }, [code, t])

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
      Alert.alert(t('join.welcomeTitle'), t('join.welcomeBody', { clubName: invite?.club.name }), [
        { text: t('common.done'), onPress: () => router.replace('/(tabs)') },
      ])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('join.redeemError')
      Alert.alert(t('common.error'), msg)
    } finally {
      setRedeeming(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={neutralColors.textSecondary} />
      </View>
    )
  }

  if (error || !invite) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('join.title')} />
        <View style={styles.centered}>
          <ErrorState
            message={error || t('join.invalidInvite')}
            onRetry={() => {
              setError(null)
              setLoading(true)
              if (code) {
                api<InviteInfo>(`/invites/${code}`)
                  .then(setInvite)
                  .catch((err) => setError(err.message || t('join.invalidInvite')))
                  .finally(() => setLoading(false))
              }
            }}
            retryLabel={t('common.retry')}
          />
        </View>
      </View>
    )
  }

  const clubColor = invite.club.primaryColor || '#4A4A48'

  return (
    <View style={styles.container}>
      <ModalHeader title={t('join.title')} />
      <View style={styles.content}>
        <View style={[styles.badgeCircle, { backgroundColor: clubColor }]}>
          <Text style={styles.badgeInitial}>
            {invite.club.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <Text style={styles.eyebrow}>{t('join.invited')}</Text>
        <Text style={styles.clubName}>{invite.club.name}</Text>
        <Text style={styles.subtitle}>
          {isSignedIn
            ? t('join.tapToJoin')
            : t('join.signInToJoin')}
        </Text>

        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: clubColor }, redeeming && { opacity: 0.6 }]}
          onPress={handleRedeem}
          disabled={redeeming}
          accessibilityRole="button"
          accessibilityLabel={isSignedIn ? t('join.joinClub') : t('join.signInAndJoin')}
        >
          {redeeming ? (
            <ActivityIndicator color={neutralColors.textInverse} />
          ) : (
            <Text style={styles.joinBtnText}>
              {isSignedIn ? t('join.joinClub') : t('join.signInAndJoin')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space['2xl'] },
  badgeCircle: { width: 80, height: 80, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', marginBottom: space.lg },
  badgeInitial: { fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, fontFamily: fonts.heading, color: neutralColors.textInverse },
  eyebrow: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: space.xs },
  clubName: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, fontFamily: fonts.heading, color: neutralColors.textPrimary, textAlign: 'center', marginBottom: space.sm },
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, color: neutralColors.textSecondary, textAlign: 'center', marginBottom: space['2xl'] },
  joinBtn: { minHeight: 52, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', width: '100%' },
  joinBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textInverse },
})
