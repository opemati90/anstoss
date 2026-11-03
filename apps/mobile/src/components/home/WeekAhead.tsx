import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import {
  RsvpControl,
  rsvpTone,
  type AbsenceDetail,
  type RsvpStatus,
} from '../events/RsvpControl'
import {
  HomeCard,
  HomeSection,
  eventHeadline,
  eventMetaLine,
  formatShortDate,
  formatTime,
} from './HomeKit'
import type { HomeEvent } from '../../hooks/usePlayerHome'

export type WeekAheadProps = {
  events: HomeEvent[]
  locale: string
  pendingIds: Record<string, boolean>
  onRsvp: (eventId: string, status: RsvpStatus, absence?: AbsenceDetail) => void
  onOpen: (event: HomeEvent) => void
  /** Clock for the 7-day window; defaults to now. */
  nowMs?: number
}

const MAX_ROWS = 5
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Events from now until seven days out; the rest lives in the events tab. */
export function eventsThisWeek<T extends { date: string }>(events: T[], nowMs: number): T[] {
  return events.filter((event) => {
    const ms = new Date(event.date).getTime()
    return Number.isFinite(ms) && ms - nowMs <= WEEK_MS
  })
}

const awaitsReply = (event: HomeEvent) =>
  (!event.myRsvp || Boolean(event.myRsvpStale)) && !event.cancelledAt

/**
 * "Diese Woche" for a player: one list, chronological.
 *
 * Every row carries its own date line, so the order stays the calendar's
 * order. Only rows that still owe an answer carry the reply pills; answered
 * rows show the answer as a small semantic mark, so the list reads as a
 * schedule rather than a wall of buttons.
 */
export function WeekAhead({
  events,
  locale,
  pendingIds,
  onRsvp,
  onOpen,
  nowMs = Date.now(),
}: WeekAheadProps) {
  const { t } = useTranslation()
  const week = useMemo(() => eventsThisWeek(events, nowMs), [events, nowMs])
  const rows = useMemo(() => week.slice(0, MAX_ROWS), [week])
  // The header counts what the list can show: this week's open replies only.
  const outstanding = week.filter(awaitsReply).length

  if (rows.length === 0) return null

  return (
    <HomeSection
      actionLabel={t('homeHub.allEvents', { defaultValue: 'All events' })}
      onAction={() => router.push('/(tabs)/events' as never)}
      testID="home-week-ahead"
      title={
        outstanding > 0
          ? t('homeHub.player.weekWithOpen', {
              defaultValue: 'This week · {{count}} to answer',
              count: outstanding,
            })
          : t('homeHub.thisWeek', { defaultValue: 'This week' })
      }
    >
      <HomeCard>
        {rows.map((event, index) => (
          <WeekRow
            key={event.id}
            event={event}
            locale={locale}
            pending={Boolean(pendingIds[event.id])}
            showDivider={index > 0}
            onRsvp={(status, absence) => onRsvp(event.id, status, absence)}
            onPress={() => onOpen(event)}
          />
        ))}
      </HomeCard>
    </HomeSection>
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
  onRsvp: (status: RsvpStatus, absence?: AbsenceDetail) => void
  onPress: () => void
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const isCancelled = Boolean(event.cancelledAt)
  const needsReply = awaitsReply(event)
  const answered = event.myRsvp && !event.myRsvpStale ? event.myRsvp : null
  const meta = eventMetaLine(event, locale, t)
  const title = eventHeadline(event)
  // Several reply groups share this list; each is named after its event.
  const groupLabel = [
    title,
    `${formatShortDate(event.date, locale)} ${formatTime(event.date, locale)}`,
  ].join(', ')

  const answerLabel =
    answered === 'YES'
      ? t('homeHub.rsvp.yes', { defaultValue: 'Going' })
      : answered === 'MAYBE'
        ? t('homeHub.rsvp.maybe', { defaultValue: 'Maybe' })
        : answered === 'NO'
          ? t('homeHub.rsvp.no', { defaultValue: 'Not going' })
          : null

  const detail = isCancelled
    ? `${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}${
        event.cancelReason ? ` · ${event.cancelReason}` : ''
      }`
    : event.myRsvpStale
      ? t('event.rescheduledHint', { defaultValue: 'Time changed · confirm your reply' })
      : null

  return (
    <View
      style={[
        styles.row,
        showDivider && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
      ]}
    >
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[title, meta, detail, answerLabel].filter(Boolean).join(', ')}
        haptic="tapLight"
        style={styles.rowHead}
      >
        <View style={styles.rowText}>
          <Text
            variant="callout"
            weight="semibold"
            color={isCancelled ? 'tertiary' : 'primary'}
            numberOfLines={2}
            style={isCancelled ? styles.struck : undefined}
          >
            {title}
          </Text>
          <Text variant="footnote" color="secondary" tabular numberOfLines={2}>
            {meta}
          </Text>
          {detail ? (
            <Text
              variant="footnote"
              weight="medium"
              color={isCancelled ? 'error' : 'warning'}
              numberOfLines={2}
            >
              {detail}
            </Text>
          ) : null}
        </View>
        {answered && !isCancelled ? <AnswerMark status={answered} label={answerLabel ?? ''} /> : null}
        <Icon name="chevron.right" size={14} color="tertiary" />
      </PressableScale>

      {needsReply ? (
        <RsvpControl
          policy={event}
          value={event.myRsvp}
          onChange={onRsvp}
          disabled={pending}
          size="compact"
          accessibilityLabel={groupLabel}
        />
      ) : null}
    </View>
  )
}

function AnswerMark({ status, label }: { status: RsvpStatus; label: string }) {
  const c = useClubColors()
  const tone = rsvpTone(status, c)
  return (
    <View style={[styles.answer, { backgroundColor: tone.bg }]}>
      <Icon
        name={
          status === 'YES'
            ? 'checkmark'
            : status === 'MAYBE'
              ? 'questionmark.circle'
              : 'xmark'
        }
        size={13}
        color={tone.fg}
      />
      <Text variant="caption1" weight="semibold" style={{ color: tone.fg }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 4,
    gap: space.sm + 4,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 4,
    minHeight: 44,
  },
  rowText: { flex: 1, gap: space['2xs'] },
  struck: { textDecorationLine: 'line-through' },
  answer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 26,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
  },
})
