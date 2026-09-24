import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { hairline, radius, space } from '../../theme/tokens'
import { HomeSection } from './HomeKit'
import type { StreaksResponse } from '@anstoss/shared'
import type { TeamSeasonStats } from '../../hooks/usePlayerHome'

export type SeasonStripProps = {
  streaks: StreaksResponse['me'] | null
  rank: number | null
  seasonStats: TeamSeasonStats | null
}

/**
 * "Your season" — the part of the app that is about the player rather than the
 * schedule.
 *
 * Anstoss already computes real attendance streaks, MOTM wins, and team form;
 * none of it reached the home screen, so the player's own record lived three
 * taps deep and was effectively invisible. Three tiles, all live data, each
 * one a door to the screen that explains it. No tile renders a figure it does
 * not actually have.
 */
export function SeasonStrip({ streaks, rank, seasonStats }: SeasonStripProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  // Three tiles side by side until the text is too large for a third of the
  // width; then they wrap to full-width rows instead of clipping.
  const { width, fontScale } = useWindowDimensions()
  const wrapTiles = fontScale >= 1.35 || width / Math.max(1, fontScale) < 340

  // Both payloads are defensive: a club with no history, an older API, or a
  // partial response must leave the strip out rather than crash the screen
  // that holds the player's next match.
  // Before the season (or for a new player) every figure is 0; a row of
  // zeros says nothing, so a tile only shows once it has a record to show.
  const hasStreaks = typeof streaks?.attendanceWeeks === 'number'
  const showAttendance =
    hasStreaks && (streaks!.attendanceWeeks > 0 || (streaks!.attendanceLongest ?? 0) > 0)
  const showMotm = hasStreaks && ((streaks!.motmWeeks ?? 0) > 0 || (streaks!.motmLongest ?? 0) > 0)
  const form = Array.isArray(seasonStats?.recentForm) ? seasonStats!.recentForm : []
  const hasForm = form.length > 0
  if (!showAttendance && !showMotm && !hasForm) return null

  return (
    <HomeSection title={t('home.player.seasonTitle', { defaultValue: 'Your season' })}>
      <View style={[styles.row, wrapTiles && styles.rowStacked]}>
        {showAttendance ? (
          <Tile
            icon="flame"
            value={String(streaks!.attendanceWeeks)}
            label={t('home.player.streakWeeks', {
              defaultValue: 'week streak',
              count: streaks!.attendanceWeeks,
            })}
            caption={
              rank
                ? t('home.player.clubRank', { defaultValue: '#{{n}} in club', n: rank })
                : t('home.player.streakBest', {
                    defaultValue: 'best {{n}}',
                    n: streaks!.attendanceLongest,
                  })
            }
            onPress={() => router.push('/team-stats')}
          />
        ) : null}
        {showMotm ? (
          <Tile
            icon="trophy"
            value={String(streaks!.motmWeeks)}
            label={t('home.player.motmWins', { defaultValue: 'MOTM' })}
            caption={t('home.player.streakBest', {
              defaultValue: 'best {{n}}',
              n: streaks!.motmLongest,
            })}
            onPress={() => router.push('/team-stats')}
          />
        ) : null}
        {hasForm ? (
          <PressableScale
            onPress={() => router.push('/club-stats')}
            accessibilityRole="button"
            accessibilityLabel={t('home.player.teamForm', { defaultValue: 'Team form' })}
            haptic="tapLight"
            // PressableScale renders an Animated.View wrapper around the
            // Pressable, so `flex` has to land on the wrapper or the tiles
            // collapse to content width inside the row.
            wrapperStyle={styles.tileWrapper}
            style={[
              styles.tile,
              styles.formTile,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <View style={styles.formRow}>
              {form.slice(-5).map((result, index) => (
                <View
                  key={`${result}-${index}`}
                  style={[
                    styles.formPip,
                    {
                      backgroundColor:
                        result === 'W'
                          ? c.primary
                          : result === 'D'
                            ? hexToRgba(c.primary, 0.28)
                            : c.surfaceSunken,
                      borderColor: c.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    variant="caption1"
                    weight="bold"
                    style={{
                      color: result === 'W' ? c.onPrimary : c.textSecondary,
                    }}
                  >
                    {t(`home.player.form.${result}`, { defaultValue: result })}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="caption1" color="secondary" numberOfLines={2}>
              {t('home.player.teamForm', { defaultValue: 'Team form' })}
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </HomeSection>
  )
}

function Tile({
  icon,
  value,
  label,
  caption,
  onPress,
}: {
  icon: string
  value: string
  label: string
  caption: string
  onPress: () => void
}) {
  const c = useClubColors()
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}, ${caption}`}
      haptic="tapLight"
      wrapperStyle={styles.tileWrapper}
      style={[styles.tile, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
    >
      <Icon name={icon} size={16} color={c.primary} />
      <View style={styles.tileValueRow}>
        <Text variant="title2" weight="bold" color="primary" tabular numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text variant="caption1" color="secondary" numberOfLines={2}>
        {label}
      </Text>
      <Text variant="caption1" color="tertiary" numberOfLines={2}>
        {caption}
      </Text>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  rowStacked: { flexDirection: 'column' },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tileWrapper: { flex: 1 },
  tile: {
    minHeight: 104,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space['2xs'],
  },
  tileValueRow: { marginTop: space.xs },
  formTile: { justifyContent: 'space-between' },
  formRow: {
    flexDirection: 'row',
    gap: space['2xs'] + 2,
    flexWrap: 'wrap',
  },
  formPip: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
