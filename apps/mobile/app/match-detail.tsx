import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import type {
  FixtureLineup,
  FixtureLineupSide,
  FixtureTimelineEvent,
  FixtureTimelineState,
  ImportedFixture,
  TableSnapshotRow,
} from '@anstoss/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { Screen, Text, Button } from '../src/components/ui'
import { ModalHeader } from '../src/components/ModalHeader'
import { isFeatureEnabled } from '../src/utils/featureFlags'
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
import type {
  MatchFacts,
  MatchComparisonMetricKey,
  RosterOpsMemberSummary,
  RosterOpsSnapshot,
} from '@anstoss/shared'
import { useMatchTokens } from '../src/theme/matchTokens'
import { TEXT_WHITE } from '../src/theme/colors'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { elevation, fonts, hairline, radius, space } from '../src/theme/tokens'

type Tab = 'timeline' | 'lineup' | 'stats' | 'facts'

type LiveTickerEvent = FixtureTimelineEvent
type LiveTickerState = FixtureTimelineState

/**
 * Shape returned by GET /fixtures/:fixtureId/enrichment.
 * Returns null when the scraper sidecar isn't configured or its
 * circuit breaker is open — UI degrades to "live ticker only".
 */
type ScraperEnrichmentEvent = {
  time: string
  type: string
  team: string
  description: string | null
  score: string | null
}

type ScraperEnrichment = {
  location: string | null
  locationUrl: string | null
  events: ScraperEnrichmentEvent[] | null
  homeScore: string | null
  awayScore: string | null
  status: string | null
}

const SCRAPER_TYPE_TO_KIND: Record<string, LiveTickerEvent['kind']> = {
  goal: 'goal',
  'yellow-card': 'yellow',
  'red-card': 'red',
  substitution: 'sub',
  'own-goal': 'own_goal',
  penalty: 'pen',
}

function parseScraperMinute(time: string): number {
  // "43’" / "43'" / "90+1’" — pull the leading integer for sort order.
  const match = String(time || '').match(/(\d{1,3})/)
  if (!match) return 0
  const n = Number.parseInt(match[1], 10)
  return Number.isFinite(n) ? n : 0
}

function normalizeTeamLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\-_.]+/g, ' ')
    .replace(/[^a-z0-9äöüß ]/g, '')
    .trim()
}

function resolveScraperSide(
  team: string,
  fixture: ImportedFixture,
): LiveTickerEvent['side'] | null {
  const raw = team.trim().toLowerCase()
  if (raw === 'home' || raw === 'heim') return 'home'
  if (raw === 'away' || raw === 'guest' || raw === 'gast') return 'away'

  const normalized = normalizeTeamLabel(team)
  if (!normalized) return null
  const home = normalizeTeamLabel(fixture.homeTeam)
  const away = normalizeTeamLabel(fixture.awayTeam)
  const matchesHome =
    normalized === home ||
    (normalized.length > 3 && home.includes(normalized)) ||
    (home.length > 3 && normalized.includes(home))
  const matchesAway =
    normalized === away ||
    (normalized.length > 3 && away.includes(normalized)) ||
    (away.length > 3 && normalized.includes(away))
  if (matchesHome === matchesAway) return null
  return matchesHome ? 'home' : 'away'
}

function scraperEnrichmentToEvents(
  enrichment: ScraperEnrichment | null,
  fixture: ImportedFixture,
): LiveTickerEvent[] {
  if (!enrichment?.events?.length) return []
  const out: LiveTickerEvent[] = []
  enrichment.events.forEach((ev, index) => {
    const kind = SCRAPER_TYPE_TO_KIND[ev.type]
    if (!kind) return
    const side = resolveScraperSide(ev.team, fixture)
    if (!side) return
    const minute = parseScraperMinute(ev.time)
    // For subs the upstream ships "PlayerA für PlayerB" in description.
    // Split that into player (the one coming on) + detail (off).
    let player = ev.description ?? ''
    let detail: string | undefined = ev.score ?? undefined
    if (kind === 'sub' && ev.description?.includes(' für ')) {
      const [onPlayer, offPlayer] = ev.description.split(' für ').map((s) => s.trim())
      player = onPlayer
      detail = offPlayer ? `Off: ${offPlayer}` : undefined
    }
    out.push({
      id: `scraper-${minute}-${kind}-${index}`,
      minute,
      kind,
      player: player || (kind === 'goal' ? 'Goal' : ''),
      detail,
      side,
    })
  })
  return out
}

