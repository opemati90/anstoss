import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { R2Provider } from '../assets/r2.provider'

const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const RETENTION_BATCH_SIZE = 500

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

      const result = await tenantContext.run(
        { clubId: club.id, userId: 'system:chat-retention' },
        () => this.purgeClub(settings, now),
      )
      messagesDeleted += result.messagesDeleted
      attachmentsPurged += result.attachmentsPurged
    }

    return { messagesDeleted, attachmentsPurged }
  }

  private async purgeClub(settings: RetentionSettings, now: Date) {
    const messageCutoff = daysAgo(now, settings.messageRetentionDays)
    const attachmentCutoff = daysAgo(now, settings.attachmentRetentionDays)

    let attachmentsPurged = 0
    for (;;) {
      const candidates = await this.prisma.message.findMany({
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

      const attachmentResult = await this.prisma.$transaction(async (tx) => {
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
          select: { id: true, attachmentUrl: true },
        })

        const objectKeys = lockedAttachments
          .map((m) => (m.attachmentUrl ? this.r2.objectKeyFromUrl(m.attachmentUrl) : null))
          .filter((key): key is string => !!key)

        if (objectKeys.length > 0) {
          if (!this.r2.enabled) {
            throw new Error('R2 is not configured; chat attachment retention cannot safely delete objects')
          }
          await this.r2.deleteObjects(objectKeys)
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
      })
      attachmentsPurged += attachmentResult.count
    }

    let channelMessagesDeleted = 0
    for (;;) {
      const candidates = await this.prisma.message.findMany({
        where: {
          clubId: settings.clubId,
          deletedAt: null,
          createdAt: { lte: messageCutoff },
          reports: { none: { resolvedAt: null } },
        },
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
      })
      if (candidates.length === 0) break

      const messageIds = candidates.map((m) => m.id)
      const messageResult = await this.prisma.$transaction(async (tx) => {
        await lockChannelMessages(tx, messageIds)
        const updateResult = await tx.message.updateMany({
          where: {
            clubId: settings.clubId,
            id: { in: messageIds },
            deletedAt: null,
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
      })
      channelMessagesDeleted += messageResult.count
    }

    for (;;) {
      const candidates = await this.prisma.message.findMany({
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
      await this.prisma.$transaction(async (tx) => {
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
      })
    }

    let directMessagesDeleted = 0
    for (;;) {
      const candidates = await this.prisma.directMessage.findMany({
        where: {
          deletedAt: null,
          createdAt: { lte: messageCutoff },
          reports: { none: { resolvedAt: null } },
          conversation: { clubId: settings.clubId },
        },
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
      })
      if (candidates.length === 0) break

      const messageIds = candidates.map((m) => m.id)
      const directMessageResult = await this.prisma.$transaction(async (tx) => {
        await lockDirectMessages(tx, messageIds)
        const updateResult = await tx.directMessage.updateMany({
          where: {
            id: { in: messageIds },
            deletedAt: null,
            createdAt: { lte: messageCutoff },
            reports: { none: { resolvedAt: null } },
            conversation: { clubId: settings.clubId },
          },
          data: { content: '', deletedAt: now },
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
      })
      directMessagesDeleted += directMessageResult.count
    }

    for (;;) {
      const candidates = await this.prisma.directMessage.findMany({
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
      await this.prisma.$transaction(async (tx) => {
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
      })
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
