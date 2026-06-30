import { Injectable, Logger } from '@nestjs/common'

/**
 * Thin HTTP client for the self-hosted Zetabytes scraper sidecar
 * (services/fussball-scraper). The scraper exposes a stable REST
 * surface around fussball.de that includes data api-fussball.de
 * doesn't: match events (goals, cards, subs), venue addresses, team
 * search.
 *
 * This client is intentionally permissive — every method returns
 * `null` on failure so callers can blend it with the primary
 * api-fussball.de provider via a circuit breaker without try/catch
 * scattered everywhere.
 *
 * Configure via:
 *   FUSSBALL_SCRAPER_URL=https://scraper.example.app
 *   FUSSBALL_SCRAPER_API_KEY=<the scraper's API_KEY env value>
 */

export type ScraperGame = {
  id: string
  datetime_utc: string
  competition: string
  age_group: string | null
  home_team: string
  home_logo: string
  away_team: string
  away_logo: string
  status: string | null
  home_score: string | null
  away_score: string | null
  location: string | null
  location_url: string | null
  match_events: ScraperMatchEvent[] | null
}

export type ScraperMatchEvent = {
  /** "43’" or "90+1’" */
  time: string
  /** "goal" | "yellow-card" | "red-card" | "substitution" | ... */
  type: string
  /** Unstable in upstream — sometimes "home"/"away", sometimes a team name */
  team: string
  description: string | null
  score: string | null
}

export type ScraperTeam = {
  id: string
  name: string
  fussball_de_url: string
}

export type ScraperTableEntry = {
  place: number
  team: string
  img: string
  games: number
  won: number
  draw: number
  lost: number
  /** "50:25" */
  goal: string
  goal_difference: number
  points: number
  is_promotion: boolean
  is_relegation: boolean
}

export type ScraperTable = {
  entries: ScraperTableEntry[]
}

export type ScraperTeamInfoResponse = {
  table: ScraperTable | null
  prev_games: ScraperGame[]
  next_games: ScraperGame[]
}

export type ScraperClubSearchResult = {
  id: string
  name: string
  logo_url: string
  city: string
}

export type ScraperGoalTimingBand = {
  label: string
  scored: number
  conceded: number
}

export type ScraperGoalTiming = {
  team_name: string | null
  sample_size: number
  bands: ScraperGoalTimingBand[]
}

export type ScraperTopScorer = {
  name: string
  goals: number
  matches: number
}

export type ScraperScoringInsights = {
  team_name: string | null
  sample_size: number
  goal_timing: ScraperGoalTiming
  top_scorers: ScraperTopScorer[]
}

@Injectable()
export class FussballScraperClient {
  private readonly logger = new Logger(FussballScraperClient.name)
  private readonly baseUrl = (process.env.FUSSBALL_SCRAPER_URL || '').replace(
    /\/$/,
    '',
  )
  private readonly apiKey = process.env.FUSSBALL_SCRAPER_API_KEY || ''
  private readonly requestTimeoutMs = 15_000

