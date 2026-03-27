import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { neutralColors, semanticColors, space, radius, fontSize, fontWeight } from '../src/theme/tokens'

export default function StripeConnectScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const { clubPrimary } = useClubColors()
  const clubId = activeClub?.club.id

  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  // Check status on focus (user may return from browser)
  useFocusEffect(
    useCallback(() => {
      if (!clubId) return
      checkStatus()
    }, [clubId]), // eslint-disable-line react-hooks/exhaustive-deps
  )

  const checkStatus = async () => {
    if (!clubId) return
    setIsChecking(true)
    try {
      const result = await api<{ complete: boolean }>(
        `/clubs/${clubId}/billing/connect/refresh`,
        { method: 'POST' },
      )
      setIsComplete(result.complete)
    } catch {
      // silent
    } finally {
      setIsChecking(false)
    }
  }

  const handleStartOnboarding = async () => {
    if (!clubId) return
    setIsLoading(true)
    try {
      const result = await api<{ url: string }>(
        `/clubs/${clubId}/billing/connect`,
        { method: 'POST', body: {} },
      )
      await WebBrowser.openBrowserAsync(result.url, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      })
      // When user returns, check status
      await checkStatus()
    } catch (error) {
      const msg =
        error instanceof ApiError && error.message
          ? error.message
          : t('common.error')
      Alert.alert(t('common.error'), msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('stripeConnect.title')} />

      <View style={styles.content}>
        {isComplete ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: semanticColors.success }]}>
              <Ionicons name="checkmark" size={40} color="#FFF" />
            </View>
            <Text style={styles.heading}>{t('stripeConnect.completeTitle')}</Text>
            <Text style={styles.body}>{t('stripeConnect.completeBody')}</Text>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: clubPrimary }]}>
              <Ionicons name="card-outline" size={40} color="#FFF" />
            </View>
            <Text style={styles.heading}>{t('stripeConnect.setupTitle')}</Text>
            <Text style={styles.body}>{t('stripeConnect.setupBody')}</Text>

            <View style={styles.featureList}>
              {['sepa', 'card', 'invoices'].map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={20} color={clubPrimary} />
                  <Text style={styles.featureText}>
                    {t(`stripeConnect.feature.${feature}`)}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: clubPrimary },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleStartOnboarding}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {t('stripeConnect.startButton')}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {isChecking && (
          <ActivityIndicator style={{ marginTop: space.lg }} color={clubPrimary} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  heading: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  body: {
    fontSize: fontSize.md,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: space.md,
  },
  featureList: {
    marginTop: space.xl,
    gap: space.md,
    alignSelf: 'stretch',
    paddingHorizontal: space.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  featureText: {
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    flex: 1,
  },
  primaryButton: {
    height: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: space.xl,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: '#FFF',
  },
})
