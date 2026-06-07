import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  MembershipRole,
  type ClubPublicSummary,
  type CreateExternalTeamLinkInput,
  type ExternalTeamLink,
  type FixtureDataConfidence,
  type FixtureOverlay,
  type FussballTeamPreview,
  type ImportedFixture,
  type ImportedFixtureStatus,
  type SyncRun,
  type TeamFixturesQueryInput,
  type UpdateFixtureLocksInput,
  type UpdateFixtureOverlayInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { TeamsService } from '../teams/teams.service'
import { LiveGateway } from '../live/live.gateway'
import { FussballProviderService } from './fussball.provider'
import { FussballScraperClient, type ScraperGame } from './fussball-scraper.client'
import {
  type ApiFussballGame,
  buildExternalMatchId,
  calculateFormStreak,
  collectFixtureChanges,
  confidenceFromSources,
  extractFussballTeamId,
  inferLinkedTeamPerspective,
  mapTableRows,
  normalizeImportedFixtureStatus,
  parseApiFussballKickoff,
} from './fussball.utils'

const MAX_LIVE_LINKS_PER_CYCLE = 100
const INITIAL_BACKFILL_PAST_DAYS = 30
const INITIAL_BACKFILL_FUTURE_DAYS = 120
const PARSER_VERSION = '2026-03-24.fussball-v1'

type FixtureLike = {
  id: string
  clubId: string
  teamId: string
  teamLinkId: string
  provider: string
  externalMatchId: string
  competition: string
  kickoffAt: Date
  homeTeam: string
  awayTeam: string
  venueName: string | null
  pitchAddress: string | null
  resultHome: number | null
  resultAway: number | null
  status: string
}

type OverlayLike = {
  id: string
  fixtureId: string
  arrivalTime: Date | null
  meetingPoint: string | null
  kitColor: string | null
  travelNotes: string | null
  squadDeadline: Date | null
  veoLink: string | null
  fieldLocks: unknown
  createdAt: Date
  updatedAt: Date
}

