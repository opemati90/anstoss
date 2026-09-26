import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MembershipRole, MODERATION_RESPONSE_HOURS } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { R2Provider } from '../assets/r2.provider'
import { sendEmail } from '../email/mailer'

/**
 * Safeguarding review (2026-09-24): shared moderation safety rules.
 *
 *  - Escalation: a report goes to the platform queue (club admins cannot see
 *    or resolve it) when the reason is SAFEGUARDING or the reported sender is
 *    staff of the club (OWNER/ADMIN/COACH membership or a team coach).
 *  - Overdue: an open report older than 24h alerts the platform team once and
 *    is flagged escalated ('overdue'); club admins may still resolve it.
 *  - Evidence: moderators get a 5-minute signed URL for a reported
 *    attachment. On removal the stored object is moved to quarantine. 90 days
 *    after resolution the evidence (text, URL, quarantined object) is purged.
 */

export const ESCALATION = {
  SAFEGUARDING: 'safeguarding',
  STAFF_SENDER: 'staff_sender',
  OVERDUE: 'overdue',
} as const
export type EscalationReason = (typeof ESCALATION)[keyof typeof ESCALATION]

/** Escalations that take the report away from club moderators entirely. */
export const PLATFORM_ONLY_ESCALATIONS: string[] = [ESCALATION.SAFEGUARDING, ESCALATION.STAFF_SENDER]

export const EVIDENCE_RETENTION_DAYS = 90
export const EVIDENCE_URL_TTL_SECONDS = 300

const DAY_MS = 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

type Db = Pick<PrismaService, 'membership' | 'teamAccess'>

/** OWNER/ADMIN/COACH of the club, or an active/pending coach of one of its teams. */
export async function isClubStaff(db: Db, userId: string | null, clubId: string): Promise<boolean> {
  if (!userId) return false
  const membership = await db.membership.findFirst({
    where: {
      userId,
      clubId,
      role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH] },
    },
    select: { userId: true },
  })
  if (membership) return true
  const coach = await tenantContext.run({ clubId, userId: 'system:moderation' }, () =>
    db.teamAccess.findFirst({
      where: {
        clubId,
        userId,
        role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { userId: true },
    }),
  )
  return Boolean(coach)
}

type Quarantine = { bucket: string; key: string }

export function readQuarantine(meta: unknown): Quarantine | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const q = (meta as Record<string, unknown>).quarantine
  if (!q || typeof q !== 'object') return null
  const { bucket, key } = q as Record<string, unknown>
  return typeof bucket === 'string' && typeof key === 'string' ? { bucket, key } : null
}

/**
 * H6: a short-lived signed URL for a report's attachment evidence, or null
 * (no attachment, purged, R2 off, or a URL outside our bucket).
 */
export async function signEvidenceUrl(
  r2: R2Provider | undefined,
  report: {
    evidenceAttachmentUrl: string | null
    evidenceAttachmentMeta: unknown
    evidencePurgedAt?: Date | null
  },
): Promise<string | null> {
  if (!r2?.enabled || report.evidencePurgedAt) return null
  try {
    const quarantined = readQuarantine(report.evidenceAttachmentMeta)
    if (quarantined) {
      return await r2.presignGetIn(quarantined.bucket, quarantined.key, EVIDENCE_URL_TTL_SECONDS)
    }
    if (!report.evidenceAttachmentUrl) return null
    const key = r2.objectKeyFromUrl(report.evidenceAttachmentUrl)
    return key ? await r2.presignGet(key, EVIDENCE_URL_TTL_SECONDS) : null
  } catch {
    return null
  }
}

/**
 * H6: after a removal committed, move the message's stored attachment into
 * quarantine and point every report on that message at the quarantined copy.
 */
export async function quarantineRemovedAttachment(
  prisma: PrismaService,
  r2: R2Provider | undefined,
  input: { kind: 'channel' | 'direct'; messageId: string; attachmentUrl: string | null },
  logger: Logger,
): Promise<boolean> {
  if (!input.attachmentUrl || !r2?.enabled) return false
  const key = r2.objectKeyFromUrl(input.attachmentUrl)
  if (!key) return false
  try {
    const moved = await r2.quarantineObject(key)
    const data = {
      evidenceAttachmentUrl: null,
      evidenceAttachmentMeta: moved
        ? { quarantine: moved, originalKey: key } as Prisma.InputJsonValue
        : { unavailable: true, originalKey: key } as Prisma.InputJsonValue,
    }
    if (input.kind === 'channel') {
      await prisma.messageReport.updateMany({ where: { messageId: input.messageId, evidencePurgedAt: null }, data })
    } else {
      await prisma.directMessageReport.updateMany({
        where: { directMessageId: input.messageId, evidencePurgedAt: null },
        data,
      })
    }
    return true
  } catch (err) {
    logger.error(`quarantine failed for ${input.kind} message ${input.messageId}: ${(err as Error).message}`)
    // The report's original evidenceAttachmentUrl remains persisted. The
    // worker retries it after restarts until both storage and DB update succeed.
    return false
  }
}

