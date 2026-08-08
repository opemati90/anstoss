import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../theme/tokens'

const ITEM_HEIGHT = 40
const VISIBLE_ITEMS = 5
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS

export type DobScrollPickerProps = {
  /** Initial day (1..31), 1-indexed. */
  initialDay?: number
  /** Initial month (1..12), 1-indexed. */
  initialMonth?: number
  /** Initial year (1900..currentYear). */
  initialYear?: number
  /** Fired whenever any wheel snaps to a new index. */
  onChange?: (next: { day: number; month: number; year: number }) => void
  /** Year range floor; defaults to 100 years back from current. */
  yearMin?: number
  /** Year range ceiling; defaults to current year. */
  yearMax?: number
  locale?: string
  /** Temporarily lets a parent form disable its own vertical scrolling. */
  onInteractionChange?: (active: boolean) => void
}

const MONTH_LABELS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function monthsForLocale(locale: string): string[] {
  try {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short' })
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)))
  } catch {
    return MONTH_LABELS_EN
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body)
        .split(',')
        .map((p) => p.trim())
        .slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3)
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * iOS-feeling 3-column scroll picker for DD / MM / YYYY. Each wheel
 * snaps to a row, fires a light haptic per index change, and shades
 * non-selected rows. Centred selection band sits behind the rows.
 */
export function DobScrollPicker({
  initialDay,
  initialMonth,
  initialYear,
  onChange,
  yearMin,
  yearMax,
  locale = 'en',
  onInteractionChange,
}: DobScrollPickerProps) {
  const colors = useClubColors()

  const now = new Date()
  const yMax = yearMax ?? now.getFullYear()
  const yMin = yearMin ?? yMax - 100

  const months = useMemo(() => monthsForLocale(locale), [locale])
  const years = useMemo(
    () => Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i).reverse(),
    [yMax, yMin],
  )

  const [year, setYear] = useState(initialYear ?? yMax - 25)
  const [month, setMonth] = useState(initialMonth ?? 1)
  const days = useMemo(
    () => Array.from({ length: daysInMonth(month, year) }, (_, i) => i + 1),
    [month, year],
  )
  const [day, setDay] = useState(clamp(initialDay ?? 1, 1, daysInMonth(month, year)))

  // Re-clamp day if month/year change shrinks it (Feb 30 → 28).
  useEffect(() => {
    const max = daysInMonth(month, year)
    if (day > max) setDay(max)
  }, [day, month, year])

  // Bubble change up.
  useEffect(() => {
    onChange?.({ day, month, year })
  }, [day, month, year, onChange])

  return (
    <View
      style={styles.row}
      onTouchStart={() => onInteractionChange?.(true)}
      onTouchEnd={() => onInteractionChange?.(false)}
      onTouchCancel={() => onInteractionChange?.(false)}
    >
      {/* Selection band (centered behind the wheels) — club-color tint
          gives the snap target weight without interfering with text. */}
      <View
        pointerEvents="none"
        style={[
          styles.band,
          {
            top: (PICKER_HEIGHT - ITEM_HEIGHT) / 2,
            backgroundColor: withAlpha(colors.primary, 0.08),
            borderTopColor: withAlpha(colors.primary, 0.32),
            borderBottomColor: withAlpha(colors.primary, 0.32),
          },
        ]}
      />
      <Wheel
        items={days.map(String)}
        valueIndex={days.indexOf(day)}
        onIndexChange={(i) => setDay(days[i])}
        align="right"
      />
      <Wheel
        items={months}
        valueIndex={month - 1}
        onIndexChange={(i) => setMonth(i + 1)}
        align="center"
      />
      <Wheel
        items={years.map(String)}
        valueIndex={years.indexOf(year)}
        onIndexChange={(i) => setYear(years[i])}
        align="left"
      />
    </View>
  )
}

function Wheel({
  items,
  valueIndex,
  onIndexChange,
  align,
}: {
  items: string[]
  valueIndex: number
  onIndexChange: (idx: number) => void
  align: 'left' | 'center' | 'right'
}) {
  const colors = useClubColors()
  const ref = useRef<ScrollView>(null)
  const lastIdxRef = useRef(valueIndex)

  // Pad both ends so first / last items can scroll into the centre band.
  const padding = (PICKER_HEIGHT - ITEM_HEIGHT) / 2

  // Sync scroll offset on value-prop change (e.g. when month change
  // forces day to clamp).
  useEffect(() => {
    if (ref.current && valueIndex >= 0) {
      ref.current.scrollTo({ y: valueIndex * ITEM_HEIGHT, animated: true })
      lastIdxRef.current = valueIndex
    }
  }, [valueIndex])

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y
      const idx = Math.round(y / ITEM_HEIGHT)
      if (idx !== lastIdxRef.current && idx >= 0 && idx < items.length) {
        lastIdxRef.current = idx
        Haptics.selectionAsync().catch(() => {
          // haptics unsupported — silently ignore
        })
      }
    },
    [items.length],
  )

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y
      const idx = clamp(Math.round(y / ITEM_HEIGHT), 0, items.length - 1)
      onIndexChange(idx)
    },
    [items.length, onIndexChange],
  )

  return (
    <View style={styles.wheelWrap}>
      <Animated.ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={{ paddingVertical: padding }}
      >
        {items.map((label, i) => {
          const distance = Math.abs(i - valueIndex)
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.28
          return (
            <View key={`${label}-${i}`} style={styles.item}>
              <Text
                style={[
                  styles.itemText,
                  align === 'right'
                    ? styles.alignRight
                    : align === 'left'
                      ? styles.alignLeft
                      : styles.alignCenter,
                  { color: colors.textPrimary, opacity },
                ]}
                tabular
              >
                {label}
              </Text>
            </View>
          )
        })}
      </Animated.ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    height: PICKER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    position: 'relative',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: radius.md,
    borderTopWidth: hairline,
    borderBottomWidth: hairline,
  },
  wheelWrap: {
    flex: 1,
    height: PICKER_HEIGHT,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  itemText: {
    fontFamily: fonts.data,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  alignLeft: { textAlign: 'left' },
  alignCenter: { textAlign: 'center' },
  alignRight: { textAlign: 'right' },
})
