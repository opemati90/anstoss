import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Icon, PressableScale, Text } from '../ui'
import { SPACING_XL, SPACING_XS, SPACING_XXS, space } from '../../theme/tokens'
import type { AbsenceDetail, RsvpStatus } from '../events/RsvpControl'
import {
  eventHeadline,
  formatCountdown,
  formatShortDate,
  formatTime,
} from './HomeKit'
import { HeroRsvp, HeroSurface, heroKickoff, useHeroColors } from './HomeHero'
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
 * "Next up" as the club-coloured hero (redesign screen 22).
 *
 * It answers the three questions a player has about the next thing, in the
 * order they ask them: what is it and against whom, when do I have to be
 * there (Treffpunkt before Anstoß), and am I coming. The reply is answered in
 * place on the hero's own segmented control; inside the arrival window it
 * becomes check-in.
 */
export function NextUpHero({
  event,
  locale,
  nowMs,
  rsvpPending,
  onRsvp,
  onOpen,
}: NextUpHeroProps) {
  const hero = useHeroColors()
  const { t } = useTranslation()

  const inCheckInWindow = isInCheckInWindow(event.date, nowMs)
  const countdown = formatCountdown(event.date, nowMs, locale, t)
  const isMatch = event.type === 'MATCH'
  const headline = eventHeadline(event)
  const kickoff = formatTime(event.date, locale)
  const dateLabel = formatShortDate(event.date, locale)
  const meeting = formatTime(event.meetingAt, locale)
  const isCancelled = Boolean(event.cancelledAt)

  const answered = event.myRsvp && !event.myRsvpStale ? event.myRsvp : null
  const statusLabel = event.myRsvpStale
    ? t('event.rescheduledHint', { defaultValue: 'Time changed · confirm your reply' })
    : answered === 'YES'
      ? t('homeHub.player.youreIn', { defaultValue: "You're going" })
      : answered === 'MAYBE'
        ? t('homeHub.player.youreMaybe', { defaultValue: 'You said maybe' })
        : answered === 'NO'
          ? t('homeHub.player.youreOut', { defaultValue: "You're not going" })
          : t('home.player.areYouIn', { defaultValue: 'Are you in?' })

  const typeLabel = isMatch
    ? t('homeHub.type.match', { defaultValue: 'Match' })
    : event.type === 'TRAINING'
      ? t('homeHub.type.training', { defaultValue: 'Training' })
      : t('homeHub.type.other', { defaultValue: 'Event' })
  const venue =
    isMatch && event.homeAway
      ? event.homeAway === 'HOME'
        ? t('homeHub.home', { defaultValue: 'Home' })
        : t('homeHub.away', { defaultValue: 'Away' })
      : null
  const kicker = [t('homeHub.nextUp', { defaultValue: 'Next up' }), typeLabel, venue]
    .filter(Boolean)
    .join(' · ')
  const versus =
    isMatch && event.opponent
      ? t('homeHub.hero.versus', { defaultValue: 'vs {{opponent}}', opponent: event.opponent })
      : headline
  const place = event.meetingPoint || event.location || null
  const meetLine = [
    meeting ? t('homeHub.hero.meetAt', { defaultValue: 'Meet {{time}}', time: meeting }) : null,
    place,
  ]
    .filter(Boolean)
    .join(' · ')

  const a11ySummary = [
    headline,
    venue,
    `${dateLabel} ${kickoff}`,
    meeting ? t('homeHub.meetShort', { defaultValue: 'Meet {{time}}', time: meeting }) : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <HeroSurface style={styles.hero}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={a11ySummary}
        haptic="tapLight"
        style={styles.body}
      >
        <View style={styles.topRow}>
          <Text variant="footnote" weight="semibold" style={[styles.flex, { color: hero.muted }]} numberOfLines={1}>
            {kicker}
          </Text>
          {countdown && !isCancelled ? (
            <Text variant="footnote" weight="semibold" tabular style={{ color: hero.muted }}>
              {countdown}
            </Text>
          ) : null}
        </View>
        <Text
          variant="display"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.kickoff, { color: hero.fg }, isCancelled ? styles.struck : {}]}
        >
          {heroKickoff(event.date, locale)}
        </Text>
        <Text
          variant="headline"
          weight="semibold"
          numberOfLines={2}
          style={[{ color: hero.fg }, isCancelled ? styles.struck : {}]}
        >
          {versus}
        </Text>
        {meetLine ? (
          <Text variant="footnote" numberOfLines={2} style={{ color: hero.muted }}>
            {meetLine}
          </Text>
        ) : null}
      </PressableScale>

      {isCancelled ? (
        <View style={styles.statusRow}>
          <Icon name="xmark.circle.fill" size={18} color={hero.fg} />
          <Text variant="subheadline" weight="semibold" style={[styles.flex, { color: hero.fg }]}>
            {t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}
            {event.cancelReason ? ` · ${event.cancelReason}` : ''}
          </Text>
        </View>
      ) : inCheckInWindow && event.myRsvp === 'YES' ? (
        <Button
          label={t('home.player.openCheckIn', { defaultValue: 'Open check-in' })}
          onPress={onOpen}
          variant="accent"
          size="lg"
          fullWidth
          hapticTone="tapMedium"
        />
      ) : (
        <View style={styles.reply}>
          <HeroRsvp
            value={event.myRsvp}
            onChange={onRsvp}
            disabled={rsvpPending}
            accessibilityLabel={t('homeHub.hero.yourReply', { defaultValue: 'Your reply' })}
            testID="home-hero-rsvp"
          />
          {statusLabel ? (
            <View style={styles.statusRow}>
              <Text variant="footnote" weight="medium" style={[styles.flex, { color: hero.fg }]}>
                {statusLabel}
              </Text>
              {event.yesCount > 0 ? (
                <Text variant="footnote" tabular style={{ color: hero.muted }}>
                  {t('homeHub.player.yesCount', {
                    defaultValue: '{{count}} going',
                    count: event.yesCount,
                  })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </HeroSurface>
  )
}

const styles = StyleSheet.create({
  hero: { gap: SPACING_XL },
  body: { gap: SPACING_XS + SPACING_XXS },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kickoff: { fontSize: 50 },
  flex: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  reply: { gap: space.sm + 4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 24,
  },
})
