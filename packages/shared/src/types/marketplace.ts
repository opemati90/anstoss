export enum PlayerPosition {
  GK = 'GK',
  DEF = 'DEF',
  MID = 'MID',
  FWD = 'FWD',
}

export enum PreferredFoot {
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  BOTH = 'BOTH',
}

export enum FreeAgentVisibility {
  PUBLIC = 'PUBLIC',
  CLUB_ONLY = 'CLUB_ONLY',
  PRIVATE = 'PRIVATE',
}

export enum TrialInviteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
  // Wechselbörse pipeline (2026-09). PENDING = "Eingeladen" (club invited to
  // concrete sessions), ACCEPTED = "Termin zugesagt".
  REQUESTED = 'REQUESTED',
  OFFERED = 'OFFERED',
  JOINED = 'JOINED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

/** Who opened the Probetraining thread: the club (invite) or the player (request). */
export enum TrialInitiator {
  CLUB = 'CLUB',
  PLAYER = 'PLAYER',
}

/** A club's "Gesuch" (e.g. "Herren II sucht Torwart"). */
export enum PlayerSearchStatus {
  OPEN = 'OPEN',
  FILLED = 'FILLED',
  CLOSED = 'CLOSED',
}

/** Freigabe status of the previous club during a Vereinswechsel. */
export enum WechselReleaseStatus {
  PENDING = 'PENDING',
  GRANTED = 'GRANTED',
  REFUSED = 'REFUSED',
  NOT_NEEDED = 'NOT_NEEDED',
}

/**
 * Highest league a player has played in. German amateur ladder, top down.
 * Names differ per Landesverband (Berlin-Liga vs Verbandsliga); these are
 * the common levels, labelled in the client.
 */
export const LEAGUE_LEVELS = [
  'REGIONALLIGA',
  'OBERLIGA',
  'VERBANDSLIGA',
  'LANDESLIGA',
  'BEZIRKSLIGA',
  'KREISLIGA_A',
  'KREISLIGA_B',
  'KREISLIGA_C',
  'YOUTH',
  'NONE',
] as const

export type LeagueLevel = (typeof LEAGUE_LEVELS)[number]

/** Pipeline stage a trial shows up under, derived from status + sessions. */
export type TrialStage = 'REQUESTED' | 'INVITED' | 'SCHEDULED' | 'DECISION' | 'DONE'
