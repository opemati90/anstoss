/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { api, ApiError } from '../../api/client'
import { BottomSheet, Button, Icon, Text } from '../ui'
import { fonts, radius, space } from '../../theme/tokens'

function safeUseAuth(): {
  activeClub: { club: { id: string }; role?: string } | null
} {
  try {
    return useAuth() as never
  } catch {
    return { activeClub: null }
  }
}

const PLUS_FEATURES: Array<{ key: string; emoji: string }> = [
  { key: 'lineupBuilderPro', emoji: '🧩' },
  { key: 'motmArchive', emoji: '🏅' },
  { key: 'contributionIntake', emoji: '💳' },
  { key: 'scoutingMarketplace', emoji: '🎯' },
  { key: 'prioritySupport', emoji: '⚡' },
]

const PLUS_PRICE_ID = process.env.EXPO_PUBLIC_STRIPE_PLUS_PRICE_ID || ''

type PaywallSheetProps = {
  visible: boolean
  onClose: () => void
  /** Feature slug that triggered the paywall (e.g. 'lineup_builder_pro'). */
  triggerFeature?: string
  /** Callback after Stripe Checkout opens — parent should refetch
   * entitlements when the user comes back. */
  onUpgradeStarted?: () => void
}

export function PaywallSheet({
  visible,
  onClose,
  triggerFeature,
  onUpgradeStarted,
}: PaywallSheetProps) {
  const { t } = useTranslation()
  const { activeClub } = safeUseAuth()
  const c = useClubColors()
  const [submitting, setSubmitting] = useState(false)

  const triggerLabel = triggerFeature
    ? t(`paywall.triggers.${triggerFeature}`, {
        defaultValue: t('paywall.triggers.generic', {
          defaultValue: 'this feature',
        }),
      })
    : null

  const isOwner = activeClub?.role === 'OWNER'

  const handleUpgrade = async () => {
    if (!activeClub) return
    if (!isOwner) {
      Alert.alert(
        t('paywall.adminOnlyTitle', { defaultValue: 'Owner only' }),
        t('paywall.adminOnlyBody', {
          defaultValue:
            'Only the club owner can upgrade. Ask them to open the More tab → Upgrade to Plus.',
        }),
      )
      return
    }
    if (!PLUS_PRICE_ID) {
      Alert.alert(
        t('paywall.unavailableTitle', { defaultValue: 'Upgrade unavailable' }),
        t('paywall.unavailableBody', {
          defaultValue:
            'Stripe checkout is not configured for this build. Try again from the latest TestFlight.',
        }),
      )
      return
    }
    setSubmitting(true)
    try {
      const res = await api<{ url: string }>(
        `/clubs/${activeClub.club.id}/billing/subscribe`,
        { method: 'POST', body: { priceId: PLUS_PRICE_ID } },
      )
      onUpgradeStarted?.()
      onClose()
      void Linking.openURL(res.url)
    } catch (err) {
      const message =
        err instanceof ApiError && err.message
          ? err.message
          : t('paywall.checkoutError', {
              defaultValue: "Couldn't start checkout. Try again.",
            })
      Alert.alert(t('common.error', { defaultValue: 'Error' }), message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.container}>
        <View
          style={[
            styles.heroIcon,
            { backgroundColor: c.primary, borderRadius: radius.lg },
          ]}
        >
          <Icon name="sparkles" size={28} color="inverse" />
        </View>

        <Text variant="title2" weight="bold" color="primary" align="center" style={styles.title}>
          {triggerLabel
            ? t('paywall.titleForFeature', {
                defaultValue: 'Plus unlocks {{feature}}',
                feature: triggerLabel,
              })
            : t('paywall.titleGeneric', {
                defaultValue: 'Upgrade to Anstoss Plus',
              })}
        </Text>

        <Text variant="body" color="secondary" align="center" style={styles.subtitle}>
          {t('paywall.subtitle', {
            defaultValue: '€29 per month, cancel anytime. One subscription per club.',
          })}
        </Text>

        <View style={styles.featureList}>
          {PLUS_FEATURES.map((f) => (
            <View key={f.key} style={styles.featureRow}>
              <Text style={styles.featureEmoji}>{f.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="callout" weight="semibold" color="primary">
                  {t(`paywall.features.${f.key}.title`, {
                    defaultValue: defaultFeatureTitle(f.key),
                  })}
                </Text>
                <Text variant="footnote" color="secondary">
                  {t(`paywall.features.${f.key}.body`, {
                    defaultValue: defaultFeatureBody(f.key),
                  })}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Button
          label={t('paywall.upgradeCta', { defaultValue: 'Upgrade to Plus — €29/mo' })}
          variant="filled"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={() => void handleUpgrade()}
        />
        <Pressable onPress={onClose} style={styles.skipBtn} hitSlop={8}>
          <Text variant="footnote" color="secondary" align="center">
            {t('paywall.skip', { defaultValue: 'Maybe later' })}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

function defaultFeatureTitle(key: string): string {
  switch (key) {
    case 'lineupBuilderPro':
      return 'Lineup Builder Pro'
    case 'motmArchive':
      return 'MOTM archive'
    case 'contributionIntake':
      return 'Contribution intake (Stripe)'
    case 'scoutingMarketplace':
      return 'Scouting marketplace'
    case 'prioritySupport':
      return 'Priority support'
    default:
      return ''
  }
}

function defaultFeatureBody(key: string): string {
  switch (key) {
    case 'lineupBuilderPro':
      return 'Suggest XI, fairness rotation, share-as-image.'
    case 'motmArchive':
      return 'Searchable MOTM history with player season stats.'
    case 'contributionIntake':
      return 'Members pay dues directly through the app.'
    case 'scoutingMarketplace':
      return 'See free agents nearby and send trial invites.'
    case 'prioritySupport':
      return 'Direct line to the team — usually under 24h.'
    default:
      return ''
  }
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  heroIcon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: space.sm },
  subtitle: { paddingHorizontal: space.md },
  featureList: {
    marginTop: space.sm,
    gap: space.md,
    paddingVertical: space.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  featureEmoji: {
    fontSize: 22,
    fontFamily: fonts.body,
  },
  skipBtn: {
    paddingVertical: space.md,
  },
})