type TeamLinkRecord = {
  id: string
  clubId: string
  teamId: string
  provider: string
  externalTeamId: string
  externalClubId: string | null
  externalUrl: string
  label: string
  status: string
  lastSyncedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type NormalizedFixtureSeed = {
  clubId: string
  teamId: string
  teamLinkId: string
  provider: 'API_FUSSBALL'
  externalMatchId: string
  competition: string
  season: string | null
  kickoffAt: string
  status: ImportedFixtureStatus
  homeTeam: string
  awayTeam: string
  homeLogo: string | null
  awayLogo: string | null
  venueName: string | null
  pitchAddress: string | null
  resultHome: number | null
  resultAway: number | null
  tableSnapshot: ReturnType<typeof mapTableRows>
  sourceConfidence: FixtureDataConfidence
  rawPayload: Record<string, unknown>
}

@Injectable()
export class FussballService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly provider: FussballProviderService,
    private readonly scraper: FussballScraperClient,
    private readonly pushService: PushService,
    private readonly liveGateway: LiveGateway,
  ) {}

  /**
   * Match-detail enrichment that the api-fussball.de upstream doesn't
   * cover: venue address, location URL, post-Spielbericht event
   * timeline (goals, cards, subs). Returns `null` when the scraper
   * sidecar isn't configured or the circuit breaker is open — the
   * caller is expected to gracefully degrade.
   */
  async fetchMatchEnrichment(externalMatchId: string): Promise<{
    location: string | null
    locationUrl: string | null
    events: ScraperGame['match_events']
    homeScore: string | null
    awayScore: string | null
    status: string | null
  } | null> {
    if (!this.scraper.isAvailable()) return null
    const game = await this.scraper.getGame(externalMatchId)
    if (!game) return null
    return {
      location: game.location,
      locationUrl: game.location_url,
      events: game.match_events ?? [],
      homeScore: game.home_score,
      awayScore: game.away_score,
      status: game.status,
    }
  }

  /**
   * Authenticated wrapper around `fetchMatchEnrichment`. Looks the
   * fixture up by `externalMatchId`, asserts the caller can read its
   * team, then returns the scraper enrichment. Used by the controller
   * endpoint the mobile match-detail screen calls.
   */
  async fetchMatchEnrichmentForUser(
    userId: string,
    externalMatchId: string,
  ): Promise<Awaited<ReturnType<FussballService['fetchMatchEnrichment']>>> {
    const fixture = await this.prisma.importedFixture.findFirst({
      where: { externalMatchId },
      select: { teamId: true },
    })
    if (fixture) {
      // Reuse the same readable-access guard as every other fixture
      // path so we don't quietly leak match details for teams the
      // user has no relationship with.
      await this.teamsService.assertReadableAccess(userId, fixture.teamId)
    }
    return this.fetchMatchEnrichment(externalMatchId)
  }

  async previewTeamLink(input: string): Promise<FussballTeamPreview> {
    const externalTeamId = extractFussballTeamId(input)
    if (!externalTeamId) {
      throw new BadRequestException(
        'Provide a valid FUSSBALL.DE team URL or team ID',
      )
    }

    const { externalUrl, preview } = await this.provider.fetchTeamPage(input)

    return {
      input,
      provider: 'api_fussball',
      externalTeamId,
      externalUrl,
      label: preview.label,
      competition: preview.competition,
      pitchAddress: preview.pitchAddress,
      sourceConfidence: 'unofficial_public',
    }
  }

  async listTeamLinks(userId: string, teamId: string): Promise<ExternalTeamLink[]> {
    await this.teamsService.assertReadableAccess(userId, teamId)

    const links = await this.prisma.externalTeamLink.findMany({
      where: { teamId },
      orderBy: [{ updatedAt: 'desc' }],
    })

    return links.map((link: any) => serializeLink(link))
  }

  /**
   * Fetch the squad/roster from a linked fussball.de team page. Used by
   * the bulk-invite flow on the admin side: roster comes back, admin
   * picks who they actually have email addresses for, sends in one go.
   *
   * Returns an empty `players: []` when scraping doesn't find anyone —
   * the UI surfaces "we couldn't read the squad page; paste names
   * manually" rather than treating that as an error.
   */
  /**
   * Type-ahead search for clubs on fussball.de via the self-hosted
   * scraper sidecar. Used by the club-create flow to let an admin type
   * "SV Albatros" and pick from real fussball.de hits with logos.
   *
   * Returns [] when:
   *   - query is fewer than 3 characters (avoids hammering the upstream)
   *   - the scraper sidecar isn't configured / circuit breaker is open
   *   - the upstream returned no matches
   *
   * The mobile UI treats all three the same way ("no matches; type
   * more or paste a URL manually").
   */
  async searchFussballClubs(query: string) {
    const trimmed = query.trim()
    if (trimmed.length < 3) {
      return { results: [], available: this.scraper.isConfigured() }
    }
    if (!this.scraper.isAvailable()) {
      return { results: [], available: false }
    }
    const hits = await this.scraper.searchClubs(trimmed)
    return {
      results: hits ?? [],
      available: true,
    }
  }

  /**
   * After search picks a club, list its teams so the admin can choose
   * which to import. Returns null when the sidecar is unavailable —
   * caller falls through to manual team-URL paste.
   */
  async fetchClubTeamsFromScraper(externalClubId: string) {
    if (!this.scraper.isAvailable()) {
      return { available: false, teams: [] }
    }
    const teams = await this.scraper.getClubTeams(externalClubId)
    return {
      available: true,
      teams: teams ?? [],
    }
  }

  async fetchRosterFromTeamLink(
    userId: string,
    teamLinkId: string,
  ) {
    const link = await this.prisma.externalTeamLink.findFirst({
      where: { id: teamLinkId },
    })

    if (!link) {
      throw new NotFoundException('FUSSBALL.DE team link not found')
    }

    await this.teamsService.assertManageAccess(userId, link.teamId)

    // Primary: try the team-page Kader scrape (regex-based on the
    // current SPA HTML — fragile but free).
    const roster = await this.provider.fetchTeamRoster(link.externalTeamId)
    if (roster.players.length > 0) {
      return {
        teamLinkId: link.id,
        externalTeamId: link.externalTeamId,
        externalUrl: link.externalUrl,
        players: roster.players,
        rawCount: roster.rawCount,
        source: 'team_page' as const,
      }
    }

    // Fallback: fussball.de's SPA renders the squad client-side, so
    // the regex scrape regularly returns 0. The lineup of the most
    // recent finished match is effectively the same data — every
    // rostered player gets minutes eventually. Combine starters + bench
    // for the side our linked team played on. This is what
    // api-fussball.de's /match endpoint already gives us, no extra
    // upstream call needed beyond what the fixture sync already did.
    const lineupRoster = await this.fetchRosterFromRecentMatch(link)
    if (lineupRoster) {
      return {
        teamLinkId: link.id,
        externalTeamId: link.externalTeamId,
        externalUrl: link.externalUrl,
        players: lineupRoster,
        rawCount: lineupRoster.length,
        source: 'recent_lineup' as const,
      }
    }

    return {
      teamLinkId: link.id,
      externalTeamId: link.externalTeamId,
      externalUrl: link.externalUrl,
      players: [],
      rawCount: 0,
      source: 'empty' as const,
    }
  }

  /**
   * Last-resort roster: the most recent finished match's lineup. Picks
   * the side whose team name matches our linked label, dedupes by
   * jersey + name, returns the same shape as the page-scrape so the
   * mobile UI doesn't branch on source.
   */
  private async fetchRosterFromRecentMatch(link: {
    id: string
    teamId: string
    label: string | null
    externalTeamId: string
  }): Promise<Array<{
    name: string
    jerseyNumber: number | null
    externalPlayerId: string | null
  }> | null> {
    const recent = await this.prisma.importedFixture.findFirst({
      where: { teamLinkId: link.id, status: 'FINISHED' },
      orderBy: { kickoffAt: 'desc' },
      select: {
        externalMatchId: true,
        homeTeam: true,
        awayTeam: true,
      },
    })
    if (!recent) return null

    const lineup = await this.provider
      .fetchMatchLineup(recent.externalMatchId)
      .catch(() => null)
    if (!lineup) return null

    const linkedLabel = link.label ?? ''
    const perspective = inferLinkedTeamPerspective(
      linkedLabel,
      recent.homeTeam,
      recent.awayTeam,
    )
    const side = perspective.isHome === true
      ? lineup.home
      : perspective.isHome === false
        ? lineup.away
        : null
    if (!side) return null

    const seen = new Set<string>()
    const players: Array<{
      name: string
      jerseyNumber: number | null
      externalPlayerId: string | null
    }> = []
    for (const entry of [...side.starters, ...side.bench]) {
      const name = (entry.name ?? '').trim()
      if (!name) continue
      const jerseyNumber =
        typeof entry.number === 'number' ? entry.number : null
      const dedupeKey = `${jerseyNumber ?? ''}|${name.toLowerCase()}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      players.push({
        name,
        jerseyNumber,
        externalPlayerId: null,
      })
    }
    return players.length > 0 ? players : null
  }

  async createTeamLink(
    userId: string,
    clubId: string | undefined,
    input: CreateExternalTeamLinkInput,
  ) {
    const access = await this.teamsService.assertManageAccess(userId, input.teamId)
    assertClubScope(clubId, access.team.clubId)

    const preview = await this.previewTeamLink(input.input)
    const existing = await this.prisma.externalTeamLink.findFirst({
      where: {
        teamId: input.teamId,
        provider: 'API_FUSSBALL',
        externalTeamId: preview.externalTeamId,
      },
    })

    const persisted = existing
      ? await this.prisma.externalTeamLink.update({
          where: { id: existing.id },
          data: {
            externalUrl: preview.externalUrl,
            label: input.label?.trim() || preview.label,
            status: 'ACTIVE',
          },
        })
      : await this.prisma.externalTeamLink.create({
          data: {
            clubId: access.team.clubId,
            teamId: input.teamId,
            provider: 'API_FUSSBALL',
            externalTeamId: preview.externalTeamId,
            externalClubId: null,
            externalUrl: preview.externalUrl,
            label: input.label?.trim() || preview.label,
            status: 'ACTIVE',
          },
        })

    const sync = await this.syncTeamLink(userId, clubId, persisted.id, true)

    // Auto-seed RosterSlot rows from the fussball.de roster so the admin
    // doesn't have to enter players manually. Slots are claim-able via
    // the existing team-code flow — players who later join match by
    // normalized name and inherit jersey + position. Fire-and-forget;
    // a roster scrape miss must never break team-link creation.
    void this.seedRosterFromTeamLinkAuto(persisted.id).catch(() => undefined)

    return {
      link: serializeLink(persisted),
      sync,
    }
  }

  private async seedRosterFromTeamLinkAuto(teamLinkId: string): Promise<void> {
    const link = await this.prisma.externalTeamLink.findFirst({
      where: { id: teamLinkId },
      select: { id: true, teamId: true, externalTeamId: true, label: true },
    })
    if (!link) return

    let players: Array<{ name: string; jerseyNumber: number | null }> = []
    try {
      const roster = await this.provider.fetchTeamRoster(link.externalTeamId)
      players = (roster.players ?? [])
        .map((p) => ({
          name: typeof p.name === 'string' ? p.name.trim() : '',
          jerseyNumber: typeof p.jerseyNumber === 'number' ? p.jerseyNumber : null,
        }))
        .filter((p) => p.name.length >= 2)
    } catch {
      players = []
    }

    if (players.length === 0) {
      const recent = await this.fetchRosterFromRecentMatch({
        id: link.id,
        teamId: link.teamId,
        label: link.label,
        externalTeamId: link.externalTeamId,
      })
      if (recent) {
        players = recent.map((p) => ({
          name: p.name,
          jerseyNumber: p.jerseyNumber,
        }))
      }
    }

    if (players.length === 0) return

    const existing = await this.prisma.rosterSlot.findMany({
      where: { teamId: link.teamId },
      select: { fullName: true },
    })
    const existingNames = new Set(
      existing.map((s) => s.fullName.trim().toLowerCase()),
    )

    // Within-scrape dedup: api-fussball.de occasionally returns the same
    // player twice across roster pages (e.g. when a player is on both
    // the senior squad and a U-team variant we crawled). RosterSlot has
    // no unique index on (teamId, normalized fullName), so without
    // pre-deduping we'd insert duplicate rows. Keep the first jersey
    // we saw for each name.
    const seenInScrape = new Set<string>()
    const inserts: typeof players = []
    for (const p of players) {
      const key = p.name.toLowerCase()
      if (existingNames.has(key) || seenInScrape.has(key)) continue
      seenInScrape.add(key)
      inserts.push(p)
    }
    if (inserts.length === 0) return

    await this.prisma.rosterSlot.createMany({
      data: inserts.map((p) => ({
        teamId: link.teamId,
        fullName: p.name,
        jerseyNumber: p.jerseyNumber,
      })),
      skipDuplicates: true,
    })
  }

  async syncTeamLink(
    userId: string,
    clubId: string | undefined,
    teamLinkId: string,
    force = false,
  ): Promise<SyncRun> {
    const link = await this.prisma.externalTeamLink.findFirst({
      where: { id: teamLinkId },
    })

    if (!link) {
      throw new NotFoundException('FUSSBALL.DE team link not found')
    }

    await this.teamsService.assertManageAccess(userId, link.teamId)
    assertClubScope(clubId, link.clubId)

    const syncRun = await this.prisma.syncRun.create({
      data: {
        clubId: link.clubId,
        teamLinkId: link.id,
        provider: link.provider,
        status: 'PARTIAL',
        parserVersion: PARSER_VERSION,
      },
    })

    try {
      const { externalUrl, preview } = await this.provider.fetchTeamPage(
        link.externalUrl,
      )
      const bundle = await this.provider.fetchTeamBundle(link.externalTeamId)
      const normalizedFixtures = this.normalizeFixtures(link, preview, bundle)

      let importedCount = 0
      let updatedCount = 0
      let skippedCount = 0

      for (const fixture of normalizedFixtures) {
        const result = await this.upsertImportedFixture(link, preview.label, fixture)

        if (result === 'imported') {
          importedCount += 1
        } else if (result === 'updated') {
          updatedCount += 1
        } else {
          skippedCount += 1
        }
      }

      const completed = await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status:
            importedCount > 0 || updatedCount > 0 || force ? 'SUCCESS' : 'PARTIAL',
          importedCount,
          updatedCount,
          skippedCount,
          completedAt: new Date(),
        },
      })

      await this.prisma.externalTeamLink.update({
        where: { id: link.id },
        data: {
          externalUrl,
          label: preview.label,
          status: 'ACTIVE',
          lastSyncedAt: new Date(),
        },
      })

      return serializeSyncRun(completed)
    } catch (error) {
      const errorSummary =
        error instanceof Error ? error.message : 'Unknown sync failure'

      await this.prisma.externalTeamLink.update({
        where: { id: link.id },
        data: {
          status: 'ERROR',
        },
      })

      const completed = await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'FAILED',
          errorSummary,
          completedAt: new Date(),
        },
      })

      return serializeSyncRun(completed)
    }
  }

  /**
   * Find ACTIVE team links that have a fixture in the live window — kicked off
   * in the last 3h and not finished, or starting within 20min. The live poller
   * uses this to only hit api-fussball.de for teams actually in/near play.
   * Reads run without a clubId context (system path) — that's the intended
   * cross-club sweep; the caller scopes writes per link.
   */
  async findLiveWindowLinks(): Promise<Array<{ id: string; clubId: string }>> {
    const now = Date.now()
    const windowStart = new Date(now - 3 * 60 * 60 * 1000)
    const windowEnd = new Date(now + 20 * 60 * 1000)

    const fixtures = await this.prisma.importedFixture.findMany({
      where: {
        kickoffAt: { gte: windowStart, lte: windowEnd },
        status: { notIn: ['FINISHED', 'CANCELLED'] },
      },
      select: { teamLinkId: true, clubId: true },
      distinct: ['teamLinkId'],
      // Cap upstream fan-out per cycle. Sorting by kickoff keeps the freshest
      // (most likely in-play) matches first when more than the cap are live.
      orderBy: { kickoffAt: 'desc' },
      take: MAX_LIVE_LINKS_PER_CYCLE,
    })

    // NOTE (scale): the poller's overlap guard is process-local. On a single
    // Railway replica (current topology) that's sufficient; if the API is ever
    // scaled to multiple replicas, add a per-link Upstash lock
    // (SET fussball:live:link:{id} NX PX 45000) before refreshLinkFixtures so
    // pods don't all hit api-fussball.de for the same links.
    return fixtures.map((f: { teamLinkId: string; clubId: string }) => ({
      id: f.teamLinkId,
      clubId: f.clubId,
    }))
  }

  /**
   * System/cron path used by the live poller (fussball-live.worker). Re-fetches
   * a linked team's bundle and upserts its fixtures, which triggers the
   * liveGateway broadcasts + GOAL/FINAL push inside upsertImportedFixture on a
   * score/status change. No user auth — the cron has no user — so the CALLER
   * MUST run this inside tenantContext for link.clubId, otherwise the tenant
   * write-guard rejects the ImportedFixture/Event writes.
   */
  async refreshLinkFixtures(linkId: string): Promise<{ updated: number }> {
    const link = await this.prisma.externalTeamLink.findFirst({
      where: { id: linkId },
    })
    if (!link || link.status !== 'ACTIVE') {
      return { updated: 0 }
    }

    const { preview } = await this.provider.fetchTeamPage(link.externalUrl)
    const bundle = await this.provider.fetchTeamBundle(link.externalTeamId)
    const normalizedFixtures = this.normalizeFixtures(link, preview, bundle)

    let updated = 0
    for (const fixture of normalizedFixtures) {
      const result = await this.upsertImportedFixture(link, preview.label, fixture)
      if (result === 'imported' || result === 'updated') {
        updated += 1
      }
    }

    await this.prisma.externalTeamLink.update({
      where: { id: link.id },
      data: { lastSyncedAt: new Date() },
    })

    return { updated }
  }

  async listFixtures(
    userId: string,
    teamId: string,
    query: TeamFixturesQueryInput,
  ): Promise<ImportedFixture[]> {
    await this.teamsService.assertReadableAccess(userId, teamId)

    const now = new Date()
    const where =
      query.scope === 'upcoming'
        ? { teamId, kickoffAt: { gte: now } }
        : query.scope === 'recent'
          ? { teamId, kickoffAt: { lt: now } }
          : { teamId }

    const fixtures = await this.prisma.importedFixture.findMany({
      where,
      include: {
        overlay: true,
      },
      orderBy: {
        kickoffAt: query.scope === 'recent' ? 'desc' : 'asc',
      },
      take: query.limit,
    })

    const eventKeys = fixtures.map((fixture: any) =>
      buildEventKey(fixture.provider, fixture.externalMatchId),
    )

    const events = eventKeys.length
      ? await this.prisma.event.findMany({
          where: {
            teamId,
            externalMatchKey: { in: eventKeys },
          },
          select: {
            id: true,
            externalMatchKey: true,
          },
        })
      : []

    const eventIdByKey = new Map(
      events.map((event: any) => [event.externalMatchKey || '', event.id]),
    )

    return fixtures.map((fixture: any) =>
      serializeFixture(
        fixture,
        (eventIdByKey.get(buildEventKey(fixture.provider, fixture.externalMatchId)) as string) ||
          null,
      ),
    )
  }

  async getFixtureLineup(
    userId: string,
    fixtureId: string,
  ): Promise<import('@anstoss/shared').FixtureLineup> {
    const fixture = await this.prisma.importedFixture.findFirst({
      where: { id: fixtureId },
    })
    if (!fixture) throw new NotFoundException('Imported fixture not found')

    await this.teamsService.assertReadableAccess(userId, fixture.teamId)

    const bundle = await this.provider
      .fetchMatchLineup(fixture.externalMatchId)
      .catch(() => null)

    if (!bundle) {
      return {
        fixtureId: fixture.id,
        externalMatchId: fixture.externalMatchId,
        fetchedAt: new Date().toISOString(),
        status: 'pending',
        home: null,
        away: null,
      }
    }

    // Seed RosterSlot rows for the linked team using the public lineup —
    // public Fussball.de exposes name, jersey, position (no DOB or phone).
    // Fire-and-forget: a seed failure must never break the lineup view.
    void this.seedRosterFromLineup(fixture, bundle).catch(() => undefined)

    return {
      fixtureId: fixture.id,
      externalMatchId: fixture.externalMatchId,
      fetchedAt: new Date().toISOString(),
      status: 'available',
      home: normalizeLineupSide(bundle.home),
      away: normalizeLineupSide(bundle.away),
    }
  }

  /**
   * Idempotent: only inserts new RosterSlot rows. Existing slots (matched by
   * teamId + normalized fullName) are left untouched so admin edits and
   * already-claimed slots are never clobbered.
   */
  private async seedRosterFromLineup(
    fixture: { id: string; teamId: string; teamLinkId: string; homeTeam: string; awayTeam: string },
    bundle: import('./fussball.provider').ApiFussballLineupBundle,
  ): Promise<void> {
    const link = await this.prisma.externalTeamLink.findFirst({
      where: { id: fixture.teamLinkId },
      select: { label: true },
    })
    if (!link) return
    const perspective = inferLinkedTeamPerspective(
      link.label,
      fixture.homeTeam,
      fixture.awayTeam,
    )
    if (perspective.isHome === null) return
    const ourSide = perspective.isHome ? bundle.home : bundle.away
    const candidates = [...ourSide.starters, ...ourSide.bench]
      .map((p) => ({
        name: typeof p.name === 'string' ? p.name.trim() : '',
        jerseyNumber: typeof p.number === 'number' ? p.number : null,
        position: mapFussballPosition(p.position ?? null),
      }))
      .filter((p) => p.name.length >= 2)

    if (candidates.length === 0) return

    const existing = await this.prisma.rosterSlot.findMany({
      where: { teamId: fixture.teamId },
      select: { fullName: true },
    })
    const existingNames = new Set(
      existing.map((s) => s.fullName.trim().toLowerCase()),
    )

    const inserts = candidates.filter(
      (p) => !existingNames.has(p.name.toLowerCase()),
    )
    if (inserts.length === 0) return

    await this.prisma.rosterSlot.createMany({
      data: inserts.map((p) => ({
        teamId: fixture.teamId,
        fullName: p.name,
        jerseyNumber: p.jerseyNumber,
        position: p.position,
      })),
      skipDuplicates: true,
    })
  }

  async updateFixtureOverlay(
    userId: string,
    clubId: string | undefined,
    fixtureId: string,
    input: UpdateFixtureOverlayInput,
  ): Promise<ImportedFixture> {
    const fixture = await this.prisma.importedFixture.findFirst({
      where: { id: fixtureId },
      include: { overlay: true },
    })

    if (!fixture) {
      throw new NotFoundException('Imported fixture not found')
    }

    await this.teamsService.assertManageAccess(userId, fixture.teamId)
    assertClubScope(clubId, fixture.clubId)

    const overlay = fixture.overlay
      ? await this.prisma.fixtureOverlay.update({
          where: { id: fixture.overlay.id },
          data: {
            arrivalTime:
              input.arrivalTime !== undefined
                ? input.arrivalTime
                  ? new Date(input.arrivalTime)
                  : null
                : undefined,
            meetingPoint:
              input.meetingPoint !== undefined ? input.meetingPoint : undefined,
            kitColor: input.kitColor !== undefined ? input.kitColor : undefined,
            travelNotes:
              input.travelNotes !== undefined ? input.travelNotes : undefined,
            squadDeadline:
              input.squadDeadline !== undefined
                ? input.squadDeadline
                  ? new Date(input.squadDeadline)
                  : null
                : undefined,
            veoLink: input.veoLink !== undefined ? input.veoLink : undefined,
          },
        })
      : await this.prisma.fixtureOverlay.create({
          data: {
            clubId: fixture.clubId,
            fixtureId: fixture.id,
            arrivalTime: input.arrivalTime ? new Date(input.arrivalTime) : null,
            meetingPoint: input.meetingPoint ?? null,
            kitColor: input.kitColor ?? null,
            travelNotes: input.travelNotes ?? null,
            squadDeadline: input.squadDeadline
              ? new Date(input.squadDeadline)
              : null,
            veoLink: input.veoLink ?? null,
            fieldLocks: [],
          },
        })

    await this.syncEventForFixture(fixture, overlay, 'overlay-update')

    return serializeFixture(fixture, await this.findLinkedEventId(fixture), overlay)
  }

  async updateFixtureLocks(
    userId: string,
    clubId: string | undefined,
    fixtureId: string,
    input: UpdateFixtureLocksInput,
  ): Promise<ImportedFixture> {
    const fixture = await this.prisma.importedFixture.findFirst({
      where: { id: fixtureId },
      include: { overlay: true },
    })

    if (!fixture) {
      throw new NotFoundException('Imported fixture not found')
    }

    await this.teamsService.assertManageAccess(userId, fixture.teamId)
    assertClubScope(clubId, fixture.clubId)

    const updatedFixture = await this.prisma.importedFixture.update({
      where: { id: fixture.id },
      data: {
        kickoffAt: input.values?.kickoffAt
          ? new Date(input.values.kickoffAt)
          : undefined,
        venueName:
          input.values?.venueName !== undefined
            ? input.values.venueName
            : undefined,
        pitchAddress:
          input.values?.pitchAddress !== undefined
            ? input.values.pitchAddress
            : undefined,
        status: input.values?.status
          ? toPrismaFixtureStatus(input.values.status)
          : undefined,
        resultHome:
          input.values?.resultHome !== undefined
            ? input.values.resultHome
            : undefined,
        resultAway:
          input.values?.resultAway !== undefined
            ? input.values.resultAway
            : undefined,
      },
    })

    const overlay = fixture.overlay
      ? await this.prisma.fixtureOverlay.update({
          where: { id: fixture.overlay.id },
          data: {
            fieldLocks: input.fieldLocks,
          },
        })
      : await this.prisma.fixtureOverlay.create({
          data: {
            clubId: fixture.clubId,
            fixtureId: fixture.id,
            fieldLocks: input.fieldLocks,
          },
        })

    await this.syncEventForFixture(updatedFixture, overlay, 'manual-lock')

    return serializeFixture(
      updatedFixture,
      await this.findLinkedEventId(updatedFixture),
      overlay,
    )
  }

  async getClubSummary(clubId: string): Promise<ClubPublicSummary> {
    const linkedTeam = await this.prisma.externalTeamLink.findFirst({
      where: {
        clubId,
        status: 'ACTIVE',
      },
      orderBy: [{ lastSyncedAt: 'desc' }, { updatedAt: 'desc' }],
    })

    if (!linkedTeam) {
      return {
        clubId,
        teamId: null,
        linkedTeam: null,
        nextMatch: null,
        lastResult: null,
        table: [],
        formStreak: [],
        updatedAt: null,
        widgetUrl: null,
      }
    }

    const now = new Date()
    const [nextMatch, lastResult, recentResults] = await Promise.all([
      this.prisma.importedFixture.findFirst({
        where: {
          clubId,
          teamId: linkedTeam.teamId,
          kickoffAt: { gte: now },
        },
        include: { overlay: true },
        orderBy: { kickoffAt: 'asc' },
      }),
      this.prisma.importedFixture.findFirst({
        where: {
          clubId,
          teamId: linkedTeam.teamId,
          kickoffAt: { lt: now },
        },
        include: { overlay: true },
        orderBy: { kickoffAt: 'desc' },
      }),
      this.prisma.importedFixture.findMany({
        where: {
          clubId,
          teamId: linkedTeam.teamId,
          kickoffAt: { lt: now },
          status: 'FINISHED',
        },
        include: { overlay: true },
        orderBy: { kickoffAt: 'desc' },
        take: 5,
      }),
    ])

    const table =
      getTableSnapshot(nextMatch?.tableSnapshot) ||
      getTableSnapshot(lastResult?.tableSnapshot) ||
      []

    return {
      clubId,
      teamId: linkedTeam.teamId,
      linkedTeam: serializeLink(linkedTeam),
      nextMatch: nextMatch
        ? serializeFixture(nextMatch, await this.findLinkedEventId(nextMatch))
        : null,
      lastResult: lastResult
        ? serializeFixture(lastResult, await this.findLinkedEventId(lastResult))
        : null,
      table,
      formStreak: calculateFormStreak(
        recentResults.map((fixture: any) => ({
          kickoffAt: fixture.kickoffAt.toISOString(),
          status: toSharedFixtureStatus(fixture.status),
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          resultHome: fixture.resultHome,
          resultAway: fixture.resultAway,
        })),
        linkedTeam.label,
      ),
      updatedAt: linkedTeam.lastSyncedAt?.toISOString() || null,
      widgetUrl: linkedTeam.externalUrl,
    }
  }

  private normalizeFixtures(
    link: TeamLinkRecord,
    preview: { label: string; competition: string | null; pitchAddress: string | null },
    bundle: { prevGames: ApiFussballGame[]; nextGames: ApiFussballGame[]; table: unknown[] },
  ) {
    const now = Date.now()
    const earliest = now - INITIAL_BACKFILL_PAST_DAYS * 24 * 60 * 60 * 1000
    const latest = now + INITIAL_BACKFILL_FUTURE_DAYS * 24 * 60 * 60 * 1000
    const tableSnapshot = mapTableRows(bundle.table as never)
    const deduped = new Map<string, NormalizedFixtureSeed>()

    for (const game of [...bundle.prevGames, ...bundle.nextGames]) {
      const fixture = this.normalizeFixtureSeed(link, preview, tableSnapshot, game)
      if (!fixture) {
        continue
      }

      const kickoff = new Date(fixture.kickoffAt).getTime()
      if (kickoff < earliest || kickoff > latest) {
        continue
      }

      deduped.set(fixture.externalMatchId, fixture)
    }

    return [...deduped.values()].sort((a, b) =>
      a.kickoffAt.localeCompare(b.kickoffAt),
    )
  }

  private normalizeFixtureSeed(
    link: TeamLinkRecord,
    preview: { label: string; competition: string | null; pitchAddress: string | null },
    tableSnapshot: ReturnType<typeof mapTableRows>,
    game: ApiFussballGame,
  ): NormalizedFixtureSeed | null {
    const kickoff = parseApiFussballKickoff(game.date, game.time)
    if (!kickoff || !game.homeTeam || !game.awayTeam) {
      return null
    }

    const perspective = inferLinkedTeamPerspective(
      preview.label,
      game.homeTeam,
      game.awayTeam,
    )
    const competition = (game.competition || preview.competition || 'League fixture')
      .trim()
    const status = normalizeImportedFixtureStatus(game.status)

    return {
      clubId: link.clubId,
      teamId: link.teamId,
      teamLinkId: link.id,
      provider: 'API_FUSSBALL',
      // Prefer the upstream's real match id so the enrichment endpoint
      // (scraper.getGame) can fetch this exact match's events; fall back to a
      // synthetic id for sources that don't expose one.
      externalMatchId:
        game.matchId ||
        buildExternalMatchId({
          externalTeamId: link.externalTeamId,
          competition,
          kickoffAt: kickoff,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
        }),
      competition,
      season: deriveSeason(kickoff),
      kickoffAt: kickoff.toISOString(),
      status,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeLogo: game.homeLogo || null,
      awayLogo: game.awayLogo || null,
      venueName: perspective.isHome ? preview.label : null,
      pitchAddress: perspective.isHome ? preview.pitchAddress : null,
      resultHome: toNullableInt(game.homeScore),
      resultAway: toNullableInt(game.awayScore),
      tableSnapshot,
      sourceConfidence: confidenceFromSources(true, Boolean(preview.pitchAddress)),
      rawPayload: {
        primary: game,
        teamPage: preview,
      },
    }
  }

  private async upsertImportedFixture(
    link: TeamLinkRecord,
    linkedLabel: string,
    normalizedFixture: NormalizedFixtureSeed,
  ) {
    const existing = await this.prisma.importedFixture.findFirst({
      where: {
        teamLinkId: link.id,
        externalMatchId: normalizedFixture.externalMatchId,
      },
      include: { overlay: true },
    })

    if (!existing) {
      const created = await this.prisma.importedFixture.create({
        data: {
          clubId: normalizedFixture.clubId,
          teamId: normalizedFixture.teamId,
          teamLinkId: normalizedFixture.teamLinkId,
          provider: normalizedFixture.provider,
          externalMatchId: normalizedFixture.externalMatchId,
          competition: normalizedFixture.competition,
          season: normalizedFixture.season,
          kickoffAt: new Date(normalizedFixture.kickoffAt),
          status: toPrismaFixtureStatus(normalizedFixture.status),
          homeTeam: normalizedFixture.homeTeam,
          awayTeam: normalizedFixture.awayTeam,
          homeLogo: normalizedFixture.homeLogo,
          awayLogo: normalizedFixture.awayLogo,
          venueName: normalizedFixture.venueName,
          pitchAddress: normalizedFixture.pitchAddress,
          resultHome: normalizedFixture.resultHome,
          resultAway: normalizedFixture.resultAway,
          tableSnapshot: toJsonValue(normalizedFixture.tableSnapshot),
          rawPayload: toJsonValue(normalizedFixture.rawPayload),
          sourceConfidence: toPrismaConfidence(normalizedFixture.sourceConfidence),
          lastSeenAt: new Date(),
        },
      })

      await this.syncEventForFixture(created, null, 'initial-import', linkedLabel)
      return 'imported'
    }

    const lockedFields = getFieldLocks(existing.overlay?.fieldLocks)
    const candidate = applyLockedFields(existing, normalizedFixture, lockedFields)
    const changes = collectFixtureChanges(
      {
        kickoffAt: existing.kickoffAt.toISOString(),
        venueName: existing.venueName,
        pitchAddress: existing.pitchAddress,
        status: toSharedFixtureStatus(existing.status),
        resultHome: existing.resultHome,
        resultAway: existing.resultAway,
      },
      {
        kickoffAt: candidate.kickoffAt,
        venueName: candidate.venueName,
        pitchAddress: candidate.pitchAddress,
        status: candidate.status,
        resultHome: candidate.resultHome,
        resultAway: candidate.resultAway,
      },
      lockedFields,
    )

    // No-op short-circuit: collectFixtureChanges found nothing material
    // (kickoff/venue/status/result identical). The live poller calls this every
    // ~minute per fixture, so re-writing the row + re-syncing the calendar Event
    // on every tick is pure write amplification. Skip the writes entirely.
    if (changes.length === 0) {
      return 'skipped'
    }

    const updated = await this.prisma.importedFixture.update({
      where: { id: existing.id },
      data: {
        competition: candidate.competition,
        season: candidate.season,
        kickoffAt: new Date(candidate.kickoffAt),
        status: toPrismaFixtureStatus(candidate.status),
        homeTeam: candidate.homeTeam,
        awayTeam: candidate.awayTeam,
        homeLogo: candidate.homeLogo,
        awayLogo: candidate.awayLogo,
        venueName: candidate.venueName,
        pitchAddress: candidate.pitchAddress,
        resultHome: candidate.resultHome,
        resultAway: candidate.resultAway,
        tableSnapshot: toJsonValue(candidate.tableSnapshot),
        rawPayload: toJsonValue(candidate.rawPayload),
        sourceConfidence: toPrismaConfidence(candidate.sourceConfidence),
        lastSeenAt: new Date(),
      },
    })

    await this.syncEventForFixture(updated, existing.overlay, changes[0] || 'refresh', linkedLabel)

    {
      // Live broadcasts + dedicated GOAL/FINAL push for the lifecycle events.
      const wasFinished = existing.status === 'FINISHED'
      const isFinished = updated.status === 'FINISHED'
      const scoreChanged =
        existing.resultHome !== updated.resultHome ||
        existing.resultAway !== updated.resultAway

      // A live goal / full-time transition gets its own dedicated push below.
      // Suppress the generic "Result finalised / status updated" push for those
      // so a single goal doesn't fire two notifications.
      const dedicatedPushHandles =
        (scoreChanged && updated.status === 'LIVE') || (!wasFinished && isFinished)

      const notification = dedicatedPushHandles
        ? null
        : buildFixtureNotification(updated, linkedLabel, changes)
      if (notification) {
        await this.pushService.sendToTeam(
          updated.teamId,
          notification.title,
          notification.body,
          {
            type: 'fixture-sync',
            fixtureId: updated.id,
          },
        )
      }

      if (scoreChanged && updated.status === 'LIVE') {
        this.liveGateway.broadcastEvent(updated.id, {
          kind: 'state',
          status: 'live',
          resultHome: updated.resultHome,
          resultAway: updated.resultAway,
        })
      }

      // Broadcast the goal to the live ticker whenever the score went up —
      // including a match-deciding goal that lands together with full-time
      // (status already FINISHED), so the decisive goal still appears in the
      // timeline. The dedicated "Goal!" push only fires mid-match; at full
      // time the "Full time" push below already carries the final score, so we
      // don't double-notify.
      if (scoreChanged && (updated.status === 'LIVE' || isFinished)) {
        const homeUp = (updated.resultHome ?? 0) > (existing.resultHome ?? 0)
        const awayUp = (updated.resultAway ?? 0) > (existing.resultAway ?? 0)
        if (homeUp || awayUp) {
          this.liveGateway.broadcastEvent(updated.id, {
            kind: 'goal',
            side: homeUp ? 'home' : 'away',
            resultHome: updated.resultHome,
            resultAway: updated.resultAway,
          })
          if (updated.status === 'LIVE') {
            this.pushService
              .sendToTeam(
                updated.teamId,
                '⚽ Goal!',
                `${updated.homeTeam} ${updated.resultHome ?? 0}–${updated.resultAway ?? 0} ${updated.awayTeam}`,
                {
                  kind: 'GOAL_SCORED',
                  fixtureId: updated.id,
                },
                undefined,
                { clubId: updated.clubId, category: 'announcements' },
              )
              .catch(() => undefined)
          }
        }
      }

      if (!wasFinished && isFinished) {
        this.liveGateway.broadcastEvent(updated.id, {
          kind: 'state',
          status: 'finished',
          resultHome: updated.resultHome,
          resultAway: updated.resultAway,
        })
        this.pushService
          .sendToTeam(
            updated.teamId,
            'Full time',
            `${updated.homeTeam} ${updated.resultHome ?? 0}–${updated.resultAway ?? 0} ${updated.awayTeam}`,
            { kind: 'MATCH_FINAL', fixtureId: updated.id },
            undefined,
            { clubId: updated.clubId, category: 'announcements' },
          )
          .catch(() => undefined)
      }

      return 'updated'
    }
  }

  private async syncEventForFixture(
    fixture: FixtureLike,
    overlay: OverlayLike | null,
    reason: string,
    explicitLinkedLabel?: string,
  ) {
    const externalMatchKey = buildEventKey(fixture.provider, fixture.externalMatchId)
    const link =
      explicitLinkedLabel !== undefined
        ? null
        : await this.prisma.externalTeamLink.findFirst({
            where: { id: fixture.teamLinkId },
            select: { label: true },
          })

    const linkedLabel = explicitLinkedLabel || link?.label || fixture.homeTeam
    const perspective = inferLinkedTeamPerspective(
      linkedLabel,
      fixture.homeTeam,
      fixture.awayTeam,
    )
    const opponent = perspective.opponent
    const title =
      perspective.isHome === false
        ? `Auswaerts bei ${opponent}`
        : `Spiel gegen ${opponent}`
    const location =
      [fixture.venueName, fixture.pitchAddress].filter(Boolean).join(' · ') || null
    const notes = buildEventNotes(fixture, overlay, reason)
    const createdById = await this.resolveEventCreator(fixture.clubId)

    if (!createdById) {
      return
    }

    const existingEvent = await this.prisma.event.findFirst({
      where: { externalMatchKey },
      select: { id: true },
    })

    if (existingEvent) {
      await this.prisma.event.update({
        where: { id: existingEvent.id },
        data: {
          title,
          date: fixture.kickoffAt,
          location,
          notes,
        },
      })
      return
    }

    await this.prisma.event.create({
      data: {
        clubId: fixture.clubId,
        teamId: fixture.teamId,
        externalMatchKey,
        title,
        type: 'MATCH',
        date: fixture.kickoffAt,
        location,
        notes,
        createdById,
      },
    })
  }

  private async resolveEventCreator(clubId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        clubId,
        role: {
          in: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH],
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return membership?.userId || null
  }

  private async findLinkedEventId(fixture: {
    provider: string
    externalMatchId: string
  }) {
    const event = await this.prisma.event.findFirst({
      where: {
        externalMatchKey: buildEventKey(fixture.provider, fixture.externalMatchId),
      },
      select: { id: true },
    })

    return event?.id || null
  }
}

function assertClubScope(inputClubId: string | undefined, actualClubId: string) {
  if (!inputClubId || inputClubId !== actualClubId) {
    throw new BadRequestException(
      'X-Club-Id must match the active club for this operation',
    )
  }
}

function deriveSeason(kickoff: Date) {
  const year = kickoff.getUTCFullYear()
  return kickoff.getUTCMonth() >= 6
    ? `${year}/${year + 1}`
    : `${year - 1}/${year}`
}

function toNullableInt(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getFieldLocks(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : []
}

function applyLockedFields(
  existing: {
    kickoffAt: Date
    venueName: string | null
    pitchAddress: string | null
    status: string
    resultHome: number | null
    resultAway: number | null
  },
  incoming: NormalizedFixtureSeed,
  lockedFields: string[],
) {
  const locked = new Set(lockedFields)

  return {
    ...incoming,
    kickoffAt: locked.has('kickoffAt')
      ? existing.kickoffAt.toISOString()
      : incoming.kickoffAt,
    venueName: locked.has('venueName') ? existing.venueName : incoming.venueName,
    pitchAddress: locked.has('pitchAddress')
      ? existing.pitchAddress
      : incoming.pitchAddress,
    status: locked.has('status')
      ? toSharedFixtureStatus(existing.status)
      : incoming.status,
    resultHome: locked.has('resultHome') ? existing.resultHome : incoming.resultHome,
    resultAway: locked.has('resultAway') ? existing.resultAway : incoming.resultAway,
  }
}

function buildEventNotes(
  fixture: {
    competition: string
    status: string
    resultHome: number | null
    resultAway: number | null
  },
  overlay:
    | {
        arrivalTime: Date | null
        meetingPoint: string | null
        travelNotes: string | null
        squadDeadline: Date | null
      }
    | null,
  reason: string,
) {
  const lines = [
    `Competition: ${fixture.competition}`,
    `Status: ${toSharedFixtureStatus(fixture.status)}`,
  ]

  if (fixture.resultHome !== null && fixture.resultAway !== null) {
    lines.push(`Result: ${fixture.resultHome}:${fixture.resultAway}`)
  }

  if (overlay?.arrivalTime) {
    lines.push(`Arrival: ${overlay.arrivalTime.toISOString()}`)
  }

  if (overlay?.meetingPoint) {
    lines.push(`Meeting point: ${overlay.meetingPoint}`)
  }

  if (overlay?.squadDeadline) {
    lines.push(`Squad deadline: ${overlay.squadDeadline.toISOString()}`)
  }

  if (overlay?.travelNotes) {
    lines.push(`Travel: ${overlay.travelNotes}`)
  }

  lines.push(`Imported from FUSSBALL.DE (${reason})`)
  return lines.join('\n')
}

function buildFixtureNotification(
  fixture: {
    homeTeam: string
    awayTeam: string
    kickoffAt: Date
    venueName: string | null
    pitchAddress: string | null
    resultHome: number | null
    resultAway: number | null
    status: string
  },
  linkedLabel: string,
  changes: string[],
) {
  const perspective = inferLinkedTeamPerspective(
    linkedLabel,
    fixture.homeTeam,
    fixture.awayTeam,
  )
  const opponent = perspective.opponent

  if (changes.includes('kickoff')) {
    return {
      title: 'Kickoff updated',
      body: `Match vs ${opponent} now starts at ${fixture.kickoffAt.toLocaleString('de-DE')}.`,
    }
  }

  if (changes.includes('venue') || changes.includes('pitchAddress')) {
    return {
      title: 'Venue updated',
      body: `Venue for ${opponent} changed to ${[fixture.venueName, fixture.pitchAddress]
        .filter(Boolean)
        .join(', ')}.`,
    }
  }

  if (changes.includes('status')) {
    return {
      title: 'Match status updated',
      body: `${fixture.homeTeam} vs ${fixture.awayTeam} is now ${toSharedFixtureStatus(
        fixture.status,
      )}.`,
    }
  }

  if (
    changes.includes('result') &&
    fixture.resultHome !== null &&
    fixture.resultAway !== null
  ) {
    return {
      title: 'Result finalised',
      body: `${fixture.homeTeam} ${fixture.resultHome}:${fixture.resultAway} ${fixture.awayTeam}`,
    }
  }

  return null
}

function buildEventKey(provider: string, externalMatchId: string) {
  return `${provider}:${externalMatchId}`
}

function toPrismaFixtureStatus(status: ImportedFixtureStatus) {
  switch (status) {
    case 'scheduled':
      return 'SCHEDULED'
    case 'live':
      return 'LIVE'
    case 'finished':
      return 'FINISHED'
    case 'postponed':
      return 'POSTPONED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function toSharedFixtureStatus(status: string): ImportedFixtureStatus {
  switch (status) {
    case 'SCHEDULED':
      return 'scheduled'
    case 'LIVE':
      return 'live'
    case 'FINISHED':
      return 'finished'
    case 'POSTPONED':
      return 'postponed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

function toPrismaConfidence(confidence: FixtureDataConfidence) {
  switch (confidence) {
    case 'official_partner':
      return 'OFFICIAL_PARTNER'
    case 'official_widget':
      return 'OFFICIAL_WIDGET'
    case 'community_open':
      return 'COMMUNITY_OPEN'
    case 'club_entered':
      return 'CLUB_ENTERED'
    case 'mixed':
      return 'MIXED'
    default:
      return 'UNOFFICIAL_PUBLIC'
  }
}

function toSharedConfidence(confidence: string): FixtureDataConfidence {
  switch (confidence) {
    case 'OFFICIAL_PARTNER':
      return 'official_partner'
    case 'OFFICIAL_WIDGET':
      return 'official_widget'
    case 'COMMUNITY_OPEN':
      return 'community_open'
    case 'CLUB_ENTERED':
      return 'club_entered'
    case 'MIXED':
      return 'mixed'
    default:
      return 'unofficial_public'
  }
}

function serializeLink(link: TeamLinkRecord): ExternalTeamLink {
  return {
    id: link.id,
    clubId: link.clubId,
    teamId: link.teamId,
    provider: 'api_fussball',
    externalTeamId: link.externalTeamId,
    externalClubId: link.externalClubId,
    externalUrl: link.externalUrl,
    label: link.label,
    status: link.status as ExternalTeamLink['status'],
    lastSyncedAt: link.lastSyncedAt?.toISOString() || null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  }
}

function serializeOverlay(overlay: OverlayLike): FixtureOverlay {
  return {
    id: overlay.id,
    fixtureId: overlay.fixtureId,
    arrivalTime: overlay.arrivalTime?.toISOString() || null,
    meetingPoint: overlay.meetingPoint,
    kitColor: overlay.kitColor,
    travelNotes: overlay.travelNotes,
    squadDeadline: overlay.squadDeadline?.toISOString() || null,
    veoLink: overlay.veoLink,
    fieldLocks: getFieldLocks(overlay.fieldLocks),
    createdAt: overlay.createdAt.toISOString(),
    updatedAt: overlay.updatedAt.toISOString(),
  }
}

function serializeFixture(
  fixture: FixtureLike & {
    homeLogo?: string | null
    awayLogo?: string | null
    season?: string | null
    tableSnapshot?: unknown
    rawPayload?: unknown
    sourceConfidence?: string
    lastSeenAt?: Date
    createdAt?: Date
    updatedAt?: Date
    overlay?: OverlayLike | null
  },
  eventId: string | null,
  explicitOverlay?: OverlayLike | null,
): ImportedFixture {
  return {
    id: fixture.id,
    clubId: fixture.clubId,
    teamId: fixture.teamId,
    teamLinkId: fixture.teamLinkId,
    provider: 'api_fussball',
    externalMatchId: fixture.externalMatchId,
    competition: fixture.competition,
    season: fixture.season || null,
    kickoffAt: fixture.kickoffAt.toISOString(),
    status: toSharedFixtureStatus(fixture.status),
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeLogo: fixture.homeLogo || null,
    awayLogo: fixture.awayLogo || null,
    venueName: fixture.venueName,
    pitchAddress: fixture.pitchAddress,
    resultHome: fixture.resultHome,
    resultAway: fixture.resultAway,
    tableSnapshot: getTableSnapshot(fixture.tableSnapshot),
    sourceConfidence: toSharedConfidence(
      fixture.sourceConfidence || 'UNOFFICIAL_PUBLIC',
    ),
    rawPayload: isRecord(fixture.rawPayload) ? fixture.rawPayload : {},
    lastSeenAt: fixture.lastSeenAt?.toISOString() || new Date().toISOString(),
    createdAt: fixture.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: fixture.updatedAt?.toISOString() || new Date().toISOString(),
    overlay:
      explicitOverlay || fixture.overlay
        ? serializeOverlay((explicitOverlay || fixture.overlay) as OverlayLike)
        : null,
    eventId,
  }
}

function serializeSyncRun(run: {
  id: string
  clubId: string
  teamLinkId: string
  provider: string
  status: string
  importedCount: number
  updatedCount: number
  skippedCount: number
  parserVersion: string
  errorSummary: string | null
  startedAt: Date
  completedAt: Date | null
  createdAt: Date
}): SyncRun {
  return {
    id: run.id,
    clubId: run.clubId,
    teamLinkId: run.teamLinkId,
    provider: 'api_fussball',
    status: run.status as SyncRun['status'],
    importedCount: run.importedCount,
    updatedCount: run.updatedCount,
    skippedCount: run.skippedCount,
    parserVersion: run.parserVersion,
    errorSummary: run.errorSummary,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() || null,
    createdAt: run.createdAt.toISOString(),
  }
}

function getTableSnapshot(value: unknown) {
  return Array.isArray(value)
    ? value.filter(isTableSnapshotRow).map((row) => ({ ...row }))
    : null
}

function isTableSnapshotRow(value: unknown): value is ClubPublicSummary['table'][number] {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.place === 'number' &&
    typeof value.team === 'string' &&
    typeof value.games === 'number' &&
    typeof value.won === 'number' &&
    typeof value.draw === 'number' &&
    typeof value.lost === 'number' &&
    typeof value.goal === 'string' &&
    typeof value.goalDifference === 'number' &&
    typeof value.points === 'number' &&
    typeof value.isPromotion === 'boolean' &&
    typeof value.isRelegation === 'boolean' &&
    (value.img === null || typeof value.img === 'string')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) {
    return Prisma.JsonNull
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function normalizeLineupSide(
  side: import("./fussball.provider").ApiFussballLineupSide,
): import("@anstoss/shared").FixtureLineupSide {
  const formation = side.formation || inferFormation(side.starters.length)
  const positions = positionsForFormation(formation, side.starters.length)
  const starters = side.starters.map((p, i) => ({
    number: typeof p.number === "number" ? p.number : i + 1,
    name: typeof p.name === "string" ? p.name : `#${i + 1}`,
    position: typeof p.position === "string" ? p.position : null,
    isCaptain: p.isCaptain === true,
    depth: positions[i]?.depth ?? 0.5,
    lateral: positions[i]?.lateral ?? 0.5,
  }))
  const bench = side.bench.map((p, i) => ({
    number: typeof p.number === "number" ? p.number : 90 + i,
    name: typeof p.name === "string" ? p.name : `Sub ${i + 1}`,
    position: typeof p.position === "string" ? p.position : null,
    isCaptain: false,
    depth: 0,
    lateral: 0,
  }))
  return { formation, starters, bench }
}

