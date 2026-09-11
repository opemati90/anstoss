import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import type { HomeEvent } from '../../hooks/usePlayerHome'

export type WeekAheadProps = {
  events: HomeEvent[]
  locale: string
  onOpen: (event: HomeEvent) => void
}

const MAX_ROWS = 5

/**
 * The rest of what is coming, already answered.
 *
 * Quiet on purpose — one line each, a date chip, and a dot showing the answer
 * you gave. Nothing here needs a decision, so nothing here competes with the
 * hero; it exists so the schedule stays visible without turning home back into
 * a wall of cards.
 */
export function WeekAhead({ events, locale, onOpen }: WeekAheadProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const rows = events.slice(0, MAX_ROWS)

  if (rows.length === 0) return null

  return (
    <View style={styles.section}>
      <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
        {t('home.yourWeek', { defaultValue: 'Your week' }).toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        {rows.map((event, index) => (
          <WeekRow
            key={event.id}
            event={event}
            locale={locale}
            showDivider={index > 0}
            onPress={() => onOpen(event)}
          />
        ))}
      </View>
    </View>
  )
}

function WeekRow({
  event,
  locale,
  showDivider,
  onPress,
}: {
  event: HomeEvent
  locale: string
  showDivider: boolean
  onPress: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const date = useMemo(() => new Date(event.date), [event.date])

  const day = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).toUpperCase(),
    [date, locale],
  )
  const dayNumber = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date),
    [date, locale],
  )
  const time = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date),
    [date, locale],
  )

  // One accent, three states: filled = in, outlined = maybe, hollow = out.
  // Shape carries the meaning so it survives greyscale and colour blindness.
  const answerStyle =
    event.myRsvp === 'YES'
      ? { backgroundColor: c.primary, borderColor: c.primary }
      : event.myRsvp === 'MAYBE'
        ? { backgroundColor: 'transparent', borderColor: c.primary }
        : { backgroundColor: 'transparent', borderColor: c.borderStrong }

  const answerLabel = event.myRsvp
    ? t(`event.rsvp${event.myRsvp[0]}${event.myRsvp.slice(1).toLowerCase()}`, {
        defaultValue: event.myRsvp,
      })
    : ''

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${day} ${dayNumber} ${time}${answerLabel ? `, ${answerLabel}` : ''}`}
      haptic="tapLight"
      style={[
        styles.row,
        showDivider && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
      ]}
    >
      <View style={[styles.dayChip, { backgroundColor: c.surfaceSunken }]}>
        <Text variant="caption2" weight="medium" color="tertiary">
          {day}
        </Text>
        <Text variant="callout" weight="bold" color="primary" tabular>
          {dayNumber}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
          {event.title}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1}>
          {time}
          {event.location ? ` · ${event.location}` : ''}
          {event.team?.name ? ` · ${event.team.name}` : ''}
          {/* The dot alone reads as an empty checkbox. Naming the answer costs
              one word and removes the guesswork. */}
          {answerLabel ? ` · ${answerLabel}` : ''}
        </Text>
      </View>
      <View style={[styles.answerDot, answerStyle]} />
      <Icon name="chevron.right" size={14} color="tertiary" />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 56,
  },
  dayChip: {
    minWidth: 44,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  rowText: { flex: 1, gap: space['2xs'] },
  answerDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
})
