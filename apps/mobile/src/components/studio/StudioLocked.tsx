import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PLAN_CURRENCY, PLAN_PRICES_CENTS, type StudioStyle, type StudioTemplate } from '@anstoss/shared'
import { Button, SoftIcon, Text } from '../ui'
import { ClubScreenHeader } from '../club/ClubScreenHeader'
import { StudioGraphic } from './StudioGraphic'
import { useClubColors } from '../../context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'
import { getAppLanguage, getAppLocale } from '../../i18n'
import type { StudioGraphicData } from '../../studio/buildGraphicData'
import { STUDIO_INK } from '../../theme/studio'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_MD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XXXL,
} from '../../theme/tokens'

/** Board 41 (StudioLocked.dc.html) measures. */
const PAGE_TOP = 12
const PAGE_GAP = 22
const FAN_GAP = 12
const SIDE_WIDTH = 104
const CENTER_WIDTH = 124
const SIDE_DROP = 12
const SIDE_TILT = '6deg'
const SIDE_TILT_LEFT = '-6deg'
const COPY_GAP = 10
const HEADLINE = 26
const BODY_SIZE = 15
const ROW_HEIGHT = 60
const ROW_GAP = 14
const DOCK_TOP = 12
const DOCK_BOTTOM_MIN = 30

const FAN: Array<{ template: StudioTemplate; style: StudioStyle; width: number; tilt?: string }> = [
  { template: 'LINEUP', style: 'KREIDE', width: SIDE_WIDTH, tilt: SIDE_TILT_LEFT },
  { template: 'FULL_TIME', style: 'FLUTLICHT', width: CENTER_WIDTH },
  { template: 'MATCHDAY', style: 'DERBY', width: SIDE_WIDTH, tilt: SIDE_TILT },
]

/**
 * Free clubs (board 41): a fan of three graphics in the club's colours, what
 * the Studio does, and one lime action into the Abo screen.
 */
export function StudioLocked({ build }: { build: (template: StudioTemplate) => StudioGraphicData }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const locale = getAppLocale(getAppLanguage())
  const price = new Intl.NumberFormat(locale, { style: 'currency', currency: PLAN_CURRENCY }).format(
    PLAN_PRICES_CENTS.monthly / 100,
  )

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="studio-locked">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + PAGE_TOP, paddingBottom: SPACING_XXXL * 4 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ClubScreenHeader title={t('studio.title')} fallbackHref="/(tabs)/more" />

        <View style={styles.fan}>
          {FAN.map((item) => (
            <View
              key={item.template}
              style={[
                styles.fanItem,
                { shadowColor: STUDIO_INK },
                item.tilt ? { transform: [{ rotate: item.tilt }, { translateY: SIDE_DROP }] } : styles.fanCenter,
              ]}
            >
              <View style={styles.fanClip}>
                <StudioGraphic
                  data={build(item.template)}
                  template={item.template}
                  style={item.style}
                  width={item.width}
                  presentedBy={t('studio.graphic.presentedBy')}
                  accessibilityLabel={t('studio.previewA11y', { template: t(`studio.template.${item.template}`) })}
                />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.copy}>
          <Text weight="bold" color="primary" accessibilityRole="header" style={styles.headline}>
            {t('studio.locked.headline')}
          </Text>
          <Text color="secondary" style={styles.body}>
            {t('studio.locked.body')}
          </Text>
        </View>

        <View style={[styles.group, { backgroundColor: c.surface }]}>
          {(['f1', 'f2', 'f3'] as const).map((key, i) => (
            <View
              key={key}
              style={[styles.row, i < 2 && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle }]}
            >
              <SoftIcon name="checkmark" />
              <Text variant="body" weight="semibold" color="primary" style={styles.flex}>
                {t(`studio.locked.${key}`)}
              </Text>
            </View>
          ))}
        </View>
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
        <Button
          label={t('studio.locked.cta')}
          variant="accent"
          size="lg"
          fullWidth
          onPress={() => router.push('/abo' as never)}
          testID="studio-locked-cta"
        />
        <Text variant="caption1" weight="regular" color="secondary" align="center">
          {t('studio.locked.note', { price })}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, gap: PAGE_GAP },
  fan: { flexDirection: 'row', justifyContent: 'center', gap: FAN_GAP, paddingVertical: SPACING_SM },
  fanItem: {
    borderRadius: RADIUS_MD,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  fanCenter: { zIndex: 1 },
  fanClip: { borderRadius: RADIUS_MD, overflow: 'hidden' },
  copy: { gap: COPY_GAP },
  headline: { fontSize: HEADLINE, lineHeight: HEADLINE * 1.15, letterSpacing: -0.65 },
  body: { fontSize: BODY_SIZE, lineHeight: BODY_SIZE * 1.55 },
  group: { borderRadius: RADIUS_CARD, paddingHorizontal: SPACING_LG },
  row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
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
