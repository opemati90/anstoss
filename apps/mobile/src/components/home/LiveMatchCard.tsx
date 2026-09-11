import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ImportedFixture } from '@anstoss/shared'
import { Icon, PressableScale, Text } from '../ui'
import { LiveStatusPill } from '../match'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { TEXT_WHITE } from '../../theme/colors'
import { hairline, radius, space } from '../../theme/tokens'

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
      accessibilityLabel={`${fixture.homeTeam} vs ${fixture.awayTeam} live, ${fixture.resultHome ?? 0}-${fixture.resultAway ?? 0}`}
      haptic="tapLight"
      style={[styles.card, { backgroundColor: c.primary }]}
    >
      <View style={styles.head}>
        <LiveStatusPill status="live" inverse />
        <Text
          variant="caption2"
          tracking="wide"
          weight="semibold"
          numberOfLines={1}
          style={{ color: hexToRgba(TEXT_WHITE, 0.72) }}
        >
          {fixture.competition.toUpperCase()}
        </Text>
      </View>

      <View style={styles.scoreRow}>
        <Text
          variant="footnote"
          weight="semibold"
          numberOfLines={1}
          style={[styles.team, { color: TEXT_WHITE }]}
        >
          {fixture.homeTeam}
        </Text>
        <Text variant="dataLarge" weight="bold" tabular style={{ color: TEXT_WHITE }}>
          {fixture.resultHome ?? 0}-{fixture.resultAway ?? 0}
        </Text>
        <Text
          variant="footnote"
          weight="semibold"
          numberOfLines={1}
          style={[styles.team, styles.teamRight, { color: TEXT_WHITE }]}
        >
          {fixture.awayTeam}
        </Text>
      </View>

      {showOpenAction ? (
        <View style={[styles.footer, { borderTopColor: hexToRgba(TEXT_WHITE, 0.22) }]}>
          <Text variant="footnote" weight="semibold" style={{ color: TEXT_WHITE }}>
            {t('home.player.openLive', { defaultValue: 'Open live match' })}
          </Text>
          <Icon name="chevron.right" size={14} color={TEXT_WHITE} />
        </View>
      ) : null}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: space.lg,
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
  teamRight: { textAlign: 'right' },
  footer: {
    borderTopWidth: hairline,
    paddingTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
