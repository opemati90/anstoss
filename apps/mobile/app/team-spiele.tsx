import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import type { ImportedFixture, TableSnapshotRow } from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { DashboardSkeleton } from '../src/components/Skeleton'
import { Screen, SegmentedControl, StatusPill, Text } from '../src/components/ui'
import { hairline, radius, space } from '../src/theme/tokens'
import { isOwnTableRow, ownTeamNameOf, splitFixtures } from '../src/components/squad/fixtureSide'
import { resolveIsTeamCoach } from '../src/components/squad/useIsTeamCoach'

type Tab = 'spiele' | 'tabelle'
type FormResult = 'W' | 'D' | 'L'

/**
 * Spiele & Tabelle — the team's fussball.de fixtures and league table on
 * one screen behind a segmented control. Replaces the unreachable
 * team-matches screen and the floating "table" button that led to a second
 * screen. /league-table redirects here with tab=tabelle.
 */
export default function TeamSpieleScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const { activeClub, activeTeamId, activeTeamAccess, activeRoleMode } = useAuth()
  const params = useLocalSearchParams<{ tab?: string; teamId?: string }>()
  const teamId = (typeof params.teamId === 'string' && params.teamId) || activeTeamId
  // M1: the team role only counts for the team shown here (params.teamId may
  // name another team); otherwise only club owners/admins may link.
  const canLink = resolveIsTeamCoach({
    roleMode: activeRoleMode,
    clubRole: activeClub?.role,
    teamRole: teamId === activeTeamId ? activeTeamAccess?.role : null,
  })
  const [tab, setTab] = useState<Tab>(params.tab === 'tabelle' ? 'tabelle' : 'spiele')
  // Narrow phone or large text: drop the S/U/N columns so the team name
  // keeps its room; numeric columns grow with the font scale so digits
  // never clip.
  const { width, fontScale } = useWindowDimensions()
  const scale = Math.min(Math.max(fontScale, 1), 2)
  const compactTable = width / scale < 380
  const col = { width: Math.round(26 * scale) }
  const wideCol = { width: Math.round(34 * scale) }

  const [upcoming, setUpcoming] = useState<ImportedFixture[]>([])
  const [recent, setRecent] = useState<ImportedFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!teamId) {
      setLoading(false)
      return
    }
    try {
      const [next, past] = await Promise.all([
        api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=upcoming&limit=20`),
        api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=recent&limit=10`),
      ])
      const split = splitFixtures(
        Array.isArray(next) ? next : [],
        Array.isArray(past) ? past : [],
      )
      setUpcoming(split.upcoming)
      setRecent(split.results)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => {
    void load()
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  // Kader fix H3: our side comes from the server (the fixture's own team
  // link, exact match), never from a prefix of the active team's label —
  // which was also wrong whenever params.teamId named another team.
  const ownTeamName = useMemo(() => ownTeamNameOf([...recent, ...upcoming]), [recent, upcoming])

  const form = useMemo<FormResult[]>(
    () =>
      recent
        .filter(
          (f) =>
            f.status === 'finished' &&
            f.resultHome != null &&
            f.resultAway != null &&
            typeof f.isHome === 'boolean',
        )
        .slice(0, 5)
        .map((f) => {
          const home = f.isHome === true
          const own = home ? f.resultHome! : f.resultAway!
          const opp = home ? f.resultAway! : f.resultHome!
          return own > opp ? 'W' : own < opp ? 'L' : 'D'
        }),
    [recent],
  )

  const tableSource = useMemo(
    () => recent.find((f) => Array.isArray(f.tableSnapshot) && f.tableSnapshot.length > 0) ?? null,
    [recent],
  )
  const table = (tableSource?.tableSnapshot ?? []) as TableSnapshotRow[]

  const retry = () => {
    setLoading(true)
    setError(false)
    void load()
  }

  const header = <ModalHeader mode="back" title={t('kader.matches.title')} />

  const body = () => {
    if (loading) return <DashboardSkeleton />
    if (error) {
      return (
        <ErrorState
          message={t('states.team_matches.error.title')}
          hint={t('states.team_matches.error.body')}
          onRetry={retry}
          retryLabel={t('states.common.retry')}
        />
      )
    }
    if (!teamId) {
      return (
        <EmptyState
          icon="figure.soccer"
          title={t('states.team_matches.noTeam.title')}
          description={t('states.team_matches.noTeam.body')}
        />
      )
    }
    if (tab === 'tabelle') {
      if (table.length === 0) {
        return (
          <EmptyState icon="chart.bar" title={t('matches.tableEmpty')} description={t('matches.tableEmptyBody')} />
        )
      }
      return (
        <View style={styles.block}>
          {tableSource?.competition ? (
            <Text variant="footnote" weight="semibold" color="secondary" style={styles.caption}>
              {tableSource.competition}
            </Text>
          ) : null}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            <View style={[styles.tableRow, { borderBottomColor: c.borderSubtle }]}>
              <View style={styles.placeCol}>
                <View style={styles.zone} />
                <Text variant="caption1" color="tertiary" tabular>
                  #
                </Text>
              </View>
              <Text variant="caption1" color="tertiary" style={styles.teamCol}>
                {t('matches.colTeam')}
              </Text>
              {(compactTable ? (['colP'] as const) : (['colP', 'colW', 'colD', 'colL'] as const)).map(
                (key) => (
                  <Text key={key} variant="caption1" color="tertiary" tabular style={[styles.numCol, col]}>
                    {t(`matches.${key}`)}
                  </Text>
                ),
              )}
              <Text variant="caption1" color="tertiary" tabular style={[styles.numCol, wideCol]}>
                {t('matches.colGD')}
              </Text>
              <Text variant="caption1" color="tertiary" tabular style={[styles.ptsCol, wideCol]}>
                {t('matches.colPts')}
              </Text>
            </View>
            {table.map((row, index) => {
              const own = isOwnTableRow(row.team, ownTeamName)
              return (
                <View
                  key={`${row.place}-${index}`}
                  accessible
                  accessibilityLabel={t('kader.matches.tableRowA11y', {
                    place: row.place,
                    team: row.team,
                    points: row.points,
                    games: row.games,
                  })}
                  style={[
                    styles.tableRow,
                    index < table.length - 1 && { borderBottomColor: c.borderSubtle },
                    own && { backgroundColor: c.surfaceSunken },
                  ]}
                >
                  <View style={styles.placeCol}>
                    <View
                      style={[
                        styles.zone,
                        row.isPromotion && { backgroundColor: c.success },
                        row.isRelegation && { backgroundColor: c.error },
                      ]}
                    />
                    <Text variant="footnote" weight={own ? 'bold' : 'regular'} color="primary" tabular>
                      {row.place}
                    </Text>
                  </View>
                  <View style={[styles.teamCol, styles.teamCell]}>
                    {row.img ? <Image source={{ uri: row.img }} style={styles.logo} /> : null}
                    <Text
                      variant="footnote"
                      weight={own ? 'bold' : 'regular'}
                      color={own ? 'tint' : 'primary'}
                      numberOfLines={1}
                      style={styles.flex}
                    >
                      {row.team}
                    </Text>
                  </View>
                  {(compactTable ? [row.games] : [row.games, row.won, row.draw, row.lost]).map((value, i) => (
                    <Text key={i} variant="footnote" color="secondary" tabular style={[styles.numCol, col]}>
                      {value}
                    </Text>
                  ))}
                  <Text variant="footnote" color="secondary" tabular style={[styles.numCol, wideCol]}>
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </Text>
                  <Text
                    variant="footnote"
                    weight="bold"
                    color={own ? 'tint' : 'primary'}
                    tabular
                    style={[styles.ptsCol, wideCol]}
                  >
                    {row.points}
                  </Text>
                </View>
              )
            })}
          </View>
          {table.some((r) => r.isPromotion || r.isRelegation) ? (
            <View style={styles.legend}>
              {table.some((r) => r.isPromotion) ? (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: c.success }]} />
                  <Text variant="footnote" color="secondary">
                    {t('matches.promotion')}
                  </Text>
                </View>
              ) : null}
              {table.some((r) => r.isRelegation) ? (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: c.error }]} />
                  <Text variant="footnote" color="secondary">
                    {t('matches.relegation')}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )
    }

    if (upcoming.length === 0 && recent.length === 0) {
      return (
        <EmptyState
          icon="figure.soccer"
          title={t('states.team_matches.empty.title')}
          description={canLink ? t('kader.matches.emptyCoachBody') : t('kader.matches.emptyBody')}
          actionLabel={canLink ? t('kader.matches.linkCta') : undefined}
          onAction={canLink ? () => router.push('/fussball-link') : undefined}
        />
      )
    }

    return (
      <View style={styles.block}>
        {form.length > 0 ? (
          <View style={styles.formRow}>
            <Text variant="footnote" weight="semibold" color="secondary">
              {t('matches.form')}
            </Text>
            <View style={styles.formBadges}>
              {form.map((result, i) => (
                <StatusPill
                  key={i}
                  label={t(result === 'W' ? 'matches.colW' : result === 'L' ? 'matches.colL' : 'matches.colD')}
                  tone={result === 'W' ? 'success' : result === 'L' ? 'error' : 'neutral'}
                />
              ))}
            </View>
          </View>
        ) : null}
        {upcoming.length > 0 ? (
          <FixtureGroup title={t('matches.upcoming')} fixtures={upcoming} locale={locale} />
        ) : null}
        {recent.length > 0 ? (
          <FixtureGroup title={t('matches.recent')} fixtures={recent} locale={locale} />
        ) : null}
      </View>
    )
  }

  return (
    <Screen header={header} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl<Tab>
          segments={[
            { key: 'spiele', label: t('kader.matches.tabMatches'), testID: 'team-spiele-tab-matches' },
            { key: 'tabelle', label: t('kader.matches.tabTable'), testID: 'team-spiele-tab-table' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {body()}
      </ScrollView>
    </Screen>
  )
}

function FixtureGroup({
  title,
  fixtures,
  locale,
}: {
  title: string
  fixtures: ImportedFixture[]
  locale: string
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View style={styles.group}>
      <Text variant="footnote" weight="semibold" color="secondary" style={styles.caption}>
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        {fixtures.map((fixture, index) => {
          const kickoff = new Date(fixture.kickoffAt)
          const date = new Intl.DateTimeFormat(locale, {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
          }).format(kickoff)
          const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', hourCycle: 'h23', minute: '2-digit' }).format(kickoff)
          const hasResult = fixture.resultHome != null && fixture.resultAway != null
          // Unknown side: show both names and no Heim/Auswärts claim.
          const side = typeof fixture.isHome === 'boolean' ? fixture.isHome : null
          const opponent =
            side === null ? `${fixture.homeTeam} – ${fixture.awayTeam}` : side ? fixture.awayTeam : fixture.homeTeam
          return (
            <Pressable
              key={fixture.id}
              accessibilityRole="button"
              accessibilityLabel={[
                `${fixture.homeTeam} – ${fixture.awayTeam}`,
                hasResult ? `${fixture.resultHome}:${fixture.resultAway}` : `${date}, ${time}`,
                fixture.competition,
              ].join(', ')}
              onPress={() =>
                router.push({
                  pathname: '/match-detail',
                  params: { fixtureId: fixture.id, teamId: fixture.teamId },
                })
              }
              style={({ pressed }) => [
                styles.fixture,
                index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                pressed && { backgroundColor: c.surfaceSunken },
              ]}
            >
              <View style={styles.flex}>
                <Text variant="footnote" color="secondary" tabular>
                  {hasResult ? date : `${date} · ${time}`}
                </Text>
                <Text variant="body" weight="semibold" color="primary" numberOfLines={2}>
                  {opponent}
                </Text>
                <Text variant="footnote" color="secondary">
                  {[
                    side === null ? null : side ? t('kader.matches.home') : t('kader.matches.away'),
                    fixture.competition,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {hasResult ? (
                <Text variant="headline" weight="bold" color="primary" tabular>
                  {`${fixture.resultHome}:${fixture.resultAway}`}
                </Text>
              ) : fixture.status === 'live' ? (
                <StatusPill label={t('fussball.status.live')} tone="error" />
              ) : null}
            </Pressable>
          )
        })}
      </View>
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
  flex: { flex: 1, minWidth: 0 },
  block: { gap: space.lg },
  group: { gap: space.sm },
  caption: { paddingHorizontal: space.xs },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  formBadges: { flexDirection: 'row', gap: space.xs },
  fixture: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  tableRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingRight: space.sm,
    borderBottomWidth: hairline,
    borderBottomColor: 'transparent',
  },
  placeCol: { minWidth: 36, flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  zone: { width: 3, alignSelf: 'stretch' },
  teamCol: { flex: 1, minWidth: 0 },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  logo: { width: 16, height: 16, borderRadius: radius.sm },
  numCol: { textAlign: 'center' },
  ptsCol: { textAlign: 'right' },
  legend: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendDot: { width: 8, height: 8, borderRadius: radius.full },
})
