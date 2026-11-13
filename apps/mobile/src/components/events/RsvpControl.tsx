import { memo, useCallback, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ClubTheme } from '../../theme/club-theme'
import { Radius, RADIUS_FULL, RADIUS_MD, space, SPACING_SM, SPACING_XS, SPACING_XXS } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { UnavailableReasonSheet, type AbsenceDetail } from './UnavailableReasonSheet'

export type RsvpStatus = 'YES' | 'MAYBE' | 'NO'
export type { AbsenceDetail }

/**
 * Answer colours, one accent (DESIGN.md, 2026-09-11): a reply is a choice,
 * not three alert states. Zusage carries the club colour, Vielleicht and
 * Absage stay neutral; the icon and label carry the meaning. Kept as a
 * helper because home marks a given answer with it.
 */
export function rsvpTone(status: RsvpStatus, c: ClubTheme): { fg: string; bg: string } {
  if (status === 'YES') return { fg: c.primary, bg: c.primary50 }
  if (status === 'MAYBE') return { fg: c.textPrimary, bg: c.surfaceMuted }
  return { fg: c.textSecondary, bg: c.surfaceSunken }
}

const OPTIONS: Array<{ status: RsvpStatus; icon: string; labelKey: string }> = [
  { status: 'YES', icon: 'checkmark', labelKey: 'eventFlow.rsvp.yes' },
  { status: 'MAYBE', icon: 'questionmark.circle', labelKey: 'eventFlow.rsvp.maybe' },
  { status: 'NO', icon: 'xmark', labelKey: 'eventFlow.rsvp.no' },
]

