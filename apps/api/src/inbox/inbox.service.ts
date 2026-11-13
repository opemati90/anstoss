import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { InboxNotification, InboxNotificationPage, NotificationInboxQuery } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { resolveLocale, type Locale } from '../i18n/translations'
import { formatPush, PUSH_TEMPLATES, type NotificationType } from '../push/push.templates'

/** Rows older than this are pruned by {@link InboxService.pruneOlderThan}. */
export const INBOX_RETENTION_DAYS = 90

type RecordInput =
  | {
      kind: 'template'
      type: NotificationType
      data: unknown
      target?: Record<string, string> | null
      clubId?: string | null
      teamId?: string | null
    }
  | {
      kind: 'rendered'
      type: string
      /** Rendered per recipient language at write time. */
      render: (locale: Locale) => { title: string; body: string }
      target?: Record<string, string> | null
      clubId?: string | null
      teamId?: string | null
    }

type Row = {
  id: string
  type: string
  data: unknown
  title: string | null
  body: string | null
  target: unknown
  clubId: string | null
  teamId: string | null
  createdAt: Date
  readAt: Date | null
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Store one inbox entry per recipient. Never throws: the inbox is a side
   * record of a push and must not break the action that triggered it.
   */
  async record(userIds: string[], input: RecordInput): Promise<void> {
    const recipients = Array.from(new Set(userIds.filter(Boolean)))
    if (recipients.length === 0) return
    try {
      const target = sanitizeTarget(input.target)
      if (input.kind === 'template') {
        await this.prisma.inboxNotification.createMany({
          data: recipients.map((userId) => ({
            userId,
            type: input.type,
            data: (input.data ?? {}) as object,
            target: target ?? undefined,
            clubId: input.clubId ?? target?.clubId ?? null,
            teamId: input.teamId ?? target?.teamId ?? null,
          })),
        })
        return
      }
      const users = await this.prisma.user.findMany({
        where: { id: { in: recipients } },
        select: { id: true, preferredLanguage: true },
      })
      const rendered = new Map<Locale, { title: string; body: string }>()
      await this.prisma.inboxNotification.createMany({
        data: users.map((user: { id: string; preferredLanguage: string | null }) => {
          const locale = resolveLocale(user.preferredLanguage)
          let copy = rendered.get(locale)
          if (!copy) {
            copy = input.render(locale)
            rendered.set(locale, copy)
          }
          return {
            userId: user.id,
            type: input.type,
            title: copy.title,
            body: copy.body,
            target: target ?? undefined,
            clubId: input.clubId ?? target?.clubId ?? null,
            teamId: input.teamId ?? target?.teamId ?? null,
          }
        }),
      })
    } catch (err) {
      this.logger.warn(
        `Inbox write failed for ${input.type}: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  async list(userId: string, query: NotificationInboxQuery): Promise<InboxNotificationPage> {
    const cursor = decodeCursor(query.cursor)
    const [rows, unreadCount, user] = await Promise.all([
      this.prisma.inboxNotification.findMany({
        where: {
          userId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      }),
      this.unreadCount(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { preferredLanguage: true } }),
    ])
    const locale = resolveLocale(user?.preferredLanguage)
    const page = rows.slice(0, query.limit) as Row[]
    const last = page[page.length - 1]
    return {
      items: page.map((row) => toDto(row, locale)),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
      unreadCount,
    }
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.inboxNotification.count({ where: { userId, readAt: null } })
  }

  async markRead(userId: string, id: string): Promise<{ unreadCount: number }> {
    const result = await this.prisma.inboxNotification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    })
    if (result.count === 0) throw new NotFoundException('Notification not found')
    return { unreadCount: await this.unreadCount(userId) }
  }

  async markAllRead(userId: string): Promise<{ unreadCount: number }> {
    await this.prisma.inboxNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { unreadCount: 0 }
  }

  /** Housekeeping: drop entries older than the retention window. */
  async pruneOlderThan(days = INBOX_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const result = await this.prisma.inboxNotification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    return result.count
  }
}

function toDto(row: Row, locale: Locale): InboxNotification {
  let title = row.title ?? ''
  let body = row.body ?? ''
  if (row.type in PUSH_TEMPLATES && row.data && typeof row.data === 'object') {
    try {
      const copy = formatPush(row.type as NotificationType, row.data as never, locale)
      title = copy.title
      body = copy.body
    } catch {
      // Template data from an older shape: fall back to any stored copy.
    }
  }
  return {
    id: row.id,
    type: row.type,
    title,
    body,
    clubId: row.clubId,
    teamId: row.teamId,
    target: sanitizeTarget(row.target as Record<string, string> | null),
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }
}

/** Keep only string values; the payload is a deep link, not arbitrary JSON. */
function sanitizeTarget(target: Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!target || typeof target !== 'object') return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(target)) {
    if (typeof value === 'string' && value.length <= 512) out[key] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    const createdAt = new Date(iso)
    if (!id || Number.isNaN(createdAt.getTime())) return null
    return { createdAt, id }
  } catch {
    return null
  }
}
