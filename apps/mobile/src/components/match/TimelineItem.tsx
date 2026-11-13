import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, SPACING_MD, SPACING_SM, SPACING_XXS } from '../../theme/tokens'

export type TimelineEventKind = 'goal' | 'sub' | 'yellow' | 'red' | 'pen' | 'own_goal'

export type TimelineItemProps = {
  minute: number
  kind: TimelineEventKind
  player: string
  detail?: string
  side: 'home' | 'away'
  /**
   * Which side is the viewer's club. When set, a goal for the other side
   * reads "Gegentor" (design 14 Spielverlauf). Unknown → plain "Tor".
   */
  ownSide?: 'home' | 'away' | null
  isLast?: boolean
}

const MINUTE_COL = 36
const ROW_MIN = 52

/**
 * One row of the Spielverlauf group: Barlow minute, who, and what
 * (design 14). Rendered inside a white radius-20 group; `isLast` drops the
 * divider.
 */
export function TimelineItem({
  minute,
  kind,
  player,
  detail,
  side,
  ownSide,
  isLast,
}: TimelineItemProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const conceded = (kind === 'goal' || kind === 'pen') && ownSide != null && side !== ownSide
  const label = conceded
    ? t('matchLive.kind.conceded', { defaultValue: 'Goal against' })
    : t(`matchLive.kind.${kind}`, { defaultValue: DEFAULT_LABELS[kind] })

  return (
    <View
      accessible
      accessibilityLabel={`${minute}'. ${label}. ${player}${detail ? `, ${detail}` : ''}`}
      style={[
        styles.row,
        !isLast && { borderBottomWidth: hairline, borderBottomColor: c.borderSubtle },
      ]}
    >
      <Text variant="data" tabular style={styles.minute}>
        {`${minute}'`}
      </Text>
      <View style={styles.who}>
        <Text variant="callout" weight="semibold" numberOfLines={1}>
          {player}
        </Text>
        {detail ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {/* Design 15: the kind as a muted word on the right ("Tor", "Gelb"). */}
      <Text variant="footnote" color="secondary" style={styles.kind}>
        {label}
      </Text>
    </View>
  )
}

const DEFAULT_LABELS: Record<TimelineEventKind, string> = {
  goal: 'Goal',
  sub: 'Substitution',
  yellow: 'Yellow',
  red: 'Red',
  pen: 'Penalty',
  own_goal: 'Own goal',
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + SPACING_XXS,
    paddingVertical: SPACING_SM,
  },
  minute: {
    width: MINUTE_COL,
    fontSize: 18,
    lineHeight: 22,
  },
  who: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  kind: { flexShrink: 0 },
})
