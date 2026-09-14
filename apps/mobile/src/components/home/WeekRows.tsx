import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'

export type WeekRowEvent = {
  id: string
  title: string
  date: string
  location?: string | null
  yesCount?: number
  maybeCount?: number
  noCount?: number
  cancelledAt?: string | null
  cancelReason?: string | null
}

export type WeekRowsProps = {
  events: WeekRowEvent[]
  locale: string
  /** Squad size, so a row can say "12 of 18" instead of a bare count. */
  squadSize?: number | null
  onCreate?: () => void
  emptyLabel: string
}

const MAX_ROWS = 5

/**
 * The manager's week: one list, each row carrying the availability count.
 *
 * Coaches and admins used to get the same rows as players but without the
 * one number they actually scan for, and the count lived a tap away on the
 * detail screen. Now it sits on the row. Cancelled events stay in the list,
 * struck through, so a cancelled training doesn't read as a free evening.
 */
export function WeekRows({ events, locale, squadSize, onCreate, emptyLabel }: WeekRowsProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const rows = useMemo(() => events.slice(0, MAX_ROWS), [events])

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
          {t('home.coach.thisWeek', { defaultValue: 'This week' }).toUpperCase()}
        </Text>
        {onCreate ? (
          <PressableScale
            onPress={onCreate}
            accessibilityRole="button"
            accessibilityLabel={t('home.coach.createEvent', { defaultValue: 'Create event' })}
            haptic="tapLight"
            style={styles.headAction}
          >
            <Icon name="plus.circle" size={14} color={c.primary} />
            <Text variant="caption1" weight="semibold" style={{ color: c.primary }}>
              {t('home.week.new', { defaultValue: 'New' })}
            </Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="footnote" color="secondary">
              {emptyLabel}
            </Text>
          </View>
        ) : (
          rows.map((event, index) => (
            <WeekRow
              key={event.id}
              event={event}
              locale={locale}
              squadSize={squadSize ?? null}
              showDivider={index > 0}
            />
          ))
        )}
      </View>
    </View>
  )
}

function WeekRow({
  event,
  locale,
  squadSize,
  showDivider,
}: {
  event: WeekRowEvent
  locale: string
  squadSize: number | null
  showDivider: boolean
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const date = useMemo(() => new Date(event.date), [event.date])
  const isCancelled = Boolean(event.cancelledAt)

  const day = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).toUpperCase()
  const dayNumber = new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)

  const yes = event.yesCount ?? 0
  const answered = yes + (event.maybeCount ?? 0) + (event.noCount ?? 0)
  // Guests and loans can push replies past the roster, so the total is
  // whichever is larger; "14 of 3" is never an honest number.
  const total = Math.max(squadSize ?? 0, answered)
  const countLabel =
    total > 0
      ? t('home.week.yesOf', { defaultValue: '{{yes}} of {{total}}', yes, total })
      : t('home.week.yesCount', { defaultValue: '{{yes}} yes', yes })
  const pending = Math.max(0, total - answered)

  const label = isCancelled
    ? `${event.title}, ${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}`
    : `${event.title}, ${day} ${dayNumber} ${time}, ${countLabel}`

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/event-detail', params: { eventId: event.id } })}
      accessibilityRole="button"
      accessibilityLabel={label}
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
        <Text
          variant="callout"
          weight="semibold"
          color={isCancelled ? 'tertiary' : 'primary'}
          numberOfLines={1}
          style={isCancelled ? styles.struck : undefined}
        >
          {event.title}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1}>
          {isCancelled
            ? `${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}${event.cancelReason ? ` · ${event.cancelReason}` : ''}`
            : `${time}${event.location ? ` · ${event.location}` : ''}`}
        </Text>
      </View>
      {!isCancelled ? (
        <View style={styles.count}>
          <Text variant="callout" weight="bold" color="primary" tabular>
            {countLabel}
          </Text>
          {pending > 0 ? (
            <Text variant="caption2" color="tertiary" tabular>
              {t('home.coach.pendingShort', { defaultValue: '{{count}} pending', count: pending })}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Icon name="chevron.right" size={14} color="tertiary" />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2xs'],
    minHeight: 32,
    paddingHorizontal: space.xs,
  },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  empty: { padding: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 60,
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
  count: { alignItems: 'flex-end', gap: 1 },
  struck: { textDecorationLine: 'line-through' },
})
