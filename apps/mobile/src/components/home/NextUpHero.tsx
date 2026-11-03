import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import {
  RsvpControl,
  rsvpTone,
  type AbsenceDetail,
  type RsvpStatus,
} from '../events/RsvpControl'
import {
  HomeAwayChip,
  KickoffBlock,
  LocationLine,
  TypeChip,
  eventHeadline,
  formatCountdown,
  formatShortDate,
  formatTime,
} from './HomeKit'
import type { HomeEvent } from '../../hooks/usePlayerHome'

export type NextUpHeroProps = {
  event: HomeEvent
  locale: string
  nowMs: number
  rsvpPending: boolean
  onRsvp: (status: RsvpStatus, absence?: AbsenceDetail) => void
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
 * "Next up": the one surface on home allowed to be large.
 *
 * It answers the three questions a player has about the next thing, in the
 * order they ask them: what is it and against whom, when do I have to be
 * there (Treffpunkt before Anstoß), and am I coming. The reply is answered in
 * place; inside the arrival window it becomes check-in.
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

  const inCheckInWindow = isInCheckInWindow(event.date, nowMs)
  const countdown = formatCountdown(event.date, nowMs, locale, t)
  const isMatch = event.type === 'MATCH'
  const headline = eventHeadline(event)
  const kickoff = formatTime(event.date, locale)
  const dateLabel = formatShortDate(event.date, locale)
  const meeting = formatTime(event.meetingAt, locale)
  const isCancelled = Boolean(event.cancelledAt)

  const needsReply = !event.myRsvp || Boolean(event.myRsvpStale)
  const answered = event.myRsvp && !event.myRsvpStale ? event.myRsvp : null
  const answerTone = answered ? rsvpTone(answered, c) : null
  const statusLabel = event.myRsvpStale
    ? t('event.rescheduledHint', { defaultValue: 'Time changed · confirm your reply' })
    : answered === 'YES'
      ? t('homeHub.player.youreIn', { defaultValue: "You're going" })
      : answered === 'MAYBE'
        ? t('homeHub.player.youreMaybe', { defaultValue: 'You said maybe' })
        : answered === 'NO'
          ? t('homeHub.player.youreOut', { defaultValue: "You're not going" })
          : t('home.player.areYouIn', { defaultValue: 'Are you in?' })

  const a11ySummary = [
    headline,
    event.homeAway === 'AWAY'
      ? t('homeHub.away', { defaultValue: 'Away' })
      : event.homeAway === 'HOME'
        ? t('homeHub.home', { defaultValue: 'Home' })
        : null,
    `${dateLabel} ${kickoff}`,
    meeting ? t('homeHub.meetShort', { defaultValue: 'Meet {{time}}', time: meeting }) : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={a11ySummary}
        haptic="tapLight"
        style={styles.body}
      >
        <View style={styles.chipRow}>
          <TypeChip type={event.type} />
          {isMatch ? <HomeAwayChip homeAway={event.homeAway} /> : null}
          {countdown && !isCancelled ? (
            <Text variant="footnote" weight="medium" color="secondary" tabular style={styles.countdown}>
              {countdown}
            </Text>
          ) : null}
        </View>

        <Text
          variant="title2"
          weight="bold"
          color={isCancelled ? 'tertiary' : 'primary'}
          numberOfLines={2}
          style={isCancelled ? styles.struck : undefined}
        >
          {headline}
        </Text>

        <KickoffBlock event={event} locale={locale} />
        <LocationLine event={event} />
      </PressableScale>

      <View style={[styles.actionZone, { borderTopColor: c.borderSubtle }]}>
        {isCancelled ? (
          <View style={styles.statusRow}>
            <Icon name="xmark.circle.fill" size={18} color={c.error} />
            <Text variant="subheadline" weight="semibold" color="secondary" style={styles.flex}>
              {t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}
              {event.cancelReason ? ` · ${event.cancelReason}` : ''}
            </Text>
          </View>
        ) : inCheckInWindow && event.myRsvp === 'YES' ? (
          <Button
            label={t('home.player.openCheckIn', { defaultValue: 'Open check-in' })}
            onPress={onOpen}
            fullWidth
            hapticTone="tapMedium"
          />
        ) : (
          <>
            <View style={styles.statusRow}>
              {answerTone ? (
                <Icon
                  name={
                    answered === 'YES'
                      ? 'checkmark.circle.fill'
                      : answered === 'MAYBE'
                        ? 'questionmark.circle.fill'
                        : 'xmark.circle.fill'
                  }
                  size={18}
                  color={answerTone.fg}
                />
              ) : null}
              <Text
                variant="subheadline"
                weight="semibold"
                color={needsReply ? 'primary' : 'secondary'}
                style={styles.flex}
              >
                {statusLabel}
              </Text>
              {event.yesCount > 0 ? (
                <Text variant="footnote" color="secondary" tabular>
                  {t('homeHub.player.yesCount', {
                    defaultValue: '{{count}} going',
                    count: event.yesCount,
                  })}
                </Text>
              ) : null}
            </View>
            <RsvpControl
              policy={event}
              value={event.myRsvp}
              onChange={onRsvp}
              disabled={rsvpPending}
              testID="home-hero-rsvp"
            />
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: space.sm + 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  countdown: { marginStart: 'auto' },
  flex: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  actionZone: {
    borderTopWidth: hairline,
    paddingHorizontal: space.md,
    paddingTop: space.sm + 4,
    paddingBottom: space.md,
    gap: space.sm + 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 24,
  },
})
