/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'

type SeasonStats = {
  played: number
  wins: number
  draws: number
  losses: number
  winRate: number
  goalDifference: number
  recentForm: Array<'W' | 'D' | 'L'>
}

type Props = {
  clubId: string
  teamId: string
}

/**
 * SeasonStatsCard — compact season overview widget for CoachHome / AdminHome.
 *
 * Fetches GET /clubs/:clubId/teams/:teamId/season-stats and renders:
 *   Row 1: Played | Win Rate
 *   Row 2: W / D / L | Goal Diff
 *   Row 3: Recent Form dots (last 5, W=green, D=grey, L=red)
 *
 * Hidden when played === 0 (no results yet).
 */
export function SeasonStatsCard({ clubId, teamId }: Props) {
  const c = useClubColors()
  const { t } = useTranslation()
  const [stats, setStats] = useState<SeasonStats | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api<SeasonStats>(
        `/clubs/${clubId}/teams/${teamId}/season-stats`,
      )
      setStats(result)
    } catch {
      // silently ignore — widget is non-critical
    } finally {
      setLoaded(true)
    }
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  // Don't render until loaded; hide if no results
  if (!loaded || !stats || stats.played === 0) return null

  const goalDiffLabel =
    stats.goalDifference > 0
      ? `+${stats.goalDifference}`
      : String(stats.goalDifference)

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      {/* Eyebrow */}
      <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
        {t('stats.season', { defaultValue: 'This Season' }).toUpperCase()}
      </Text>

      {/* Row 1: Played + Win Rate */}
      <View style={styles.row}>
        <StatCell
          label={t('stats.played', { defaultValue: 'Played' })}
          value={String(stats.played)}
        />
        <Divider color={c.borderDefault} />
        <StatCell
          label={t('stats.winRate', { defaultValue: 'Win Rate' })}
          value={`${stats.winRate}%`}
        />
      </View>

      {/* Row 2: W / D / L + Goal Diff */}
      <View style={styles.row}>
        <View style={styles.wdlGroup}>
          <WdlPill label="W" count={stats.wins} color={c.success} />
          <WdlPill label="D" count={stats.draws} color={c.textTertiary} />
          <WdlPill label="L" count={stats.losses} color={c.error} />
        </View>
        <Divider color={c.borderDefault} />
        <StatCell
          label={t('stats.goalDiff', { defaultValue: 'Goal Diff' })}
          value={goalDiffLabel}
          valueColor={
            stats.goalDifference > 0
              ? c.success
              : stats.goalDifference < 0
              ? c.error
              : c.textPrimary
          }
        />
      </View>

      {/* Row 3: Recent Form */}
      {(stats.recentForm ?? []).length > 0 ? (
        <View style={styles.formRow}>
          <Text style={[styles.formLabel, { color: c.textTertiary }]}>
            {t('stats.recentForm', { defaultValue: 'Recent Form' }).toUpperCase()}
          </Text>
          <View style={styles.formDots}>
            {(stats.recentForm ?? []).map((result, i) => (
              <FormDot
                key={i}
                result={result}
                successColor={c.success}
                errorColor={c.error}
                neutralColor={c.textTertiary}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

function StatCell({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  const c = useClubColors()
  return (
    <View style={styles.statCell}>
      <Text
        style={[
          styles.statValue,
          { color: valueColor ?? c.textPrimary },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: c.textTertiary }]}>{label}</Text>
    </View>
  )
}

function WdlPill({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: string
}) {
  return (
    <View style={styles.wdlPill}>
      <Text style={[styles.wdlValue, { color }]}>{String(count)}</Text>
      <Text style={[styles.wdlLabel, { color }]}>{label}</Text>
    </View>
  )
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />
}

function FormDot({
  result,
  successColor,
  errorColor,
  neutralColor,
}: {
  result: 'W' | 'D' | 'L'
  successColor: string
  errorColor: string
  neutralColor: string
}) {
  const color =
    result === 'W' ? successColor : result === 'L' ? errorColor : neutralColor

  return (
    <View
      style={[styles.formDot, { backgroundColor: color }]}
      accessibilityLabel={result}
    />
  )
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 12,
  },
  eyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  statCell: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    fontFamily: fonts.data,
    fontSize: 22,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  statLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  divider: {
    width: 1,
    height: 36,
    opacity: 0.5,
  },
  wdlGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  wdlPill: {
    alignItems: 'center',
    gap: 2,
  },
  wdlValue: {
    fontFamily: fonts.data,
    fontSize: 22,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  wdlLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  formLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  formDots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  formDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
})
