import { StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { useMatchTokens } from '../../theme/matchTokens'
import { fontSize, fonts, space } from '../../theme/tokens'

export type StatRowProps = {
  label: string
  home: number | string
  away: number | string
  /** when both sides are numeric, render proportional fill bars */
  numeric?: boolean
}

export function StatRow({ label, home, away, numeric = true }: StatRowProps) {
  const colors = useClubColors()
  const tokens = useMatchTokens()

  const homeNum = typeof home === 'number' ? home : Number(home) || 0
  const awayNum = typeof away === 'number' ? away : Number(away) || 0
  const total = homeNum + awayNum
  const homePct = numeric && total > 0 ? Math.round((homeNum / total) * 100) : 50
  const awayPct = 100 - homePct

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.value, { color: colors.textPrimary, textAlign: 'left' }]}>
          {home}
        </Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.textPrimary, textAlign: 'right' }]}>
          {away}
        </Text>
      </View>
      {numeric && (
        <View style={[styles.bar, { backgroundColor: colors.surfaceSunken }]}>
          <View style={[styles.fillHome, { backgroundColor: colors.primary, flex: homePct }]} />
          <View
            style={[styles.fillAway, { backgroundColor: tokens.tokenAway, flex: awayPct }]}
          />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  value: {
    flex: 1,
    fontFamily: fonts.data,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  label: {
    flex: 1,
    fontFamily: fonts.label,
    fontSize: fontSize['2xs'],
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  bar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fillHome: {
    height: '100%',
  },
  fillAway: {
    height: '100%',
  },
})
