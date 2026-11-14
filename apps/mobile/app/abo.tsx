import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ClubPlan, PlanPrice } from '@anstoss/shared'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useClubPlan, fallbackClubPlan } from '../src/hooks/useClubPlan'
import { useAuth } from '../src/context/AuthContext'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import { ClubScreenHeader } from '../src/components/club/ClubScreenHeader'
import { Button, Icon, SegmentedControl, Text } from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import {
  FONT_FAMILY_DISPLAY,
  RADIUS_CARD,
  RADIUS_HERO,
  RADIUS_SM,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XXXL,
} from '../src/theme/tokens'

type Interval = 'monthly' | 'yearly'

/** Board 35 (Plan.dc.html) measures. */
const PAGE_TOP = 12
const PAGE_GAP = 20
const CARD_GAP = 14
const USAGE_GAP = 6
const BAR_HEIGHT = 6
const BAR_RADIUS = 3
const BAR_GAP = 2
const HERO_PADDING = 22
const HERO_GAP = 16
const PRICE_SIZE = 52
const CHECK_SIZE = 20
const CHECK_ICON = 12
const FEATURE_GAP = 10
const FEATURE_TEXT = 14
const FEATURE_LINE = 20
const TAG_PAD_V = 4
const DOCK_TOP = 12
const DOCK_BOTTOM_MIN = 32
const TEXT_PLAN_TITLE = 20
const TEXT_PER = 14
const NOTE_LINE = 20

/** Order of the check-list on the Verein card (board 35). */
const FEATURE_ROWS = [
  'limits',
  'clubColors',
  'liveTicker',
  'matchdayStudio',
  'autoReminders',
  'fixtureImport',
  'duesTracking',
  'chatTranslation',
  'actingSessions',
] as const

function formatPrice(price: PlanPrice, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: price.currency.toUpperCase(),
    }).format(price.amountCents / 100)
  } catch {
    return `${(price.amountCents / 100).toFixed(2)} ${price.currency.toUpperCase()}`
  }
}

/**
 * Abo — the club plan (redesign 35, REVAMP_HANDOFF "Plans and pricing").
 * Current plan with usage against limits, Monatlich/Jährlich toggle, the
 * club-coloured Verein card and a docked lime trial action. Paid plans are
 * sold on the website; the app only shows status and starts the card-less
 * trial. Only Vorstand and Kassenwart can start it, everyone else reads.
 */
