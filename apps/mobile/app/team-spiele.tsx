import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
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
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { DashboardSkeleton } from '../src/components/Skeleton'
import { Icon, IconButton, Screen, SegmentedControl, StatusPill, Text } from '../src/components/ui'
import { hexToRgba } from '../src/theme/club-theme'
import { goBackOrReplace } from '../src/utils/navigation'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXL,
  SPACING_XXS,
} from '../src/theme/tokens'
import { isOwnTableRow, ownTeamNameOf, splitFixtures } from '../src/components/squad/fixtureSide'
import { resolveIsTeamCoach } from '../src/components/squad/useIsTeamCoach'

type Tab = 'spiele' | 'tabelle'
type FormResult = 'W' | 'D' | 'L'

const ZONE_WIDTH = 3
const FORM_CELL = 16
const ROW_MIN = 50
const FIXTURE_ROW_MIN = 60
const DATE_COL = 76

/**
 * Spiele & Tabelle (design 20 Tabelle) — the team's fussball.de league table
 * and fixtures behind a segmented control. /league-table redirects here
 * with tab=tabelle.
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
  // Numeric columns grow with the font scale so digits never clip; on a
  // narrow phone at large text the Sp column drops so the name keeps room.
  const { width, fontScale } = useWindowDimensions()
  const scale = Math.min(Math.max(fontScale, 1), 2)
  const compactTable = width / scale < 340
  const numCol = { width: Math.round(28 * scale) }
  const placeCol = { width: Math.round(22 * scale) }

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

  // Header: league + season from the fixtures (design: "Kreisliga C" /
  // "… · Saison 26/27"). Region and Staffel are not in the feed.
  const leagueFixture = tableSource ?? recent[0] ?? upcoming[0] ?? null
  const headerTitle = leagueFixture?.competition || t('kader.matches.title')
  const headerSeason = leagueFixture?.season
    ? t('kader.matches.season', { defaultValue: 'Season {{season}}', season: leagueFixture.season })
    : null

  // Source line: fussball.de and when the shown data was last scraped.
  const sourceStamp = useMemo(() => {
    const list = tab === 'tabelle' ? (tableSource ? [tableSource] : []) : [...upcoming, ...recent]
    const latest = list.reduce<number | null>((max, f) => {
      const ts = new Date(f.lastSeenAt).getTime()
      return Number.isFinite(ts) && (max == null || ts > max) ? ts : max
    }, null)
    if (latest == null) return null
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
    }).format(new Date(latest))
  }, [tab, tableSource, upcoming, recent, locale])

  const retry = () => {
    setLoading(true)
    setError(false)
    void load()
  }

  const header = (
    <View style={styles.header}>
      <IconButton
        variant="outlined"
        onPress={() => goBackOrReplace(router, '/')}
        accessibilityLabel={t('common.back')}
      >
        <Icon name="chevron.left" size={20} color="primary" />
      </IconButton>
      <View style={styles.flex}>
        <Text variant="title2" weight="bold" numberOfLines={1} accessibilityRole="header">
          {headerTitle}
        </Text>
        {headerSeason ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {headerSeason}
          </Text>
        ) : null}
      </View>
    </View>
  )

  const footnote = (showFormLegend: boolean) =>
    sourceStamp || showFormLegend ? (
      <Text variant="caption1" color="secondary">
        {[
          showFormLegend
            ? t('kader.matches.formLegend', {
                defaultValue: 'W Win · D Draw · L Loss.',
              })
            : null,
          sourceStamp
            ? t('kader.matches.source', {
                defaultValue: 'Source: fussball.de, updated {{when}}.',
                when: sourceStamp,
              })
            : null,
        ]
          .filter(Boolean)
          .join(' ')}
      </Text>
    ) : null

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
      const hasZones = table.some((r) => r.isPromotion || r.isRelegation)
      return (
        <View style={styles.block}>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            <View style={[styles.tableRow, styles.tableHead, { borderBottomColor: c.borderSubtle }]}>
              <Text variant="caption1" weight="semibold" color="secondary" style={placeCol}>
                #
              </Text>
              <Text variant="caption1" weight="semibold" color="secondary" style={styles.flex}>
                {t('kader.matches.colClub', { defaultValue: 'Club' })}
              </Text>
              {compactTable ? null : (
                <Text variant="caption1" weight="semibold" color="secondary" style={[styles.num, numCol]}>
                  {t('matches.colP')}
                </Text>
              )}
              <Text variant="caption1" weight="semibold" color="secondary" style={[styles.num, numCol]}>
                {t('kader.matches.colDiff', { defaultValue: 'Diff' })}
              </Text>
              <Text variant="caption1" weight="semibold" color="secondary" style={[styles.num, numCol]}>
                {t('matches.colPts')}
              </Text>
            </View>
            {table.map((row, index) => {
              const own = isOwnTableRow(row.team, ownTeamName)
              const nextOwn = isOwnTableRow(table[index + 1]?.team ?? '', ownTeamName)
              const fg = own ? c.onPrimary : c.textPrimary
              const muted = own ? hexToRgba(c.onPrimary, 0.78) : c.textSecondary
              return (
                <Fragment key={`${row.place}-${index}`}>
                  <View
                    accessible
                    accessibilityLabel={t('kader.matches.tableRowA11y', {
                      place: row.place,
                      team: row.team,
                      points: row.points,
                      games: row.games,
                    })}
                    style={[styles.tableRow, own && { backgroundColor: c.primary }]}
                  >
                    {row.isPromotion || row.isRelegation ? (
                      <View
                        style={[
                          styles.zone,
                          { backgroundColor: row.isPromotion ? c.success : c.error },
                        ]}
                      />
                    ) : null}
                    <Text variant="data" style={[styles.place, placeCol, { color: fg }]}>
                      {row.place}
                    </Text>
                    <Text
                      variant="subheadline"
                      weight={own ? 'bold' : 'medium'}
                      numberOfLines={1}
                      style={[styles.flex, { color: fg }]}
                    >
                      {row.team}
                    </Text>
                    {compactTable ? null : (
                      <Text variant="footnote" tabular style={[styles.num, numCol, { color: muted }]}>
                        {row.games}
                      </Text>
                    )}
                    <Text variant="footnote" tabular style={[styles.num, numCol, { color: muted }]}>
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </Text>
                    <Text variant="data" style={[styles.num, styles.points, numCol, { color: fg }]}>
                      {row.points}
                    </Text>
                  </View>
                  {index < table.length - 1 && !own && !nextOwn ? (
                    <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
                  ) : null}
                </Fragment>
              )
            })}
          </View>
          {hasZones ? (
            <View style={styles.legend}>
              {table.some((r) => r.isPromotion) ? (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: c.success }]} />
                  <Text variant="caption1" color="secondary">
                    {t('matches.promotion')}
                  </Text>
                </View>
              ) : null}
              {table.some((r) => r.isRelegation) ? (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: c.error }]} />
                  <Text variant="caption1" color="secondary">
                    {t('matches.relegation')}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {footnote(false)}
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
            <Text variant="label">{t('matches.form')}</Text>
            <FormStrip results={form} />
          </View>
        ) : null}
        {upcoming.length > 0 ? (
          <FixtureGroup title={t('matches.upcoming')} fixtures={upcoming} locale={locale} />
        ) : null}
        {recent.length > 0 ? (
          <FixtureGroup title={t('matches.recent')} fixtures={recent} locale={locale} />
        ) : null}
        {footnote(form.length > 0)}
      </View>
    )
  }

  return (
    <Screen scroll={false} padded={false} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {header}
        <SegmentedControl<Tab>
          segments={[
            { key: 'tabelle', label: t('kader.matches.tabTable'), testID: 'team-spiele-tab-table' },
            { key: 'spiele', label: t('kader.matches.tabMatches'), testID: 'team-spiele-tab-matches' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {body()}
      </ScrollView>
    </Screen>
  )
}

/** The design's form squares: W solid ink, D quiet fill, L outline. */
function FormStrip({ results }: { results: FormResult[] }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const letter = (r: FormResult) =>
    t(r === 'W' ? 'matches.colW' : r === 'L' ? 'matches.colL' : 'matches.colD')
  return (
    <View
      style={styles.formCells}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t('matches.form')}: ${results.map(letter).join(' ')}`}
    >
      {results.map((r, i) => (
        <View
          key={i}
          style={[
            styles.formCell,
            r === 'W'
              ? { backgroundColor: c.ink }
              : r === 'D'
                ? { backgroundColor: c.borderStrong }
                : { borderWidth: 1, borderColor: c.borderControl },
          ]}
        >
          <Text
            variant="caption1"
            weight="bold"
            style={[
              styles.formLetter,
              { color: r === 'W' ? c.onInk : r === 'D' ? c.textPrimary : c.textSecondary },
            ]}
            maxFontSizeMultiplier={1}
          >
            {letter(r)}
          </Text>
        </View>
      ))}
    </View>
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
    <View style={styles.section}>
      <Text variant="label" accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.group, styles.groupPadded, { backgroundColor: c.surface }]}>
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
            side === null
              ? `${fixture.homeTeam} – ${fixture.awayTeam}`
              : side
                ? t('kader.matches.vsOpponent', { defaultValue: 'vs. {{team}}', team: fixture.awayTeam })
                : t('kader.matches.atOpponent', { defaultValue: 'at {{team}}', team: fixture.homeTeam })
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
                index < fixtures.length - 1 && {
                  borderBottomWidth: hairline,
                  borderBottomColor: c.borderSubtle,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text variant="footnote" color="secondary" tabular style={styles.dateCol}>
                {date}
              </Text>
              <Text variant="subheadline" weight="semibold" numberOfLines={2} style={styles.flex}>
                {opponent}
              </Text>
              {fixture.status === 'live' ? (
                <StatusPill label={t('fussball.status.live')} tone="error" />
              ) : null}
              <Text variant="data" style={styles.result}>
                {hasResult ? `${fixture.resultHome}:${fixture.resultAway}` : time}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_XXL * 2,
    gap: SPACING_LG + SPACING_XXS,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  flex: { flex: 1, minWidth: 0 },
  block: { gap: SPACING_LG },
  section: { gap: SPACING_MD },
  group: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  groupPadded: { paddingHorizontal: SPACING_LG },
  tableHead: {
    minHeight: 0,
    paddingTop: SPACING_MD,
    paddingBottom: SPACING_SM,
    borderBottomWidth: hairline,
    marginHorizontal: SPACING_LG,
    paddingHorizontal: 0,
  },
  tableRow: {
    minHeight: ROW_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM + SPACING_XXS,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_SM,
  },
  divider: { height: hairline, marginHorizontal: SPACING_LG },
  zone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: ZONE_WIDTH },
  place: { fontSize: 17, lineHeight: 20 },
  num: { textAlign: 'right' },
  points: { fontSize: 18, lineHeight: 22 },
  legend: { flexDirection: 'row', gap: SPACING_LG, paddingHorizontal: SPACING_XS },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING_XS },
  legendDot: { width: SPACING_SM, height: SPACING_SM, borderRadius: RADIUS_FULL },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  formCells: { flexDirection: 'row', gap: SPACING_XS },
  formCell: {
    width: FORM_CELL,
    height: FORM_CELL,
    borderRadius: SPACING_XS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formLetter: { fontSize: 10, lineHeight: 12 },
  fixture: {
    minHeight: FIXTURE_ROW_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + SPACING_XXS,
    paddingVertical: SPACING_MD,
  },
  dateCol: { width: DATE_COL },
  result: { fontSize: 20, lineHeight: 24 },
})
