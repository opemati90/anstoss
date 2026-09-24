import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { HomeSection } from './HomeKit'

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
  /**
   * Coach home: render as a section that starts folded to one summary row
   * ("10 Spiele · 6 S · 2 U · 2 N") and expands in place.
   */
  collapsible?: boolean
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
export function SeasonStatsCard({ clubId, teamId, collapsible = false }: Props) {
  const c = useClubColors()
  const { t } = useTranslation()
  const [stats, setStats] = useState<SeasonStats | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api<unknown>(
        `/clubs/${clubId}/teams/${teamId}/season-stats`,
      )
      // Guard against unexpected response shapes (array, string, etc.)
      if (
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        'played' in (result as object)
      ) {
        setStats(result as SeasonStats)
      }
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
  if (!loaded || !stats || !stats.played) return null

  const goalDiffLabel =
    stats.goalDifference > 0
      ? `+${stats.goalDifference}`
      : String(stats.goalDifference)

  const details = (
    <>
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
          <WdlPill label={t('home.player.form.W', { defaultValue: 'W' })} count={stats.wins} color={c.success} />
          <WdlPill label={t('home.player.form.D', { defaultValue: 'D' })} count={stats.draws} color={c.textSecondary} />
          <WdlPill label={t('home.player.form.L', { defaultValue: 'L' })} count={stats.losses} color={c.error} />
        </View>
        <Divider color={c.borderDefault} />
        <StatCell
          label={t('stats.goalDiff', { defaultValue: 'Goal Diff' })}
          value={goalDiffLabel}
        />
      </View>

      {/* Row 3: Recent Form */}
      {(stats.recentForm ?? []).length > 0 ? (
        <View style={styles.formRow}>
          <Text variant="caption1" color="secondary">
            {t('stats.recentForm', { defaultValue: 'Recent Form' })}
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
    </>
  )

  if (collapsible) {
    const summary = t('homeHub.seasonSummary', {
      defaultValue: '{{played}} played · {{wins}} W · {{draws}} D · {{losses}} L',
      played: stats.played,
      wins: stats.wins,
      draws: stats.draws,
      losses: stats.losses,
    })
    return (
      <HomeSection title={t('stats.season', { defaultValue: 'This Season' })}>
        <View
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
        >
          <PressableScale
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={summary}
            accessibilityState={{ expanded }}
            haptic="tapLight"
            style={styles.summaryRow}
          >
            <Text variant="callout" weight="semibold" color="primary" tabular style={styles.flex}>
              {summary}
            </Text>
            <Icon name={expanded ? 'chevron.up' : 'chevron.down'} size={14} color="tertiary" />
          </PressableScale>
          {expanded ? (
            <View style={[styles.expanded, { borderTopColor: c.borderSubtle }]}>{details}</View>
          ) : null}
        </View>
      </HomeSection>
    )
  }

  return (
    <View
      style={[
        styles.card,
        styles.cardPadded,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <Text variant="caption1" color="secondary">
        {t('stats.season', { defaultValue: 'This Season' })}
      </Text>
      {details}
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
        variant="title2"
        weight="bold"
        tabular
        style={{ color: valueColor ?? c.textPrimary }}
      >
        {value}
      </Text>
      <Text variant="caption1" color="secondary">
        {label}
      </Text>
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
      <Text variant="title2" weight="bold" tabular style={{ color }}>
        {String(count)}
      </Text>
      <Text variant="caption1" weight="semibold" style={{ color }}>
        {label}
      </Text>
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
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  cardPadded: { padding: space.md, gap: space.sm + 4 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
  },
  expanded: {
    borderTopWidth: hairline,
    padding: space.md,
    gap: space.sm + 4,
  },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  statCell: {
    flex: 1,
    gap: space['2xs'],
  },
  divider: {
    width: hairline,
    height: 36,
  },
  wdlGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  wdlPill: {
    alignItems: 'center',
    gap: space['2xs'],
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  formDots: {
    flexDirection: 'row',
    gap: space.xs + space['2xs'],
    alignItems: 'center',
  },
  formDot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
  },
})
