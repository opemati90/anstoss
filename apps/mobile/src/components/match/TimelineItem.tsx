import { StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { Icon, IconName } from '../ui/Icon'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../theme/tokens'

export type TimelineEventKind = 'goal' | 'sub' | 'yellow' | 'red' | 'pen' | 'own_goal'

export type TimelineItemProps = {
  minute: number
  kind: TimelineEventKind
  player: string
  detail?: string
  side: 'home' | 'away'
  isLast?: boolean
}

const ICONS: Record<TimelineEventKind, IconName> = {
  goal: 'football',
  sub: 'swap-horizontal',
  yellow: 'square',
  red: 'square',
  pen: 'football',
  own_goal: 'football',
}

const LABELS: Record<TimelineEventKind, string> = {
  goal: 'Goal',
  sub: 'Substitution',
  yellow: 'Yellow card',
  red: 'Red card',
  pen: 'Penalty',
  own_goal: 'Own goal',
}

export function TimelineItem({
  minute,
  kind,
  player,
  detail,
  side,
  isLast,
}: TimelineItemProps) {
  const colors = useClubColors()
  const accent = kind === 'red' ? colors.error : kind === 'yellow' ? colors.warning : colors.primary

  return (
    <View style={styles.row}>
      <View style={styles.minuteCol}>
        <View style={[styles.minutePill, { backgroundColor: colors.surfaceSunken }]}>
          <Text style={[styles.minuteText, { color: colors.textPrimary }]}>{minute}'</Text>
        </View>
      </View>

      <View style={styles.timelineCol}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        {!isLast && <View style={[styles.line, { backgroundColor: colors.borderDefault }]} />}
      </View>

      <View
        style={[
          styles.body,
          side === 'away' && { alignItems: 'flex-end' },
        ]}
      >
        <View style={styles.bodyTop}>
          <Icon name={ICONS[kind]} size={14} color={accent} />
          <Text
            style={[
              styles.label,
              { color: colors.textSecondary },
            ]}
          >
            {LABELS[kind]}
          </Text>
        </View>
        <Text style={[styles.player, { color: colors.textPrimary }]}>{player}</Text>
        {detail ? (
          <Text style={[styles.detail, { color: colors.textTertiary }]}>{detail}</Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  minuteCol: {
    width: 44,
    alignItems: 'center',
    paddingTop: space['2xs'],
  },
  minutePill: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'] + 1,
    borderRadius: radius.full,
  },
  minuteText: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xs'],
    fontWeight: '600',
  },
  timelineCol: {
    width: 24,
    alignItems: 'center',
    paddingTop: space.xs + space['2xs'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  line: {
    width: hairline,
    flex: 1,
    minHeight: 32,
    marginTop: space['2xs'],
  },
  body: {
    flex: 1,
    gap: space['2xs'],
  },
  bodyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + space['2xs'],
  },
  label: {
    fontFamily: fonts.label,
    fontSize: fontSize['2xs'],
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  player: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  detail: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
  },
})