export default function AboScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const { activeClub } = useAuth()
  const { plan: loaded, startTrial } = useClubPlan()
  const [interval, setInterval] = useState<Interval>('monthly')
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const locale = getAppLocale(getAppLanguage())

  const plan: ClubPlan = loaded ?? fallbackClubPlan(activeClub?.club.id ?? '', false)
  const price = formatPrice(plan.prices[interval], locale)
  const per = interval === 'monthly' ? t('clubPlan.perMonth') : t('clubPlan.perYear')
  const perShort = interval === 'monthly' ? t('clubPlan.perMonth') : t('clubPlan.perYearShort')
  const teamsFull = plan.usage.teams >= plan.limits.teams
  const playersFull = plan.usage.players >= plan.limits.players
  const isFree = plan.tier === 'FREE'
  const trialActive = plan.source === 'TRIAL' && Boolean(plan.trialEndsAt)
  const trialDate = plan.trialEndsAt
    ? new Date(plan.trialEndsAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
    : ''
  const statusTag = trialActive
    ? t('clubPlan.trialUntil', { date: trialDate })
    : teamsFull
      ? t('clubPlan.teamLimit')
      : playersFull
        ? t('clubPlan.playerLimit')
        : !isFree
          ? t('clubPlan.active')
          : null
  const canStartTrial = isFree && !plan.trialUsed && plan.canManage

  const onStartTrial = async () => {
    if (starting) return
    setStarting(true)
    setMessage(null)
    try {
      await startTrial()
      setMessage(t('clubPlan.started'))
    } catch {
      setMessage(t('clubPlan.startError'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="abo-screen">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + PAGE_TOP, paddingBottom: SPACING_XXXL * 5 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ClubScreenHeader title={t('clubPlan.title')} fallbackHref="/(tabs)/more" />

        {/* Current plan + usage against limits */}
        <View style={[styles.card, { backgroundColor: c.surface }]} testID="abo-current">
          <View style={styles.cardHead}>
            <Text variant="body" weight="bold" color="primary" style={styles.flexShrink}>
              {t('clubPlan.current', { plan: t(`clubPlan.tier.${plan.tier}`) })}
            </Text>
            {statusTag ? (
              <View style={[styles.tag, { backgroundColor: c.surfaceMuted }]}>
                <Text variant="caption1" weight="bold" color="secondary" numberOfLines={1}>
                  {statusTag}
                </Text>
              </View>
            ) : null}
          </View>
          <UsageBar
            label={t('clubPlan.teams')}
            used={plan.usage.teams}
            limit={plan.limits.teams}
            testID="abo-usage-teams"
          />
          <UsageBar
            label={t('clubPlan.players')}
            used={plan.usage.players}
            limit={plan.limits.players}
            testID="abo-usage-players"
          />
        </View>

        <SegmentedControl<Interval>
          segments={[
            { key: 'monthly', label: t('clubPlan.monthly'), testID: 'abo-interval-monthly' },
            { key: 'yearly', label: t('clubPlan.yearly'), testID: 'abo-interval-yearly' },
          ]}
          value={interval}
          onChange={setInterval}
          testID="abo-interval"
        />

        {/* Verein card in the club colour */}
        <View style={[styles.hero, { backgroundColor: c.heroBg }]} testID="abo-verein">
          <View style={styles.heroHead}>
            <Text weight="bold" style={[styles.planTitle, { color: c.onHeroBg }]}>
              {t('clubPlan.tier.PRO')}
            </Text>
            <View style={[styles.tag, { backgroundColor: c.accent }]}>
              <Text variant="caption1" weight="bold" style={{ color: c.onAccent }}>
                {t('clubPlan.trialTag')}
              </Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: c.onHeroBg }]} testID="abo-price">
              {price}
            </Text>
            <Text style={[styles.per, { color: c.onHeroMuted }]}>{per}</Text>
          </View>
          <View style={styles.features}>
            {FEATURE_ROWS.map((key) => (
              <View key={key} style={styles.featureRow}>
                <View style={[styles.check, { backgroundColor: c.accent }]}>
                  <Icon name="checkmark" size={CHECK_ICON} color={c.onAccent} />
                </View>
                <Text style={[styles.featureText, { color: c.onHeroBg }]}>
                  {t(`clubPlan.features.${key}`)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text variant="footnote" color="secondary" style={styles.note}>
          {perHeadNote(t, plan, locale)}
        </Text>
        {plan.salesEmail ? (
          <Text variant="footnote" color="secondary" style={styles.note}>
            {t('clubPlan.sales', { email: plan.salesEmail })}
          </Text>
        ) : null}
      </ScrollView>

      {/* Docked action */}
      <View
        style={[
          styles.dock,
          {
            backgroundColor: c.background,
            borderTopColor: c.borderDefault,
            paddingBottom: Math.max(DOCK_BOTTOM_MIN, insets.bottom + SPACING_MD),
          },
        ]}
        testID="abo-dock"
      >
        {canStartTrial ? (
          <>
            <Button
              label={t('clubPlan.cta')}
              variant="accent"
              size="lg"
              fullWidth
              loading={starting}
              disabled={starting}
              onPress={onStartTrial}
              accessibilityLabel={t('clubPlan.cta')}
              testID="abo-start-trial"
            />
            <Text variant="caption1" weight="regular" color="secondary" align="center">
              {message ?? t('clubPlan.ctaNote', { price, per: perShort })}
            </Text>
          </>
        ) : (
          <Text
            variant="footnote"
            color="secondary"
            align="center"
            testID="abo-status-note"
          >
            {message ??
              (trialActive
                ? `${t('clubPlan.trialRunning', { date: trialDate })} ${t('clubPlan.trialRunningNote')}`
                : !isFree
                  ? t('clubPlan.paidActive')
                  : !plan.canManage
                    ? t('clubPlan.readOnly')
                    : t('clubPlan.trialUsed'))}
          </Text>
        )}
      </View>
    </View>
  )
}

function perHeadNote(
  t: (key: string, options?: Record<string, unknown>) => string,
  plan: ClubPlan,
  locale: string,
) {
  const head = t('clubPlan.noteHead')
  const tail = t('clubPlan.noteTail')
  const players = plan.usage.players
  if (players <= 0) return `${head} ${tail}`
  // "keine 50 Cent": the monthly price per player, rounded up to 10 cents.
  const cents = Math.ceil(plan.prices.monthly.amountCents / players / 10) * 10
  const amount =
    cents < 100
      ? t('clubPlan.cents', { count: cents })
      : formatPrice({ amountCents: cents, currency: plan.prices.monthly.currency }, locale)
  return `${head} ${t('clubPlan.notePerHead', { count: players, amount })} ${tail}`
}

function UsageBar({
  label,
  used,
  limit,
  testID,
}: {
  label: string
  used: number
  limit: number
  testID?: string
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const full = used >= limit
  const filled = limit > 0 ? Math.min(used, limit) : 0
  const rest = Math.max(0, limit - filled)
  return (
    <View style={styles.usage} testID={testID}>
      <View style={styles.usageHead}>
        <Text variant="footnote" weight="semibold" color="primary">
          {label}
        </Text>
        <Text
          variant="footnote"
          weight={full ? 'bold' : 'medium'}
          color={full ? 'primary' : 'secondary'}
        >
          {t('clubPlan.usage', { used, limit })}
        </Text>
      </View>
      <View
        style={styles.bar}
        accessibilityRole="progressbar"
        accessibilityLabel={`${label} ${t('clubPlan.usage', { used, limit })}`}
        accessibilityValue={{ min: 0, max: limit, now: filled }}
      >
        {filled > 0 ? <View style={{ flex: filled, backgroundColor: c.ink }} /> : null}
        {rest > 0 ? <View style={{ flex: rest, backgroundColor: c.borderDefault }} /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, gap: PAGE_GAP },
  flexShrink: { flexShrink: 1 },
  card: { borderRadius: RADIUS_CARD, padding: SPACING_LG, gap: CARD_GAP },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING_SM,
  },
  tag: {
    paddingVertical: TAG_PAD_V,
    paddingHorizontal: SPACING_SM,
    borderRadius: RADIUS_SM,
  },
  usage: { gap: USAGE_GAP },
  usageHead: { flexDirection: 'row', justifyContent: 'space-between' },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
    gap: BAR_GAP,
  },
  hero: { borderRadius: RADIUS_HERO, padding: HERO_PADDING, gap: HERO_GAP },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: FEATURE_GAP },
  planTitle: { fontSize: TEXT_PLAN_TITLE, lineHeight: TEXT_PLAN_TITLE * 1.25 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: SPACING_SM },
  price: { fontFamily: FONT_FAMILY_DISPLAY, fontSize: PRICE_SIZE, lineHeight: PRICE_SIZE },
  per: { fontSize: TEXT_PER, lineHeight: TEXT_PER * 1.3 },
  features: { gap: FEATURE_GAP },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: FEATURE_GAP },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, fontSize: FEATURE_TEXT, lineHeight: FEATURE_LINE },
  note: { lineHeight: NOTE_LINE },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: DOCK_TOP,
    paddingHorizontal: SCREEN_PADDING,
    gap: SPACING_SM,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})