function inferFormation(starterCount: number): string {
  if (starterCount === 11) return "4-3-3"
  if (starterCount === 9) return "3-3-2"
  if (starterCount === 7) return "2-3-1"
  return `1-${Math.max(1, starterCount - 1)}`
}

function positionsForFormation(
  formation: string,
  starterCount: number,
): { depth: number; lateral: number }[] {
  const lines = formation
    .split(/[-x]/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (lines.length === 0) return []

  const result: { depth: number; lateral: number }[] = []
  // Goalkeeper (always first slot in feed): depth 0.05
  result.push({ depth: 0.05, lateral: 0.5 })

  // Distribute the remaining lines from defenders to forwards.
  const totalLines = lines.length
  lines.forEach((countOnLine, lineIdx) => {
    // depth from 0.18 (defenders) to 0.92 (forwards)
    const depth = 0.18 + (lineIdx / Math.max(1, totalLines - 1)) * 0.72
    for (let j = 0; j < countOnLine; j++) {
      const lateral =
        countOnLine === 1
          ? 0.5
          : 0.12 + (j / (countOnLine - 1)) * 0.76
      result.push({ depth, lateral })
    }
  })

  return result.slice(0, starterCount)
}


/**
 * Map Fussball.de position codes to our PlayerPosition enum.
 * Returns null if unknown — caller leaves position empty.
 */
function mapFussballPosition(
  raw: string | null,
): "GK" | "DEF" | "MID" | "FWD" | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  if (code === "TW" || code === "GK") return "GK"
  if (
    code === "IV" || code === "AV" || code === "LV" || code === "RV" ||
    code === "LIB" || code === "DF" || code === "DEF" || code === "CB" ||
    code === "LB" || code === "RB"
  ) return "DEF"
  if (
    code === "DM" || code === "ZM" || code === "OM" || code === "LM" ||
    code === "RM" || code === "MF" || code === "MID" || code === "CM" ||
    code === "AM" || code === "CDM" || code === "CAM"
  ) return "MID"
  if (
    code === "ST" || code === "MS" || code === "RA" || code === "LA" ||
    code === "FW" || code === "FWD" || code === "CF" || code === "LW" || code === "RW"
  ) return "FWD"
  return null
}
