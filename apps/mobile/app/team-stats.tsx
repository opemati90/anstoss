import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { StreaksResponse } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api, ApiError } from '../src/api/client'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { DashboardSkeleton } from '../src/components/Skeleton'
import { Avatar, Screen, StatCard, StatGrid, StatusPill, Text } from '../src/components/ui'
import { hairline, radius, space } from '../src/theme/tokens'
import { formatDayMonth } from '../src/components/squad/format'

type SeasonStats = {
  played: number
  wins: number
  draws: number
  losses: number
  winRate: number
  goalDifference: number
  recentForm: Array<'W' | 'D' | 'L'>
}

type MotmArchive = {
  season: string
  topByPlayer: Array<{ userId: string; name: string; avatarUrl: string | null; count: number }>
  byMatch: Array<{
    matchId: string
    kickoffAt: string
    opponentName: string
    motmUserId: string | null
    motmName: string | null
  }>
  /** Set by the API when the archive is scoped to one team. */
  teamId?: string
}

type StatsData = {
  season: SeasonStats | null
  streaks: StreaksResponse | null
  motm: MotmArchive | null
}

/** A 403/404 means "not for you / nothing yet", not a broken screen. */
async function soft<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return null
    throw err
  }
}

/**
 * Statistik — one place for the team's numbers: the season (fussball.de
 * results), training attendance, Spieler des Spiels and personal streaks.
 * Replaces the separate streaks, rankings and MOTM-archive screens.
 */
