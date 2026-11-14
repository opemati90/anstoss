import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { Text } from '../ui'
import { Haptics } from '../../utils/haptics'
import { RADIUS_CARD, RADIUS_FULL, RADIUS_INPUT, SPACING_SM, SPACING_XS } from '../../theme/tokens'

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Local calendar arithmetic, not 24-hour milliseconds (DST days vary in length). */
export function calendarDays(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, offset) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12),
  )
}

export function ScheduleDateStrip({ events, locale, selectedDay, onSelect }: {
  events: Array<{ date: string; cancelledAt?: string | null }>
  locale: string
  selectedDay: string | null
  onSelect: (day: string | null) => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const { width, fontScale } = useWindowDimensions()
  const [viewportWidth, setViewportWidth] = useState(width - 40)
  const [dayCount, setDayCount] = useState(42)
  const [visibleIndex, setVisibleIndex] = useState(0)
  const today = localDateKey(new Date())
  const days = useMemo(() => calendarDays(new Date(`${today}T12:00:00`), dayCount), [today, dayCount])
  const dayWidth = Math.max(44 * Math.min(fontScale, 2), (viewportWidth - SPACING_SM * 2) / 7)
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const event of events) {
      if (event.cancelledAt) continue
      const key = localDateKey(new Date(event.date))
      result.set(key, (result.get(key) ?? 0) + 1)
    }
    return result
  }, [events])
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(days[Math.min(visibleIndex, days.length - 1)])

  return (
    <View style={styles.container}>
      <Text variant="caption1" color="secondary" testID="events-calendar-month">{month}</Text>
      <FlatList
        horizontal
        data={days}
        keyExtractor={localDateKey}
        testID="events-week"
        showsHorizontalScrollIndicator={false}
        style={[styles.week, { backgroundColor: c.surface }]}
        contentContainerStyle={styles.content}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        getItemLayout={(_, index) => ({ length: dayWidth, offset: dayWidth * index, index })}
        onScroll={(event) => setVisibleIndex(Math.max(0, Math.floor(event.nativeEvent.contentOffset.x / dayWidth)))}
        scrollEventThrottle={100}
        onEndReached={() => setDayCount((count) => count + 28)}
        onEndReachedThreshold={0.5}
        renderItem={({ item: day }) => {
          const key = localDateKey(day)
          const selected = selectedDay === key
          const fg = selected ? c.onInk : c.textPrimary
          const count = counts.get(key) ?? 0
          return (
            <Pressable
              testID={`events-day-${key}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(day)}, ${t('eventFlow.list.dayEvents', { count })}`}
              onPress={() => { Haptics.select(); onSelect(selected ? null : key) }}
              style={({ pressed }) => [styles.day, { width: dayWidth, backgroundColor: selected ? c.ink : 'transparent' }, pressed && { opacity: 0.7 }]}
            >
              <Text variant="caption1" weight="semibold" color={fg}>
                {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day).replace('.', '')}
              </Text>
              <Text variant="data" color={fg}>{day.getDate()}</Text>
              <View style={[styles.dot, { backgroundColor: count ? (selected ? c.onInk : c.primary) : 'transparent' }]} />
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: SPACING_SM },
  week: { borderRadius: RADIUS_CARD, borderCurve: 'continuous', flexGrow: 0 },
  content: { padding: SPACING_SM },
  day: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: SPACING_XS, paddingVertical: SPACING_SM, borderRadius: RADIUS_INPUT, borderCurve: 'continuous' },
  dot: { width: 5, height: 5, borderRadius: RADIUS_FULL },
})
