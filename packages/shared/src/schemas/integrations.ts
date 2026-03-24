import { z } from 'zod'

export const externalDataProviderSchema = z.enum([
  'api_fussball',
  'fussball_public_page',
  'openligadb',
  'club_manual',
  'widget_embed',
  'weather',
  'maps',
  'veo_manual',
])

export const externalTeamLinkStatusSchema = z.enum([
  'ACTIVE',
  'NEEDS_REVIEW',
  'ERROR',
  'DISCONNECTED',
])

export const importedFixtureStatusSchema = z.enum([
  'scheduled',
  'live',
  'finished',
  'postponed',
  'cancelled',
  'unknown',
])

export const fixtureDataConfidenceSchema = z.enum([
  'official_partner',
  'official_widget',
  'unofficial_public',
  'community_open',
  'club_entered',
  'mixed',
])

export const syncRunStatusSchema = z.enum(['SUCCESS', 'PARTIAL', 'FAILED'])

export const tableSnapshotRowSchema = z.object({
  place: z.number().int().min(1),
  team: z.string().min(1),
  img: z.string().url().nullable(),
  games: z.number().int().min(0),
  won: z.number().int().min(0),
  draw: z.number().int().min(0),
  lost: z.number().int().min(0),
  goal: z.string().min(1),
  goalDifference: z.number().int(),
  points: z.number(),
  isPromotion: z.boolean(),
  isRelegation: z.boolean(),
})

export const externalTeamLinkSchema = z.object({
  id: z.string().min(1),
  clubId: z.string().min(1),
  teamId: z.string().min(1),
  provider: externalDataProviderSchema,
  externalTeamId: z.string().min(1),
  externalClubId: z.string().min(1).nullable(),
  externalUrl: z.string().url(),
  label: z.string().min(1).max(140),
  status: externalTeamLinkStatusSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const fixtureOverlaySchema = z.object({
  id: z.string().min(1),
  fixtureId: z.string().min(1),
  arrivalTime: z.string().datetime().nullable(),
  meetingPoint: z.string().max(160).nullable(),
  kitColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable(),
  travelNotes: z.string().max(1000).nullable(),
  squadDeadline: z.string().datetime().nullable(),
  veoLink: z.string().url().nullable(),
  fieldLocks: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const importedFixtureSchema = z.object({
  id: z.string().min(1),
  clubId: z.string().min(1),
  teamId: z.string().min(1),
  teamLinkId: z.string().min(1),
  provider: externalDataProviderSchema,
  externalMatchId: z.string().min(1),
  competition: z.string().min(1).max(160),
  season: z.string().max(40).nullable(),
  kickoffAt: z.string().datetime(),
  status: importedFixtureStatusSchema,
  homeTeam: z.string().min(1).max(160),
  awayTeam: z.string().min(1).max(160),
  homeLogo: z.string().url().nullable(),
  awayLogo: z.string().url().nullable(),
  venueName: z.string().max(160).nullable(),
  pitchAddress: z.string().max(500).nullable(),
  resultHome: z.number().int().min(0).nullable(),
  resultAway: z.number().int().min(0).nullable(),
  tableSnapshot: z.array(tableSnapshotRowSchema).nullable(),
  sourceConfidence: fixtureDataConfidenceSchema,
  rawPayload: z.record(z.unknown()),
  lastSeenAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  overlay: fixtureOverlaySchema.nullable(),
  eventId: z.string().min(1).nullable(),
})

export const syncRunSchema = z.object({
  id: z.string().min(1),
  clubId: z.string().min(1),
  teamLinkId: z.string().min(1),
  provider: externalDataProviderSchema,
  status: syncRunStatusSchema,
  importedCount: z.number().int().min(0),
  updatedCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  parserVersion: z.string().min(1).max(40),
  errorSummary: z.string().max(1000).nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export const fussballTeamPreviewRequestSchema = z.object({
  input: z.string().min(1).max(500),
})

export const fussballTeamPreviewSchema = z.object({
  input: z.string().min(1),
  provider: z.literal('api_fussball'),
  externalTeamId: z.string().min(1),
  externalUrl: z.string().url(),
  label: z.string().min(1).max(140),
  competition: z.string().max(160).nullable(),
  pitchAddress: z.string().max(500).nullable(),
  sourceConfidence: fixtureDataConfidenceSchema,
})

export const createExternalTeamLinkSchema = z.object({
  teamId: z.string().min(1),
  input: z.string().min(1).max(500),
  label: z.string().min(1).max(140).optional(),
})

export const syncTeamLinkSchema = z.object({
  force: z.boolean().optional(),
})

export const teamFixturesQuerySchema = z.object({
  scope: z.enum(['all', 'upcoming', 'recent']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export const updateFixtureOverlaySchema = z.object({
  arrivalTime: z.string().datetime().nullable().optional(),
  meetingPoint: z.string().max(160).nullable().optional(),
  kitColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  travelNotes: z.string().max(1000).nullable().optional(),
  squadDeadline: z.string().datetime().nullable().optional(),
  veoLink: z.string().url().nullable().optional(),
})

export const updateFixtureLocksSchema = z.object({
  fieldLocks: z.array(z.string().min(1)).max(12),
  values: z
    .object({
      kickoffAt: z.string().datetime().optional(),
      venueName: z.string().max(160).nullable().optional(),
      pitchAddress: z.string().max(500).nullable().optional(),
      status: importedFixtureStatusSchema.optional(),
      resultHome: z.number().int().min(0).nullable().optional(),
      resultAway: z.number().int().min(0).nullable().optional(),
    })
    .optional(),
})

export const clubPublicSummarySchema = z.object({
  clubId: z.string().min(1),
  teamId: z.string().min(1).nullable(),
  linkedTeam: externalTeamLinkSchema.nullable(),
  nextMatch: importedFixtureSchema.nullable(),
  lastResult: importedFixtureSchema.nullable(),
  table: z.array(tableSnapshotRowSchema),
  formStreak: z.array(z.string().min(1)),
  updatedAt: z.string().datetime().nullable(),
  widgetUrl: z.string().url().nullable(),
})

export type FussballTeamPreviewRequestInput = z.infer<
  typeof fussballTeamPreviewRequestSchema
>
export type CreateExternalTeamLinkInput = z.infer<
  typeof createExternalTeamLinkSchema
>
export type SyncTeamLinkInput = z.infer<typeof syncTeamLinkSchema>
export type TeamFixturesQueryInput = z.infer<typeof teamFixturesQuerySchema>
export type UpdateFixtureOverlayInput = z.infer<typeof updateFixtureOverlaySchema>
export type UpdateFixtureLocksInput = z.infer<typeof updateFixtureLocksSchema>
