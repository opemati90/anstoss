import { memo, useCallback, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import type { TextVariant } from '../ui/Text'
import { useClubColors } from '../../context/ClubThemeContext'
import { textSafeAccent, type ClubTheme } from '../../theme/club-theme'
import { radius, space, SPACING_XXS } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { UnavailableReasonSheet, type AbsenceDetail } from './UnavailableReasonSheet'
import type { AvailabilityPolicy } from './availabilityPolicy'
import { useAvailabilityClosed } from '../../hooks/useAvailabilityClosed'
import { LAUNCH_FEATURES } from '@anstoss/shared'

export type RsvpStatus = 'YES' | 'MAYBE' | 'NO'
export type { AbsenceDetail }

/** Semantic palette per answer: Zusage = success, Vielleicht = warning, Absage = error. */
export function rsvpTone(status: RsvpStatus, c: ClubTheme): { fg: string; bg: string } {
  if (status === 'YES') return { fg: c.success, bg: c.successBg }
  if (status === 'MAYBE') return { fg: c.warning, bg: c.warningBg }
  return { fg: c.error, bg: c.errorBg }
}

const OPTIONS: Array<{ status: RsvpStatus; icon: string; labelKey: string }> = [
  { status: 'YES', icon: 'hand.thumbsup', labelKey: 'eventFlow.rsvp.yes' },
  { status: 'MAYBE', icon: 'questionmark.circle', labelKey: 'eventFlow.rsvp.maybe' },
  { status: 'NO', icon: 'hand.thumbsdown', labelKey: 'eventFlow.rsvp.no' },
]

export type RsvpControlProps = {
  value: RsvpStatus | null
  /**
   * Called with the answer. An Absage arrives only after the reason sheet is
   * confirmed, with the optional reason and note.
   */
  onChange: (status: RsvpStatus, absence?: AbsenceDetail) => void
  disabled?: boolean
  policy?: AvailabilityPolicy
  /** `compact` uses a smaller label for dense list rows; tap targets stay 44pt. */
  size?: 'default' | 'compact'
  /** Skip the Absage sheet (e.g. a coach correcting a reply). Default: ask. */
  askReason?: boolean
  /** Name shown in the sheet when a parent answers for a child. */
  subjectName?: string | null
  /**
   * Screen-reader name of the radio group, e.g. "Training, Di 29.09.". Needed
   * wherever several controls sit in one list, so each answer is announced
   * with the event it belongs to.
   */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * The app's single availability control: Zusage · Vielleicht · Absage.
 *
 * Three pills, each with an icon. The selected answer takes its semantic
 * colour (Zusage green, Vielleicht amber, Absage red) as a tint with a
 * matching outline; unselected pills carry a `borderControl` outline so they
 * read as controls. Colour is never the only carrier of meaning. Absage
 * opens the short reason sheet everywhere this control is used, so the coach
 * gets the same information no matter where the player answered.
 */
export const RsvpControl = memo(function RsvpControl({
  value,
  onChange,
  disabled = false,
  policy,
  size = 'default',
  askReason = true,
  subjectName,
  accessibilityLabel,
  style,
  testID,
}: RsvpControlProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const closed = useAvailabilityClosed(policy ?? null)
  disabled = disabled || closed
  const compact = size === 'compact'
  const variant: TextVariant = compact ? 'subheadline' : 'callout'
  const [sheetOpen, setSheetOpen] = useState(false)
  // home revamp: the three pills must hold at 320pt and font scale 2.0.
  // The real label widths are measured off-screen (same variant, semibold,
  // so the selected weight fits too) together with the row width, and the
  // densest layout that fits is chosen: icon beside label, icon above label,
  // or one pill per line. The row stays invisible until both are known, so
  // there is no first frame in the wrong layout.
  const [trackWidth, setTrackWidth] = useState(0)
  const [measured, setMeasured] = useState<Record<string, number>>({})
  const labels = OPTIONS.map((option) => t(option.labelKey))
  const labelWidths = labels.every((label) => measured[label] != null)
    ? labels.map((label) => measured[label] as number)
    : null
  const ready = trackWidth > 0 && labelWidths !== null
  const layout = decidePillLayout({ trackWidth: compact ? Math.max(0, trackWidth - space.xs * 2) : trackWidth, labelWidths, iconSize: compact ? 15 : 17 })

  const onMeasure = useCallback((label: string, width: number) => {
    setMeasured((prev) => (prev[label] === width ? prev : { ...prev, [label]: width }))
  }, [])

  const handlePress = useCallback(
    (status: RsvpStatus) => {
      if (disabled) return
      Haptics.select()
      if (status === 'NO' && askReason && LAUNCH_FEATURES.healthReporting) {
        setSheetOpen(true)
        return
      }
      onChange(status)
    },
    [askReason, disabled, onChange],
  )

  const handleAbsence = useCallback(
    (detail: AbsenceDetail) => {
      setSheetOpen(false)
      if (!disabled) onChange('NO', detail)
    },
    [onChange, disabled],
  )

  return (
    <>
      <View
        testID={testID}
        style={[
          styles.track,
          compact && [styles.compactTrack, { backgroundColor: c.surfaceSunken }],
          layout === 'column' && styles.trackColumn,
          disabled && styles.disabled,
          !ready && styles.unmeasured,
          style,
        ]}
        onLayout={(e) => setTrackWidth(Math.round(e.nativeEvent.layout.width))}
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
      >
        {/* Off-screen measurement of the three labels at the widest weight. */}
        <View style={styles.measure} pointerEvents="none" {...HIDDEN_FROM_A11Y}>
          {labels.map((label) => (
            <Text
              key={label}
              variant={variant}
              weight="semibold"
              maxFontSizeMultiplier={2}
              numberOfLines={1}
              style={styles.measureText}
              onLayout={(e) => onMeasure(label, Math.ceil(e.nativeEvent.layout.width))}
            >
              {label}
            </Text>
          ))}
        </View>
        {/* home revamp: semantic pills. Selected = the answer's own colour
            (Zusage success, Vielleicht warning, Absage error) as a tint with a
            matching outline; unselected = borderControl outline. Icon, weight
            and the radio state carry the meaning alongside colour. */}
        {OPTIONS.map((option, index) => {
          const isActive = value === option.status
          const label = labels[index]
          const tone = rsvpTone(option.status, c)
          return (
            <Pressable
              key={option.status}
              testID={testID ? `${testID}-${option.status}` : undefined}
              onPress={() => handlePress(option.status)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={subjectName ? `${subjectName}: ${label}` : label}
              accessibilityHint={accessibilityLabel}
              accessibilityState={{ selected: isActive, checked: isActive, disabled }}
              style={({ pressed }) => [
                styles.option,
                compact ? styles.optionCompact : null,
                layout === 'tall' && styles.optionTall,
                layout === 'column' && styles.optionColumn,
                compact ? (isActive
                  ? { backgroundColor: c.surface, borderColor: c.borderSubtle, borderWidth: 1 }
                  : { backgroundColor: 'transparent', borderWidth: 0 }) : isActive
                  ? { backgroundColor: tone.bg, borderColor: tone.fg, borderWidth: 1.5 }
                  : { backgroundColor: c.surface, borderColor: c.borderControl, borderWidth: 1 },
                pressed && !isActive && { backgroundColor: c.surfaceSunken },
              ]}
            >
              <Icon
                name={option.icon}
                size={compact ? 15 : 17}
                color={isActive ? tone.fg : c.textSecondary}
              />
              <Text
                variant={variant}
                weight={isActive ? 'semibold' : 'medium'}
                maxFontSizeMultiplier={2}
                numberOfLines={layout === 'column' ? undefined : 1}
                style={{ color: compact ? (isActive ? textSafeAccent(c.primary, c.surface) : c.textSecondary) : (isActive ? tone.fg : c.textPrimary), flexShrink: 1 }}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {closed ? <Text variant="footnote" color="secondary">{t('eventFlow.availability.closed')}</Text> : null}
      {askReason && LAUNCH_FEATURES.healthReporting ? (
        <UnavailableReasonSheet
          visible={sheetOpen && !disabled}
          subjectName={subjectName}
          onSubmit={handleAbsence}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  )
})

export type PillLayout = 'inline' | 'tall' | 'column'

const GAP = space.sm
const PILL_PAD = space.sm
const TALL_PAD = space.xs
const ICON_GAP = space.xs + 2
/** Selected outline (1.5pt) on both sides. */
const BORDER = 3
const HIDDEN_FROM_A11Y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
}

/**
 * Pick the densest pill layout whose widest label fits a third of the row.
 *
 * `labelWidths` are measured widths at the user's font scale (up to 200%).
 * Order of preference: icon beside label ('inline'), icon above label ('tall'), and only when
 * even that clips, one pill per line ('column'). Unmeasured input returns
 * 'inline'; the control stays invisible until it is measured.
 */
export function decidePillLayout({
  trackWidth,
  labelWidths,
  iconSize = 17,
}: {
  trackWidth: number
  labelWidths: readonly number[] | null
  iconSize?: number
}): PillLayout {
  if (trackWidth <= 0 || !labelWidths || labelWidths.length === 0) return 'inline'
  const perPill = (trackWidth - GAP * 2) / 3
  const longest = Math.max(...labelWidths)
  if (PILL_PAD * 2 + BORDER + iconSize + (iconSize ? ICON_GAP : 0) + longest <= perPill) return 'inline'
  if (TALL_PAD * 2 + BORDER + longest <= perPill) return 'tall'
  return 'column'
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: GAP,
  },
  compactTrack: { padding: space.xs, borderRadius: radius.lg, borderCurve: 'continuous', gap: space.xs },
  trackColumn: { flexDirection: 'column' },
  disabled: { opacity: 0.5 },
  unmeasured: { opacity: 0 },
  measure: {
    position: 'absolute',
    top: 0,
    start: 0,
    width: 2000,
    alignItems: 'flex-start',
    opacity: 0,
  },
  measureText: { alignSelf: 'flex-start' },
  option: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ICON_GAP,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    paddingHorizontal: PILL_PAD,
  },
  optionCompact: { minHeight: 44 },
  optionTall: {
    flexDirection: 'column',
    minHeight: 58,
    gap: SPACING_XXS,
    paddingVertical: space.xs + 2,
    paddingHorizontal: TALL_PAD,
    borderRadius: radius.lg,
  },
  optionColumn: { flex: 0, justifyContent: 'flex-start', paddingHorizontal: space.md },
})
