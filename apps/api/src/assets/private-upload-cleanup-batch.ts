import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { getClubId, tenantContext } from '../prisma/tenant.context'
import { PrivateUploadCleanup } from './private-upload-cleanup'

/** Trusted, tenant-scoped batch runner. Lifecycle operation tokens, not this
 * scheduling lease, decide whether provider writes may run. Safe to revisit
 * pending operations after a process restart; the executor observes them.
 * Runtime timer/DI activation remains gated with the v2 upload rollout.
 */
export class PrivateUploadCleanupBatch {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'privateMediaUpload'>,
    private readonly cleanup: Pick<PrivateUploadCleanup, 'run'>,
  ) {}

  async run(clubId: string, shouldContinue: () => boolean = () => true) {
    if (!clubId || (getClubId() && getClubId() !== clubId)) {
      throw new Error('Private upload cleanup tenant mismatch')
    }
    return tenantContext.run({ clubId, userId: 'private-upload-cleanup' }, async () => {
      if (!shouldContinue()) return { selected: 0, outcomes: {} }
      const now = new Date()
      const jobs = await this.prisma.privateMediaUpload.findMany({
        where: { clubId, cleanupAvailableAt: { lte: now }, state: { not: 'REMOVED' },
          OR: [{ cancelRequestedAt: { not: null } }, { state: { not: 'ATTACHED' }, expiresAt: { lte: now } }] },
        orderBy: [{ cleanupAvailableAt: 'asc' }, { id: 'asc' }], take: 25,
        select: { id: true, clubId: true, ownerId: true, cleanupAvailableAt: true, cleanupClaimId: true },
      })
      const outcomes: Partial<Record<Awaited<ReturnType<PrivateUploadCleanup['run']>>, number>> = {}
      for (const job of jobs) {
        if (!shouldContinue()) break
        if (job.clubId !== clubId) throw new Error('Private upload cleanup tenant mismatch')
        const cleanupClaimId = randomUUID()
        const claim = await this.prisma.privateMediaUpload.updateMany({
          where: { id: job.id, clubId, ownerId: job.ownerId,
            cleanupAvailableAt: job.cleanupAvailableAt, cleanupClaimId: job.cleanupClaimId },
          data: { cleanupClaimId, cleanupAvailableAt: new Date(Date.now() + 10 * 60_000) },
        })
        if (claim.count !== 1) continue
        // A stop after claim retains the short lease for a later cycle; never
        // start fresh provider work after observing shutdown/disablement.
        if (!shouldContinue()) break
        let result: Awaited<ReturnType<PrivateUploadCleanup['run']>>
        try { result = await this.cleanup.run({ id: job.id, clubId, ownerId: job.ownerId }) }
        catch { result = 'unknown' }
        outcomes[result] = (outcomes[result] ?? 0) + 1
        const minutes = result === 'awaiting-part-cleanup' ? 360
          : result === 'held' || result === 'conflict' ? 60
          : result === 'unknown' ? 15 : 1
        // A slow former worker must not overwrite the next worker's schedule.
        await this.prisma.privateMediaUpload.updateMany({
          where: { id: job.id, clubId, ownerId: job.ownerId, cleanupClaimId },
          data: { cleanupClaimId: null, cleanupAvailableAt: new Date(Date.now() + minutes * 60_000) },
        })
      }
      return { selected: jobs.length, outcomes }
    })
  }
}
