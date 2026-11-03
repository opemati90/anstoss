import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { R2Provider } from './r2.provider'
import { lockMediaObject } from './media-object-lock'
import { isOwnedPrivateV1Key } from '../media/private-v1-owner'
import { uploadKindFor, type ChatAttachmentType } from '../media/chat-media-limits'
import { privateV1CleanupEnabled, PRIVATE_V1_PAUSED_UNTIL } from '../media/private-v1-reservations'

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
      const now = new Date()
      const due = await this.prisma.accountMediaDeletion.findMany({
        where: { OR: [
          { uploadState: null, availableAt: { lte: now } },
          ...(privateV1CleanupEnabled() ? [{ uploadState: 'PENDING', uploadExpiresAt: { lte: now },
            availableAt: { lte: now } }] : []),
        ] },
        orderBy: [{ availableAt: 'asc' }, { objectKey: 'asc' }],
        take: 40,
      })
      // A separate budget prevents the distant bridge sentinel from starving
      // behind a sustained stream of ordinary due jobs.
      const paused = privateV1CleanupEnabled() ? await this.prisma.accountMediaDeletion.findMany({
        where: { uploadState: 'PENDING', uploadExpiresAt: { lte: now }, availableAt: PRIVATE_V1_PAUSED_UNTIL },
        orderBy: [{ uploadExpiresAt: 'asc' }, { objectKey: 'asc' }], take: 10,
      }) : []
      const jobs = [...new Map([...paused, ...due].map((job) => [job.objectKey, job])).values()]
      for (const job of jobs) {
        // Optimistic lease shared across replicas. A crashed worker's claim
        // becomes eligible again; deletion is idempotent after partial success.
        const leaseUntil = new Date(Date.now() + 5 * 60_000)
        const claim = await this.prisma.accountMediaDeletion.updateMany({
          where: { objectKey: job.objectKey, uploadState: job.uploadState, attempts: job.attempts, availableAt: job.availableAt },
          data: { attempts: { increment: 1 }, availableAt: leaseUntil },
        })
        if (claim.count !== 1) continue
        const where = { objectKey: job.objectKey, attempts: job.attempts + 1, availableAt: leaseUntil, uploadState: job.uploadState }
        try {
          await this.prisma.$transaction(
            async (tx) => {
              await lockMediaObject(tx, job.objectKey)
              // The job may have been cancelled or repurposed while this
              // worker waited on the object lock. Never act on a stale lease.
              const claimed = await tx.accountMediaDeletion.findUnique({
                where: { objectKey: job.objectKey },
                select: { attempts: true, availableAt: true, uploadState: true, uploadExpiresAt: true, uploadOwnerId: true },
              })
              if (!claimed || claimed.attempts !== job.attempts + 1 || claimed.uploadState !== job.uploadState
                || claimed.availableAt.getTime() !== leaseUntil.getTime()) return
              if (claimed.uploadState === 'PENDING') {
                const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
                if (!claimed.uploadExpiresAt || claimed.uploadExpiresAt > now) return
                // A rolling deployment may have persisted a message on an
                // older replica that did not consume its reservation. Adopt
                // only a canonical, sender-bound live reference; all other
                // ambiguous references remain held for investigation.
                const ownerId = claimed.uploadOwnerId
                if (!ownerId) return
                const attachmentUrl = `https://private-media.anstoss.invalid/${job.objectKey}`
                const [channel, direct] = await Promise.all([
                  tx.message.findFirst({ where: { attachmentUrl, senderId: ownerId, deletedAt: null },
                    select: { clubId: true, teamId: true, messageType: true } }),
                  tx.directMessage.findFirst({ where: { attachmentUrl, senderId: ownerId, deletedAt: null },
                    select: { conversationId: true, messageType: true, conversation: { select: { clubId: true } } } }),
                ])
                const kinds = ['VOICE', 'IMAGE', 'VIDEO', 'FILE']
                const channelOwns = channel && kinds.includes(channel.messageType)
                  && isOwnedPrivateV1Key(job.objectKey, { targetType: 'chat', clubId: channel.clubId,
                    targetId: channel.teamId, ownerId, kind: uploadKindFor(channel.messageType as ChatAttachmentType) })
                const directOwns = direct && kinds.includes(direct.messageType)
                  && isOwnedPrivateV1Key(job.objectKey, { targetType: 'dm', clubId: direct.conversation.clubId,
                    targetId: direct.conversationId, ownerId, kind: uploadKindFor(direct.messageType as ChatAttachmentType) })
                if (channelOwns || directOwns) {
                  await tx.accountMediaDeletion.deleteMany({ where: { ...where, uploadOwnerId: ownerId } })
                  return
                }
              } else if (claimed.uploadState !== null) return
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
              const keySuffixes = [...new Set([job.objectKey, encodeURI(job.objectKey)])]
              const holds = await Promise.all([
                tx.messageReport.findFirst({ where: evidenceWhere, select: { id: true } }),
                tx.directMessageReport.findFirst({ where: evidenceWhere, select: { id: true } }),
                tx.message.findFirst({ where: liveReferenceWhere, select: { id: true } }),
                tx.directMessage.findFirst({ where: liveReferenceWhere, select: { id: true } }),
                tx.freeAgentMedia.findFirst({ where: { OR: keySuffixes.flatMap((key) => [
                  { url: { endsWith: `/${key}` } }, { thumbnailUrl: { endsWith: `/${key}` } },
                ]) }, select: { id: true } }),
                tx.user.findFirst({ where: { deletedAt: null, OR: keySuffixes.map((key) => ({
                  avatarUrl: { endsWith: `/${key}` },
                })) }, select: { id: true } }),
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
