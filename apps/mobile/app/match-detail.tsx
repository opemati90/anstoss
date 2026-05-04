/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  RefreshControl,
} from 'react-native'
import type {
  FixtureLineup,
  FixtureLineupSide,
  ImportedFixture,
  TableSnapshotRow,
} from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { Screen, Text } from '../src/components/ui'
import {
  MatchHero,
  MatchSegmentControl,
  TimelineItem,
  StatRow,
  FormationPitch,
  MotmSheet,
  type MatchStatus,
  type MotmTally,
} from '../src/components/match'
import type { RosterOpsMemberSummary, RosterOpsSnapshot } from '@anstoss/shared'
import { useMatchTokens } from '../src/theme/matchTokens'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { hairline, space } from '../src/theme/tokens'

type Tab = 'timeline' | 'lineup' | 'stats'

export default function MatchDetailScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const tokens = useMatchTokens()
  const { fixtureId, teamId } = useLocalSearchParams<{
    fixtureId: string
    teamId: string
  }>()
  const locale = getAppLocale(getAppLanguage())

  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<Tab>('timeline')
  const [motmOpen, setMotmOpen] = useState(false)
  const [motmTally, setMotmTally] = useState<MotmTally | null>(null)
  const [squad, setSquad] = useState<RosterOpsMemberSummary[]>([])

  const isCoach =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const fetchFixture = useCallback(async () => {
    if (!teamId) return
    try {
      const fixtures = await api<ImportedFixture[]>(
        `/teams/${teamId}/fixtures?scope=all&limit=50`,
      )
      const found = fixtures?.find((f) => f.id === fixtureId)
      if (found) setFixture(found)
    } catch {
      // stale-while-revalidate
    }
  }, [teamId, fixtureId])

  useEffect(() => {
    void fetchFixture()
  }, [fetchFixture])

  useEffect(() => {
    if (!fixture || fixture.status !== 'finished' || !activeClub) return
    let cancelled = false
    ;(async () => {
      try {
        const [tally, snapshot] = await Promise.all([
          api<MotmTally>(`/fixtures/${fixture.id}/motm`).catch(() => null),
          api<RosterOpsSnapshot>(
            `/clubs/${activeClub.club.id}/teams/${fixture.teamId}/roster-ops`,
          ).catch(() => null),
        ])
        if (cancelled) return
        if (tally) setMotmTally(tally)
        if (snapshot) setSquad(snapshot.squad)
      } catch {
        // tolerated
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fixture, activeClub])

  const submitMotmVote = useCallback(
    async (targetUserId: string) => {
      if (!fixture) return
      try {
        const tally = await api<MotmTally>(
          `/fixtures/${fixture.id}/motm/vote`,
          { method: 'POST', body: { userId: targetUserId } },
        )
        if (tally) setMotmTally(tally)
      } catch {
        // tolerated; UI stays on the chosen option
      }
    },
    [fixture],
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchFixture()
    } finally {
      setRefreshing(false)
    }
  }

  const status: MatchStatus = useMemo(() => {
    if (!fixture) return 'scheduled'
    if (fixture.status === 'live') return 'live'
    if (fixture.status === 'finished') return 'final'
    return 'scheduled'
  }, [fixture])

  if (!fixture) {
    return (
      <Screen scroll={false} padded={false} edges={['left', 'right']}>
        <View style={styles.emptyContainer} />
      </Screen>
    )
  }

  const kickoff = new Date(fixture.kickoffAt)
  const dateShort = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(kickoff)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
    kickoff,
  )
  const timeStr = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(kickoff)
  const hasResult = fixture.resultHome != null && fixture.resultAway != null
  const overlay = fixture.overlay
  const fussballUrl =
    typeof fixture.rawPayload?.url === 'string'
      ? (fixture.rawPayload.url as string)
      : null

  const openMaps = () => {
    if (!fixture.pitchAddress) return
    Linking.openURL(
      `https://maps.apple.com/?q=${encodeURIComponent(fixture.pitchAddress)}`,
    )
  }
  const openFussball = () => {
    if (!fussballUrl) return
    Linking.openURL(fussballUrl)
  }

  const stage =
    fixture.season || `${dateShort}, ${timeStr}`

  const segments = [
    { key: 'timeline', label: t('matches.tab.timeline', { defaultValue: 'Time Line' }) },
    { key: 'lineup', label: t('matches.tab.lineup', { defaultValue: 'Lineup' }) },
    { key: 'stats', label: t('matches.tab.stats', { defaultValue: 'Stats' }) },
  ]

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <MatchHero
          home={{ name: fixture.homeTeam, badgeUrl: fixture.homeLogo }}
          away={{ name: fixture.awayTeam, badgeUrl: fixture.awayLogo }}
          status={status}
          scoreHome={hasResult ? fixture.resultHome : null}
          scoreAway={hasResult ? fixture.resultAway : null}
          competition={fixture.competition}
          stage={stage}
          scheduledLabel={`${weekday.slice(0, 3).toUpperCase()} ${timeStr}`}
          onBack={() => router.back()}
        />

        <View style={[styles.card, { backgroundColor: tokens.cardSurface }]}>
          <View style={styles.segmentWrap}>
            <MatchSegmentControl
              segments={segments}
              value={tab}
              onChange={(k) => setTab(k as Tab)}
            />
          </View>

          {tab === 'timeline' && (
            <View style={styles.tabBody}>
              <SectionLabel>
                {t('matches.section.kickoff', { defaultValue: 'Kickoff' })}
              </SectionLabel>
              <View style={styles.kvBlock}>
                <KvRow
                  label={t('matches.tab.kickoffLabel', { defaultValue: 'When' })}
                  value={`${weekday}, ${timeStr}`}
                  valueMono
                />
                {fixture.venueName ? (
                  <>
                    <Divider />
                    <KvRow
                      label={t('matches.tab.venueLabel', { defaultValue: 'Where' })}
                      value={fixture.venueName}
                      hint={fixture.pitchAddress ?? undefined}
                      onPress={fixture.pitchAddress ? openMaps : undefined}
                    />
                    <Divider />
                    <KvRow
                      label={t('matches.tab.carpoolLabel', {
                        defaultValue: 'Carpool',
                      })}
                      value={t('matches.tab.carpoolValue', {
                        defaultValue: 'Open carpool board',
                      })}
                      hint={t('matches.tab.carpoolHint', {
                        defaultValue: 'Offer a ride or claim a seat',
                      })}
                      onPress={() =>
                        router.push({
                          pathname: '/carpool',
                          params: { fixtureId: fixture.id },
                        } as never)
                      }
                    />
                  </>
                ) : null}
                {fixture.competition ? (
                  <>
                    <Divider />
                    <KvRow
                      label={t('matches.tab.leagueLabel', { defaultValue: 'League' })}
                      value={fixture.competition}
                    />
                  </>
                ) : null}
                {isCoach && overlay?.arrivalTime ? (
                  <>
                    <Divider />
                    <KvRow
                      label={t('matches.arrivalTime')}
                      value={new Intl.DateTimeFormat(locale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(overlay.arrivalTime))}
                      valueMono
                    />
                  </>
                ) : null}
                {isCoach && overlay?.meetingPoint ? (
                  <>
                    <Divider />
                    <KvRow
                      label={t('matches.meetingPoint')}
                      value={overlay.meetingPoint}
                    />
                  </>
                ) : null}
                {isCoach && overlay?.kitColor ? (
                  <>
                    <Divider />
                    <KvRow label={t('matches.kitColor')} value={overlay.kitColor} />
                  </>
                ) : null}
              </View>

              <TimelinePlaceholder fixture={fixture} />

              <LeagueSnippet fixture={fixture} />

              {fixture.status === 'finished' ? (
                <Pressable
                  onPress={() => setMotmOpen(true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.cta,
                    { backgroundColor: c.primary },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    variant="footnote"
                    weight="semibold"
                    style={{ color: c.textInverse }}
                  >
                    {motmTally?.myVoteUserId
                      ? t('matches.motmChange', { defaultValue: 'Change MOTM vote' })
                      : t('matches.motmVote', { defaultValue: 'Vote Man of the Match' })}
                  </Text>
                </Pressable>
              ) : null}

              {fussballUrl ? (
                <Pressable
                  onPress={openFussball}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.cta,
                    { backgroundColor: c.textPrimary },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    variant="footnote"
                    weight="semibold"
                    style={{ color: c.textInverse }}
                  >
                    {t('matches.openInFussball', {
                      defaultValue: 'Open in fussball.de',
                    })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {tab === 'lineup' && (
            <View style={styles.tabBody}>
              <LineupTab fixture={fixture} />
            </View>
          )}

          {tab === 'stats' && (
            <View style={styles.tabBody}>
              <StatsTab fixture={fixture} />
            </View>
          )}
        </View>
      </ScrollView>

      <MotmSheet
        visible={motmOpen}
        squad={squad}
        tally={motmTally}
        onVote={submitMotmVote}
        onClose={() => setMotmOpen(false)}
      />
    </Screen>
  )
}

function TimelinePlaceholder({ fixture }: { fixture: ImportedFixture }) {
  const { t } = useTranslation()
  const c = useClubColors()
  if (fixture.status !== 'live' && fixture.status !== 'finished') return null
  return (
    <View style={styles.subSection}>
      <SectionLabel>
        {t('matches.section.events', { defaultValue: 'Match events' })}
      </SectionLabel>
      <View style={[styles.empty, { borderColor: c.borderDefault }]}>
        <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
          {t('matches.eventsEmpty', {
            defaultValue:
              'Match events will appear here once we sync them from fussball.de.',
          })}
        </Text>
      </View>
    </View>
  )
}

function LineupTab({ fixture }: { fixture: ImportedFixture }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [lineup, setLineup] = useState<FixtureLineup | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api<FixtureLineup>(`/fixtures/${fixture.id}/lineup`)
      .then((data) => {
        if (!cancelled) setLineup(data)
      })
      .catch(() => {
        if (!cancelled) setLineup(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fixture.id])

  if (loading) {
    return <View style={[styles.empty, { borderColor: c.borderDefault }]} />
  }

  if (!lineup || lineup.status !== 'available' || (!lineup.home && !lineup.away)) {
    return (
      <View style={styles.subSection}>
        <View style={[styles.empty, { borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            {t('matches.lineupEmpty', {
              defaultValue:
                'Lineups appear here as soon as fussball.de publishes the squad.',
            })}
          </Text>
        </View>
      </View>
    )
  }

  const players = [
    ...sideToPlayers(lineup.home, 'home'),
    ...sideToPlayers(lineup.away, 'away'),
  ]

  return (
    <View style={styles.subSection}>
      <FormationPitch
        homeName={fixture.homeTeam}
        awayName={fixture.awayTeam}
        homeBadge={fixture.homeLogo}
        awayBadge={fixture.awayLogo}
        homeFormation={lineup.home?.formation ?? '4-3-3'}
        awayFormation={lineup.away?.formation ?? '4-3-3'}
        players={players}
      />
      {(lineup.home?.bench.length || lineup.away?.bench.length) ? (
        <View style={styles.benchBlock}>
          <SectionLabel>
            {t('matches.section.bench', { defaultValue: 'Bench' })}
          </SectionLabel>
          <View style={styles.benchRow}>
            <BenchCol title={fixture.homeTeam} side={lineup.home} />
            <BenchCol title={fixture.awayTeam} side={lineup.away} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function sideToPlayers(
  side: FixtureLineupSide | null,
  team: 'home' | 'away',
): Array<{ number: number; name: string; depth: number; lateral: number; side: 'home' | 'away' }> {
  if (!side) return []
  return side.starters.map((p) => ({
    number: p.number,
    name: p.name,
    depth: p.depth,
    lateral: p.lateral,
    side: team,
  }))
}

function BenchCol({ title, side }: { title: string; side: FixtureLineupSide | null }) {
  const c = useClubColors()
  if (!side) return null
  return (
    <View style={styles.benchCol}>
      <Text variant="caption2" color="tertiary" style={styles.benchHead}>
        {title.toUpperCase()}
      </Text>
      {side.bench.map((p) => (
        <View key={`${title}-${p.number}-${p.name}`} style={styles.benchItem}>
          <Text
            variant="caption1"
            color="tertiary"
            tabular
            style={[styles.benchNumber, { color: c.textSecondary }]}
          >
            {p.number}
          </Text>
          <Text variant="footnote" color="primary" numberOfLines={1}>
            {p.name}
          </Text>
        </View>
      ))}
    </View>
  )
}

function StatsTab({ fixture }: { fixture: ImportedFixture }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const stats = extractStats(fixture)
  if (!stats.length) {
    return (
      <View style={styles.subSection}>
        <View style={[styles.empty, { borderColor: c.borderDefault }]}>
          <Text
            variant="footnote"
            color="secondary"
            style={{ textAlign: 'center' }}
          >
            {t('matches.statsEmpty', {
              defaultValue: 'Stats will be available after kick-off.',
            })}
          </Text>
        </View>
      </View>
    )
  }
  return (
    <View style={styles.subSection}>
      {stats.map((s) => (
        <StatRow
          key={s.label}
          label={s.label}
          home={s.home}
          away={s.away}
          numeric={s.numeric}
        />
      ))}
    </View>
  )
}

function extractStats(fixture: ImportedFixture): {
  label: string
  home: number | string
  away: number | string
  numeric?: boolean
}[] {
  const raw = fixture.rawPayload as Record<string, unknown>
  const statsBag = (raw?.stats as Record<string, [number, number]>) || null
  if (!statsBag) return []
  return Object.entries(statsBag).map(([k, v]) => ({
    label: k,
    home: v[0],
    away: v[1],
    numeric: true,
  }))
}

function LeagueSnippet({ fixture }: { fixture: ImportedFixture }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const hasTable = fixture.tableSnapshot && (fixture.tableSnapshot as unknown[]).length > 0
  if (!hasTable) return null
  const rows = windowAroundFixture(
    fixture.tableSnapshot as TableSnapshotRow[],
    fixture.homeTeam,
    fixture.awayTeam,
  )
  return (
    <View style={styles.subSection}>
      <SectionLabel>
        {t('matches.section.league', { defaultValue: 'League' })}
        {fixture.competition ? ` · ${fixture.competition}` : ''}
      </SectionLabel>
      <View style={[styles.tableHead, { borderBottomColor: c.borderDefault }]}>
        <Text variant="caption2" color="tertiary" style={styles.tablePos}>
          #
        </Text>
        <Text variant="caption2" color="tertiary" style={styles.tableTeam}>
          {t('matches.colTeam', { defaultValue: 'Club' })}
        </Text>
        <Text variant="caption2" color="tertiary" style={styles.tableNum}>
          {t('matches.colP', { defaultValue: 'P' })}
        </Text>
        <Text variant="caption2" color="tertiary" style={styles.tableNum}>
          {t('matches.colGD', { defaultValue: 'GD' })}
        </Text>
        <Text variant="caption2" color="tertiary" style={styles.tableNum}>
          {t('matches.colPts', { defaultValue: 'Pts' })}
        </Text>
      </View>
      {rows.map((row, i, arr) => {
        const mine = row.team === fixture.homeTeam || row.team === fixture.awayTeam
        return (
          <View key={`${row.place}-${row.team}`}>
            <View style={styles.tableRow}>
              <Text
                variant="footnote"
                color={mine ? c.primary : 'secondary'}
                weight={mine ? 'bold' : 'regular'}
                tabular
                style={styles.tablePos}
              >
                {row.place}
              </Text>
              <Text
                variant="footnote"
                color="primary"
                weight={mine ? 'semibold' : 'regular'}
                numberOfLines={1}
                style={styles.tableTeam}
              >
                {row.team}
              </Text>
              <Text
                variant="footnote"
                color="secondary"
                tabular
                style={styles.tableNum}
              >
                {row.games}
              </Text>
              <Text
                variant="footnote"
                color="secondary"
                tabular
                style={styles.tableNum}
              >
                {row.goalDifference > 0 ? '+' : ''}
                {row.goalDifference}
              </Text>
              <Text
                variant="footnote"
                color={mine ? c.primary : 'primary'}
                weight={mine ? 'bold' : 'semibold'}
                tabular
                style={styles.tableNum}
              >
                {row.points}
              </Text>
            </View>
            {i < arr.length - 1 ? <Divider /> : null}
          </View>
        )
      })}
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/league-table',
            params: { teamId: fixture.teamId },
          })
        }
        accessibilityRole="button"
        style={styles.viewAll}
      >
        <Text variant="footnote" weight="semibold" color={c.primary}>
          {t('matches.viewTable', { defaultValue: 'View full table' })} →
        </Text>
      </Pressable>
    </View>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="caption2"
      tracking="wide"
      weight="semibold"
      color="tertiary"
      style={styles.sectionLabel}
    >
      {String(children).toUpperCase()}
    </Text>
  )
}

function KvRow({
  label,
  value,
  valueMono,
  hint,
  onPress,
}: {
  label: string
  value: string
  valueMono?: boolean
  hint?: string
  onPress?: () => void
}) {
  const Wrap = onPress ? Pressable : View
  return (
    <Wrap
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label} ${value}` : undefined}
      style={({ pressed }: { pressed?: boolean } = {}) => [
        styles.kvRow,
        pressed && onPress ? { opacity: 0.55 } : null,
      ]}
    >
      <Text variant="footnote" color="secondary" style={styles.kvLabel}>
        {label}
      </Text>
      <View style={styles.kvValueWrap}>
        <Text
          variant="footnote"
          weight="semibold"
          color="primary"
          tabular={valueMono}
          numberOfLines={1}
        >
          {value}
        </Text>
        {hint ? (
          <Text variant="caption2" color="tertiary" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Wrap>
  )
}

function Divider() {
  const c = useClubColors()
  return <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
}

function windowAroundFixture(
  rows: TableSnapshotRow[] | null,
  homeTeam: string,
  awayTeam: string,
): TableSnapshotRow[] {
  if (!rows || rows.length === 0) return []
  const idx = rows.findIndex((r) => r.team === homeTeam || r.team === awayTeam)
  if (idx < 0) return rows.slice(0, 5)
  const start = Math.max(0, idx - 2)
  const end = Math.min(rows.length, start + 5)
  return rows.slice(end - 5, end)
}

void TimelineItem // reserved for live event injection

const styles = StyleSheet.create({
  emptyContainer: { flex: 1 },
  scroll: { paddingBottom: space['2xl'] },

  card: {
    flex: 1,
    paddingTop: space.md,
  },
  segmentWrap: {
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  tabBody: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.lg,
  },

  subSection: { gap: space.sm },

  sectionLabel: {
    letterSpacing: 1.4,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  kvBlock: {
    paddingHorizontal: 2,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    gap: space.md,
  },
  kvLabel: { flex: 1 },
  kvValueWrap: { flexShrink: 1, alignItems: 'flex-end', gap: 2 },
  divider: { height: hairline },

  empty: {
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: 14,
    borderWidth: hairline,
    borderStyle: 'dashed',
  },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
    borderBottomWidth: hairline,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  tablePos: { width: 24, textAlign: 'left' },
  tableTeam: { flex: 1 },
  tableNum: { width: 36, textAlign: 'right' },

  viewAll: { paddingTop: space.sm, paddingBottom: space.xs },

  benchBlock: { gap: space.xs },
  benchRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  benchCol: { flex: 1, gap: 4 },
  benchHead: {
    letterSpacing: 1.2,
    paddingBottom: 4,
  },
  benchItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    paddingVertical: 4,
  },
  benchNumber: { width: 28 },

  cta: {
    paddingVertical: space.md,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
})