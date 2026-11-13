import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ImportedFixture } from '@anstoss/shared'
import { Icon, PressableScale, Text } from '../ui'
import { LiveStatusPill } from '../match'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { RADIUS_HERO, hairline, space } from '../../theme/tokens'

export type LiveMatchCardProps = {
  fixture: ImportedFixture
  /**
   * Hidden while the player still owes a decision on this match — the reply
   * control below is the action that matters, and two competing calls to
   * action on one screen means neither gets taken.
   */
  showOpenAction: boolean
  onPress: () => void
}

/**
 * The score, while it is happening. The only surface allowed to use the club
 * primary as a full background — that is what earns it the top of the screen.
 */
export function LiveMatchCard({ fixture, showOpenAction, onPress }: LiveMatchCardProps) {
  const c = useClubColors()
  const { t } = useTranslation()

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('homeHub.liveA11y', {
        defaultValue: '{{home}} vs {{away}}, live, {{homeScore}} to {{awayScore}}',
        home: fixture.homeTeam,
        away: fixture.awayTeam,
        homeScore: fixture.resultHome ?? 0,
        awayScore: fixture.resultAway ?? 0,
      })}
      haptic="tapLight"
      style={[styles.card, { backgroundColor: c.heroBg }]}
    >
      <View style={styles.head}>
        <LiveStatusPill status="live" inverse />
        <Text
          variant="footnote"
          weight="medium"
          numberOfLines={2}
          style={[styles.competition, { color: hexToRgba(c.onHeroBg, 0.8) }]}
        >
          {fixture.competition}
        </Text>
      </View>

      <View style={styles.scoreRow}>
        <Text
          variant="subheadline"
          weight="semibold"
          numberOfLines={2}
          style={[styles.team, { color: c.onHeroBg }]}
        >
          {fixture.homeTeam}
        </Text>
        <Text variant="title1" weight="bold" tabular style={{ color: c.onHeroBg }}>
          {fixture.resultHome ?? 0}-{fixture.resultAway ?? 0}
        </Text>
        <Text
          variant="subheadline"
          weight="semibold"
          numberOfLines={2}
          style={[styles.team, styles.teamRight, { color: c.onHeroBg }]}
        >
          {fixture.awayTeam}
        </Text>
      </View>

      {showOpenAction ? (
        <View style={[styles.footer, { borderTopColor: hexToRgba(c.onHeroBg, 0.22) }]}>
          <Text variant="subheadline" weight="semibold" style={{ color: c.onHeroBg }}>
            {t('home.player.openLive', { defaultValue: 'Open live match' })}
          </Text>
          <Icon name="chevron.right" size={14} color={c.onHeroBg} />
        </View>
      ) : null}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS_HERO,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  team: { flex: 1 },
  competition: { flexShrink: 1, textAlign: 'right' },
  teamRight: { textAlign: 'right' },
  footer: {
    borderTopWidth: hairline,
    paddingTop: space.sm,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
