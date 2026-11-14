import { useCallback, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { STUDIO_AI_ACTIONS, type StudioCreditPack } from '@anstoss/shared'
import { useClubColors, useIsDark } from '../../src/context/ClubThemeContext'
import { useAuth } from '../../src/context/AuthContext'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { goBackOrReplace } from '../../src/utils/navigation'
import { getAppLanguage, getAppLocale } from '../../src/i18n'
import { ClubScreenHeader } from '../../src/components/club/ClubScreenHeader'
import { Button, Text } from '../../src/components/ui'
import { CreditsIcon } from '../../src/components/studio/StudioBits'
import { fallbackCredits, useStudioAccess, useStudioCredits } from '../../src/hooks/useStudio'
import {
  STUDIO_ACCENT,
  STUDIO_DASH,
  STUDIO_INK,
  STUDIO_ON_WORKSPACE,
  STUDIO_POSITIVE_FG,
  STUDIO_POSITIVE_FG_DARK,
  STUDIO_WORKSPACE_MUTED,
} from '../../src/theme/studio'
import {
  FONT_FAMILY_DISPLAY,
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXS,
  SPACING_XXXL,
} from '../../src/theme/tokens'

/** Board 42 (Credits.dc.html) measures. */
const PAGE_TOP = 12
const PAGE_GAP = 18
const HERO_RADIUS = 24
const HERO_ICON = 52
const HERO_NUMBER = 40
const COST_ROW = 48
const COST_SIZE = 14
const COST_NUMBER = 18
const PACK_ROW = 58
const PACK_PRICE = 19
const RADIO = 22
const RADIO_ON = 7
const RADIO_OFF = 2
const DOCK_TOP = 12
const DOCK_BOTTOM_MIN = 30
const NOTE_LINE = 18

function formatPrice(pack: StudioCreditPack, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: pack.currency.toUpperCase() }).format(
      pack.amountCents / 100,
    )
  } catch {
    return `${(pack.amountCents / 100).toFixed(2)} ${pack.currency.toUpperCase()}`
  }
}

/**
 * KI-Credits (board 42): the balance, what each AI action costs, and the
 * one-off packs. Credits are a consumable digital good, so the app never
 * sells them natively: "kaufen" opens the checkout on the Anstoss website.
 */