  // Lightweight in-memory circuit breaker. After 3 consecutive failures
  // we open the circuit for a cool-off window so the API doesn't waste
  // 15-second timeouts trying a downed scraper on every request.
  private consecutiveFailures = 0
  private circuitOpenedAt: number | null = null
  private readonly failureThreshold = 3
  private readonly cooloffMs = 60_000

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey)
  }

  isAvailable(): boolean {
    if (!this.isConfigured()) return false
    if (this.circuitOpenedAt === null) return true
    if (Date.now() - this.circuitOpenedAt > this.cooloffMs) {
      // Half-open: let one probe through.
      this.circuitOpenedAt = null
      this.consecutiveFailures = 0
      return true
    }
    return false
  }

  async getGame(externalMatchId: string): Promise<ScraperGame | null> {
    return this.get<ScraperGame>(`/api/game/${encodeURIComponent(externalMatchId)}`)
  }

  async getTeamInfo(externalTeamId: string): Promise<ScraperTeamInfoResponse | null> {
    return this.get<ScraperTeamInfoResponse>(
      `/api/team/${encodeURIComponent(externalTeamId)}`,
    )
  }

  async getTeamNextGames(externalTeamId: string): Promise<ScraperGame[] | null> {
    return this.get<ScraperGame[]>(
      `/api/team/${encodeURIComponent(externalTeamId)}/next_games`,
    )
  }

  async getTeamPrevGames(externalTeamId: string): Promise<ScraperGame[] | null> {
    return this.get<ScraperGame[]>(
      `/api/team/${encodeURIComponent(externalTeamId)}/prev_games`,
    )
  }

  async getTeamTable(externalTeamId: string): Promise<ScraperTable | null> {
    return this.get<ScraperTable>(
      `/api/team/${encodeURIComponent(externalTeamId)}/table`,
    )
  }

  async getTeamScoringInsights(
    externalTeamId: string,
  ): Promise<ScraperScoringInsights | null> {
    return this.get<ScraperScoringInsights>(
      `/api/team/${encodeURIComponent(externalTeamId)}/scoring-insights`,
    )
  }

  async searchClubs(query: string): Promise<ScraperClubSearchResult[] | null> {
    if (query.trim().length < 3) return []
    return this.get<ScraperClubSearchResult[]>(
      `/api/search/clubs?query=${encodeURIComponent(query.trim())}`,
    )
  }

  async getClubTeams(externalClubId: string): Promise<ScraperTeam[] | null> {
    return this.get<ScraperTeam[]>(
      `/api/club/${encodeURIComponent(externalClubId)}/teams`,
    )
  }

  /**
   * Generic GET. Returns `null` on any failure (config missing, circuit
   * open, network error, non-2xx, parse error). Caller decides whether
   * a `null` is a fallthrough cue or a hard failure for that endpoint.
   */
  private async get<T>(path: string): Promise<T | null> {
    if (!this.isConfigured()) {
      return null
    }

    if (!this.isAvailable()) {
      this.logger.debug(
        `Scraper circuit open; skipping ${path} until cool-off elapses`,
      )
      return null
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    )

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (response.status === 404) {
        // 404 isn't a circuit-breaker signal — it just means upstream
        // doesn't have the resource. Reset failure counter; let caller
        // decide what to do with `null`.
        this.consecutiveFailures = 0
        return null
      }

      if (!response.ok) {
        this.recordFailure(`${response.status} ${response.statusText}`, path)
        return null
      }

      const json = (await response.json()) as T
      this.consecutiveFailures = 0
      return json
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.name === 'AbortError'
            ? 'timeout'
            : error.message
          : String(error)
      this.recordFailure(reason, path)
      return null
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private recordFailure(reason: string, path: string) {
    this.consecutiveFailures += 1
    this.logger.warn(
      `Scraper failure (${this.consecutiveFailures}/${this.failureThreshold}) on ${path}: ${reason}`,
    )
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenedAt = Date.now()
      this.logger.error(
        `Scraper circuit opened for ${this.cooloffMs}ms after ${this.consecutiveFailures} consecutive failures`,
      )
    }
  }

  /** Test-only: explicitly close the circuit. */
  resetCircuit(): void {
    this.consecutiveFailures = 0
    this.circuitOpenedAt = null
  }

  /** Public health probe — used by an admin debug endpoint to confirm
   * connectivity without going through circuit-breaker bookkeeping. */
  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, reason: 'FUSSBALL_SCRAPER_URL or API_KEY not set' }
    }
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      return response.ok
        ? { ok: true }
        : { ok: false, reason: `${response.status} ${response.statusText}` }
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Map a scraper Game to the existing ApiFussballGame shape so the
   * downstream `mapGameToImportedFixture()` pipeline doesn't need to
   * change. Returns the minimal subset the existing mapper consumes.
   */
  static toApiFussballGame(game: ScraperGame) {
    return {
      gameId: game.id,
      kickoffDate: null,
      kickoffTime: null,
      kickoffDateTime: game.datetime_utc,
      competition: game.competition,
      ageGroup: game.age_group,
      home: { team: game.home_team, logo: game.home_logo },
      away: { team: game.away_team, logo: game.away_logo },
      status: game.status,
      homeGoals: parseScore(game.home_score),
      awayGoals: parseScore(game.away_score),
      location: game.location,
      // Existing pipeline carries an opaque rawPayload through; we
      // pass the full scraper row so future enrichers can pick up
      // match events without another fetch.
      rawPayload: game as unknown as Record<string, unknown>,
    }
  }
}

function parseScore(value: string | null): number | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  return Number.isFinite(n) ? n : null
}
