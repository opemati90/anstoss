import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { R2Provider } from '../assets/r2.provider'
import { isPrivateUploadMarker, PrivateUploadBindingError, retireMessageUpload } from '../assets/private-upload-retirement'
import { isProvenOwnedLegacyMedia, retireLegacyChatMedia } from '../assets/legacy-chat-media-retirement'

const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const RETENTION_BATCH_SIZE = 500

class LegacyRetentionNeedsReview extends Error {}
export class RetentionSweepError extends Error {
  constructor(readonly summary: { messagesDeleted: number; attachmentsPurged: number; blockedClubIds: string[]; failedClubIds: string[] }) {
    super(summary.failedClubIds.length
      ? 'Chat retention failed for one or more clubs; some attachments may require provenance review'
      : 'Chat attachment retention requires provenance review; other clubs may have completed')
  }
}

type RetentionSettings = {
  clubId: string
  enabled: boolean
  messageRetentionDays: number
  attachmentRetentionDays: number
}

@Injectable()
export class ChatRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRetentionWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Provider,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    if (process.env.CHAT_RETENTION_SWEEP_ENABLED !== 'true') {
      this.logger.log('Chat retention sweep disabled; set CHAT_RETENTION_SWEEP_ENABLED=true to run.')
      return
    }
    this.timer = setInterval(() => void this.tick(), RETENTION_SWEEP_INTERVAL_MS)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async purgeExpired(now = new Date()) {
    const clubs = await this.prisma.club.findMany({
      select: {
        id: true,
        chatRetentionSettings: {
          select: {
            clubId: true,
            enabled: true,
            messageRetentionDays: true,
            attachmentRetentionDays: true,
          },
        },
      },
    })

    let messagesDeleted = 0
    let attachmentsPurged = 0
    const blockedClubIds: string[] = []
    const failedClubIds: string[] = []
    for (const club of clubs) {
      const settings =
        club.chatRetentionSettings ??
        ({
          clubId: club.id,
          enabled: false,
          messageRetentionDays: 365,
          attachmentRetentionDays: 90,
        } satisfies RetentionSettings)
      if (!settings.enabled) continue

      try {
        const result = await tenantContext.run({ clubId: club.id, userId: 'system:chat-retention' },
          () => this.purgeClubWithRetry(settings, now))
        messagesDeleted += result.messagesDeleted
        attachmentsPurged += result.attachmentsPurged
      } catch (error) {
        if (error instanceof LegacyRetentionNeedsReview || error instanceof PrivateUploadBindingError) {
          blockedClubIds.push(club.id)
          this.logger.warn(`Chat retention rolled back for club ${JSON.stringify(club.id)}; attachment review required`)
        } else {
          failedClubIds.push(club.id)
          const candidate = error as { code?: unknown; name?: unknown; meta?: { code?: unknown } }
          const code = typeof candidate?.code === 'string' && /^P\d{4}$/.test(candidate.code) ? candidate.code : 'unknown'
          const name = typeof candidate?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(candidate.name) ? candidate.name : 'Error'
          const sqlstate = ['40001', '40P01'].includes(String(candidate?.meta?.code)) ? String(candidate?.meta?.code) : 'unknown'
          this.logger.error(`Chat retention failed for club ${JSON.stringify(club.id)}; transaction rolled back (class=${name}, code=${code}, sqlstate=${sqlstate})`)
        }
      }
    }

    if (blockedClubIds.length || failedClubIds.length) {
      throw new RetentionSweepError({ messagesDeleted, attachmentsPurged, blockedClubIds, failedClubIds })
    }

    return { messagesDeleted, attachmentsPurged }
  }

  /** Read-only, advisory counts; execution rechecks eligibility under row locks. */
  async previewExpired(now = new Date()) {
    const clubs = await this.prisma.club.findMany({
      select: { id: true, chatRetentionSettings: true },
    })
    const rows = []
    for (const club of clubs) {
      const settings = club.chatRetentionSettings
      if (!settings?.enabled) continue
      const messageCutoff = daysAgo(now, settings.messageRetentionDays)
      const attachmentCutoff = daysAgo(now, settings.attachmentRetentionDays)
      const unreported = { reports: { none: { resolvedAt: null } } }
      const messages = { ...unreported, deletedAt: null, createdAt: { lte: messageCutoff } }
      const attachments = {
        ...unreported, attachmentUrl: { not: null },
        OR: [
          { createdAt: { lte: attachmentCutoff } },
          { createdAt: { lte: messageCutoff }, deletedAt: null },
        ],
      }
      const counts = await tenantContext.run({ clubId: club.id, userId: 'system:chat-retention-preview' }, async () => {
        // A tagged v1 reference is a candidate, not proof of ownership. The
        // preview explicitly reports bindingStatus:not_checked; the sweep
        // validates the full sender/scope binding inside its transaction.
        const legacy = { NOT: [
          { attachmentUrl: { startsWith: 'https://private-media.anstoss.invalid/private-chat/v2/' } },
          { attachmentUrl: { contains: '/private-v1-u' } },
        ] }
        const [channelMessages, directMessages, channelAttachments, directAttachments, channelLegacyBlocked, directLegacyBlocked] = await Promise.all([
          this.prisma.message.count({ where: { clubId: club.id, ...messages } }),
          this.prisma.directMessage.count({ where: { conversation: { clubId: club.id }, ...messages } }),
          this.prisma.message.count({ where: { clubId: club.id, ...attachments } }),
          this.prisma.directMessage.count({ where: { conversation: { clubId: club.id }, ...attachments } }),
          this.prisma.message.count({ where: { clubId: club.id, ...attachments, ...legacy } }),
          this.prisma.directMessage.count({ where: { conversation: { clubId: club.id }, ...attachments, ...legacy } }),
        ])
        return { channelMessages, directMessages, channelAttachments, directAttachments, channelLegacyBlocked, directLegacyBlocked,
          legacyAttachmentsRequireReview: channelLegacyBlocked > 0 || directLegacyBlocked > 0,
          bindingStatus: 'not_checked' as const }
      })
      rows.push({ clubId: club.id, messageCutoff, attachmentCutoff, ...counts })
    }
    return { asOf: now, advisory: true, clubsScanned: clubs.length, enabledClubs: rows }
  }

  private async purgeClubWithRetry(settings: RetentionSettings, now: Date) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Settings mutations take the same club lock. FOR UPDATE also forces
          // a Serializable conflict/retry if a concurrent update committed
          // while this transaction was waiting on that advisory lock.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-retention-settings:${settings.clubId}`}))`
          const rows = await tx.$queryRaw<RetentionSettings[]>`
            SELECT "clubId", "enabled", "messageRetentionDays", "attachmentRetentionDays"
            FROM "ClubChatRetentionSettings" WHERE "clubId" = ${settings.clubId} FOR UPDATE
          `
          const fresh = rows[0]
          if (!fresh?.enabled) return { messagesDeleted: 0, attachmentsPurged: 0 }
          return this.purgeClub(fresh, now, tx)
        },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000, maxWait: 10_000 })
      } catch (error) {
        const failure = error as { code?: string; meta?: { code?: string } }
        const retryable = failure?.code === 'P2034'
          || (failure?.code === 'P2010' && ['40001', '40P01'].includes(failure.meta?.code ?? ''))
        if (!retryable || attempt >= 2) throw error
      }
    }
  }

  private async purgeClub(settings: RetentionSettings, now: Date, db: Prisma.TransactionClient) {
    const messageCutoff = daysAgo(now, settings.messageRetentionDays)
    const attachmentCutoff = daysAgo(now, settings.attachmentRetentionDays)

    // Both streams and all batches share one serializable transaction: an
    // unprovable binding anywhere rolls back every change to this club.
    const dueLegacy = {
      attachmentUrl: { not: null },
      NOT: [
        { attachmentUrl: { startsWith: 'https://private-media.anstoss.invalid/private-chat/v2/' } },
        { attachmentUrl: { contains: '/private-v1-u' } },
      ],
      reports: { none: { resolvedAt: null } },
      OR: [
        { createdAt: { lte: attachmentCutoff } },
        { createdAt: { lte: messageCutoff }, deletedAt: null },
      ],
    }
    const [channelLegacy, directLegacy] = await Promise.all([
      db.message.count({ where: { clubId: settings.clubId, ...dueLegacy } }),
      db.directMessage.count({ where: { conversation: { clubId: settings.clubId }, ...dueLegacy } }),
    ])
    if (channelLegacy || directLegacy) throw new LegacyRetentionNeedsReview('Legacy chat attachment retention requires provenance review')

    let attachmentsPurged = 0
    for (;;) {
      const candidates = await db.message.findMany({
        where: {
          clubId: settings.clubId,
          attachmentUrl: { not: null },
          reports: { none: { resolvedAt: null } },
          OR: [
            { createdAt: { lte: attachmentCutoff } },
            { createdAt: { lte: messageCutoff }, deletedAt: null },
          ],
        },
        select: { id: true, attachmentUrl: true },
        take: RETENTION_BATCH_SIZE,
      })

      if (candidates.length === 0) break

      const attachmentResult = await (async (tx: Prisma.TransactionClient) => {
        await lockChannelMessages(tx, candidates.map((m) => m.id))
        const lockedAttachments = await tx.message.findMany({
          where: {
            clubId: settings.clubId,
            id: { in: candidates.map((m) => m.id) },
            attachmentUrl: { not: null },
            reports: { none: { resolvedAt: null } },
            OR: [
              { createdAt: { lte: attachmentCutoff } },
              { createdAt: { lte: messageCutoff }, deletedAt: null },
            ],
          },
          select: { id: true, attachmentUrl: true, channelId: true, teamId: true, senderId: true, messageType: true },
        })

        if (lockedAttachments.some((message) => !isPrivateUploadMarker(message.attachmentUrl)
          && !isProvenOwnedLegacyMedia(this.r2, message.attachmentUrl, { kind: 'chat', clubId: settings.clubId,
            targetId: message.teamId, senderId: message.senderId, messageType: message.messageType }))) {
          throw new LegacyRetentionNeedsReview('Legacy chat attachment retention requires provenance review')
        }
        for (const message of lockedAttachments) {
          if (isPrivateUploadMarker(message.attachmentUrl)) {
            const retired = await retireMessageUpload(tx, {
              clubId: settings.clubId, messageId: message.id, targetType: 'CHANNEL', targetId: message.channelId,
            })
            if (!retired) throw new PrivateUploadBindingError('Private upload message binding is unavailable')
          } else {
            try {
              await retireLegacyChatMedia(tx, this.r2, message.attachmentUrl, { kind: 'chat', clubId: settings.clubId,
                targetId: message.teamId, senderId: message.senderId, messageType: message.messageType })
            } catch (error) {
              if (error instanceof Error && error.name === 'ServiceUnavailableException') {
                throw new LegacyRetentionNeedsReview('Legacy chat attachment retention requires provenance review')
              }
              throw error
            }
          }
        }

        return tx.message.updateMany({
          where: {
            clubId: settings.clubId,
            id: { in: lockedAttachments.map((m) => m.id) },
            attachmentUrl: { not: null },
            reports: { none: { resolvedAt: null } },
          },
          data: { attachmentUrl: null, attachmentMeta: null as never },
        })
      })(db)
      attachmentsPurged += attachmentResult.count
    }

    let channelMessagesDeleted = 0
    for (;;) {
      const candidates = await db.message.findMany({
        where: {
          clubId: settings.clubId,
          deletedAt: null,
          attachmentUrl: null,
          createdAt: { lte: messageCutoff },
          reports: { none: { resolvedAt: null } },
        },
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
      })
      if (candidates.length === 0) break

      const messageIds = candidates.map((m) => m.id)
      const messageResult = await (async (tx: Prisma.TransactionClient) => {
        await lockChannelMessages(tx, messageIds)
        const updateResult = await tx.message.updateMany({
          where: {
            clubId: settings.clubId,
            id: { in: messageIds },
            deletedAt: null,
            attachmentUrl: null,
            createdAt: { lte: messageCutoff },
            reports: { none: { resolvedAt: null } },
          },
          data: {
            content: '',
            attachmentUrl: null,
            attachmentMeta: null as never,
            deletedAt: now,
          },
        })
        await tx.messageTranslation.deleteMany({
          where: {
            messageId: { in: messageIds },
            message: {
              clubId: settings.clubId,
              deletedAt: now,
            },
          },
        })
        await tx.pollVote.deleteMany({
          where: {
            poll: {
              messageId: { in: messageIds },
              message: { clubId: settings.clubId, deletedAt: now },
            },
          },
        })
        await tx.pollOption.deleteMany({
          where: {
            poll: {
              messageId: { in: messageIds },
              message: { clubId: settings.clubId, deletedAt: now },
            },
          },
        })
        await tx.poll.deleteMany({
          where: {
            messageId: { in: messageIds },
            message: { clubId: settings.clubId, deletedAt: now },
          },
        })
        return updateResult
      })(db)
      channelMessagesDeleted += messageResult.count
    }

    for (;;) {
      const candidates = await db.message.findMany({
        where: {
          clubId: settings.clubId,
          deletedAt: { not: null },
          createdAt: { lte: messageCutoff },
          reports: { none: { resolvedAt: null } },
          OR: [{ translations: { some: {} } }, { poll: { isNot: null } }],
        },
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
      })
      if (candidates.length === 0) break

      const messageIds = candidates.map((m) => m.id)
      await (async (tx: Prisma.TransactionClient) => {
        await lockChannelMessages(tx, messageIds)
        await tx.messageTranslation.deleteMany({
          where: {
            messageId: { in: messageIds },
            message: {
              clubId: settings.clubId,
              deletedAt: { not: null },
              createdAt: { lte: messageCutoff },
              reports: { none: { resolvedAt: null } },
            },
          },
        })
        await tx.pollVote.deleteMany({
          where: {
            poll: {
              messageId: { in: messageIds },
              message: {
                clubId: settings.clubId,
                deletedAt: { not: null },
                createdAt: { lte: messageCutoff },
                reports: { none: { resolvedAt: null } },
              },
            },
          },
        })
        await tx.pollOption.deleteMany({
          where: {
            poll: {
              messageId: { in: messageIds },
              message: {
                clubId: settings.clubId,
                deletedAt: { not: null },
                createdAt: { lte: messageCutoff },
                reports: { none: { resolvedAt: null } },
              },
            },
          },
        })
        await tx.poll.deleteMany({
          where: {
            messageId: { in: messageIds },
            message: {
              clubId: settings.clubId,
              deletedAt: { not: null },
              createdAt: { lte: messageCutoff },
              reports: { none: { resolvedAt: null } },
            },
          },
        })
      })(db)
    }

    // Chat revamp: DM attachments (photo/video/PDF/voice) follow the same
    // attachment + message windows as channel media; the R2 object is
    // deleted with the reference. Unresolved reports keep the evidence.
    for (;;) {
      const dmAttachmentWhere = {
        attachmentUrl: { not: null },
        reports: { none: { resolvedAt: null } },
        conversation: { clubId: settings.clubId },
        OR: [
          { createdAt: { lte: attachmentCutoff } },
          { createdAt: { lte: messageCutoff }, deletedAt: null },
        ],
      }
      const candidates = await db.directMessage.findMany({
        where: dmAttachmentWhere,
        select: { id: true, attachmentUrl: true },
        take: RETENTION_BATCH_SIZE,
      })
      if (!candidates || candidates.length === 0) break

      const result = await (async (tx: Prisma.TransactionClient) => {
        await lockDirectMessages(tx, candidates.map((m) => m.id))
        const locked = await tx.directMessage.findMany({
          where: { id: { in: candidates.map((m) => m.id) }, ...dmAttachmentWhere },
          select: { id: true, attachmentUrl: true, conversationId: true, senderId: true, messageType: true },
        })
        if (locked.some((message) => !isPrivateUploadMarker(message.attachmentUrl)
          && !isProvenOwnedLegacyMedia(this.r2, message.attachmentUrl, { kind: 'dm', clubId: settings.clubId,
            targetId: message.conversationId, senderId: message.senderId, messageType: message.messageType }))) {
          throw new LegacyRetentionNeedsReview('Legacy DM attachment retention requires provenance review')
        }
        for (const message of locked) {
          if (isPrivateUploadMarker(message.attachmentUrl)) {
            const retired = await retireMessageUpload(tx, {
              clubId: settings.clubId, messageId: message.id, targetType: 'DM', targetId: message.conversationId,
            })
            if (!retired) throw new PrivateUploadBindingError('Private upload message binding is unavailable')
          } else {
            try {
              await retireLegacyChatMedia(tx, this.r2, message.attachmentUrl, { kind: 'dm', clubId: settings.clubId,
                targetId: message.conversationId, senderId: message.senderId, messageType: message.messageType })
            } catch (error) {
              if (error instanceof Error && error.name === 'ServiceUnavailableException') {
                throw new LegacyRetentionNeedsReview('Legacy DM attachment retention requires provenance review')
              }
              throw error
            }
          }
        }
        return tx.directMessage.updateMany({
          where: {
            id: { in: locked.map((m) => m.id) },
            attachmentUrl: { not: null },
            reports: { none: { resolvedAt: null } },
            conversation: { clubId: settings.clubId },
          },
          data: { attachmentUrl: null, attachmentMeta: Prisma.DbNull },
        })
      })(db)
      attachmentsPurged += result.count
      if (result.count === 0) break
    }

    let directMessagesDeleted = 0
    for (;;) {
      const candidates = await db.directMessage.findMany({
        where: {
          deletedAt: null,
          attachmentUrl: null,
          createdAt: { lte: messageCutoff },
          reports: { none: { resolvedAt: null } },
          conversation: { clubId: settings.clubId },
        },
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
      })
      if (candidates.length === 0) break

      const messageIds = candidates.map((m) => m.id)
      const directMessageResult = await (async (tx: Prisma.TransactionClient) => {
        await lockDirectMessages(tx, messageIds)
        const updateResult = await tx.directMessage.updateMany({
          where: {
            id: { in: messageIds },
            deletedAt: null,
            attachmentUrl: null,
            createdAt: { lte: messageCutoff },
            reports: { none: { resolvedAt: null } },
            conversation: { clubId: settings.clubId },
          },
          data: { content: '', attachmentUrl: null, attachmentMeta: Prisma.DbNull, deletedAt: now },
        })
        await tx.directMessageTranslation.deleteMany({
          where: {
            directMessageId: { in: messageIds },
            directMessage: {
              deletedAt: now,
              conversation: { clubId: settings.clubId },
            },
          },
        })
        return updateResult
      })(db)
      directMessagesDeleted += directMessageResult.count
    }

    for (;;) {
      const candidates = await db.directMessage.findMany({
        where: {
          deletedAt: { not: null },
          createdAt: { lte: messageCutoff },
          reports: { none: { resolvedAt: null } },
          translations: { some: {} },
          conversation: { clubId: settings.clubId },
        },
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
      })
      if (candidates.length === 0) break

      const messageIds = candidates.map((m) => m.id)
      await (async (tx: Prisma.TransactionClient) => {
        await lockDirectMessages(tx, messageIds)
        await tx.directMessageTranslation.deleteMany({
          where: {
            directMessageId: { in: messageIds },
            directMessage: {
              deletedAt: { not: null },
              createdAt: { lte: messageCutoff },
              reports: { none: { resolvedAt: null } },
              conversation: { clubId: settings.clubId },
            },
          },
        })
      })(db)
    }

    return {
      messagesDeleted: channelMessagesDeleted + directMessagesDeleted,
      attachmentsPurged,
    }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      const result = await this.purgeExpired()
      if (result.messagesDeleted > 0 || result.attachmentsPurged > 0) {
        this.logger.log(
          `Chat retention purged ${result.messagesDeleted} messages and ${result.attachmentsPurged} attachments.`,
        )
      }
    } catch (error) {
      if (error instanceof RetentionSweepError) {
        this.logger.error(`Chat retention partial result: ${JSON.stringify(error.summary)}`)
      }
      this.logger.error(
        `Chat retention sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    } finally {
      this.running = false
    }
  }
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

async function lockChannelMessages(tx: any, messageIds: string[]) {
  for (const id of [...new Set(messageIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-message:${id}`}))`
  }
}

async function lockDirectMessages(tx: any, messageIds: string[]) {
  for (const id of [...new Set(messageIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dm-message:${id}`}))`
  }
}
