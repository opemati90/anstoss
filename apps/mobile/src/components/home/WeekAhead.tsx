import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { hairline, radius, space } from '../../theme/tokens'
import { RsvpControl, type RsvpStatus } from './RsvpControl'
import type { HomeEvent } from '../../hooks/usePlayerHome'

export type WeekAheadProps = {
  events: HomeEvent[]
  locale: string
  pendingIds: Record<string, boolean>
  onRsvp: (eventId: string, status: RsvpStatus) => void
  onOpen: (event: HomeEvent) => void
}

const MAX_ROWS = 5

/**
 * One list for the week, not two.
 *
 * This used to be two stacked sections — "Needs your reply" and "Your week" —
 * each with its own header and its own bordered card. Same subject, same rows,
 * twice the chrome, and it was a large part of why home felt like a lot. Now
 * it is a single list: anything still unanswered sorts first and carries the
 * reply control inline, everything else is a quiet one-line row.
 */
export function WeekAhead({
  events,
  locale,
  pendingIds,
  onRsvp,
  onOpen,
}: WeekAheadProps) {
  const c = useClubColors()
  const { t } = useTranslation()

  // A cancelled event owes nobody an answer: it neither sorts first nor
  // counts toward the "to reply" badge.
  const awaits = (event: HomeEvent) => !event.myRsvp && !event.cancelledAt
  const ordered = useMemo(
    () => [...events.filter(awaits), ...events.filter((event) => !awaits(event))],
    [events],
  )

  const outstanding = events.filter(awaits).length
  const rows = ordered.slice(0, MAX_ROWS)

  if (rows.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
          {t('home.yourWeek', { defaultValue: 'Your week' }).toUpperCase()}
        </Text>
        {outstanding > 0 ? (
          <View style={[styles.count, { backgroundColor: hexToRgba(c.primary, 0.12) }]}>
            <Text variant="caption2" weight="bold" style={{ color: c.primary }}>
              {t('home.player.replyCount', {
                defaultValue: '{{n}} to reply',
                n: outstanding,
              })}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        {rows.map((event, index) => (
          <WeekRow
            key={event.id}
            event={event}
            locale={locale}
            pending={Boolean(pendingIds[event.id])}
            showDivider={index > 0}
            onRsvp={(status) => onRsvp(event.id, status)}
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
  pending,
  showDivider,
  onRsvp,
  onPress,
}: {
  event: HomeEvent
  locale: string
  pending: boolean
  showDivider: boolean
  onRsvp: (status: RsvpStatus) => void
  onPress: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const date = useMemo(() => new Date(event.date), [event.date])
  const isCancelled = Boolean(event.cancelledAt)
  const needsReply = !event.myRsvp && !isCancelled

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

  const answerLabel = event.myRsvp
    ? t(`event.rsvp${event.myRsvp[0]}${event.myRsvp.slice(1).toLowerCase()}`, {
        defaultValue: event.myRsvp,
      })
    : ''

  return (
    <View
      style={[
        styles.row,
        needsReply && styles.rowAnswerable,
        showDivider && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
      ]}
    >
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          isCancelled
            ? `${event.title}, ${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}${
                event.cancelReason ? `, ${event.cancelReason}` : ''
              }`
            : `${event.title}, ${day} ${dayNumber} ${time}${answerLabel ? `, ${answerLabel}` : ''}`
        }
        haptic="tapLight"
        style={styles.rowHead}
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
              : `${time}${event.location ? ` · ${event.location}` : ''}${answerLabel ? ` · ${answerLabel}` : ''}`}
          </Text>
        </View>
        <Icon name="chevron.right" size={14} color="tertiary" />
      </PressableScale>

      {/* Only rows that still owe an answer carry a control. Putting one on
          every row turned a schedule back into a wall of buttons. */}
      {needsReply ? (
        <RsvpControl
          value={event.myRsvp}
          onChange={onRsvp}
          disabled={pending}
          size="compact"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  count: {
    height: 20,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 56,
    justifyContent: 'center',
  },
  rowAnswerable: { gap: space.sm, paddingVertical: space.md },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
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
  struck: { textDecorationLine: 'line-through' },
})
