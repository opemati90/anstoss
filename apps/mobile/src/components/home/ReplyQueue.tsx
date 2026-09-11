import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { hairline, radius, space } from '../../theme/tokens'
import { RsvpControl, type RsvpStatus } from './RsvpControl'
import type { HomeEvent } from '../../hooks/usePlayerHome'

export type ReplyQueueProps = {
  events: HomeEvent[]
  locale: string
  pendingIds: Record<string, boolean>
  onRsvp: (eventId: string, status: RsvpStatus) => void
  onOpen: (event: HomeEvent) => void
}

/** Beyond this, the events tab is the better surface. */
const MAX_ROWS = 4

/**
 * Everything the player still owes an answer on, answerable without leaving
 * home.
 *
 * This is the screen's reason to exist. Before it, replying to four training
 * sessions meant four round trips through a detail screen; here it is four
 * taps in one place, and the section disappears the moment the queue is
 * empty — a to-do list that can actually reach zero.
 */
export function ReplyQueue({
  events,
  locale,
  pendingIds,
  onRsvp,
  onOpen,
}: ReplyQueueProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const rows = events.slice(0, MAX_ROWS)
  const overflow = events.length - rows.length

  if (rows.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="caption2" tracking="wide" weight="bold" color="tertiary">
          {t('home.player.replyQueueTitle', { defaultValue: 'Needs your reply' }).toUpperCase()}
        </Text>
        <View style={[styles.count, { backgroundColor: hexToRgba(c.primary, 0.12) }]}>
          <Text variant="caption2" weight="bold" tabular style={{ color: c.primary }}>
            {events.length}
          </Text>
        </View>
      </View>

      <View
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
      >
        {rows.map((event, index) => (
          <ReplyRow
            key={event.id}
            event={event}
            locale={locale}
            pending={Boolean(pendingIds[event.id])}
            showDivider={index > 0}
            onRsvp={(status) => onRsvp(event.id, status)}
            onOpen={() => onOpen(event)}
          />
        ))}
        {overflow > 0 ? (
          <View style={[styles.overflow, { borderTopColor: c.borderSubtle }]}>
            <Text variant="caption1" color="tertiary">
              {t('home.player.replyQueueMore', {
                defaultValue: '+{{n}} more in Events',
                n: overflow,
              })}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function ReplyRow({
  event,
  locale,
  pending,
  showDivider,
  onRsvp,
  onOpen,
}: {
  event: HomeEvent
  locale: string
  pending: boolean
  showDivider: boolean
  onRsvp: (status: RsvpStatus) => void
  onOpen: () => void
}) {
  const c = useClubColors()
  const date = useMemo(() => new Date(event.date), [event.date])
  const when = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date),
    [date, locale],
  )

  return (
    <View
      style={[
        styles.row,
        showDivider && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
      ]}
    >
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${when}`}
        haptic="tapLight"
        style={styles.rowHead}
      >
        <View style={styles.rowText}>
          <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
            {event.title}
          </Text>
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {when}
            {event.team?.name ? ` · ${event.team.name}` : ''}
          </Text>
        </View>
        <Icon name="chevron.right" size={14} color="tertiary" />
      </PressableScale>
      <RsvpControl
        value={event.myRsvp}
        onChange={onRsvp}
        disabled={pending}
        size="compact"
        style={styles.rowRsvp}
      />
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
    minWidth: 22,
    height: 20,
    paddingHorizontal: space.xs + 1,
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
    paddingVertical: space.md,
    gap: space.sm,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowText: { flex: 1, gap: space['2xs'] },
  rowRsvp: {},
  overflow: {
    borderTopWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
})
