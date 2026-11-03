import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { getClubId } from '../prisma/tenant.context'
import { PrivateUploadStorage } from './private-upload-storage'
import { PrivateUploadCleanup } from './private-upload-cleanup'
import { PrivateUploadCleanupBatch } from './private-upload-cleanup-batch'

/** Off by default. Does not enable upload routes. Discovers intents rather than
 * Club rows so deleted clubs/owners cannot strand storage cleanup work.
 */
@Injectable()
export class PrivateUploadCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrivateUploadCleanupWorker.name)
  private timer?: ReturnType<typeof setInterval>
  private batch?: PrivateUploadCleanupBatch
  private running = false
  private stopped = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.PRIVATE_UPLOAD_CLEANUP_ENABLED !== 'true') return
    const accountId = process.env.R2_ACCOUNT_ID ?? ''
    const bucket = process.env.R2_QUARANTINE_BUCKET?.trim()
    const accessKeyId = process.env.R2_QUARANTINE_ACCESS_KEY_ID?.trim()
    const secretAccessKey = process.env.R2_QUARANTINE_SECRET_ACCESS_KEY?.trim()
    if (!/^[a-f0-9]{32}$/i.test(accountId) || !bucket || !accessKeyId || !secretAccessKey
      || process.env.R2_QUARANTINE_JURISDICTION !== 'eu'
      || bucket === (process.env.R2_BUCKET_NAME || 'anstoss-assets')) {
      throw new Error('Private upload cleanup requires separate private EU storage credentials')
    }
    const storage = new PrivateUploadStorage({
      region: 'auto', endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }, bucket)
    this.batch = new PrivateUploadCleanupBatch(this.prisma, new PrivateUploadCleanup(this.prisma, storage))
    this.timer = setInterval(() => { void this.runCycle() }, 60_000)
    this.timer.unref?.()
    void this.runCycle()
  }

  onModuleDestroy() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
  }

  async runCycle() {
    if (this.stopped || this.running || !this.batch || process.env.PRIVATE_UPLOAD_CLEANUP_ENABLED !== 'true') return
    // Never run global tenant discovery inside a member request's context.
    if (getClubId()) {
      this.logger.warn('Private upload cleanup skipped inside tenant request context')
      return
    }
    this.running = true
    try {
      // Global internal discovery only; all mutation is delegated to the
      // tenant-scoped runner. No dependency on a surviving Club/User row.
      const clubs = await this.prisma.$queryRaw<Array<{ clubId: string }>>`
        SELECT "clubId" FROM "PrivateMediaUpload"
        WHERE "cleanupAvailableAt" <= NOW() AND "state" <> 'REMOVED'
          AND ("cancelRequestedAt" IS NOT NULL OR ("state" <> 'ATTACHED' AND "expiresAt" <= NOW()))
        GROUP BY "clubId" ORDER BY MIN("cleanupAvailableAt"), "clubId" LIMIT 10
      `
      for (const { clubId } of clubs) {
        if (this.stopped || process.env.PRIVATE_UPLOAD_CLEANUP_ENABLED !== 'true') break
        try {
          const { outcomes } = await this.batch.run(clubId,
            () => !this.stopped && process.env.PRIVATE_UPLOAD_CLEANUP_ENABLED === 'true')
          if (outcomes.conflict || outcomes.unknown || outcomes['awaiting-part-cleanup']) {
            this.logger.warn('Private upload cleanup has unresolved work; durable schedule retained')
          }
        } catch {
          this.logger.warn('Private upload cleanup batch failed; durable schedule retained')
        }
      }
    } catch {
      this.logger.warn('Private upload cleanup discovery failed; retry on next cycle')
    } finally { this.running = false }
  }
}
