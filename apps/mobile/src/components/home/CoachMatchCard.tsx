import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, IconButton, Text } from '../ui'
import { SPACING_XS, SPACING_XXS, space } from '../../theme/tokens'
import { formatCountdown, type MatchdayFields } from './HomeKit'
import { HeroSplit, HeroSurface, heroKickoff, useHeroColors, type RsvpSplit } from './HomeHero'

export type { RsvpSplit }

export type CoachMatchCardProps = {
  event: MatchdayFields & { id: string }
  locale: string
  split: RsvpSplit
  nowMs?: number
  onOpen: () => void
  onShare?: () => void
}

/**
 * The coach's next match as the club-coloured hero (redesign screen 08):
 * "Ligaspiel · Heim" and the countdown, the kick-off in Barlow display,
 * "gegen <Gegner>" (the Treffpunkt lives on the event, not here), and the squad's answers as one bar in one accent at
 * three densities. The actions that move the week forward live in the
 * "Vor dem Spiel" group beneath, not on the card.
 */
export function CoachMatchCard({ event, locale, split, nowMs, onOpen, onShare }: CoachMatchCardProps) {
  const { t } = useTranslation()
  const hero = useHeroColors()
  const total = split.yes + split.maybe + split.no + split.open
  const isMatch = event.type === 'MATCH'
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
  const kicker = [typeLabel, venue].filter(Boolean).join(' · ')
  const countdown = formatCountdown(event.date, nowMs ?? Date.now(), locale, t)
  const versus =
    isMatch && event.opponent
      ? t('homeHub.hero.versus', { defaultValue: 'vs {{opponent}}', opponent: event.opponent })
      : event.title
  const kickoff = heroKickoff(event.date, locale)

  return (
    <View>
      <HeroSurface
        onPress={onOpen}
        accessibilityLabel={[kicker, kickoff, versus, countdown].filter(Boolean).join(', ')}
        testID="coach-hero"
      >
        <View style={styles.topRow}>
          <Text variant="footnote" weight="semibold" style={[styles.flex, { color: hero.muted }]} numberOfLines={1}>
            {kicker}
          </Text>
          {countdown ? (
            <Text variant="footnote" weight="semibold" style={{ color: hero.muted }}>
              {countdown}
            </Text>
          ) : null}
          {onShare ? <View style={styles.shareSpace} /> : null}
        </View>

        <View style={styles.headline}>
          <Text variant="display" style={[styles.kickoff, { color: hero.fg }]} numberOfLines={1} adjustsFontSizeToFit>
            {kickoff}
          </Text>
          <Text variant="headline" weight="semibold" style={[styles.versus, { color: hero.fg }]} numberOfLines={2}>
            {versus}
          </Text>
        </View>

        {total > 0 ? (
          <HeroSplit split={split} />
        ) : (
          <Text variant="footnote" style={{ color: hero.muted }}>
            {t('homeHub.coach.noSquad', {
              defaultValue: 'No players in the squad yet. Invite your team so they can reply.',
            })}
          </Text>
        )}
      </HeroSurface>

      {/* Outside the card's pressable so it is its own button; overlaid on
          the hero's top row. */}
      {onShare ? (
        <IconButton
          variant="onHero"
          onPress={onShare}
          accessibilityLabel={t('home.readiness.shareBriefing', { defaultValue: 'Share briefing' })}
          style={styles.share}
        >
          <Icon name="square.and.arrow.up" size={18} color={hero.fg} />
        </IconButton>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 20 },
  flex: { flex: 1 },
  shareSpace: { width: 40 },
  share: { position: 'absolute', top: 10, right: 12 },
  headline: { gap: SPACING_XS + SPACING_XXS },
  kickoff: { fontSize: 54 },
  versus: { fontSize: 17 },
})
