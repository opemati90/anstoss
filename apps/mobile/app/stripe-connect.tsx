import { useState, useCallback } from 'react'
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useFocusEffect, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { ErrorState } from '../src/components/ErrorState'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { fonts, space, radius, fontSize, lineHeight } from '../src/theme/tokens'

export default function StripeConnectScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [error, setError] = useState(false)

  const checkStatus = useCallback(async () => {
    if (!clubId) return
    setIsChecking(true)
    try {
      const result = await api<{ complete: boolean }>(`/clubs/${clubId}/billing/connect/refresh`, {
        method: 'POST',
      })
      setIsComplete(result.complete)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setIsChecking(false)
    }
  }, [clubId])

  // Check status on focus (user may return from browser)
  useFocusEffect(
    useCallback(() => {
      checkStatus()
    }, [checkStatus]),
  )

  const handleStartOnboarding = async () => {
    if (!clubId) return
    setIsLoading(true)
    try {
      const result = await api<{ url: string }>(`/clubs/${clubId}/billing/connect`, {
        method: 'POST',
        body: {},
      })
      await WebBrowser.openBrowserAsync(result.url, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      })
      // When user returns, check status
      await checkStatus()
    } catch (error) {
      const msg = error instanceof ApiError && error.message ? error.message : t('common.error')
      Alert.alert(t('common.error'), msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Defensive: every render path here depends on `c` (club theme) and
  // `clubId`. If the auth context hasn't hydrated `activeClub` yet (rare,
  // but happens on cold start or right after a club switch), skip the
  // full layout and show a quiet loading state. Avoids dereferencing
  // tokens that might briefly be undefined.
  if (!c || !clubId) {
    // Back affordance so this never becomes an infinite-spinner trap when
    // the screen is opened without an active club (not just mid-hydration).
    return (
      <Screen
        header={
          <ModalHeader
            title={t('stripeConnect.title')}
            mode="back"
            onClose={() => router.back()}
          />
        }
      >
        <View style={styles.content}>
          <ActivityIndicator />
        </View>
      </Screen>
    )
  }

  const features: { key: string; label: string }[] = [
    { key: 'sepa', label: t('stripeConnect.feature.sepa') },
    { key: 'card', label: t('stripeConnect.feature.card') },
    { key: 'invoices', label: t('stripeConnect.feature.invoices') },
  ]

  return (
    <Screen header={<ModalHeader title={t('stripeConnect.title')} />}>
      <View style={styles.content}>
        {error && !isChecking ? (
          <ErrorState onRetry={checkStatus} />
        ) : isComplete ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: c.success }]}>
              <Icon name="checkmark" size="md" color={c.textInverse} />
            </View>
            <Text style={[styles.heading, { color: c.textPrimary }]}>
              {t('stripeConnect.completeTitle')}
            </Text>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              {t('stripeConnect.completeBody')}
            </Text>
            <View style={styles.buttonWrap}>
              <Button
                label={t('stripeConnect.doneButton', { defaultValue: 'Done' })}
                variant="filled"
                size="lg"
                onPress={() => router.back()}
                fullWidth
              />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: c.primary }]}>
              <Icon name="creditcard" size="md" color={c.textInverse} />
            </View>
            <Text style={[styles.heading, { color: c.textPrimary }]}>
              {t('stripeConnect.setupTitle')}
            </Text>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              {t('stripeConnect.setupBody')}
            </Text>

            <View style={styles.featureList}>
              {features.map((feature) => (
                <View key={feature.key} style={styles.featureRow}>
                  <Icon name="checkmark.circle.fill" size="md" color={c.primary} />
                  <Text style={[styles.featureText, { color: c.textPrimary }]}>
                    {feature.label}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.buttonWrap}>
              <Button
                label={t('stripeConnect.startButton')}
                variant="filled"
                size="lg"
                onPress={handleStartOnboarding}
                loading={isLoading}
                disabled={isLoading}
                fullWidth
              />
            </View>
          </>
        )}

        {isChecking && <ActivityIndicator style={{ marginTop: space.lg }} color={c.primary} />}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  heading: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: lineHeight.md,
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
    fontFamily: fonts.body,
    flex: 1,
  },
  buttonWrap: {
    alignSelf: 'stretch',
    marginTop: space.xl,
  },
})
