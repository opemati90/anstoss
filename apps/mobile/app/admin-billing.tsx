import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { neutralColors, semanticColors, space, fontSize, fontWeight, radius } from '../src/theme/tokens'

type BillingStatusResponse = {
  clubId: string
  provider: string
  plan: string
  subscriptionStatus: string
  connectStatus: string
  currentPeriodEnd: string | null
  billingContactEmail: string | null
}

export default function AdminBillingScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [billing, setBilling] = useState<BillingStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const clubId = activeClub?.club.id
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'de-DE'

  const fetchBilling = useCallback(async () => {
    if (!clubId) return
    try {
      const data = await api<BillingStatusResponse>(`/clubs/${clubId}/billing/status`)
      setBilling(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchBilling()
    setRefreshing(false)
  }

  const stripeConnected = billing?.connectStatus === 'active'
  const statusColor = billing?.subscriptionStatus === 'active'
    ? semanticColors.success
    : billing?.subscriptionStatus === 'past_due'
      ? semanticColors.warning
      : neutralColors.textSecondary

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={neutralColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('adminBilling.title')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} />
      ) : billing ? (
        <>
          {/* Plan card */}
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <Text style={styles.planName}>
                {billing.plan === 'FOUNDATION'
                  ? t('adminBilling.freePlan')
                  : t('adminBilling.proPlan')}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {t(`adminBilling.status.${billing.subscriptionStatus}`)}
                </Text>
              </View>
            </View>

            {billing.currentPeriodEnd && (
              <Text style={styles.periodText}>
                {t('adminBilling.periodEnd', {
                  date: new Intl.DateTimeFormat(locale, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  }).format(new Date(billing.currentPeriodEnd)),
                })}
              </Text>
            )}
          </View>

          {/* Stripe Connect */}
          <View style={styles.connectCard}>
            <Text style={styles.sectionTitle}>{t('adminBilling.paymentSetup')}</Text>
            <View style={styles.connectRow}>
              <Ionicons
                name={stripeConnected ? 'checkmark-circle' : 'alert-circle-outline'}
                size={20}
                color={stripeConnected ? semanticColors.success : semanticColors.warning}
              />
              <Text style={styles.connectText}>
                {stripeConnected
                  ? t('adminBilling.stripeConnected')
                  : t('adminBilling.stripeNotConnected')}
              </Text>
            </View>
            {!stripeConnected && (
              <TouchableOpacity
                style={[styles.connectButton, { backgroundColor: theme.clubPrimary }]}
                onPress={() => router.push('/stripe-connect')}
              >
                <Text style={styles.connectButtonText}>
                  {t('adminBilling.setupStripe')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('adminBilling.unavailable')}</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  backButton: { marginRight: space.sm },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  planCard: {
    marginHorizontal: space.md,
    marginTop: space.md,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  periodText: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    marginTop: space.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.sm,
  },
  connectCard: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
  },
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  connectText: {
    fontSize: fontSize.sm,
    color: neutralColors.textPrimary,
    flex: 1,
  },
  connectButton: {
    marginTop: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  connectButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  empty: { paddingTop: 72, alignItems: 'center' },
  emptyText: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
  },
})
