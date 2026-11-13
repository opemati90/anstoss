import type { MatchLiveEventKind, MatchLiveStatus } from '../schemas/live'

export interface MatchLiveEventDto {
  id: string
  kind: MatchLiveEventKind
  minute: number
  playerUserId: string | null
  playerName: string | null
  relatedUserId: string | null
  relatedName: string | null
  createdAt: string
}

export interface MatchLiveStateDto {
  eventId: string
  status: MatchLiveStatus
  /** Team's own goals / opponent goals. */
  goalsFor: number
  goalsAgainst: number
  /** Same score mapped onto home/away using the event's homeAway (home if unset). */
  scoreHome: number
  scoreAway: number
  homeAway: 'HOME' | 'AWAY' | null
  opponent: string | null
  /**
   * Redesign 15: the opponent crest colour ("#B23A3A"), from the fussball.de
   * club or typed by the coach. Absent on older APIs: the crest stays white.
   */
  opponentColor?: string | null
  /** Running minute derived from the clock; null before kick-off. */
  minute: number | null
  kickoffAt: string | null
  secondHalfAt: string | null
  finishedAt: string | null
  /** Newest first. */
  events: MatchLiveEventDto[]
  /** Whether the caller may record events and move the clock. */
  canRecord: boolean
}
