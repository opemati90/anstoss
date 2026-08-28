import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { BottomSheet, Button, Icon, Text, type IconName } from '../ui'
import { fonts, fontSize, radius, space } from '../../theme/tokens'

type LaunchFeature = {
  key: string
  icon: IconName
  defaultTitle: string
  defaultBody: string
}

const LAUNCH_FEATURES: LaunchFeature[] = [
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
    defaultTitle: 'Club contribution tracking',
    defaultBody: 'Track dues, receipts, reminders, and bank transfers in one place.',
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
    defaultBody: 'Direct line to our team. Usually under 24 hours.',
  },
]

type PaywallSheetProps = {
  visible: boolean
  onClose: () => void
  /** Feature slug that triggered the paywall (e.g. 'lineup_builder_pro'). */
  triggerFeature?: string
  /** Kept for caller compatibility; upgrade sales are disabled for store submission. */
  onUpgradeStarted?: () => void
}

export function PaywallSheet({ visible, onClose, triggerFeature }: PaywallSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()

  const triggerLabel = triggerFeature
    ? t(`paywall.triggers.${triggerFeature}`, {
        defaultValue: t('paywall.triggers.generic', {
          defaultValue: 'this feature',
        }),
      })
    : null

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        {/* Hero — club-color slab with a single bold value statement. */}
        <View style={[styles.hero, { backgroundColor: c.primary }]}>
          <View style={styles.heroEyebrowRow}>
            <Icon name="bolt" size={12} color="inverse" />
            <Text style={[styles.heroEyebrow, { color: c.textInverse }]}>
              {t('paywall.eyebrow', { defaultValue: 'LAUNCH ACCESS' })}
            </Text>
          </View>
          <Text style={[styles.heroTitle, { color: c.textInverse }]} numberOfLines={3}>
            {triggerLabel
              ? t('paywall.titleForFeature', {
                  defaultValue: '{{feature}} is included during launch.',
                  feature: triggerLabel,
                })
              : t('paywall.titleEditorial', {
                  defaultValue: 'Launch tools are included for every club.',
                })}
          </Text>
          <Text
            style={[styles.heroSubtitle, { color: c.textInverse, opacity: 0.85 }]}
            numberOfLines={4}
          >
            {t('paywall.heroSubtitle', {
              defaultValue:
                'No digital upgrade is sold in this app build. Club tools remain available while we complete store-compliant billing.',
            })}
          </Text>
        </View>

        {/* Feature list — proper Icon glyphs in club-color circles
            instead of emoji. Tighter copy: one outcome per row. */}
        <View style={styles.featureList}>
          {LAUNCH_FEATURES.map((f) => (
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
            defaultValue: 'Continue',
          })}
          variant="filled"
          size="lg"
          fullWidth
          onPress={onClose}
        />

        <View style={styles.trustRow}>
          <Icon name="lock" size={11} color="tertiary" />
          <Text variant="caption2" color="tertiary">
            {t('paywall.trust', {
              defaultValue: 'No digital subscription purchase in this build',
            })}
          </Text>
        </View>

        <Text variant="caption2" color="tertiary" align="center" style={styles.complianceFinePrint}>
          {t('paywall.compliance', {
            defaultValue:
              'Club dues go directly to the club bank account. Digital feature upgrades are disabled for this store submission.',
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
