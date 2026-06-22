import { useState } from 'react'
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { api, ApiError } from '../../api/client'
import { BottomSheet, Button, Icon, Text, type IconName } from '../ui'
import { fonts, fontSize, hairline, radius, space } from '../../theme/tokens'

function safeUseAuth(): {
  activeClub: { club: { id: string }; role?: string } | null
} {
  try {
    return useAuth() as never
  } catch {
    return { activeClub: null }
  }
}

type Cadence = 'monthly' | 'yearly'

type PlusFeature = {
  key: string
  icon: IconName
  defaultTitle: string
  defaultBody: string
}

const PLUS_FEATURES: PlusFeature[] = [
  {
    key: 'lineupBuilderPro',
    icon: 'football',
    defaultTitle: 'Lineup Builder Pro',
    defaultBody: 'Suggest XI with fairness rotation. Share as image to WhatsApp in one tap.',
  },
  {
    key: 'motmArchive',
    icon: 'trophy',
    defaultTitle: 'MOTM archive',
    defaultBody: 'Season Man-of-the-Match history with top-scorer leaderboards.',
  },
  {
    key: 'contributionIntake',
    icon: 'creditcard',
    defaultTitle: 'Stripe contribution intake',
    defaultBody: 'Members pay dues directly through the app. No more chasing.',
  },
  {
    key: 'scoutingMarketplace',
    icon: 'paperplane',
    defaultTitle: 'Scouting marketplace',
    defaultBody: 'See free agents nearby, send trial invites, fill the bench.',
  },
  {
    key: 'sponsorLogos',
    icon: 'photo',
    defaultTitle: 'Sponsor logos',
    defaultBody: 'Upload your kit sponsors and show them on every member’s home screen.',
  },
  {
    key: 'prioritySupport',
    icon: 'bolt',
    defaultTitle: 'Priority support',
    defaultBody: 'Direct line to our team — usually under 24 hours.',
  },
]

