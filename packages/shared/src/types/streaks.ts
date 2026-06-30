/**
 * Streaks — verified engagement aggregates for a club member, plus a club
 * leaderboard. Computed server-side from real ops data (event RSVPs bucketed by
 * ISO week, MOTM poll wins), so the values are "backed by truth, not scrapes"
 * and safe to surface on the gamified player card.
 */

export interface StreaksMe {
  /** Current attendance streak: consecutive ISO weeks with ≥1 YES RSVP. */
  attendanceWeeks: number
  /** Longest attendance streak in the rolling window. */
  attendanceLongest: number
  /** Current MOTM streak: consecutive eligible weeks the member won MOTM. */
  motmWeeks: number
  /** Longest MOTM streak in the rolling window. */
  motmLongest: number
  /** ISO timestamp of the member's most recent counted activity. */
  lastActivityAt: string
}

export interface StreaksLeaderboardEntry {
  userId: string
  name: string
  avatarUrl: string | null
  attendanceWeeks: number
  motmWeeks: number
}

export interface StreaksResponse {
  me: StreaksMe
  leaderboard: StreaksLeaderboardEntry[]
}
