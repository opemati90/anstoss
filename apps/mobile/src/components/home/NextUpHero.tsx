import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Icon, PressableScale, Text } from '../ui'
import { SPACING_XL, SPACING_XS, SPACING_XXS, space } from '../../theme/tokens'
import type { AbsenceDetail, RsvpStatus } from '../events/RsvpControl'
import {
  eventHeadline,
  formatShortDate,
  formatTime,
  matchKindLabel,
} from './HomeKit'
import { DeclineReasonSheet } from '../rsvp/DeclineReasonSheet'
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
  const isMatch = event.type === 'MATCH'
  const headline = eventHeadline(event)
  const kickoff = formatTime(event.date, locale)
  const dateLabel = formatShortDate(event.date, locale)
  const meeting = formatTime(event.meetingAt, locale)
  const isCancelled = Boolean(event.cancelledAt)

  const answered = event.myRsvp && !event.myRsvpStale ? event.myRsvp : null
  // Board 22: one confirmation line once answered; after an Absage the
  // player can still add the reason ("Grund angeben").
  const statusLabel = event.myRsvpStale
    ? t('event.rescheduledHint', { defaultValue: 'Time changed · confirm your reply' })
    : answered === 'YES'
      ? t('homeHub.player.confirmYes', {
          defaultValue: "You're in. You're one of {{count}}.",
          count: Math.max(1, event.yesCount),
        })
      : answered === 'MAYBE'
        ? t('homeHub.player.confirmMaybe', { defaultValue: 'Please decide soon, your coach is planning.' })
        : answered === 'NO'
          ? t('homeHub.player.confirmNo', { defaultValue: "Declined. Your coach has been told." })
          : null
  const [reasonOpen, setReasonOpen] = useState(false)

  const typeLabel = isMatch
    ? matchKindLabel(event.matchKind, t)
    : event.type === 'TRAINING'
      ? t('homeHub.type.training', { defaultValue: 'Training' })
      : t('homeHub.type.other', { defaultValue: 'Event' })
  const venue =
    isMatch && event.homeAway
      ? event.homeAway === 'HOME'
        ? t('homeHub.home', { defaultValue: 'Home' })
        : t('homeHub.away', { defaultValue: 'Away' })
      : null
  // Screen 22: "Als Nächstes · Ligaspiel" — no countdown or venue on the
  // player hero; the time and the Treffpunkt line say when to be there.
  const kicker = [t('homeHub.nextUp', { defaultValue: 'Next up' }), typeLabel]
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

  // "So vs. Rot-Weiß Köpenick III" — names the event in the Absage sheet.
  const contextLabel = `${heroKickoff(event.date, locale).split(' ')[0]} ${versus}`

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
        <Text variant="footnote" weight="semibold" style={{ color: hero.muted }} numberOfLines={1}>
          {kicker}
        </Text>
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
          style={[styles.versus, { color: hero.fg }, isCancelled ? styles.struck : {}]}
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
            contextLabel={contextLabel}
            testID="home-hero-rsvp"
          />
          {statusLabel ? (
            <View style={styles.statusRow}>
              <Text variant="footnote" style={[styles.flex, { color: hero.fg }]}>
                {statusLabel}
              </Text>
              {answered === 'NO' ? (
                <PressableScale
                  onPress={() => setReasonOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('homeHub.player.giveReason', { defaultValue: 'Add a reason' })}
                  haptic="tapLight"
                  style={styles.reasonLink}
                  testID="home-hero-reason"
                >
                  <Text variant="footnote" weight="bold" style={{ color: hero.fg }}>
                    {t('homeHub.player.giveReason', { defaultValue: 'Add a reason' })}
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          ) : null}
          <DeclineReasonSheet
            visible={reasonOpen}
            contextLabel={contextLabel}
            onSubmit={(detail) => {
              setReasonOpen(false)
              onRsvp('NO', detail)
            }}
            onClose={() => setReasonOpen(false)}
          />
        </View>
      )}
    </HeroSurface>
  )
}

const styles = StyleSheet.create({
  hero: { gap: SPACING_XL },
  body: { gap: SPACING_XS + SPACING_XXS },
  kickoff: { fontSize: 50 },
  versus: { fontSize: 16 },
  flex: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
  reply: { gap: space.sm },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    minHeight: 24,
  },
  reasonLink: { minHeight: 44, justifyContent: 'center' },
})
