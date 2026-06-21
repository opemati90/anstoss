import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import {
  ApiFussballGame,
  ApiFussballTableRow,
  buildFussballTeamUrl,
  extractFussballTeamId,
  parseFussballRoster,
  parseFussballTeamPage,
  type FussballPagePreview,
  type FussballRoster,
} from './fussball.utils'
import {
  FussballScraperClient,
  type ScraperGame,
  type ScraperTable,
  type ScraperTeamInfoResponse,
} from './fussball-scraper.client'

export interface ApiFussballTeamBundle {
  prevGames: ApiFussballGame[]
  nextGames: ApiFussballGame[]
  table: ApiFussballTableRow[]
}

export interface ApiFussballPlayer {
  number?: number | null
  name?: string | null
  position?: string | null
  isCaptain?: boolean
}

export interface ApiFussballLineupSide {
  formation: string | null
  starters: ApiFussballPlayer[]
  bench: ApiFussballPlayer[]
}

export interface ApiFussballLineupBundle {
  home: ApiFussballLineupSide
  away: ApiFussballLineupSide
}

/**
 * Data provider for fixture imports.
 *
 * NOTE: FUSSBALL.DE/DFBnet data should be consumed through licensed exports,
 * official widgets, or explicit partner feeds. The legacy scraper sidecar is
 * kept as an optional development/import adapter behind FUSSBALL_SCRAPER_URL;
 * production use should prefer the LICENSED_FEED importer so Anstoss does not
 * depend on prohibited datacrawling/datenscraping.
 */
@Injectable()
export class FussballProviderService {
  private readonly requestTimeoutMs = 12000

  constructor(private readonly scraper: FussballScraperClient) {}

  async fetchTeamBundle(externalTeamId: string): Promise<ApiFussballTeamBundle> {
    if (!this.scraper.isConfigured()) {
      throw new ServiceUnavailableException(
        'FUSSBALL_SCRAPER_URL is required to import fixtures from fussball.de',
      )
    }

    const info = await this.scraper.getTeamInfo(externalTeamId)
    if (!info) {
      throw new ServiceUnavailableException(
        'fussball.de scraper returned no data while loading fixtures',
      )
    }

    return {
      prevGames: (info.prev_games ?? []).map(scraperGameToApiGame),
      nextGames: (info.next_games ?? []).map(scraperGameToApiGame),
      table: scraperTableToApiRows(info.table),
    }
  }

  /**
   * The fussball.de scraper exposes match events (goals/cards/subs) via
   * /api/game/:id but not structured starting lineups, so lineups aren't
   * available. Callers degrade gracefully (getFixtureLineup → status 'pending').
   */
  async fetchMatchLineup(
    _externalMatchId: string,
  ): Promise<ApiFussballLineupBundle | null> {
    return null
  }

  async fetchTeamRoster(input: string): Promise<FussballRoster> {
    const externalUrl = buildTeamPageUrl(input)
    const response = await this.fetchWithTimeout(
      externalUrl,
      {
        headers: {
          Accept: 'text/html',
        },
        redirect: 'error',
      },
      'loading the team roster',
    )

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `FUSSBALL.DE returned ${response.status} while loading the roster`,
      )
    }

    const html = await response.text()
    return parseFussballRoster(html)
  }

  async fetchTeamPage(
    input: string,
  ): Promise<{ externalUrl: string; preview: FussballPagePreview }> {
    const externalUrl = buildTeamPageUrl(input)
    const externalTeamId = extractFussballTeamId(input)
    const fallbackLabel = externalTeamId || input

    // Prefer the scraper: it reliably returns the team's games, from which we
    // derive label + competition + home venue. fussball.de itself is an SPA, so
    // the raw-HTML parse below is a sparse last resort.
    if (externalTeamId && this.scraper.isConfigured()) {
      const info = await this.scraper.getTeamInfo(externalTeamId)
      if (info) {
        return {
          externalUrl,
          preview: derivePreviewFromGames(info, fallbackLabel),
        }
      }
    }

    const response = await this.fetchWithTimeout(
      externalUrl,
      {
        headers: {
          Accept: 'text/html',
        },
        redirect: 'error',
      },
      'loading the team page',
    )

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `FUSSBALL.DE returned ${response.status} while loading the team page`,
      )
    }

    const html = await response.text()

    return {
      externalUrl,
      preview: parseFussballTeamPage(html, fallbackLabel),
    }
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    action: string,
  ) {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    )

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException(
          `FUSSBALL.DE timed out while ${action}`,
        )
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Map a scraper game to the ApiFussballGame shape the normalize pipeline
 * consumes. The pipeline reads German date/time strings (parseApiFussballKickoff
 * expects "DD.MM.YYYY" + "HH:MM"); the scraper ships an ISO `datetime_utc`, so
 * format it back to UTC components to preserve the exact kickoff instant.
 */
