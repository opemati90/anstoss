import { memo, useCallback, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import Svg, { Circle, Path } from 'react-native-svg'
import { PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { INK, TEXT_WHITE } from '../../theme/colors'
import { RADIUS_FULL, RADIUS_HERO, RADIUS_LG, RADIUS_MD, SPACING_LG, SPACING_XL, SPACING_XXS, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { DeclineReasonSheet as UnavailableReasonSheet, type AbsenceDetail } from '../rsvp/DeclineReasonSheet'
import type { RsvpStatus } from '../events/RsvpControl'
import { formatTime } from './HomeKit'

/**
 * The club-coloured hero of the 2026-11 redesign (screens 08, 22, 25, 29):
 * radius 28, a faint pitch-circle drawn in the corner, white type with
 * `onHeroMuted` secondary copy, and a one-accent RSVP bar or an on-hero
 * reply control. One hero per screen.
 */

export type RsvpSplit = { yes: number; maybe: number; no: number; open: number }

/**
 * Hero colours from the theme's hero tokens: `heroBg` is the raw club colour
 * in light AND dark mode (DESIGN.md: "The club hero keeps the raw club colour
 * in dark mode"), `onHeroBg` its text colour. A pale Vereinsfarbe gets dark
 * text, so the muted copy, track and thumb follow `onHeroBg` instead of
 * assuming white.
 */
export function useHeroColors(): {
  bg: string
  fg: string
  muted: string
  track: string
  /** Text on the selected (fg-filled) thumb. */
  onThumb: string
  tint: (alpha: number) => string
} {
  const c = useClubColors()
  const fg = c.onHeroBg
  const fgIsWhite = fg.toUpperCase() === TEXT_WHITE
  const tint = (alpha: number) => (fg.startsWith('#') ? hexToRgba(fg, alpha) : fg)
  return {
    bg: c.heroBg,
    fg,
    muted: fgIsWhite ? c.onHeroMuted : tint(0.72),
    track: tint(0.12),
    onThumb: fgIsWhite ? INK : c.heroBg,
    tint,
  }
}

export function HeroSurface({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: {
  children: ReactNode
  /** When set, the whole card opens the event. */
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const hero = useHeroColors()
  const surface = [styles.hero, { backgroundColor: hero.bg }, style]
  const decoration = (
    <View style={styles.decoration} pointerEvents="none" {...HIDDEN}>
      <Svg width={260} height={260} viewBox="0 0 260 260" fill="none">
        <Circle cx={130} cy={130} r={90} stroke={hero.fg} strokeOpacity={0.07} strokeWidth={1.5} />
        <Path d="M0 130h260" stroke={hero.fg} strokeOpacity={0.07} strokeWidth={1.5} />
      </Svg>
    </View>
  )
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        haptic="tapLight"
        style={surface}
        testID={testID}
      >
        {decoration}
        {children}
      </PressableScale>
    )
  }
  return (
    <View style={surface} testID={testID}>
      {decoration}
      {children}
    </View>
  )
}

/** "So 14:00": weekday and kick-off, the hero's display line. */
export function heroKickoff(iso: string, locale: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d).replace(/\.$/, '')
  return `${weekday} ${formatTime(iso, locale)}`
}

/**
 * The squad's answers as one bar in one accent at three densities (white,
 * white 45%, white 16%), with Barlow counts beneath. Absagen are counted in
 * the legend but take no bar segment, so the bar reads "who is coming".
 * DESIGN.md 2026-09-11: never green/amber/red.
 */
export function HeroSplit({ split }: { split: RsvpSplit }) {
  const hero = useHeroColors()
  const { t } = useTranslation()
  const segments = [
    { key: 'yes', flex: split.yes, color: hero.fg },
    { key: 'maybe', flex: split.maybe, color: hero.tint(0.45) },
    { key: 'open', flex: split.open, color: hero.tint(0.16) },
  ].filter((segment) => segment.flex > 0)
  const items = [
    { key: 'yes', count: split.yes, label: t('homeHub.hero.going', { defaultValue: 'going', count: split.yes }) },
    { key: 'maybe', count: split.maybe, label: t('homeHub.split.maybe', { defaultValue: 'maybe', count: split.maybe }) },
    { key: 'open', count: split.open, label: t('homeHub.split.open', { defaultValue: 'no reply', count: split.open }) },
  ]
  // Screen 08 shows dabei · vielleicht · offen; Absagen stay in the spoken label.
  const spoken =
    split.no > 0
      ? [...items, { key: 'no', count: split.no, label: t('homeHub.hero.declined', { defaultValue: 'declined', count: split.no }) }]
      : items
  const label = spoken.map((item) => `${item.count} ${item.label}`).join(', ')
  return (
    <View style={styles.split}>
      <View
        style={[styles.bar, segments.length === 0 && { backgroundColor: hero.tint(0.16) }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
      >
        {segments.map((segment) => (
          <View key={segment.key} style={{ flex: segment.flex, backgroundColor: segment.color }} />
        ))}
      </View>
      <View style={styles.counts} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {items.map((item) => (
          <Text key={item.key} variant="footnote" weight="medium" style={{ color: hero.muted }}>
            <Text variant="data" style={[styles.count, { color: hero.fg }]}>
              {String(item.count)}
            </Text>
            {` ${item.label}`}
          </Text>
        ))}
      </View>
    </View>
  )
}

const OPTIONS: Array<{ status: RsvpStatus; labelKey: string }> = [
  { status: 'YES', labelKey: 'eventFlow.rsvp.yes' },
  { status: 'MAYBE', labelKey: 'eventFlow.rsvp.maybe' },
  { status: 'NO', labelKey: 'eventFlow.rsvp.no' },
]

/**
 * The reply control on a club hero: a translucent white track, the chosen
 * answer as a white thumb with ink text. Same contract as RsvpControl — an
 * Absage arrives only after the reason sheet is confirmed.
 */
export const HeroRsvp = memo(function HeroRsvp({
  value,
  onChange,
  disabled = false,
  subjectName,
  contextLabel,
  accessibilityLabel,
  testID,
}: {
  value: RsvpStatus | null
  /** Names the event in the Absage sheet ("So vs. Rot-Weiß Köpenick III"). */
  contextLabel?: string | null
  onChange: (status: RsvpStatus, absence?: AbsenceDetail) => void
  disabled?: boolean
  subjectName?: string | null
  accessibilityLabel?: string
  testID?: string
}) {
  const { t } = useTranslation()
  const hero = useHeroColors()
  const [sheetOpen, setSheetOpen] = useState(false)

  const handlePress = useCallback(
    (status: RsvpStatus) => {
      if (disabled) return
      Haptics.select()
      if (status === 'NO') {
        setSheetOpen(true)
        return
      }
      onChange(status)
    },
    [disabled, onChange],
  )

  return (
    <>
      <View
        testID={testID}
        style={[styles.track, { backgroundColor: hero.track }, disabled && styles.disabled]}
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
      >
        {OPTIONS.map((option) => {
          const active = value === option.status
          const label = t(option.labelKey)
          return (
            <Pressable
              key={option.status}
              testID={testID ? `${testID}-${option.status}` : undefined}
              onPress={() => handlePress(option.status)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={subjectName ? `${subjectName}: ${label}` : label}
              accessibilityHint={accessibilityLabel}
              accessibilityState={{ selected: active, checked: active, disabled }}
              style={({ pressed }) => [
                styles.option,
                active ? { backgroundColor: hero.fg } : null,
                pressed && !active ? { backgroundColor: hero.tint(0.08) } : null,
              ]}
            >
              <Text
                variant="subheadline"
                weight="bold"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ color: active ? hero.onThumb : hero.fg }}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <UnavailableReasonSheet
        visible={sheetOpen}
        subjectName={subjectName}
        contextLabel={contextLabel}
        onSubmit={(detail) => {
          setSheetOpen(false)
          onChange('NO', detail)
        }}
        onClose={() => setSheetOpen(false)}
      />
    </>
  )
})

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: RADIUS_HERO,
    borderCurve: 'continuous',
    padding: SPACING_XL + SPACING_XXS,
    gap: SPACING_XL + SPACING_XXS,
    overflow: 'hidden',
  },
  decoration: { position: 'absolute', right: -90, top: -70 },
  split: { gap: space.sm + 2 },
  bar: { flexDirection: 'row', height: 6, borderRadius: RADIUS_FULL, overflow: 'hidden', gap: SPACING_XXS },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACING_LG + SPACING_XXS, rowGap: space.xs },
  count: { fontSize: 18, lineHeight: 20 },
  track: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    borderRadius: RADIUS_LG,
    borderCurve: 'continuous',
  },
  option: {
    flex: 1,
    minHeight: 48,
    borderRadius: RADIUS_MD + 1,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  disabled: { opacity: 0.6 },
})