export default function TeamStatsScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const { user, activeClub, activeTeamId } = useAuth()
  const clubId = activeClub?.club.id ?? null

  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    const teamQuery = activeTeamId ? `?teamId=${encodeURIComponent(activeTeamId)}` : ''
    try {
      const [season, streaks, motm] = await Promise.all([
        activeTeamId
          ? soft(api<SeasonStats>(`/clubs/${clubId}/teams/${activeTeamId}/season-stats`))
          : Promise.resolve(null),
        // Team numbers when a team is active; the API echoes teamId when it
        // scoped them, and the labels follow that echo (an older API answers
        // for the whole club and keeps the "im Verein" labels).
        soft(api<StreaksResponse>(`/clubs/${clubId}/streaks${teamQuery}`)),
        soft(api<MotmArchive>(`/clubs/${clubId}/motm/archive${teamQuery}`)),
      ])
      setData({
        season: season && typeof season === 'object' && 'played' in season ? season : null,
        streaks: streaks ?? null,
        motm: motm ?? null,
      })
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [clubId, activeTeamId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const header = <ModalHeader mode="back" title={t('kader.stats.title')} />

  if (loading && !data) {
    return (
      <Screen header={header} padded={false}>
        <DashboardSkeleton />
      </Screen>
    )
  }

  if (!data) {
    return (
      <Screen header={header} padded={false}>
        <View style={styles.state}>
          {error ? (
            <ErrorState
              message={t('kader.errors.loadTitle')}
              hint={t('kader.errors.loadBody')}
              onRetry={() => {
                setLoading(true)
                void load()
              }}
              retryLabel={t('kader.actions.retry')}
            />
          ) : (
            <EmptyState icon="chart.bar" title={t('kader.stats.emptyTitle')} description={t('kader.stats.emptyBody')} />
          )}
        </View>
      </Screen>
    )
  }

  const { season, streaks, motm } = data
  const me = streaks?.me ?? null
  const attendance = [...(streaks?.leaderboard ?? [])]
    .filter((entry) => entry.attendanceWeeks > 0)
    .sort((a, b) => b.attendanceWeeks - a.attendanceWeeks || a.name.localeCompare(b.name, 'de'))
    .slice(0, 10)
  const motmTop = (motm?.topByPlayer ?? []).slice(0, 5)
  const motmMatches = (motm?.byMatch ?? []).filter((m) => m.motmName).slice(0, 6)
  const streaksForTeam = Boolean(activeTeamId && streaks?.teamId === activeTeamId)
  const motmForTeam = Boolean(activeTeamId && motm?.teamId === activeTeamId)
  const hasSeason = Boolean(season && season.played > 0)
  const hasAnything =
    hasSeason ||
    attendance.length > 0 ||
    motmTop.length > 0 ||
    (me != null && (me.attendanceWeeks > 0 || me.motmWeeks > 0))

  return (
    <Screen header={header} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {!hasAnything ? (
          <EmptyState icon="chart.bar" title={t('kader.stats.emptyTitle')} description={t('kader.stats.emptyBody')} />
        ) : null}

        {hasSeason && season ? (
          <Section title={t('kader.stats.season')}>
            <StatGrid columns={2}>
              <StatCard label={t('kader.stats.played')} value={season.played} />
              <StatCard
                label={t('kader.stats.record')}
                value={t('kader.stats.recordValue', {
                  wins: season.wins,
                  draws: season.draws,
                  losses: season.losses,
                })}
              />
              <StatCard
                label={t('kader.stats.winRate')}
                value={new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
                  // The API reports a percentage (e.g. 62.5).
                  season.winRate / 100,
                )}
              />
              <StatCard
                label={t('kader.stats.goalDifference')}
                value={season.goalDifference > 0 ? `+${season.goalDifference}` : String(season.goalDifference)}
              />
            </StatGrid>
            {season.recentForm.length > 0 ? (
              <View style={styles.formRow}>
                <Text variant="footnote" color="secondary">
                  {t('matches.form')}
                </Text>
                {season.recentForm.slice(0, 5).map((result, i) => (
                  <StatusPill
                    key={i}
                    label={t(result === 'W' ? 'matches.colW' : result === 'L' ? 'matches.colL' : 'matches.colD')}
                    tone={result === 'W' ? 'success' : result === 'L' ? 'error' : 'neutral'}
                  />
                ))}
              </View>
            ) : null}
          </Section>
        ) : null}

        {me && (me.attendanceWeeks > 0 || me.motmWeeks > 0 || me.attendanceLongest > 0) ? (
          <Section title={t('kader.stats.myStreaks')}>
            <StatGrid columns={2}>
              <StatCard
                icon="calendar"
                label={t('kader.stats.attendanceStreak')}
                value={t('kader.stats.weeks', { count: me.attendanceWeeks })}
                trend={t('kader.stats.longest', { count: me.attendanceLongest })}
              />
              <StatCard
                icon="trophy"
                label={t('kader.stats.motmStreak')}
                value={t('kader.stats.weeks', { count: me.motmWeeks })}
                trend={t('kader.stats.longest', { count: me.motmLongest })}
              />
            </StatGrid>
          </Section>
        ) : null}

        {attendance.length > 0 ? (
          <Section
            title={streaksForTeam ? t('kader.stats.attendanceTeam') : t('kader.stats.attendance')}
            footer={streaksForTeam ? t('kader.stats.attendanceTeamFooter') : t('kader.stats.attendanceFooter')}
          >
            <Card>
              {attendance.map((entry, index) => (
                <RankRow
                  key={entry.userId}
                  rank={index + 1}
                  name={entry.name}
                  avatarUrl={entry.avatarUrl}
                  value={t('kader.stats.weeksShort', { count: entry.attendanceWeeks })}
                  highlighted={entry.userId === user?.id}
                  first={index === 0}
                />
              ))}
            </Card>
          </Section>
        ) : null}

        {motmTop.length > 0 ? (
          <Section
            title={
              motmForTeam
                ? motm?.season
                  ? t('kader.stats.motmTeamSeason', { season: motm.season })
                  : t('kader.stats.motmTeam')
                : motm?.season
                  ? t('kader.stats.motmSeason', { season: motm.season })
                  : t('kader.stats.motm')
            }
          >
            <Card>
              {motmTop.map((entry, index) => (
                <RankRow
                  key={entry.userId}
                  rank={index + 1}
                  name={entry.name}
                  avatarUrl={entry.avatarUrl}
                  value={t('kader.stats.awards', { count: entry.count })}
                  highlighted={entry.userId === user?.id}
                  first={index === 0}
                />
              ))}
            </Card>
          </Section>
        ) : null}

        {motmMatches.length > 0 ? (
          <Section title={t('kader.stats.motmByMatch')}>
            <Card>
              {motmMatches.map((match, index) => (
                <View
                  key={match.matchId}
                  style={[
                    styles.row,
                    index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text variant="body" color="primary">
                      {match.motmName}
                    </Text>
                    <Text variant="footnote" color="secondary">
                      {t('kader.stats.versus', {
                        opponent: match.opponentName,
                        date: formatDayMonth(match.kickoffAt, locale),
                      })}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function Section({
  title,
  footer,
  children,
}: {
  title: string
  footer?: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <Text variant="footnote" weight="semibold" color="secondary" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
      {footer ? (
        <Text variant="footnote" color="tertiary" style={styles.sectionTitle}>
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  const c = useClubColors()
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>{children}</View>
  )
}

function RankRow({
  rank,
  name,
  avatarUrl,
  value,
  highlighted,
  first,
}: {
  rank: number
  name: string
  avatarUrl: string | null
  value: string
  highlighted: boolean
  first: boolean
}) {
  const c = useClubColors()
  return (
    <View
      accessible
      accessibilityLabel={`${rank}. ${name}, ${value}`}
      style={[
        styles.row,
        !first && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
        highlighted && { backgroundColor: c.surfaceSunken },
      ]}
    >
      <Text variant="subheadline" color={rank === 1 ? 'tint' : 'tertiary'} weight="semibold" tabular style={styles.rank}>
        {rank}
      </Text>
      <Avatar size="md" src={avatarUrl} fallbackText={name} />
      <Text variant="body" weight={highlighted ? 'semibold' : 'regular'} color="primary" numberOfLines={2} style={styles.flex}>
        {name}
      </Text>
      <Text variant="subheadline" color="secondary" tabular>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'],
    gap: space.lg,
  },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: space.md },
  section: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.xs },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm + 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rank: { minWidth: 20, textAlign: 'right' },
  flex: { flex: 1, minWidth: 0 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
})