/** Platform team alerts: email to SAFEGUARDING_ALERT_EMAILS (fallback INTERNAL_ADMIN_EMAILS). */
@Injectable()
export class PlatformSafetyAlerter {
  private readonly logger = new Logger(PlatformSafetyAlerter.name)

  recipients(): string[] {
    const raw = process.env.SAFEGUARDING_ALERT_EMAILS || process.env.INTERNAL_ADMIN_EMAILS || ''
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
  }

  /**
   * Internal operations alert (platform staff, English). Never contains the
   * reported content; the platform console shows it after login.
   */
  async alert(input: { reason: EscalationReason; reportIds: string[]; clubId: string | null }) {
    if (input.reportIds.length === 0) return
    const summary =
      input.reason === ESCALATION.SAFEGUARDING
        ? 'Child-safety (SAFEGUARDING) report: review immediately'
        : input.reason === ESCALATION.STAFF_SENDER
          ? 'Report against club staff escalated to the platform queue'
          : `Report(s) open longer than ${MODERATION_RESPONSE_HOURS}h`
    // Always leaves a log line (Sentry/log alerting) even without email.
    this.logger.error(
      `[moderation:${input.reason}] ${summary} club=${input.clubId ?? '-'} reports=${input.reportIds.join(',')}`,
    )
    const lines = [
      summary,
      `Club: ${input.clubId ?? 'n/a'}`,
      `Reports: ${input.reportIds.join(', ')}`,
      'Open the platform console > Moderation to act.',
    ]
    for (const to of this.recipients()) {
      await sendEmail({
        to,
        subject: `[Anstoss moderation] ${summary}`,
        text: lines.join('\n'),
        html: lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(''),
      })
    }
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * M6 / retention: hourly sweep (no scheduler dependency in this API; same
 * setInterval pattern as the chat retention worker). Disabled in tests and
 * with MODERATION_SAFETY_SWEEP_ENABLED=false. Safe on several instances:
 * each report is claimed with a conditional update before alerting.
 */
@Injectable()
export class ModerationSafetyWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModerationSafetyWorker.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerter: PlatformSafetyAlerter,
    @Optional() private readonly r2?: R2Provider,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    if (process.env.MODERATION_SAFETY_SWEEP_ENABLED === 'false') return
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick() {
    try {
      await this.retryPendingQuarantines()
      await this.alertOverdue()
      await this.purgeExpiredEvidence()
    } catch (err) {
      this.logger.warn(`moderation sweep failed: ${(err as Error).message}`)
    }
  }

  /** Persisted report URLs are the retry queue; no user request needs to retry. */
  async retryPendingQuarantines(): Promise<number> {
    if (!this.r2?.enabled) return 0
    const evidence = { evidencePurgedAt: null, evidenceAttachmentUrl: { not: null } }
    let channelCursor: string | undefined
    let directCursor: string | undefined
    let completed = 0
    const seen = new Set<string>()
    for (;;) {
      const [channel, direct] = await Promise.all([
        this.prisma.messageReport.findMany({
          where: { ...evidence, ...(channelCursor ? { id: { gt: channelCursor } } : {}), message: { is: { deletedAt: { not: null } } } },
          select: { id: true, messageId: true, evidenceAttachmentUrl: true },
          orderBy: { id: 'asc' }, take: 200,
        }),
        this.prisma.directMessageReport.findMany({
          where: { ...evidence, ...(directCursor ? { id: { gt: directCursor } } : {}), directMessage: { is: { deletedAt: { not: null } } } },
          select: { id: true, directMessageId: true, evidenceAttachmentUrl: true },
          orderBy: { id: 'asc' }, take: 200,
        }),
      ])
      if (!channel.length && !direct.length) break
      channelCursor = channel.at(-1)?.id ?? channelCursor
      directCursor = direct.at(-1)?.id ?? directCursor
      const tasks = new Map<string, { kind: 'channel' | 'direct'; messageId: string; attachmentUrl: string | null }>()
      for (const row of channel) tasks.set(`channel:${row.messageId}`, {
        kind: 'channel', messageId: row.messageId, attachmentUrl: row.evidenceAttachmentUrl,
      })
      for (const row of direct) tasks.set(`direct:${row.directMessageId}`, {
        kind: 'direct', messageId: row.directMessageId, attachmentUrl: row.evidenceAttachmentUrl,
      })
      for (const [key, input] of tasks) {
        if (seen.has(key)) continue
        seen.add(key)
        if (await quarantineRemovedAttachment(this.prisma, this.r2, input, this.logger)) completed++
      }
    }
    return completed
  }

  /** Alert once per open report older than the response target. */
  async alertOverdue(opts: { clubId?: string; now?: Date } = {}): Promise<string[]> {
    const now = opts.now ?? new Date()
    const before = new Date(now.getTime() - MODERATION_RESPONSE_HOURS * 60 * 60 * 1000)
    const [channel, direct] = await Promise.all([
      this.prisma.messageReport.findMany({
        where: {
          resolvedAt: null,
          overdueAlertedAt: null,
          createdAt: { lt: before },
          ...(opts.clubId ? { message: { is: { clubId: opts.clubId } } } : {}),
        },
        select: { id: true, escalatedAt: true, message: { select: { clubId: true } } },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.directMessageReport.findMany({
        where: {
          resolvedAt: null,
          overdueAlertedAt: null,
          createdAt: { lt: before },
          ...(opts.clubId
            ? { directMessage: { is: { conversation: { is: { clubId: opts.clubId } } } } }
            : {}),
        },
        select: {
          id: true,
          escalatedAt: true,
          directMessage: { select: { conversation: { select: { clubId: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    ])

    const claimed = new Map<string, string[]>()
    const add = (clubId: string, id: string) => claimed.set(clubId, [...(claimed.get(clubId) ?? []), id])
    for (const r of channel) {
      const res = await this.prisma.messageReport.updateMany({
        where: { id: r.id, overdueAlertedAt: null, resolvedAt: null },
        data: {
          overdueAlertedAt: now,
          ...(r.escalatedAt ? {} : { escalatedAt: now, escalationReason: ESCALATION.OVERDUE }),
        },
      })
      if (res.count === 1) add(r.message.clubId, r.id)
    }
    for (const r of direct) {
      const res = await this.prisma.directMessageReport.updateMany({
        where: { id: r.id, overdueAlertedAt: null, resolvedAt: null },
        data: {
          overdueAlertedAt: now,
          ...(r.escalatedAt ? {} : { escalatedAt: now, escalationReason: ESCALATION.OVERDUE }),
        },
      })
      if (res.count === 1) add(r.directMessage.conversation.clubId, r.id)
    }
    const all: string[] = []
    for (const [clubId, ids] of claimed) {
      all.push(...ids)
      await this.alerter.alert({ reason: ESCALATION.OVERDUE, reportIds: ids, clubId })
    }
    return all
  }

  /** Null report evidence (and delete quarantined media) 90 days after resolution. */
  async purgeExpiredEvidence(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - EVIDENCE_RETENTION_DAYS * DAY_MS)
    const where = { resolvedAt: { lt: cutoff }, evidencePurgedAt: null }
    const select = { id: true, evidenceAttachmentMeta: true, evidenceAttachmentUrl: true }
    let channelCursor: string | undefined
    let directCursor: string | undefined
    let purged = 0
    for (;;) {
      const [channel, direct] = await Promise.all([
        this.prisma.messageReport.findMany({ where: { ...where, ...(channelCursor ? { id: { gt: channelCursor } } : {}) }, select: { ...select, message: { select: { deletedAt: true } } }, orderBy: { id: 'asc' }, take: 500 }),
        this.prisma.directMessageReport.findMany({ where: { ...where, ...(directCursor ? { id: { gt: directCursor } } : {}) }, select: { ...select, directMessage: { select: { deletedAt: true } } }, orderBy: { id: 'asc' }, take: 500 }),
      ])
      if (!channel.length && !direct.length) break
      channelCursor = channel.at(-1)?.id ?? channelCursor
      directCursor = direct.at(-1)?.id ?? directCursor
      const data = {
        evidenceContent: null,
        evidenceAttachmentUrl: null,
        evidenceAttachmentMeta: Prisma.DbNull,
        evidencePurgedAt: now,
      }
      const rows = [
        ...channel.map((r) => ({ ...r, kind: 'channel' as const, removed: Boolean(r.message.deletedAt) })),
        ...direct.map((r) => ({ ...r, kind: 'direct' as const, removed: Boolean(r.directMessage.deletedAt) })),
      ]
      for (const r of rows) {
        // Do not erase the only durable retry pointer to removed public media.
        if (r.removed && r.evidenceAttachmentUrl) continue
        const q = readQuarantine(r.evidenceAttachmentMeta)
        if (q) {
          const referenceWhere = {
            evidencePurgedAt: null,
            OR: [{ resolvedAt: null }, { resolvedAt: { gte: cutoff } }],
            AND: [
              { evidenceAttachmentMeta: { path: ['quarantine', 'bucket'], equals: q.bucket } },
              { evidenceAttachmentMeta: { path: ['quarantine', 'key'], equals: q.key } },
            ],
          }
          const references = await Promise.all([
            this.prisma.messageReport.findFirst({ where: referenceWhere, select: { id: true } }),
            this.prisma.directMessageReport.findFirst({ where: referenceWhere, select: { id: true } }),
          ])
          if (!references.some(Boolean)) {
            if (!this.r2?.enabled) continue
            try { await this.r2.deleteObjectIn(q.bucket, q.key) }
            catch {
              this.logger.error(`Evidence deletion failed for report ${r.id}; retained for retry`)
              continue
            }
          }
        }
        const args = { where: { ...where, id: r.id }, data }
        const result = r.kind === 'channel'
          ? await this.prisma.messageReport.updateMany(args)
          : await this.prisma.directMessageReport.updateMany(args)
        purged += result.count
      }
    }
    return purged
  }
}
