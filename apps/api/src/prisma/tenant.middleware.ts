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
 * Security invariant: tenant-scoped mutations must run inside a club context.
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

// Models that have a direct clubId column and MUST be tenant-scoped.
// Exported so a schema-drift guard test can assert every clubId-bearing model
// in schema.prisma is registered here — a model with a clubId column that is
// NOT in this set would read/write completely unscoped (silent cross-tenant
// leak), so the test fails CI if anyone adds one without registering it.
export const TENANT_SCOPED_MODELS = new Set([
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
  'InviteCampaign',
  'InviteRedemption',
  'TrialInvite',
  'InjuryReport',
  'TeamDutyAssignment',
  'ClubContributionSettings',
  'ContributionPlan',
  'ContributionAssignment',
  'ContributionRecord',
  'ContributionReminder',
  'BankImportBatch',
  'BankTransaction',
  'ContributionMatch',
  'EventCheckIn',
])

/**
 * clubId-bearing models that are intentionally NOT auto-scoped by this
 * middleware. Each is authorized by another mechanism. Listed explicitly so the
 * schema-drift guard test can assert that every clubId model is consciously
 * classified as either scoped (above) or intentionally-unscoped (here) — a new
 * clubId model that lands in neither set fails CI and forces a decision.
 *
 * NOTE: membership in this list is a documented exclusion, not a proof of
 * safety. These still warrant per-model review; the value here is that the
 * exclusions are now explicit and reviewable instead of silent.
 */
export const TENANT_UNSCOPED_MODELS = new Set([
  // Bridge table — queried explicitly by userId AND clubId, never auto-injected.
  'Membership',
  // Stripe/billing — written from webhook handlers that run with NO request
  // context (no clubId in AsyncLocalStorage); auto-scoping would throw on write.
  // Authorized via Stripe signature + explicit clubId lookups.
  'StripeAccount',
  'Subscription',
  'PaymentEvent',
  // Platform/admin surfaces — filter clubId explicitly where needed and are
  // also read cross-club by superadmin tooling.
  'AuditLog',
  'SupportAction',
  'FeatureFlagOverride',
  // Chat — scoped by relation (channelId/conversationId/teamId) + service-layer
  // access asserts rather than a clubId where-injection.
  'Channel',
  'Conversation',
  // Membership-lifecycle + per-user/club records authorized at the service
  // layer via explicit clubId/userId filters.
  'JoinRequest',
  'NotificationPreference',
  'Sponsor',
  // Claim and ownership workflows must be readable before a caller has club
  // access and are guarded by claimant/reviewer/owner checks in their service.
  'ClubClaim',
  'ClubDispute',
  'OwnershipTransfer',
  'OwnershipTransferChallenge',
  // Platform-managed commercial state is created from signed webhooks or the
  // platform console and is intentionally queried across clubs.
  'EntitlementGrant',
  'ClubPlanCompliance',
])

export const READ_ACTIONS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'count',
  'aggregate',
  'groupBy',
])

/**
 * Reads of tenant-scoped models fail OPEN when there is no clubId in context
 * (writes fail closed — see below). This is intentional and load-bearing:
 * ~half the API surface is keyed by :teamId / :eventId / :planId etc. rather
 * than :clubId, so those routes never establish a clubId context. Those reads
 * are authorized at the service layer instead (assertReadableAccess /
 * assertManageAccess and friends). Flipping reads to fail closed would break
 * every relation-routed read endpoint.
 *
 * The risk a fail-open read carries is a cross-tenant leak if some path forgets
 * the service-level assert. We can't safely flip to fail-closed blindly, so the
 * migration is: make every fail-open read AUDITABLE. `onFailOpenRead` is called
 * (deduped per model+action) whenever a tenant-scoped read runs unscoped, so
 * the leak surface becomes visible in logs/Sentry and individual models can be
 * promoted to fail-closed later once their call sites are proven scoped.
 */
export function createTenantMiddleware(
  getClubId: () => string | undefined,
  onFailOpenRead?: (model: string, action: string) => void,
) {
  // Dedupe audit signals per process so a hot read path doesn't flood logs;
  // each distinct (model, action) that ever fails open is reported once.
  const reportedFailOpen = new Set<string>()

  return async (params: MiddlewareParams, next: (params: MiddlewareParams) => Promise<unknown>) => {
    const clubId = getClubId()

    if (!params.model) {
      return next(params)
    }

    // Direct tenant-scoped models: inject clubId automatically
    if (TENANT_SCOPED_MODELS.has(params.model)) {
      if (!clubId) {
        if (READ_ACTIONS.has(params.action)) {
          if (onFailOpenRead) {
            const key = `${params.model}.${params.action}`
            if (!reportedFailOpen.has(key)) {
              reportedFailOpen.add(key)
              onFailOpenRead(params.model, params.action)
            }
          }
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
