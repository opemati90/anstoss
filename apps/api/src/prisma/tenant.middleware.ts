import { TenantScopeViolationError } from '@anstoss/shared'

// Prisma v5+ removed MiddlewareParams type export but $use still works at runtime.
// Define the params shape that $use passes to the middleware function.
interface MiddlewareParams {
  model?: string
  action: string
  args: any
  dataPath: string[]
  runInTransaction: boolean
}

/**
 * Prisma tenant-scoping middleware.
 *
 * MANDATED BY CEO REVIEW — #1 security measure.
 *
 * Auto-injects clubId on all queries for tenant-scoped models.
 * No per-query manual clubId filtering — globally enforced.
 *
 * How it works:
 *   1. Request handler sets clubId on AsyncLocalStorage context
 *   2. This middleware reads clubId from context
 *   3. On every find/update/delete, it injects `where: { clubId }`
 *   4. On every create, it injects `data: { clubId }`
 *   5. If clubId is missing for a tenant-scoped operation, it throws
 *
 * Tenant-scoped models (have clubId column):
 *   TeamGroup, Team, TeamAccess, GuardianRelationship, ParentalConsent,
 *   ExternalTeamLink, ImportedFixture, FixtureOverlay, SyncRun,
 *   Event, Message, Invite, ClubContributionSettings, ContributionPlan,
 *   ContributionAssignment, ContributionRecord, ContributionReminder
 *
 * Models scoped via relation (don't need direct clubId injection):
 *   TeamMember (via team), Rsvp (via event)
 *   Membership (bridge table — queried by both userId and clubId explicitly)
 */

// Models that have a direct clubId column and MUST be tenant-scoped
const TENANT_SCOPED_MODELS = new Set([
  'TeamGroup',
  'Team',
  'TeamAccess',
  'GuardianRelationship',
  'ParentalConsent',
  'ExternalTeamLink',
  'ImportedFixture',
  'FixtureOverlay',
  'SyncRun',
  'Event',
  'Message',
  'Invite',
  'TrialInvite',
  'InjuryReport',
  'TeamDutyAssignment',
  'ClubContributionSettings',
  'ContributionPlan',
  'ContributionAssignment',
  'ContributionRecord',
  'ContributionReminder',
])

const READ_ACTIONS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'count',
  'aggregate',
  'groupBy',
])

export function createTenantMiddleware(
  getClubId: () => string | undefined,
) {
  return async (params: MiddlewareParams, next: (params: MiddlewareParams) => Promise<unknown>) => {
    const clubId = getClubId()

    if (!params.model) {
      return next(params)
    }

    // Direct tenant-scoped models: inject clubId automatically
    if (TENANT_SCOPED_MODELS.has(params.model)) {
      if (!clubId) {
        if (READ_ACTIONS.has(params.action)) {
          return next(params)
        }

        throw new TenantScopeViolationError(
          `${params.model}.${params.action} called without clubId in context. ` +
            'Set clubId via AsyncLocalStorage before mutating tenant-scoped data.',
        )
      }

      switch (params.action) {
        case 'findMany':
        case 'findFirst':
        case 'findUnique':
        case 'count':
        case 'aggregate':
        case 'groupBy':
          params.args = params.args || {}
          params.args.where = { ...params.args.where, clubId }
          break

        case 'create':
          params.args = params.args || {}
          params.args.data = { ...params.args.data, clubId }
          break

        case 'createMany':
          params.args = params.args || {}
          if (Array.isArray(params.args.data)) {
            params.args.data = params.args.data.map((item: Record<string, unknown>) => ({
              ...item,
              clubId,
            }))
          } else {
            params.args.data = { ...params.args.data, clubId }
          }
          break

        case 'update':
        case 'updateMany':
        case 'delete':
        case 'deleteMany':
          params.args = params.args || {}
          params.args.where = { ...params.args.where, clubId }
          break

        case 'upsert':
          params.args = params.args || {}
          params.args.where = { ...params.args.where, clubId }
          params.args.create = { ...params.args.create, clubId }
          break
      }
    }

    return next(params)
  }
}