function scraperGameToApiGame(game: ScraperGame): ApiFussballGame {
  const { date, time } = isoToGermanDateTime(game.datetime_utc)
  return {
    matchId: game.id,
    date,
    time,
    status: game.status ?? undefined,
    competition: game.competition,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    homeScore: game.home_score,
    awayScore: game.away_score,
    homeLogo: game.home_logo || null,
    awayLogo: game.away_logo || null,
  }
}

function scraperTableToApiRows(
  table: ScraperTable | null,
): ApiFussballTableRow[] {
  if (!table?.entries) return []
  return table.entries.map((entry) => ({
    place: entry.place,
    team: entry.team,
    img: entry.img || null,
    games: entry.games,
    won: entry.won,
    draw: entry.draw,
    lost: entry.lost,
    goal: entry.goal,
    goalDifference: entry.goal_difference,
    points: entry.points,
    isPromotion: entry.is_promotion,
    isRelegation: entry.is_relegation,
  }))
}

/**
 * Derive the team preview from its fixtures: the team name that appears in the
 * most games (every game, home or away) is the linked team itself; competition
 * comes from any game; the venue from a home game's location.
 */
function derivePreviewFromGames(
  info: ScraperTeamInfoResponse,
  fallbackLabel: string,
): FussballPagePreview {
  const games = [...(info.prev_games ?? []), ...(info.next_games ?? [])]

  const counts = new Map<string, number>()
  for (const game of games) {
    for (const name of [game.home_team, game.away_team]) {
      const trimmed = (name ?? '').trim()
      if (trimmed) counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
    }
  }

  let label = fallbackLabel
  let best = 0
  for (const [name, count] of counts) {
    if (count > best) {
      best = count
      label = name
    }
  }

  const competition = games.find((g) => g.competition)?.competition ?? null
  const pitchAddress =
    games.find((g) => g.home_team?.trim() === label && g.location)?.location ??
    null

  return { label, competition, pitchAddress }
}

function isoToGermanDateTime(iso: string | null | undefined): {
  date?: string
  time?: string
} {
  if (!iso) return {}
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return {}
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return { date: `${dd}.${mm}.${yyyy}`, time: `${hh}:${min}` }
}

function buildTeamPageUrl(input: string) {
  const trimmedInput = input.trim()

  if (trimmedInput.includes('://')) {
    const parsed = new URL(trimmedInput)
    const host = parsed.hostname.toLowerCase()

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !ALLOWED_FUSSBALL_HOSTS.has(host)
    ) {
      throw new ServiceUnavailableException(
        'Only canonical FUSSBALL.DE team URLs are allowed',
      )
    }
  }

  const externalTeamId = extractFussballTeamId(trimmedInput)
  if (!externalTeamId) {
    throw new ServiceUnavailableException(
      'A valid FUSSBALL.DE team URL or ID is required',
    )
  }

  return buildFussballTeamUrl(externalTeamId)
}

const ALLOWED_FUSSBALL_HOSTS = new Set([
  'fussball.de',
  'www.fussball.de',
  'next.fussball.de',
])