export type RsvpControlProps = {
  value: RsvpStatus | null
  /**
   * Called with the answer. An Absage arrives only after the reason sheet is
   * confirmed, with the optional reason and note.
   */
  onChange: (status: RsvpStatus, absence?: AbsenceDetail) => void
  disabled?: boolean
  /**
   * `default` is the segmented answer of the event screen and the home hero;
   * `compact` is the row of small pills under a schedule row (36pt visual,
   * 44pt touch target).
   */
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
  /** "So · Heimspiel gegen X": names the event in the Absage sheet. */
  contextLabel?: string | null
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * The app's single availability control: Zusage · Vielleicht · Absage.
 *
 * One accent (DESIGN.md): the selected answer is filled with the club colour,
 * the others stay neutral. `default` is a segmented track (surfaceSunken,
 * 44pt segments, icon + label); `compact` is three outlined pills. Absage
 * opens the short reason sheet everywhere this control is used, so the coach
 * gets the same information no matter where the player answered.
 */
export const RsvpControl = memo(function RsvpControl({
  value,
  onChange,
  disabled = false,
  size = 'default',
  askReason = true,
  subjectName,
  accessibilityLabel,
  contextLabel,
  style,
  testID,
}: RsvpControlProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const compact = size === 'compact'
  const [sheetOpen, setSheetOpen] = useState(false)
  // The segmented layout must hold at 320pt and font scale 2.0. The real
  // label widths are measured off-screen (semibold, so the selected weight
  // fits too) together with the track width, and the densest layout that
  // fits is chosen: icon beside label, icon above label, or one segment per
  // line. The track stays invisible until both are known, so there is no
  // first frame in the wrong layout. Compact pills simply wrap.
  const [trackWidth, setTrackWidth] = useState(0)
  const [measured, setMeasured] = useState<Record<string, number>>({})
  const labels = OPTIONS.map((option) => t(option.labelKey))
  const labelWidths = labels.every((label) => measured[label] != null)
    ? labels.map((label) => measured[label] as number)
    : null
  const ready = compact || (trackWidth > 0 && labelWidths !== null)
  const layout: PillLayout = compact
    ? 'inline'
    : decidePillLayout({ trackWidth, labelWidths, iconSize: ICON_SIZE })

  const onMeasure = useCallback((label: string, width: number) => {
    setMeasured((prev) => (prev[label] === width ? prev : { ...prev, [label]: width }))
  }, [])

  const handlePress = useCallback(
    (status: RsvpStatus) => {
      if (disabled) return
      Haptics.select()
      if (status === 'NO' && askReason) {
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
      onChange('NO', detail)
    },
    [onChange],
  )

  return (
    <>
      <View
        testID={testID}
        style={[
          compact ? styles.pills : [styles.track, { backgroundColor: c.surfaceSunken }],
          layout === 'column' && styles.trackColumn,
          disabled && styles.disabled,
          !ready && styles.unmeasured,
          style,
        ]}
        onLayout={
          compact
            ? undefined
            : (e) => setTrackWidth(Math.round(e.nativeEvent.layout.width) - TRACK_PAD * 2)
        }
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
      >
        {!compact ? (
          // Off-screen measurement of the three labels at the widest weight.
          <View style={styles.measure} pointerEvents="none" {...HIDDEN_FROM_A11Y}>
            {labels.map((label) => (
              <Text
                key={label}
                variant="subheadline"
                weight="semibold"
                numberOfLines={1}
                style={styles.measureText}
                onLayout={(e) => onMeasure(label, Math.ceil(e.nativeEvent.layout.width))}
              >
                {label}
              </Text>
            ))}
          </View>
        ) : null}
        {OPTIONS.map((option, index) => {
          const isActive = value === option.status
          const label = labels[index]
          const fg = isActive ? c.onPrimary : compact ? c.textPrimary : c.textSecondary
          return (
            <Pressable
              key={option.status}
              testID={testID ? `${testID}-${option.status}` : undefined}
              onPress={() => handlePress(option.status)}
              disabled={disabled}
              hitSlop={compact ? PILL_HIT_SLOP : undefined}
              accessibilityRole="radio"
              accessibilityLabel={subjectName ? `${subjectName}: ${label}` : label}
              accessibilityHint={accessibilityLabel}
              accessibilityState={{ selected: isActive, checked: isActive, disabled }}
              style={({ pressed }) => [
                compact ? styles.pill : styles.segment,
                layout === 'tall' && styles.segmentTall,
                layout === 'column' && styles.segmentColumn,
                compact
                  ? isActive
                    ? { backgroundColor: c.primary, borderColor: c.primary }
                    : { backgroundColor: 'transparent', borderColor: c.borderStrong }
                  : isActive
                    ? { backgroundColor: c.primary }
                    : null,
                pressed && !isActive && styles.pressed,
              ]}
            >
              {!compact ? (
                <Icon
                  name={isActive && option.status === 'YES' ? 'checkmark.circle.fill' : option.icon}
                  size={ICON_SIZE}
                  color={fg}
                />
              ) : null}
              <Text
                variant={compact ? 'footnote' : 'subheadline'}
                weight={compact || isActive ? 'bold' : 'semibold'}
                numberOfLines={1}
                adjustsFontSizeToFit={!compact}
                minimumFontScale={MIN_LABEL_SCALE}
                style={{ color: fg, flexShrink: 1 }}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {askReason ? (
        <UnavailableReasonSheet
          visible={sheetOpen}
          subjectName={subjectName}
          contextLabel={contextLabel}
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
const ICON_SIZE = 16
/** Segmented track inset (design `.seg`: 4pt). */
const TRACK_PAD = SPACING_XS
/** Compact pills are 36pt tall; 4pt slop each side makes the target 44pt. */
const PILL_HIT_SLOP = { top: 4, bottom: 4, left: 2, right: 2 }
/** Selected outline (1.5pt) on both sides. */
const BORDER = 3
/** adjustsFontSizeToFit may shrink a label this far before we stack pills. */
const MIN_LABEL_SCALE = 0.8

const HIDDEN_FROM_A11Y = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
}

/**
 * Pick the densest pill layout whose widest label fits a third of the row.
 *
 * `labelWidths` are measured widths (already at the user's font scale, which
 * the Text variant caps). Order of preference: icon beside label ('inline'),
 * icon above label ('tall', which may shrink the label to 80%), and only when
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
  if (PILL_PAD * 2 + BORDER + iconSize + ICON_GAP + longest <= perPill) return 'inline'
  if (TALL_PAD * 2 + BORDER + longest * MIN_LABEL_SCALE <= perPill) return 'tall'
  return 'column'
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: SPACING_XS,
    padding: TRACK_PAD,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  trackColumn: { flexDirection: 'column' },
  disabled: { opacity: 0.5 },
  unmeasured: { opacity: 0 },
  pressed: { opacity: 0.7 },
  measure: {
    position: 'absolute',
    top: 0,
    start: 0,
    width: 2000,
    alignItems: 'flex-start',
    opacity: 0,
  },
  measureText: { alignSelf: 'flex-start' },
  segment: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ICON_GAP,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    paddingHorizontal: PILL_PAD,
  },
  segmentTall: {
    flexDirection: 'column',
    minHeight: 58,
    gap: SPACING_XXS,
    paddingVertical: space.xs + 2,
    paddingHorizontal: TALL_PAD,
  },
  segmentColumn: { flex: 0, justifyContent: 'flex-start', paddingHorizontal: space.md },
  pill: {
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: SPACING_SM + 2,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
