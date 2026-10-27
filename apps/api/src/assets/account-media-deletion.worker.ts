import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { R2Provider } from './r2.provider'
import { lockMediaObject } from './media-object-lock'

/** Global internal outbox. No HTTP surface and no dependency on a live user. */
@Injectable()
export class AccountMediaDeletionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountMediaDeletionWorker.name)
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Provider,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.ACCOUNT_MEDIA_DELETION_DISABLED === 'true')
      return
    this.timer = setInterval(() => {
      void this.runCycle()
    }, 60_000)
    this.timer.unref?.()
    void this.runCycle()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runCycle() {
    if (this.running) return
    this.running = true
    try {
      const jobs = await this.prisma.accountMediaDeletion.findMany({
        where: { availableAt: { lte: new Date() } },
        orderBy: [{ availableAt: 'asc' }, { objectKey: 'asc' }],
        take: 50,
      })
      for (const job of jobs) {
        // Optimistic lease shared across replicas. A crashed worker's claim
        // becomes eligible again; deletion is idempotent after partial success.
        const claim = await this.prisma.accountMediaDeletion.updateMany({
          where: { objectKey: job.objectKey, attempts: job.attempts, availableAt: job.availableAt },
          data: { attempts: { increment: 1 }, availableAt: new Date(Date.now() + 5 * 60_000) },
        })
        if (claim.count !== 1) continue
        const where = { objectKey: job.objectKey, attempts: job.attempts + 1 }
        try {
          await this.prisma.$transaction(
            async (tx) => {
              await lockMediaObject(tx, job.objectKey)
              // A source key may also have been referenced by another reported
              // message. Keep it until the moderation worker preserves its evidence.
              const evidenceWhere = {
                evidencePurgedAt: null,
                OR: [...new Set([job.objectKey, encodeURI(job.objectKey)])].map((key) => ({
                  evidenceAttachmentUrl: { endsWith: `/${key}` },
                })),
              }
              const liveReferenceWhere = {
                deletedAt: null,
                OR: [...new Set([job.objectKey, encodeURI(job.objectKey)])].map((key) => ({
                  attachmentUrl: { endsWith: `/${key}` },
                })),
              }
              const holds = await Promise.all([
                tx.messageReport.findFirst({ where: evidenceWhere, select: { id: true } }),
                tx.directMessageReport.findFirst({ where: evidenceWhere, select: { id: true } }),
                tx.message.findFirst({ where: liveReferenceWhere, select: { id: true } }),
                tx.directMessage.findFirst({ where: liveReferenceWhere, select: { id: true } }),
              ])
              if (holds.some(Boolean)) return // lease expiry schedules recheck
              await this.r2.deleteObjects([job.objectKey])
              await tx.accountMediaDeletion.deleteMany({ where })
            },
            { timeout: 45_000 },
          )
        } catch {
          // Do not persist raw provider errors, URLs or credentials. No retry
          // ceiling: an outage must never silently abandon an erasure request.
          await this.prisma.accountMediaDeletion.updateMany({
            where,
            data: {
              lastFailureAt: new Date(),
              availableAt: new Date(
                Date.now() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 9)),
              ),
            },
          })
          this.logger.error('Account media cleanup failed; durable retry retained')
        }
      }
    } catch {
      this.logger.error('Account media cleanup cycle failed; pending jobs retained')
    } finally {
      this.running = false
    }
  }
}
