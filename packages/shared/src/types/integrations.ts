export type ExternalDataProvider =
  | 'api_fussball'
  | 'fussball_public_page'
  | 'openligadb'
  | 'club_manual'
  | 'widget_embed'
  | 'weather'
  | 'maps'
  | 'veo_manual'

export type ExternalTeamLinkStatus =
  | 'ACTIVE'
  | 'NEEDS_REVIEW'
  | 'ERROR'
  | 'DISCONNECTED'

export type ImportedFixtureStatus =
  | 'scheduled'
  | 'live'
  | 'finished'
  | 'postponed'
  | 'cancelled'
  | 'unknown'

export type FixtureDataConfidence =
  | 'official_partner'
  | 'official_widget'
  | 'unofficial_public'
  | 'community_open'
  | 'club_entered'
  | 'mixed'

export type SyncRunStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED'

export interface TableSnapshotRow {
  place: number
  team: string
  img: string | null
  games: number
  won: number
  draw: number
  lost: number
  goal: string
  goalDifference: number
  points: number
  isPromotion: boolean
  isRelegation: boolean
}

export interface ExternalTeamLink {
  id: string
  clubId: string
  teamId: string
  provider: ExternalDataProvider
  externalTeamId: string
  externalClubId: string | null
  externalUrl: string
  label: string
  status: ExternalTeamLinkStatus
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ImportedFixture {
  id: string
  clubId: string
  teamId: string
  teamLinkId: string
  provider: ExternalDataProvider
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
  tableSnapshot: TableSnapshotRow[] | null
  sourceConfidence: FixtureDataConfidence
  rawPayload: Record<string, unknown>
  lastSeenAt: string
  createdAt: string
  updatedAt: string
  overlay: FixtureOverlay | null
  eventId: string | null
}

export interface FixtureOverlay {
  id: string
  fixtureId: string
  arrivalTime: string | null
  meetingPoint: string | null
  kitColor: string | null
  travelNotes: string | null
  squadDeadline: string | null
  veoLink: string | null
  fieldLocks: string[]
  createdAt: string
  updatedAt: string
}

export interface SyncRun {
  id: string
  clubId: string
  teamLinkId: string
  provider: ExternalDataProvider
  status: SyncRunStatus
  importedCount: number
  updatedCount: number
  skippedCount: number
  parserVersion: string
  errorSummary: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
}

export interface FussballTeamPreview {
  input: string
  provider: 'api_fussball'
  externalTeamId: string
  externalUrl: string
  label: string
  competition: string | null
  pitchAddress: string | null
  sourceConfidence: FixtureDataConfidence
}

export interface ClubPublicSummary {
  clubId: string
  teamId: string | null
  linkedTeam: ExternalTeamLink | null
  nextMatch: ImportedFixture | null
  lastResult: ImportedFixture | null
  table: TableSnapshotRow[]
  formStreak: string[]
  updatedAt: string | null
  widgetUrl: string | null
}