function dedupeEvents(events: LiveTickerEvent[]): LiveTickerEvent[] {
  // De-dupe by minute + kind + first 24 chars of player name. Live
  // ticker entries usually win over scraper entries because they're
  // entered while the match is in motion; we sort live first.
  const seen = new Set<string>()
  const out: LiveTickerEvent[] = []
  for (const ev of events) {
    const key = `${ev.minute}|${ev.kind}|${(ev.player || '').slice(0, 24).toLowerCase()}|${ev.side}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ev)
  }
  return out
}

export default function MatchDetailScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const tokens = useMatchTokens()
  const { fixtureId, teamId, tab: tabParam } = useLocalSearchParams<{
    fixtureId: string
    teamId: string
    tab?: string
  }>()
  const locale = getAppLocale(getAppLanguage())

  const [fixture, setFixture] = useState<ImportedFixture | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Deep-linkable initial tab (?tab=facts) so a push/notification can land the
  // user straight on a specific segment.
  const [tab, setTab] = useState<Tab>(
    tabParam === 'facts' || tabParam === 'lineup' || tabParam === 'stats'
      ? (tabParam as Tab)
      : 'timeline',
  )
  const [motmOpen, setMotmOpen] = useState(false)
  const [motmTally, setMotmTally] = useState<MotmTally | null>(null)
  const [live, setLive] = useState<LiveTickerState | null>(null)
  const [enrichment, setEnrichment] = useState<ScraperEnrichment | null>(null)
  const [facts, setFacts] = useState<MatchFacts | null>(null)
  const [squad, setSquad] = useState<RosterOpsMemberSummary[]>([])

  const isCoach =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const fetchFixture = useCallback(async () => {
    if (!teamId) return
    try {
      const fixtures = await api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=all&limit=50`)
      const found = fixtures?.find((f) => f.id === fixtureId)
      if (found) setFixture(found)
    } catch {
      // stale-while-revalidate
    }
  }, [teamId, fixtureId])

  useEffect(() => {
    void fetchFixture()
  }, [fetchFixture])

  // Live ticker — fetch on mount and poll every 8s while the match is
  // live. The mock backend advances the clock + occasionally injects a
  // new event so the UI feels truly live across refetches.
  useEffect(() => {
    if (!fixture) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const fetchLive = async () => {
      try {
        const data = await api<LiveTickerState | null>(`/fixtures/${fixture.id}/timeline`)
        if (cancelled) return
        if (data) setLive(data)
      } catch {
        // tolerated
      }
      if (!cancelled && (live?.status ?? fixture.status) === 'live') {
        timer = setTimeout(fetchLive, 8000)
      }
    }
    void fetchLive()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [fixture, live?.status])

  // Spielbericht enrichment from the scraper sidecar — only fires for
  // finished matches (the post-match report doesn't exist before
  // kickoff and isn't reliable mid-match). When the sidecar isn't
  // configured the API returns null and the timeline falls back to
  // the live ticker alone.
  useEffect(() => {
    if (!fixture) return
    if (fixture.status !== 'finished') return
    if (fixture.provider !== 'api_fussball') return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api<ScraperEnrichment | null>(`/fixtures/${fixture.id}/enrichment`)
        if (!cancelled) setEnrichment(data ?? null)
      } catch {
        if (!cancelled) setEnrichment(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fixture])

  // Match Facts — head-to-head comparison + recent form, computed server-side
  // from the club's own imported fixtures. Independent of the live ticker so it
  // loads for upcoming matches too. Degrades silently (null) when unavailable.
  useEffect(() => {
    if (!fixture) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api<MatchFacts>(`/fixtures/${fixture.id}/facts`)
        if (!cancelled) setFacts(data ?? null)
      } catch {
        if (!cancelled) setFacts(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fixture])

  useEffect(() => {
    if (!fixture || !activeClub) return
    if (fixture.status !== 'finished' && fixture.status !== 'live') return
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
        const tally = await api<MotmTally>(`/fixtures/${fixture.id}/motm/vote`, {
          method: 'POST',
          body: { userId: targetUserId },
        })
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
    if (live?.status === 'live') return 'live'
    if (live?.status === 'final') return 'final'
    if (!fixture) return 'scheduled'
    if (fixture.status === 'live') return 'live'
    if (fixture.status === 'finished') return 'final'
    return 'scheduled'
  }, [fixture, live])

  const liveScoreHome = live?.scoreHome ?? null
  const liveScoreAway = live?.scoreAway ?? null

  if (!fixture) {
    return (
      <Screen
        scroll={false}
        padded={false}
        header={<ModalHeader mode="back" onClose={() => router.back()} />}
      >
        <View style={[styles.emptyContainer, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={c.primary} />
        </View>
      </Screen>
    )
  }

  const kickoff = new Date(fixture.kickoffAt)
  const dateShort = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(kickoff)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(kickoff)
  const timeStr = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(kickoff)
  const hasResult = fixture.resultHome != null && fixture.resultAway != null
  const overlay = fixture.overlay
  const fussballUrl =
    typeof fixture.rawPayload?.url === 'string' ? (fixture.rawPayload.url as string) : null

  // Prefer the scraper-derived address when the imported fixture
  // didn't carry one — the linked public source may not expose pitch addresses,
  // so the scraper enrichment is the only path to a Maps deep-link
  // for most amateur matches.
  const venueAddress = fixture.pitchAddress ?? enrichment?.location ?? null
  const venueMapsUrl = enrichment?.locationUrl ?? null

  const openMaps = () => {
    if (venueMapsUrl) {
      Linking.openURL(venueMapsUrl)
      return
    }
    if (venueAddress) {
      Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(venueAddress)}`)
    }
  }
  const openFussball = () => {
    if (!fussballUrl) return
    Linking.openURL(fussballUrl)
  }

  const stage = fixture.season || `${dateShort}, ${timeStr}`

  const segments = [
    { key: 'timeline', label: t('matches.tab.timeline', { defaultValue: 'Time Line' }) },
    { key: 'facts', label: t('matches.tab.facts', { defaultValue: 'Facts' }) },
    { key: 'lineup', label: t('matches.tab.lineup', { defaultValue: 'Lineup' }) },
    { key: 'stats', label: t('matches.tab.stats', { defaultValue: 'Stats' }) },
  ]

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <MatchHero
          home={{ name: fixture.homeTeam, badgeUrl: fixture.homeLogo }}
          away={{ name: fixture.awayTeam, badgeUrl: fixture.awayLogo }}
          status={status}
          scoreHome={liveScoreHome ?? (hasResult ? fixture.resultHome : null)}
          scoreAway={liveScoreAway ?? (hasResult ? fixture.resultAway : null)}
          minute={live?.status === 'live' ? live.minute : undefined}
          competition={fixture.competition}
          stage={stage}
          scheduledLabel={`${weekday.slice(0, 3).toUpperCase()} ${timeStr}`}
          onBack={() => router.back()}
        />

        {status === 'live' ? (
          <View style={styles.liveCtaWrap}>
            <Button
              label={t('matchDetail.watchLive', {
                defaultValue: 'Watch live ticker',
              })}
              variant="filled"
              fullWidth
              onPress={() =>
                router.push({
                  pathname: '/match-live',
                  params: { fixtureId: fixture.id, teamId },
                })
              }
            />
          </View>
        ) : null}

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
                {fixture.venueName || venueAddress ? (
                  <>
                    <Divider />
                    <KvRow
                      label={t('matches.tab.venueLabel', { defaultValue: 'Where' })}
                      value={fixture.venueName ?? venueAddress ?? ''}
                      hint={venueAddress ?? undefined}
                      onPress={venueAddress || venueMapsUrl ? openMaps : undefined}
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
                    <KvRow label={t('matches.meetingPoint')} value={overlay.meetingPoint} />
                  </>
                ) : null}
                {isCoach && overlay?.kitColor ? (
                  <>
                    <Divider />
                    <KvRow label={t('matches.kitColor')} value={overlay.kitColor} />
                  </>
                ) : null}
              </View>

              <LiveTickerSection fixture={fixture} live={live} enrichment={enrichment} />

              <LeagueSnippet fixture={fixture} />

              {fixture.status === 'finished' || fixture.status === 'live' ? (
                <>
                  {motmTally && motmTally.results.length > 0 ? (
                    <MotmLeaderCard tally={motmTally} c={c} />
                  ) : null}
                  <Pressable
                    onPress={() => setMotmOpen(true)}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.cta,
                      { backgroundColor: c.primary },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text variant="footnote" weight="semibold" style={{ color: c.textInverse }}>
                      {motmTally?.myVoteUserId
                        ? t('matches.motmChange', {
                            defaultValue: 'Change MOTM vote',
                          })
                        : t('matches.motmVote', {
                            defaultValue: 'Vote Man of the Match',
                          })}
                    </Text>
                  </Pressable>
                  {isFeatureEnabled('anstoss.experimentalFeatures') ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/photo-wall',
                          params: { fixtureId: fixture.id },
                        } as never)
                      }
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.cta,
                        styles.ctaGhost,
                        { backgroundColor: c.surface, borderColor: c.borderStrong },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text variant="footnote" weight="semibold" style={{ color: c.textPrimary }}>
                        {t('matches.openPhotoWall', {
                          defaultValue: 'Open photo wall',
                        })}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
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
                  <Text variant="footnote" weight="semibold" style={{ color: c.textInverse }}>
                    {t('matches.openInFussball', {
                      defaultValue: 'Open source page',
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

          {tab === 'facts' && (
            <View style={styles.tabBody}>
              <FactsTab facts={facts} />
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

function LiveTickerSection({
  fixture,
  live,
  enrichment,
}: {
  fixture: ImportedFixture
  live: LiveTickerState | null
  enrichment: ScraperEnrichment | null
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const isLive = live?.status === 'live'
  const isFinal = live?.status === 'final' || fixture.status === 'finished'
  if (!isLive && !isFinal) return null

  // Merge live ticker events (admin-entered, MOTM-quality) with the
  // post-match events imported from the linked public source. Live
  // takes priority because it's authored by people who saw the
  // action; scraper fills gaps the admin didn't enter.
  const liveEvents = live?.events ?? []
  const scraperEvents = scraperEnrichmentToEvents(enrichment, fixture)
  const events = dedupeEvents([...liveEvents, ...scraperEvents]).sort((a, b) => b.minute - a.minute)
  const showsScraperAttribution = isFinal && scraperEvents.length > 0

  return (
    <View style={styles.subSection}>
      <View style={styles.tickerHead}>
        <SectionLabel>{t('matches.section.events', { defaultValue: 'Match events' })}</SectionLabel>
        {isLive ? (
          <View style={[styles.livePulse, { backgroundColor: c.error }]}>
            <View style={[styles.livePulseDot, { backgroundColor: TEXT_WHITE }]} />
            <Text style={styles.livePulseText}>
              {t('matches.liveLabel', {
                defaultValue: "LIVE · {{minute}}'",
                minute: live!.minute,
              })}
            </Text>
          </View>
        ) : null}
      </View>
      {events.length === 0 ? (
        <View style={[styles.empty, { borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            {t('matches.eventsEmpty', {
              defaultValue: 'Events will appear here as the action unfolds.',
            })}
          </Text>
        </View>
      ) : (
        <View
          style={[styles.tickerCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
        >
          {events.map((ev, idx) => (
            <TimelineItem
              key={ev.id}
              minute={ev.minute}
              kind={ev.kind}
              player={ev.player}
              detail={ev.detail}
              side={ev.side}
              isLast={idx === events.length - 1}
            />
          ))}
        </View>
      )}
      {showsScraperAttribution ? (
        <Text variant="caption2" color="tertiary" style={styles.scraperAttribution}>
          {t('matches.scraperAttribution', {
            defaultValue: 'Match events from linked source',
          })}
        </Text>
      ) : null}
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
                'Lineups appear here when the squad is available from the linked source or entered by the coach.',
            })}
          </Text>
        </View>
      </View>
    )
  }

  const players = [...sideToPlayers(lineup.home, 'home'), ...sideToPlayers(lineup.away, 'away')]

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
      {lineup.home?.bench.length || lineup.away?.bench.length ? (
        <View style={styles.benchBlock}>
          <SectionLabel>{t('matches.section.bench', { defaultValue: 'Bench' })}</SectionLabel>
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
          <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
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
        <StatRow key={s.label} label={s.label} home={s.home} away={s.away} numeric={s.numeric} />
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

const FACTS_METRIC_LABELS: Record<MatchComparisonMetricKey, { key: string; def: string }> = {
  games: { key: 'matches.facts.metric.games', def: 'Games' },
  points: { key: 'matches.facts.metric.points', def: 'Points' },
  goalsFor: { key: 'matches.facts.metric.goalsFor', def: 'Goals for' },
  goalsAgainst: { key: 'matches.facts.metric.goalsAgainst', def: 'Goals against' },
}

/**
 * Match Facts — season head-to-head comparison (center-baseline diverging bars,
 * club-accent on the better side) + the linked team's recent form (W/D/L pips).
 * Editorial, club-adaptive, dual-mode via useClubColors. Each section renders
 * only when its data is present.
 */
function FactsTab({ facts }: { facts: MatchFacts | null }) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (!facts || (!facts.comparison && !facts.recentForm)) {
    return (
      <View style={styles.subSection}>
        <View style={[styles.empty, { borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            {t('matches.facts.empty', {
              defaultValue: 'Facts appear once both teams have played league matches.',
            })}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.subSection}>
      {facts.comparison ? (
        <View style={styles.factsBlock}>
          <SectionLabel>
            {t('matches.facts.h2h', { defaultValue: 'Season head-to-head' })}
          </SectionLabel>
          <View style={styles.factsH2hHead}>
            <Text variant="caption1" color="secondary" weight="medium" numberOfLines={1} style={styles.factsTeamL}>
              {facts.comparison.homeTeam}
            </Text>
            <Text variant="caption1" color="secondary" weight="medium" numberOfLines={1} style={styles.factsTeamR}>
              {facts.comparison.awayTeam}
            </Text>
          </View>
          {facts.comparison.metrics.map((m) => {
            const total = m.home + m.away
            const homeShare = total > 0 ? (m.home / total) * 100 : 50
            const awayShare = total > 0 ? (m.away / total) * 100 : 50
            const homeWins = m.higherIsBetter ? m.home >= m.away : m.home <= m.away
            const label = FACTS_METRIC_LABELS[m.key]
            return (
              <View key={m.key} style={styles.factsMetric}>
                <View style={styles.factsRow}>
                  <Text style={[styles.factsNum, styles.factsNumL, { color: c.textPrimary }]} tabular>
                    {m.home}
                  </Text>
                  <View style={styles.factsBars}>
                    <View style={styles.factsBarSideL}>
                      <View
                        style={[
                          styles.factsBar,
                          { width: `${homeShare}%`, backgroundColor: homeWins ? c.primary : c.borderDefault },
                        ]}
                      />
                    </View>
                    <View style={styles.factsBarSideR}>
                      <View
                        style={[
                          styles.factsBar,
                          { width: `${awayShare}%`, backgroundColor: !homeWins ? c.primary : c.borderDefault },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.factsNum, styles.factsNumR, { color: c.textPrimary }]} tabular>
                    {m.away}
                  </Text>
                </View>
                <Text variant="caption2" color="tertiary" style={styles.factsMetricLabel}>
                  {t(label.key, { defaultValue: label.def })}
                </Text>
              </View>
            )
          })}
        </View>
      ) : null}

      {facts.recentForm ? (
        <View style={styles.factsBlock}>
          <SectionLabel>{t('matches.facts.form', { defaultValue: 'Recent form' })}</SectionLabel>
          <View style={styles.factsFormTop}>
            <Text variant="callout" weight="semibold" color="primary" numberOfLines={1} style={styles.factsFormTeam}>
              {facts.recentForm.teamName}
            </Text>
            <Text variant="caption1" color="secondary" tabular>
              {t('matches.facts.points', { defaultValue: '{{count}} pts', count: facts.recentForm.points })}
            </Text>
          </View>
          <View style={styles.factsPips}>
            {facts.recentForm.results.map((r, i) => (
              <View
                key={i}
                style={[
                  styles.factsPip,
                  { backgroundColor: r === 'W' ? c.success : r === 'D' ? c.textTertiary : c.error },
                ]}
              >
                <Text style={[styles.factsPipText, { color: c.textInverse }]}>{r}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {facts.goalTiming ? (
        <View style={styles.factsBlock}>
          <SectionLabel>
            {t('matches.facts.timing', { defaultValue: 'When goals happen' })}
            {` · ${facts.goalTiming.teamName}`}
          </SectionLabel>
          <View style={styles.timingChart}>
            {(() => {
              const max = Math.max(
                1,
                ...facts.goalTiming.bands.flatMap((b) => [b.scored, b.conceded]),
              )
              return facts.goalTiming.bands.map((b) => (
                <View key={b.label} style={styles.timingBand}>
                  <View style={styles.timingBars}>
                    <View
                      style={[
                        styles.timingBar,
                        { height: `${(b.scored / max) * 100}%`, backgroundColor: c.primary },
                      ]}
                    />
                    <View
                      style={[
                        styles.timingBar,
                        { height: `${(b.conceded / max) * 100}%`, backgroundColor: c.borderDefault },
                      ]}
                    />
                  </View>
                  <Text variant="caption2" color="tertiary" style={styles.timingLabel}>
                    {b.label}
                  </Text>
                </View>
              ))
            })()}
          </View>
          <View style={styles.factsLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c.primary }]} />
              <Text variant="caption2" color="secondary">
                {t('matches.facts.scored', { defaultValue: 'Scored' })}
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c.borderDefault }]} />
              <Text variant="caption2" color="secondary">
                {t('matches.facts.conceded', { defaultValue: 'Conceded' })}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {facts.topScorers ? (
        <View style={styles.factsBlock}>
          <SectionLabel>{t('matches.facts.scorers', { defaultValue: 'Top scorers' })}</SectionLabel>
          {[
            { team: facts.topScorers.homeTeam, list: facts.topScorers.home },
            { team: facts.topScorers.awayTeam, list: facts.topScorers.away },
          ].map((grp) => (
            <View key={grp.team} style={styles.scorerGroup}>
              <Text variant="caption1" weight="semibold" color="secondary" numberOfLines={1}>
                {grp.team}
              </Text>
              {grp.list.map((s, i) => (
                <View key={`${s.name}:${i}`} style={[styles.scorerRow, { borderTopColor: c.borderSubtle }]}>
                  <Text variant="callout" color="primary" numberOfLines={1} style={styles.scorerName}>
                    {s.name}
                  </Text>
                  <View style={styles.scorerStats}>
                    <Text style={[styles.scorerGoals, { color: c.primary }]} tabular>
                      {s.goals}
                    </Text>
                    <Text variant="caption2" color="tertiary" tabular>
                      {` · ${t('matches.facts.matchesShort', { defaultValue: '{{count}} apps', count: s.matches })}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
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
              <Text variant="footnote" color="secondary" tabular style={styles.tableNum}>
                {row.games}
              </Text>
              <Text variant="footnote" color="secondary" tabular style={styles.tableNum}>
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

function MotmLeaderCard({ tally, c }: { tally: MotmTally; c: ReturnType<typeof useClubColors> }) {
  const { t } = useTranslation()
  const top = tally.results[0]
  if (!top) return null
  const totalVotes = tally.totalVotes ?? 0
  return (
    <View style={[styles.motmCard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text style={[styles.motmEyebrow, { color: c.textTertiary }]}>
        {t('matches.motmEyebrow', { defaultValue: 'MAN OF THE MATCH · LIVE' })}
      </Text>
      <View style={styles.motmRow}>
        <View style={[styles.motmAvatar, { backgroundColor: c.primary }]}>
          <Text style={styles.motmInit}>
            {top.name
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </Text>
        </View>
        <View style={styles.motmInfo}>
          <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
            {top.name}
          </Text>
          <Text variant="caption2" color="secondary" tabular>
            {t('matches.motmTallyLine', {
              defaultValue: '{{votes}} of {{total}} votes · {{pct}}%',
              votes: top.votes,
              total: totalVotes,
              pct: top.pct,
            })}
          </Text>
        </View>
        <View style={[styles.motmBadge, { backgroundColor: c.primary }]}>
          <Text style={styles.motmBadgeText}>{top.pct}%</Text>
        </View>
      </View>
      <View style={[styles.motmBar, { backgroundColor: c.borderDefault }]}>
        <View style={[styles.motmBarFill, { width: `${top.pct}%`, backgroundColor: c.primary }]} />
      </View>
    </View>
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
  liveCtaWrap: { paddingHorizontal: space.md, paddingTop: space.md },

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

  // ── Match Facts ──
  factsBlock: { paddingBottom: space.sm },
  factsH2hHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  factsTeamL: { flex: 1, textAlign: 'left' },
  factsTeamR: { flex: 1, textAlign: 'right' },
  factsMetric: { marginBottom: space.sm },
  factsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  factsNum: {
    width: 38,
    fontFamily: fonts.data,
    fontSize: 14,
    fontWeight: '600',
  },
  factsNumL: { textAlign: 'right' },
  factsNumR: { textAlign: 'left' },
  factsBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2xs'],
  },
  factsBarSideL: { flex: 1, alignItems: 'flex-end' },
  factsBarSideR: { flex: 1, alignItems: 'flex-start' },
  factsBar: {
    height: 6,
    minWidth: 4,
    borderRadius: radius.full,
  },
  factsMetricLabel: {
    textAlign: 'center',
    marginTop: space['2xs'],
    letterSpacing: 0.3,
  },
  factsFormTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  factsFormTeam: { flex: 1 },
  factsPips: {
    flexDirection: 'row',
    gap: space.xs,
  },
  factsPip: {
    width: 30,
    height: 30,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factsPipText: {
    fontFamily: fonts.data,
    fontSize: 12,
    fontWeight: '700',
  },

  // goal-timing histogram (View-based; no SVG dep)
  timingChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.xs,
    paddingTop: space.xs,
  },
  timingBand: { flex: 1, alignItems: 'center', gap: space['2xs'] },
  timingBars: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space['2xs'],
  },
  timingBar: {
    width: 9,
    minHeight: 2,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  timingLabel: { letterSpacing: 0.2 },
  factsLegend: {
    flexDirection: 'row',
    gap: space.lg,
    marginTop: space.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space['2xs'] },
  legendDot: { width: 9, height: 3, borderRadius: space['2xs'] },

  // top scorers
  scorerGroup: { marginTop: space.sm, gap: space['2xs'] },
  scorerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderTopWidth: hairline,
  },
  scorerName: { flex: 1, marginRight: space.sm },
  scorerStats: { flexDirection: 'row', alignItems: 'baseline' },
  scorerGoals: { fontFamily: fonts.data, fontSize: 14, fontWeight: '600' },

  kvBlock: {
    paddingHorizontal: space['2xs'],
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    gap: space.md,
  },
  kvLabel: { flex: 1 },
  kvValueWrap: { flexShrink: 1, alignItems: 'flex-end', gap: space['2xs'] },
  motmInfo: { flex: 1, gap: space['2xs'] },
  divider: { height: hairline },

  empty: {
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderStyle: 'dashed',
  },

  tickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tickerCard: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
    ...elevation.card,
  },
  scraperAttribution: {
    marginTop: space.xs,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  livePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + space['2xs'],
    paddingHorizontal: space.sm + space['2xs'],
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  livePulseText: {
    fontFamily: fonts.heading,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: TEXT_WHITE,
  },

  motmCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: space.sm,
    ...elevation.card,
  },
  motmEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  motmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space['2xs'],
  },
  motmAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motmInit: {
    fontFamily: fonts.heading,
    color: TEXT_WHITE,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  motmBadge: {
    paddingHorizontal: space.sm + space['2xs'],
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  motmBadgeText: {
    fontFamily: fonts.data,
    color: TEXT_WHITE,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  motmBar: {
    height: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  motmBarFill: {
    height: '100%',
    borderRadius: radius.full,
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
  benchCol: { flex: 1, gap: space.xs },
  benchHead: {
    letterSpacing: 1.2,
    paddingBottom: space.xs,
  },
  benchItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    paddingVertical: space.xs,
  },
  benchNumber: { width: 28 },

  cta: {
    minHeight: 48,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  ctaGhost: {
    borderWidth: hairline,
  },
})