export default function StudioCreditsScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const isDark = useIsDark()
  const insets = useSafeAreaInsetsSafe()
  const { activeClub } = useAuth()
  const access = useStudioAccess()
  const { credits: loaded, refresh, checkout } = useStudioCredits()
  const [selected, setSelected] = useState(1)
  const [buying, setBuying] = useState(false)
  const [bought, setBought] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const locale = getAppLocale(getAppLanguage())

  // Coming back from the website: the new balance shows at once.
  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const credits = loaded ?? fallbackCredits(activeClub?.club.id ?? '', access.canBuy)
  const canBuy = credits.canBuy
  const pack = credits.packs[Math.min(selected, credits.packs.length - 1)]
  const number = (n: number) => n.toLocaleString(locale)
  const resetDate = new Date(credits.resetsAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
  const positive = isDark ? STUDIO_POSITIVE_FG_DARK : STUDIO_POSITIVE_FG

  const onBuy = async () => {
    if (buying || !pack) return
    setBuying(true)
    setNote(null)
    try {
      const url = await checkout(pack.id)
      if (!url) throw new Error('No checkout URL')
      await Linking.openURL(url).catch(() => undefined)
      await refresh()
      setBought(true)
    } catch {
      setNote(t('studio.credits.unavailable'))
    } finally {
      setBuying(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="studio-credits">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + PAGE_TOP, paddingBottom: SPACING_XXXL * 4 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ClubScreenHeader title={t('studio.credits.title')} fallbackHref="/studio" titleSize={24} />

        <View
          style={[styles.hero, { backgroundColor: isDark ? c.surfaceRaised : STUDIO_INK }]}
          accessible
          accessibilityLabel={t('studio.creditsA11y', { count: credits.balance })}
          testID="studio-credits-balance"
        >
          <View style={[styles.heroIcon, { backgroundColor: STUDIO_ACCENT }]}>
            <CreditsIcon size={26} color={STUDIO_INK} />
          </View>
          <View style={styles.heroCopy}>
            <Text allowFontScaling={false} style={styles.heroNumber}>
              {number(credits.balance)}
            </Text>
            <Text variant="footnote" style={styles.heroNote}>
              {t('studio.credits.included', { count: credits.monthlyAllowance, date: resetDate })}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="label" accessibilityRole="header">
            {t('studio.credits.costs')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {STUDIO_AI_ACTIONS.map((action) => (
              <View
                key={action}
                style={[styles.costRow, { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle }]}
                testID={`studio-cost-${action.toLowerCase()}`}
              >
                <Text weight="semibold" color="primary" style={styles.costLabel}>
                  {t(`studio.credits.cost.${action}`)}
                </Text>
                <Text allowFontScaling={false} color="primary" style={styles.costNumber}>
                  {credits.costs[action] ?? 0}
                </Text>
                <CreditsIcon size={14} color={c.textPrimary} />
              </View>
            ))}
            <View style={styles.costRow}>
              <Text weight="semibold" color="primary" style={styles.costLabel}>
                {t('studio.credits.cost.free')}
              </Text>
              <Text variant="footnote" weight="bold" style={{ color: positive }}>
                {t('studio.credits.freeTag')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section} accessibilityRole="radiogroup" accessibilityLabel={t('studio.credits.packLabel')}>
          <Text variant="label" accessibilityRole="header">
            {t('studio.credits.buy')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {credits.packs.map((item, i) => {
              const on = i === selected
              const name = t('studio.credits.pack', { count: item.credits }).replace(
                String(item.credits),
                number(item.credits),
              )
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setSelected(i)
                    setBought(false)
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={`${name}, ${formatPrice(item, locale)}`}
                  accessibilityState={{ checked: on }}
                  testID={`studio-pack-${item.credits}`}
                  style={[
                    styles.packRow,
                    i < credits.packs.length - 1 && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle },
                  ]}
                >
                  <View style={styles.packCopy}>
                    <Text variant="body" weight="bold" color="primary">
                      {name}
                    </Text>
                    {item.savingsPercent > 0 ? (
                      <Text variant="caption1" weight="semibold" style={{ color: positive }}>
                        {t('studio.credits.save', { percent: item.savingsPercent })}
                      </Text>
                    ) : null}
                  </View>
                  <Text allowFontScaling={false} color="primary" style={styles.packPrice}>
                    {formatPrice(item, locale)}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      on
                        ? { borderWidth: RADIO_ON, borderColor: c.ink }
                        : { borderWidth: RADIO_OFF, borderColor: STUDIO_DASH },
                    ]}
                  />
                </Pressable>
              )
            })}
          </View>
        </View>

        <Text variant="caption1" weight="regular" color="secondary" style={styles.note}>
          {t('studio.credits.note')}
        </Text>
      </ScrollView>

      <View
        style={[
          styles.dock,
          {
            backgroundColor: c.background,
            borderTopColor: c.borderDefault,
            paddingBottom: Math.max(DOCK_BOTTOM_MIN, insets.bottom + SPACING_MD),
          },
        ]}
      >
        {bought ? (
          <Button
            label={t('studio.credits.bought')}
            variant="accent"
            size="lg"
            fullWidth
            onPress={() => goBackOrReplace(router, '/studio' as never)}
            testID="studio-credits-bought"
          />
        ) : canBuy && pack ? (
          <Button
            label={t('studio.credits.cta', { count: pack.credits, price: formatPrice(pack, locale) }).replace(
              String(pack.credits),
              number(pack.credits),
            )}
            variant="filled"
            size="lg"
            fullWidth
            loading={buying}
            disabled={buying}
            onPress={onBuy}
            testID="studio-credits-buy"
          />
        ) : null}
        <Text variant="caption1" weight="regular" color="secondary" align="center" testID="studio-credits-note">
          {note ?? (canBuy ? t('studio.credits.vat') : t('studio.credits.readOnly'))}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, gap: PAGE_GAP },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_LG,
    padding: SPACING_XL,
    borderRadius: HERO_RADIUS,
  },
  heroIcon: {
    width: HERO_ICON,
    height: HERO_ICON,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, gap: SPACING_XXS },
  heroNumber: {
    fontFamily: FONT_FAMILY_DISPLAY,
    fontSize: HERO_NUMBER,
    lineHeight: HERO_NUMBER,
    color: STUDIO_ON_WORKSPACE,
  },
  heroNote: { color: STUDIO_WORKSPACE_MUTED },
  section: { gap: SPACING_SM },
  group: { borderRadius: RADIUS_CARD, paddingHorizontal: SPACING_LG },
  costRow: { minHeight: COST_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACING_XS },
  costLabel: { flex: 1, fontSize: COST_SIZE, lineHeight: COST_SIZE * 1.4 },
  costNumber: { fontFamily: FONT_FAMILY_DISPLAY, fontSize: COST_NUMBER, lineHeight: COST_NUMBER * 1.15 },
  packRow: { minHeight: PACK_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACING_MD + 2 },
  packCopy: { flex: 1, gap: SPACING_XXS },
  packPrice: { fontFamily: FONT_FAMILY_DISPLAY, fontSize: PACK_PRICE, lineHeight: PACK_PRICE * 1.15 },
  radio: { width: RADIO, height: RADIO, borderRadius: RADIUS_FULL },
  note: { lineHeight: NOTE_LINE },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: DOCK_TOP,
    paddingHorizontal: SCREEN_PADDING,
    gap: SPACING_SM,
    borderTopWidth: hairline,
  },
})
