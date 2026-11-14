import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { R2Provider } from './r2.provider'

/** Call inside the transaction that erases the last database references. */
export async function queueMediaDeletion(
  tx: Pick<Prisma.TransactionClient, 'mediaDeletionJob'>,
  objectKeys: string[],
): Promise<void> {
  if (objectKeys.length === 0) return
  await tx.mediaDeletionJob.createMany({
    // Upload URLs live for ten minutes. Wait out already-issued PUT URLs so
    // a late upload cannot recreate an object after the erasure succeeds.
    data: Array.from(new Set(objectKeys)).map((objectKey) => ({
      objectKey,
      nextAttemptAt: new Date(Date.now() + 15 * 60_000),
    })),
    skipDuplicates: true,
  })
  await tx.mediaDeletionJob.updateMany({
    where: { objectKey: { in: objectKeys }, reclaimable: true },
    data: { reclaimable: false, nextAttemptAt: new Date(Date.now() + 15 * 60_000) },
  })
}

/** Retry durable erasures. No names, URLs or keys are written to logs. */
@Injectable()
export class MediaDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaDeletionService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Provider,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), 60_000)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      // Missing credentials must not hide an approaching retention breach.
      const overdue = await this.prisma.mediaDeletionJob.count({
        where: { createdAt: { lt: new Date(Date.now() - 25 * 86_400_000) } },
      })
      if (overdue > 0) this.logger.error(`${overdue} media erasure job(s) need urgent intervention`)
      if (!this.r2.enabled) return
      const jobs = await this.prisma.mediaDeletionJob.findMany({
        where: { nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: 'asc' },
        take: 50,
      })
      for (const job of jobs) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Serialize against attaching a pending upload, profile deletion
            // and account deletion. Re-read after the lock: an attachment may
            // have cancelled its lease since the sweep selected this row.
            const userId = /^users\/([^/]+)\//.exec(job.objectKey)?.[1]
            if (userId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`media-erasure:${job.id}`}))`
            const current = await tx.mediaDeletionJob.findFirst({
              where: { id: job.id, nextAttemptAt: { lte: new Date() } },
            })
            if (!current) return
            await this.r2.deleteObjects([current.objectKey])
            await tx.mediaDeletionJob.deleteMany({ where: { id: current.id } })
          }, { timeout: 20_000 })
        } catch {
          const delayMs = Math.min(3_600_000, 60_000 * 2 ** Math.min(job.attempts, 6))
          await this.prisma.mediaDeletionJob.updateMany({
            where: { id: job.id },
            data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + delayMs) },
          })
          this.logger.warn('Media erasure failed; durable retry retained')
        }
      }
    } catch {
      this.logger.error('Media erasure queue unavailable; next sweep will retry')
    } finally {
      this.running = false
    }
  }
}
