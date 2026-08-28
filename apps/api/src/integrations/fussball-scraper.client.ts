import { Injectable } from '@nestjs/common'

/**
 * Compatibility types and interface for historical fixture records. Network
 * access is deliberately absent: official federation pages are reference-only.
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
  isConfigured(): boolean {
    return false
  }

  isAvailable(): boolean {
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
    void path
    return null
  }

  /** Test-only: explicitly close the circuit. */
  resetCircuit(): void {
    // Compatibility no-op.
  }

  /** Public health probe — used by an admin debug endpoint to confirm
   * connectivity without going through circuit-breaker bookkeeping. */
  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: 'Official team pages are reference-only' }
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

export function isLicensedFussballFeedEnabled() {
  // Product decision: official federation pages are reference-only. Clubs
  // paste a link that Anstoss displays; the API never scrapes or ingests it.
  return false
}

function parseScore(value: string | null): number | null {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  return Number.isFinite(n) ? n : null
}
