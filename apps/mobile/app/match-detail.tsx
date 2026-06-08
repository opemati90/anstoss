/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
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
import type { RosterOpsMemberSummary, RosterOpsSnapshot } from '@anstoss/shared'
import { useMatchTokens } from '../src/theme/matchTokens'
import { TEXT_WHITE } from '../src/theme/colors'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { hairline, space } from '../src/theme/tokens'

type Tab = 'timeline' | 'lineup' | 'stats'

type LiveTickerEvent = {
  id: string
  minute: number
  kind: 'goal' | 'sub' | 'yellow' | 'red' | 'pen' | 'own_goal'
  player: string
  detail?: string
  side: 'home' | 'away'
}

type LiveTickerState = {
  status: 'scheduled' | 'live' | 'final'
  minute: number
  scoreHome: number
  scoreAway: number
  events: LiveTickerEvent[]
}

/**
 * Shape returned by GET /integrations/fussball/match/:externalMatchId/enrichment.
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

function scraperEnrichmentToEvents(
  enrichment: ScraperEnrichment | null,
): LiveTickerEvent[] {
  if (!enrichment?.events?.length) return []
  const out: LiveTickerEvent[] = []
  enrichment.events.forEach((ev, index) => {
    const kind = SCRAPER_TYPE_TO_KIND[ev.type]
    if (!kind) return
    const side: LiveTickerEvent['side'] = ev.team === 'away' ? 'away' : 'home'
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
  const [live, setLive] = useState<LiveTickerState | null>(null)
  const [enrichment, setEnrichment] = useState<ScraperEnrichment | null>(null)
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

  // Live ticker — fetch on mount and poll every 8s while the match is
  // live. The mock backend advances the clock + occasionally injects a
  // new event so the UI feels truly live across refetches.
  useEffect(() => {
    if (!fixture) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const fetchLive = async () => {
      try {
        const data = await api<LiveTickerState | null>(
          `/fixtures/${fixture.id}/timeline`,
        )
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
    if (!fixture.externalMatchId) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api<ScraperEnrichment | null>(
          `/integrations/fussball/match/${encodeURIComponent(fixture.externalMatchId)}/enrichment`,
        )
        if (!cancelled) setEnrichment(data ?? null)
      } catch {
        if (!cancelled) setEnrichment(null)
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

  // Prefer the scraper-derived address when the imported fixture
  // didn't carry one — api-fussball.de doesn't expose pitch addresses,
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
      Linking.openURL(
        `https://maps.apple.com/?q=${encodeURIComponent(venueAddress)}`,
      )
    }
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
                    <Text
                      variant="footnote"
                      weight="semibold"
                      style={{ color: c.textInverse }}
                    >
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
                        { backgroundColor: c.surface, borderColor: c.borderStrong, borderWidth: 1.25 },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        variant="footnote"
                        weight="semibold"
                        style={{ color: c.textPrimary }}
                      >
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
  // post-match Spielbericht events scraped from fussball.de. Live
  // takes priority because it's authored by people who saw the
  // action; scraper fills gaps the admin didn't enter.
  const liveEvents = live?.events ?? []
  const scraperEvents = scraperEnrichmentToEvents(enrichment)
  const events = dedupeEvents([...liveEvents, ...scraperEvents]).sort(
    (a, b) => b.minute - a.minute,
  )
  const showsScraperAttribution = isFinal && scraperEvents.length > 0

  return (
    <View style={styles.subSection}>
      <View style={styles.tickerHead}>
        <SectionLabel>
          {t('matches.section.events', { defaultValue: 'Match events' })}
        </SectionLabel>
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
              defaultValue:
                'Events will appear here as the action unfolds.',
            })}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.tickerCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
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
        <Text
          variant="caption2"
          color="tertiary"
          style={styles.scraperAttribution}
        >
          {t('matches.scraperAttribution', {
            defaultValue: 'Match events from fussball.de',
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

function MotmLeaderCard({
  tally,
  c,
}: {
  tally: MotmTally
  c: ReturnType<typeof useClubColors>
}) {
  const { t } = useTranslation()
  const top = tally.results[0]
  if (!top) return null
  const totalVotes = tally.totalVotes ?? 0
  return (
    <View
      style={[
        styles.motmCard,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <Text
        style={[
          styles.motmEyebrow,
          { color: c.textTertiary },
        ]}
      >
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
        <View style={{ flex: 1, gap: 2 }}>
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
        <View
          style={[
            styles.motmBarFill,
            { width: `${top.pct}%`, backgroundColor: c.primary },
          ]}
        />
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

  tickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tickerCard: {
    borderRadius: 14,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  scraperAttribution: {
    marginTop: space.xs,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  livePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  livePulseText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: TEXT_WHITE,
  },

  motmCard: {
    padding: space.md,
    borderRadius: 14,
    borderWidth: hairline,
    gap: 10,
  },
  motmEyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  motmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  motmAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  motmInit: {
    color: TEXT_WHITE,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  motmBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  motmBadgeText: {
    color: TEXT_WHITE,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  motmBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  motmBarFill: {
    height: '100%',
    borderRadius: 2,
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