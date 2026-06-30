/**
 * Match Facts — a "Facts" surface on the match-detail screen, computed from the
 * club's own imported fixtures (no external scrape required for this slice):
 * a season head-to-head comparison (from the league-table snapshot) and the
 * linked team's recent form. Top scorers + goal-timing arrive in a later slice
 * once the fussball scraper exposes them.
 */

export type MatchFormResult = 'W' | 'D' | 'L'

export type MatchComparisonMetricKey =
  | 'games'
  | 'points'
  | 'goalsFor'
  | 'goalsAgainst'

export interface MatchComparisonMetric {
  key: MatchComparisonMetricKey
  home: number
  away: number
  /** Whether a higher value is the "better" side (drives the accent bar). */
  higherIsBetter: boolean
}

export interface MatchComparison {
  homeTeam: string
  awayTeam: string
  metrics: MatchComparisonMetric[]
}

export interface MatchRecentForm {
  teamName: string
  /** Oldest to newest, left to right (max 5). */
  results: MatchFormResult[]
  /** Points won across the listed results (3/1/0). */
  points: number
}

export interface MatchFacts {
  comparison: MatchComparison | null
  recentForm: MatchRecentForm | null
}
