import { useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import {
  STUDIO_CREDIT_COSTS,
  STUDIO_FONT_PAIRINGS,
  type StudioFontPairing,
  type StudioStyle,
} from '@anstoss/shared'
import { useClubColors, useIsDark } from '../../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../src/utils/useSafeAreaInsetsSafe'
import { ClubScreenHeader } from '../../src/components/club/ClubScreenHeader'
import { Button, Icon, Text } from '../../src/components/ui'
import { MatchCrest } from '../../src/components/match/MatchCrest'
import { StudioGraphic } from '../../src/components/studio/StudioGraphic'
import { CreditsIcon } from '../../src/components/studio/StudioBits'
import { StudioLocked } from '../../src/components/studio/StudioLocked'
import {
  useStudioAccess,
  useStudioActions,
  useStudioBrandKit,
  useStudioCredits,
  useStudioMatch,
} from '../../src/hooks/useStudio'
import { useGraphicBuilder } from '../../src/studio/useGraphicData'
import { studioShortCode } from '../../src/studio/buildGraphicData'
import {
  STUDIO_DASH,
  STUDIO_INK,
  STUDIO_POSITIVE_BG,
  STUDIO_POSITIVE_FG,
  STUDIO_POSITIVE_FG_DARK,
} from '../../src/theme/studio'
import { hexToRgba } from '../../src/theme/club-theme'
import {
  FONT_FAMILY_BOLD,
  FONT_FAMILY_DISPLAY,
  hairline,
  RADIUS_CARD,
  RADIUS_MD,
  RADIUS_SM,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXXL,
} from '../../src/theme/tokens'

/** Board 40 (BrandKit.dc.html) measures. */
const PAGE_TOP = 12
const PAGE_GAP = 22
const SECTION_GAP = 10
const TILE_GAP = 10
const TILE_RADIUS = 18
const TILE_LABEL_GAP = 6
const CREST = 40
const SPONSOR_SIZE = 14
const SPONSOR_SUB = 10
const SWATCH_HEIGHT = 56
const SWATCH_RADIUS = 14
const FONT_TILE = 96
const FONT_SAMPLE = 34
const FONT_RING = 2
const ROW_HEIGHT = 56
const ROW_GAP = 14
const ICON_WELL = 40
const DOCK_TOP = 14
const DOCK_BOTTOM_MIN = 30
const SET_WIDTH = 100
const TAG_PAD_V = 4

const SET_STYLES: StudioStyle[] = ['FLUTLICHT', 'DERBY', 'KREIDE']
type GenState = 'idle' | 'working' | 'done'

function fontSample(pairing: StudioFontPairing) {
  if (pairing === 'CLASSIC') return { fontFamily: 'Georgia', fontWeight: '700' as const }
  if (pairing === 'MODERN') return { fontFamily: FONT_FAMILY_BOLD }
  return { fontFamily: FONT_FAMILY_DISPLAY }
}

/**
 * Brand-Kit (board 40): crest and sponsor logos, the club colours (changed
 * in club setup), one of three font pairings, connected accounts, and the
 * docked AI action that generates the club's template set for 20 credits.
 */
export default function StudioBrandKitScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const isDark = useIsDark()
  const insets = useSafeAreaInsetsSafe()
  const access = useStudioAccess()
  const { kit, save } = useStudioBrandKit()
  const { balance } = useStudioCredits()
  const actions = useStudioActions()
  const { match } = useStudioMatch(null)
  const { build } = useGraphicBuilder(match, kit)
  const [gen, setGen] = useState<GenState>('idle')
  const [note, setNote] = useState<string | null>(null)

  if (!access.loading && !access.unlocked) return <StudioLocked build={build} />

  const cost = STUDIO_CREDIT_COSTS.TEMPLATE_SET
  const enough = balance >= cost
  const preview = build('FULL_TIME')
  const positiveFg = isDark ? STUDIO_POSITIVE_FG_DARK : STUDIO_POSITIVE_FG
  const positiveBg = isDark ? hexToRgba(STUDIO_POSITIVE_FG_DARK, 0.14) : STUDIO_POSITIVE_BG

  const onGenerate = async () => {
    if (gen === 'working') return
    setGen('working')
    setNote(null)
    try {
      await actions.templateSet()
      setGen('done')
    } catch {
      setGen('idle')
      setNote(t('studio.editor.aiFailed'))
    }
  }

  const onConnect = async (channel: 'INSTAGRAM' | 'FACEBOOK') => {
    setNote(null)
    try {
      const res = await actions.connectAccount(channel)
      if (res?.url) await Linking.openURL(res.url)
      else setNote(t('studio.brandKit.connectSoon'))
    } catch {
      setNote(t('studio.brandKit.connectSoon'))
    }
  }

  const swatches: Array<{ key: 'primary' | 'accent' | 'dark' | 'light'; ring?: boolean }> = [
    { key: 'primary' },
    { key: 'accent' },
    { key: 'dark' },
    { key: 'light', ring: true },
  ]

  const logoTile = (key: string, label: string, body: React.ReactNode) => (
    <View key={key} style={styles.tileColumn}>
      <View style={[styles.tile, { backgroundColor: c.surface }]}>{body}</View>
      <Text variant="caption1" weight="semibold" color="secondary">
        {label}
      </Text>
    </View>
  )

  return (
    <View style={[styles.root, { backgroundColor: c.background }]} testID="studio-brand-kit">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + PAGE_TOP,
            paddingBottom: (gen === 'done' ? SPACING_XXXL * 9 : SPACING_XXXL * 4) + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ClubScreenHeader title={t('studio.brandKit.title')} fallbackHref="/studio" />

        <View style={styles.section}>
          <Text variant="label" accessibilityRole="header">
            {t('studio.brandKit.logos')}
          </Text>
          <View style={styles.tiles}>
            {logoTile(
              'crest',
              t('studio.brandKit.crest'),
              <MatchCrest name={studioShortCode(match.club.name)} badgeUrl={kit.crestUrl} size={CREST} color={kit.colors.primary} />,
            )}
            {kit.sponsors.slice(0, 2).map((sponsor) => {
              const words = sponsor.name.toUpperCase().split(/\s+/)
              // Board: the distinctive word large, the trade under it.
              const main = words.length > 1 ? words[words.length - 1] : words[0]
              const sub = words.length > 1 ? words.slice(0, -1).join(' ') : ''
              return logoTile(
                sponsor.id,
                t('studio.brandKit.sponsor'),
                <View accessible accessibilityRole="image" accessibilityLabel={sponsor.name} style={styles.sponsorMark}>
                  <Text allowFontScaling={false} color="primary" numberOfLines={1} style={styles.sponsorMain}>
                    {main}
                  </Text>
                  {sub ? (
                    <Text allowFontScaling={false} color="primary" numberOfLines={1} style={styles.sponsorSub}>
                      {sub}
                    </Text>
                  ) : null}
                </View>,
              )
            })}
            <View style={styles.tileColumn}>
              <Pressable
                onPress={() => router.push('/admin-sponsors' as never)}
                accessibilityRole="button"
                accessibilityLabel={t('studio.brandKit.addA11y')}
                testID="studio-kit-add-logo"
                style={({ pressed }) => [styles.tile, styles.tileAdd, { borderColor: STUDIO_DASH }, pressed && styles.pressed]}
              >
                <Icon name="plus" size={22} color={c.textSecondary} />
              </Pressable>
              <Text variant="caption1" weight="semibold" color="secondary">
                {t('studio.brandKit.add')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="label" accessibilityRole="header">
              {t('studio.brandKit.colors')}
            </Text>
            <Pressable
              onPress={() => router.push('/admin-club-profile' as never)}
              accessibilityRole="link"
              accessibilityLabel={`${t('studio.brandKit.colors')}: ${t('studio.brandKit.change')}`}
              hitSlop={SPACING_MD}
              testID="studio-kit-change-colors"
            >
              <Text variant="footnote" weight="semibold" color="tint" style={styles.link}>
                {t('studio.brandKit.change')}
              </Text>
            </Pressable>
          </View>
          <View style={styles.tiles}>
            {swatches.map(({ key, ring }) => (
              <View key={key} style={styles.swatchColumn}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: kit.colors[key] },
                    (ring || (isDark && key === 'dark')) && { borderWidth: 1, borderColor: c.borderStrong },
                  ]}
                />
                <Text variant="caption1" weight="bold" color="primary">
                  {t(`studio.brandKit.${key}`)}
                </Text>
                <Text variant="caption1" weight="regular" color="secondary" tabular>
                  {kit.colors[key].toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="label" accessibilityRole="header">
            {t('studio.brandKit.font')}
          </Text>
          <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel={t('studio.brandKit.font')}>
            {STUDIO_FONT_PAIRINGS.map((pairing) => {
              const on = kit.fontPairing === pairing
              return (
                <Pressable
                  key={pairing}
                  onPress={() => void save({ fontPairing: pairing })}
                  accessibilityRole="radio"
                  accessibilityLabel={t(`studio.brandKit.fontOption.${pairing}`)}
                  accessibilityState={{ checked: on }}
                  testID={`studio-kit-font-${pairing.toLowerCase()}`}
                  style={({ pressed }) => [
                    styles.fontTile,
                    { backgroundColor: c.surface, borderColor: on ? c.ink : c.surface },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text allowFontScaling={false} color="primary" style={[styles.fontSample, fontSample(pairing)]}>
                    3:1
                  </Text>
                  <Text variant="caption1" weight="semibold" color="primary">
                    {t(`studio.brandKit.fontOption.${pairing}`)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="label" accessibilityRole="header">
            {t('studio.brandKit.accounts')}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {kit.accounts.map((account, i) => {
              const instagram = account.channel === 'INSTAGRAM'
              const name = t(instagram ? 'studio.brandKit.instagram' : 'studio.brandKit.facebook')
              return (
                <View
                  key={account.channel}
                  style={[styles.row, i < kit.accounts.length - 1 && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle }]}
                  testID={`studio-kit-account-${account.channel.toLowerCase()}`}
                >
                  <View style={[styles.iconWell, { backgroundColor: c.surfaceMuted }]}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      {instagram ? (
                        <>
                          <Rect x={3.5} y={3.5} width={17} height={17} rx={5} stroke={c.textPrimary} strokeWidth={1.8} />
                          <Circle cx={12} cy={12} r={4} stroke={c.textPrimary} strokeWidth={1.8} />
                          <Circle cx={17.2} cy={6.8} r={0.9} fill={c.textPrimary} />
                        </>
                      ) : (
                        <Path
                          d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v6h4v-6h3l1-4h-4V8z"
                          stroke={c.textPrimary}
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </Svg>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="body" weight="semibold" color="primary">
                      {name}
                    </Text>
                    {account.connected && account.handle ? (
                      <Text variant="caption1" weight="regular" color="secondary" numberOfLines={1}>
                        {account.handle}
                      </Text>
                    ) : null}
                  </View>
                  {account.connected ? (
                    <View style={[styles.tag, { backgroundColor: positiveBg }]}>
                      <Text variant="caption1" weight="bold" style={{ color: positiveFg }}>
                        {t('studio.brandKit.connected')}
                      </Text>
                    </View>
                  ) : (
                    <Button
                      label={t('studio.brandKit.connect')}
                      variant="bordered"
                      size="sm"
                      onPress={() => void onConnect(account.channel)}
                      accessibilityLabel={`${name}: ${t('studio.brandKit.connect')}`}
                      testID={`studio-kit-connect-${account.channel.toLowerCase()}`}
                    />
                  )}
                </View>
              )
            })}
          </View>
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
        {gen === 'done' ? (
          <View style={styles.done} testID="studio-kit-set-done">
            <Text variant="footnote" weight="bold" color="primary" style={styles.doneTitle}>
              {t('studio.brandKit.done')}
            </Text>
            <View style={styles.tiles}>
              {SET_STYLES.map((style) => (
                <StudioGraphic
                  key={style}
                  data={preview}
                  template="FULL_TIME"
                  style={style}
                  width={SET_WIDTH}
                  fontPairing={kit.fontPairing}
                  presentedBy={t('studio.graphic.presentedBy')}
                  accessibilityLabel={t('studio.previewA11y', { template: t(`studio.style.${style}`) })}
                />
              ))}
            </View>
            <Button
              label={t('studio.brandKit.toStudio')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() => router.replace('/studio' as never)}
              testID="studio-kit-to-studio"
            />
          </View>
        ) : gen === 'working' ? (
          <Button label={t('studio.brandKit.working')} variant="accent" size="lg" fullWidth disabled testID="studio-kit-working" />
        ) : enough ? (
          <Button
            label={t('studio.brandKit.generate', { cost })}
            accessibilityLabel={t('studio.brandKit.generateA11y', { count: cost })}
            variant="accent"
            size="lg"
            fullWidth
            rightIcon={<CreditsIcon size={16} color={STUDIO_INK} />}
            onPress={onGenerate}
            testID="studio-kit-generate"
          />
        ) : (
          <Button
            label={t('studio.editor.getCredits')}
            variant="accent"
            size="lg"
            fullWidth
            rightIcon={<CreditsIcon size={16} color={STUDIO_INK} />}
            onPress={() => router.push('/studio/credits' as never)}
            testID="studio-kit-get-credits"
          />
        )}
        {note ? (
          <Text variant="caption1" weight="regular" color="secondary" align="center" testID="studio-note">
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: SCREEN_PADDING, gap: PAGE_GAP },
  section: { gap: SECTION_GAP },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  link: { textDecorationLine: 'underline' },
  tiles: { flexDirection: 'row', gap: TILE_GAP },
  tileColumn: { flex: 1, alignItems: 'center', gap: TILE_LABEL_GAP },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: TILE_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileAdd: { borderWidth: 1.5, borderStyle: 'dashed' },
  sponsorMark: { alignItems: 'center', paddingHorizontal: SPACING_XS },
  sponsorMain: {
    fontFamily: FONT_FAMILY_DISPLAY,
    fontSize: SPONSOR_SIZE,
    lineHeight: SPONSOR_SIZE,
    letterSpacing: 0.06 * SPONSOR_SIZE,
  },
  sponsorSub: {
    fontFamily: FONT_FAMILY_DISPLAY,
    fontSize: SPONSOR_SUB,
    lineHeight: SPONSOR_SUB * 1.1,
    letterSpacing: 0.18 * SPONSOR_SUB,
  },
  swatchColumn: { flex: 1, gap: TILE_LABEL_GAP },
  swatch: { height: SWATCH_HEIGHT, borderRadius: SWATCH_RADIUS },
  fontTile: {
    flex: 1,
    height: FONT_TILE,
    borderRadius: TILE_RADIUS,
    borderWidth: FONT_RING,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING_SM,
  },
  fontSample: { fontSize: FONT_SAMPLE, lineHeight: FONT_SAMPLE },
  group: { borderRadius: RADIUS_CARD, paddingHorizontal: SPACING_LG },
  row: { minHeight: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: RADIUS_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { paddingVertical: TAG_PAD_V, paddingHorizontal: SPACING_SM, borderRadius: RADIUS_SM },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: DOCK_TOP,
    paddingHorizontal: SCREEN_PADDING,
    gap: SPACING_MD,
    borderTopWidth: hairline,
  },
  done: { gap: SECTION_GAP },
  doneTitle: { fontSize: 14 },
})