const PRICING = {
  monthly: {
    amount: 19.99,
    suffix: '/mo',
    priceId: process.env.EXPO_PUBLIC_STRIPE_PLUS_PRICE_ID || '',
  },
  yearly: {
    amount: 199,
    suffix: '/yr',
    priceId: process.env.EXPO_PUBLIC_STRIPE_PLUS_YEARLY_PRICE_ID || '',
  },
}

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
  const [cadence, setCadence] = useState<Cadence>('yearly')

  const triggerLabel = triggerFeature
    ? t(`paywall.triggers.${triggerFeature}`, {
        defaultValue: t('paywall.triggers.generic', {
          defaultValue: 'this feature',
        }),
      })
    : null

  const isOwner = activeClub?.role === 'OWNER'
  const monthlyAnnual = PRICING.monthly.amount * 12
  const yearlySavingsPct = Math.round(
    ((monthlyAnnual - PRICING.yearly.amount) / monthlyAnnual) * 100,
  )

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
    const priceId = PRICING[cadence].priceId
    if (!priceId) {
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
        { method: 'POST', body: { priceId } },
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {/* Hero — club-color slab with editorial Plus eyebrow + a
            single bold value statement. The eyebrow doubles as the
            badge/brand cue so we don't need a separate logo tile. */}
        <View style={[styles.hero, { backgroundColor: c.primary }]}>
          <View style={styles.heroEyebrowRow}>
            <Icon name="bolt" size={12} color="inverse" />
            <Text style={[styles.heroEyebrow, { color: c.textInverse }]}>
              {t('paywall.eyebrow', { defaultValue: 'ANSTOSS PLUS' })}
            </Text>
          </View>
          <Text style={[styles.heroTitle, { color: c.textInverse }]} numberOfLines={3}>
            {triggerLabel
              ? t('paywall.titleForFeature', {
                  defaultValue: 'Plus unlocks {{feature}}.',
                  feature: triggerLabel,
                })
              : t('paywall.titleEditorial', {
                  defaultValue: 'Built for clubs that take Saturdays seriously.',
                })}
          </Text>
          <Text
            style={[styles.heroSubtitle, { color: c.textInverse, opacity: 0.85 }]}
            numberOfLines={4}
          >
            {t('paywall.heroSubtitle', {
              defaultValue:
                'Subscription buys digital tools to run a real-world football club: scouting, lineup builder, contributions, club admin. Not a consumer entertainment service.',
            })}
          </Text>
        </View>

        {/* Pricing toggle — yearly default to anchor the cheaper
            unit-cost frame; savings badge makes the math obvious. */}
        <View style={[styles.cadenceRow, { borderColor: c.borderDefault }]}>
          {(['monthly', 'yearly'] as const).map((value) => {
            const active = cadence === value
            return (
              <Pressable
                key={value}
                onPress={() => setCadence(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.cadencePill,
                  {
                    backgroundColor: active ? c.primary : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cadenceLabel,
                    { color: active ? c.textInverse : c.textPrimary },
                  ]}
                >
                  {value === 'monthly'
                    ? t('paywall.cadenceMonthly', { defaultValue: 'Monthly' })
                    : t('paywall.cadenceYearly', { defaultValue: 'Yearly' })}
                </Text>
                {value === 'yearly' && yearlySavingsPct > 0 ? (
                  <View
                    style={[
                      styles.savingsBadge,
                      {
                        // Single-accent treatment: a surface chip whether
                        // on the active (club-primary) pill or the plain
                        // pill, with the club primary as the only accent.
                        // No third hue.
                        backgroundColor: c.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.savingsBadgeText, { color: c.primary }]}
                    >
                      −{yearlySavingsPct}%
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </View>

        {/* Price headline — euro sign + amount in tabular figures so
            switching cadences doesn't shift layout. Per-unit copy
            below ("about €24/mo, billed yearly"). */}
        <View style={styles.priceBlock}>
          <Text style={[styles.priceCurrency, { color: c.textSecondary }]}>€</Text>
          <Text style={[styles.priceAmount, { color: c.textPrimary }]} tabular>
            {PRICING[cadence].amount}
          </Text>
          <Text style={[styles.priceSuffix, { color: c.textSecondary }]}>
            {PRICING[cadence].suffix}
          </Text>
        </View>
        {cadence === 'yearly' ? (
          <Text variant="footnote" color="tertiary" align="center" style={styles.priceHint}>
            {t('paywall.yearlyHint', {
              defaultValue: 'About €{{perMonth}}/mo, billed yearly.',
              perMonth: Math.round(PRICING.yearly.amount / 12),
            })}
          </Text>
        ) : (
          <Text variant="footnote" color="tertiary" align="center" style={styles.priceHint}>
            {t('paywall.monthlyHint', {
              defaultValue: 'Cancel anytime. One subscription per club.',
            })}
          </Text>
        )}

        {/* Feature list — proper Icon glyphs in club-color circles
            instead of emoji. Tighter copy: one outcome per row. */}
        <View style={styles.featureList}>
          {PLUS_FEATURES.map((f) => (
            <View key={f.key} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: c.primary50 }]}>
                <Icon name={f.icon} size={16} color={c.primary} />
              </View>
              <View style={styles.featureCopy}>
                <Text variant="callout" weight="semibold" color="primary">
                  {t(`paywall.features.${f.key}.title`, {
                    defaultValue: f.defaultTitle,
                  })}
                </Text>
                <Text variant="footnote" color="secondary">
                  {t(`paywall.features.${f.key}.body`, {
                    defaultValue: f.defaultBody,
                  })}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Primary CTA + trust microcopy. Trust line lives BELOW the
            button so it's the last thing read before tapping — calmer
            than a urgency banner above the fold. */}
        <Button
          label={t('paywall.upgradeCta', {
            defaultValue: 'Upgrade — €{{amount}}{{suffix}}',
            amount: PRICING[cadence].amount,
            suffix: PRICING[cadence].suffix,
          })}
          variant="filled"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={() => void handleUpgrade()}
        />

        <View style={styles.trustRow}>
          <Icon name="lock" size={11} color="tertiary" />
          <Text variant="caption2" color="tertiary">
            {t('paywall.trust', {
              defaultValue: 'Secure checkout via Stripe · Cancel anytime',
            })}
          </Text>
        </View>

        {/* App Review compliance fine-print: this subscription is for
            real-world club operations (scouting, lineups, contributions),
            not consumer digital content — exempts from IAP under
            Guideline 3.1.3(a). Keep this text in sync with the App
            Review notes form in App Store Connect. */}
        <Text variant="caption2" color="tertiary" align="center" style={styles.complianceFinePrint}>
          {t('paywall.compliance', {
            defaultValue:
              'Plus is a subscription for tools to run a real-world football club. It is not a consumer digital content or entertainment service.',
          })}
        </Text>

        <Pressable
          onPress={onClose}
          style={styles.skipBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.skip', { defaultValue: 'Maybe later' })}
        >
          <Text variant="footnote" color="secondary" align="center">
            {t('paywall.skip', { defaultValue: 'Maybe later' })}
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    borderRadius: radius.xl,
    gap: space.sm,
    marginBottom: space.lg,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    marginBottom: space.xs,
  },
  heroEyebrow: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
  },
  heroTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize['3xl'],
    lineHeight: fontSize['3xl'] * 1.1,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    marginTop: space.xs,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  cadenceRow: {
    flexDirection: 'row',
    padding: space.xs,
    borderWidth: hairline,
    borderRadius: radius.full,
    gap: space.xs,
    alignSelf: 'center',
  },
  cadencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
  },
  cadenceLabel: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  savingsBadge: {
    paddingHorizontal: space.xs + 2,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  savingsBadgeText: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  priceBlock: {
    // Baseline alignment is the only way to keep €, the digits, and the
    // suffix on the same typographic line. `center` aligns the *line
    // boxes* — which, given the size mismatch (28/56/16), pushes € to
    // the top and /yr to the middle of the digit box.
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  priceCurrency: {
    fontFamily: fonts.data,
    fontSize: 24,
    marginRight: space.xs,
  },
  priceAmount: {
    fontFamily: fonts.data,
    fontSize: 56,
    letterSpacing: -2,
  },
  priceSuffix: {
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    fontWeight: '500',
    marginLeft: space.xs,
  },
  priceHint: {
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  featureList: {
    marginBottom: space.lg,
    gap: space.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space['2xs'],
  },
  featureCopy: {
    flex: 1,
    gap: space['2xs'],
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    marginTop: space.sm,
  },
  complianceFinePrint: {
    marginTop: space.sm,
    paddingHorizontal: space.md,
    lineHeight: 16,
  },
  skipBtn: {
    paddingVertical: space.md,
  },
})
