import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { RsvpControl, type RsvpStatus } from './RsvpControl'
import type { HomeEvent } from '../../hooks/usePlayerHome'

export type NextUpHeroProps = {
  event: HomeEvent
  locale: string
  nowMs: number
  rsvpPending: boolean
  onRsvp: (status: RsvpStatus) => void
  onOpen: () => void
}

/** Arrival window: check-in replaces the reply control from here. */
const CHECK_IN_LEAD_MS = 2 * 60 * 60 * 1000
const CHECK_IN_TAIL_MS = 3 * 60 * 60 * 1000

/**
 * True from two hours before kick-off until three after — the span in which
 * "are you coming?" has become "are you here?".
 */
export function isInCheckInWindow(eventDate: string, nowMs: number): boolean {
  const eventMs = new Date(eventDate).getTime()
  if (!Number.isFinite(eventMs)) return false
  return nowMs >= eventMs - CHECK_IN_LEAD_MS && nowMs <= eventMs + CHECK_IN_TAIL_MS
}

/**
 * The one surface on home that is allowed to be loud.
 *
 * It answers a single question — *what do I have to do about the next thing?* —
 * and it answers it in place. Unanswered: the reply control is right here, no
 * navigation. Answered: it states your answer and gets quieter. Inside the
 * arrival window: it becomes check-in. Live: it becomes the score.
 *
 * Everything below this card on the screen is intentionally flatter so this
 * one reads first.
 */
export function NextUpHero({
  event,
  locale,
  nowMs,
  rsvpPending,
  onRsvp,
  onOpen,
}: NextUpHeroProps) {
  const c = useClubColors()
  const { t } = useTranslation()

  const date = useMemo(() => new Date(event.date), [event.date])
  const inCheckInWindow = isInCheckInWindow(event.date, nowMs)

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
  const countdown = formatCountdown(date.getTime() - nowMs, t)

  const needsReply = !event.myRsvp
  const statusLabel = event.myRsvp
    ? t(`home.player.status.${event.myRsvp.toLowerCase()}`, {
        defaultValue:
          event.myRsvp === 'YES'
            ? "You're in"
            : event.myRsvp === 'MAYBE'
              ? 'You said maybe'
              : "You're out",
      })
    : null

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={event.title}
        haptic="tapLight"
        style={styles.cardBody}
      >
        <View style={styles.eyebrowRow}>
          <Text variant="caption2" tracking="wide" weight="bold" style={{ color: c.primary }}>
            {t(`event.type.${event.type}`, { defaultValue: event.type }).toUpperCase()}
          </Text>
          {countdown ? (
            <>
              <View style={[styles.dot, { backgroundColor: c.borderStrong }]} />
              <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary">
                {countdown.toUpperCase()}
              </Text>
            </>
          ) : null}
        </View>

        <Text variant="title1" weight="bold" color="primary" numberOfLines={2} style={styles.title}>
          {event.title}
        </Text>

        <View style={styles.metaRow}>
          <Icon name="calendar" size={14} color="tertiary" />
          <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.metaText}>
            {when}
          </Text>
        </View>
        {event.location ? (
          <View style={styles.metaRow}>
            <Icon name="mappin" size={14} color="tertiary" />
            <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.metaText}>
              {event.location}
            </Text>
          </View>
        ) : null}
      </PressableScale>

      <View style={[styles.actionZone, { borderTopColor: c.borderSubtle }]}>
        {inCheckInWindow && event.myRsvp === 'YES' ? (
          <PressableScale
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t('home.player.openCheckIn', { defaultValue: 'Open check-in' })}
            haptic="tapMedium"
            style={[styles.primaryAction, { backgroundColor: c.primary }]}
          >
            <Icon name="checkmark" size={16} color={c.textInverse} />
            <Text variant="footnote" weight="bold" style={{ color: c.textInverse }}>
              {t('home.player.openCheckIn', { defaultValue: 'Open check-in' })}
            </Text>
          </PressableScale>
        ) : (
          <>
            <View style={styles.actionLabelRow}>
              <Text
                variant="caption1"
                weight={needsReply ? 'bold' : 'medium'}
                color={needsReply ? 'primary' : 'tertiary'}
                numberOfLines={1}
                style={styles.actionLabel}
              >
                {needsReply
                  ? t('home.player.areYouIn', { defaultValue: 'Are you in?' })
                  : statusLabel}
              </Text>
              {event.yesCount + event.maybeCount + event.noCount > 0 ? (
                <Text variant="caption1" color="tertiary" tabular numberOfLines={1}>
                  {t('home.player.yesCount', {
                    defaultValue: '{{yes}} in',
                    yes: event.yesCount,
                  })}
                </Text>
              ) : null}
            </View>
            <RsvpControl
              value={event.myRsvp}
              onChange={onRsvp}
              disabled={rsvpPending}
              />
          </>
        )}
      </View>
    </View>
  )
}

/**
 * Short, human lead time: "today", "tomorrow", "in 3 days", "in 2 h".
 * Anything further out than a week is left to the date line above it.
 */
function formatCountdown(
  deltaMs: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (deltaMs <= 0) return t('home.player.now', { defaultValue: 'Now' })
  const hours = deltaMs / 3_600_000
  if (hours < 1) {
    return t('home.player.inMinutes', {
      defaultValue: 'in {{n}} min',
      n: Math.max(1, Math.round(deltaMs / 60_000)),
    })
  }
  if (hours < 12) {
    return t('home.player.inHours', { defaultValue: 'in {{n}} h', n: Math.round(hours) })
  }
  const days = Math.round(hours / 24)
  if (days <= 1) return t('home.tomorrow', { defaultValue: 'Tomorrow' })
  if (days <= 7) return t('home.inNDays', { defaultValue: 'In {{n}} days', n: days })
  return null
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  cardBody: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.xs,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dot: { width: 3, height: 3, borderRadius: radius.full },
  title: { marginTop: space['2xs'], marginBottom: space['2xs'] },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  metaText: { flex: 1 },
  actionZone: {
    borderTopWidth: hairline,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
  },
  actionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  actionLabel: { flex: 1 },
  primaryAction: {
    minHeight: 46,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
})
