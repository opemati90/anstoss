import { AsyncLocalStorage } from 'async_hooks'

/**
 * AsyncLocalStorage context for tenant scoping.
 *
 * Every request sets the clubId here. The Prisma tenant middleware
 * reads it to auto-inject clubId on all tenant-scoped queries.
 *
 * Usage in a NestJS guard/interceptor:
 *   tenantContext.run({ clubId: resolvedClubId }, () => next.handle())
 */

interface TenantStore {
  clubId: string
  userId: string
}

export const tenantContext = new AsyncLocalStorage<TenantStore>()

export function getClubId(): string | undefined {
  return tenantContext.getStore()?.clubId
}
