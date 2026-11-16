import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { formatPush } from '../push/push.templates'
import { INTL_LOCALE_TAG, resolveLocale, type Locale } from '../i18n/translations'
import { eventTitleFor } from './event-copy'
import { TeamsService } from '../teams/teams.service'
import { hasPendingReminderReceipts } from '../push/reminder-delivery'

const DEFAULT_INTERVAL_MS = 60 * 1000
const BATCH_SIZE = 100

@Injectable()
export class EventReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventReminderWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly teamsService: TeamsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.EVENT_REMINDER_WORKER_DISABLED === 'true') {
      return
    }

    const intervalMs = resolveInterval()
    this.timer = setInterval(() => {
      void this.runCycle()
    }, intervalMs)
    this.timer.unref?.()

    void this.runCycle()
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  async runCycle() {
    if (this.running) return
    this.running = true
    try {
      const now = new Date()
      const prefs = await this.prisma.eventReminderPreference.findMany({
        where: { sent: false, remindAt: { lte: now } },
        select: { id: true },
        orderBy: [{ remindAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
      })
      for (const candidate of prefs) {
        try {
          await this.prisma.$transaction(
            async (tx) => {
              // Keep overlapping API instances from sending the same reminder.
              // SKIP LOCKED lets another instance process other recipients.
              const locked = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id" FROM "EventReminderPreference" WHERE "id" = ${candidate.id}
              FOR UPDATE SKIP LOCKED`
              if (!locked.length) return
              const pref = await tx.eventReminderPreference.findUnique({
                where: { id: candidate.id },
                include: {
                  event: true,
                  user: { select: { preferredLanguage: true, deletedAt: true } },
                },
              })
              const current = new Date()
              if (!pref || pref.sent || pref.remindAt > current) return
              const finish = () =>
                tx.eventReminderPreference.update({ where: { id: pref.id }, data: { sent: true } })
              if (
                pref.event.cancelledAt ||
                pref.event.archivedAt ||
                pref.user.deletedAt ||
                (pref.event.date <= current && !hasPendingReminderReceipts(pref.deliveryState))
              ) {
                await finish()
                return
              }
              try {
                await this.teamsService.assertReadableAccess(pref.userId, pref.event.teamId, {
                  eventId: pref.event.id,
                })
              } catch (error) {
                if (
                  error instanceof TeamAccessDeniedError ||
                  error instanceof ForbiddenException ||
                  error instanceof NotFoundException
                ) {
                  await finish()
                  return
                }
                throw error
              }
              const scheduled = new Date(pref.event.date.getTime() - 60 * 60_000)
              if (scheduled > current) {
                await tx.eventReminderPreference.update({
                  where: { id: pref.id },
                  data: { remindAt: scheduled },
                })
                return
              }
              const locale = resolveLocale(pref.user.preferredLanguage)
              const { title, body } = formatPush(
                'EVENT_REMINDER',
                {
                  eventTitle: eventTitleFor(pref.event, locale),
                  timeUntil: formatTimeUntil(pref.event.date, locale),
                  location: pref.event.location ?? undefined,
                },
                locale,
              )
              const result = await this.pushService.advanceEventReminder({
                userId: pref.userId,
                saved: pref.deliveryState,
                eventDate: pref.event.date,
                title,
                body,
                data: {
                  type: 'event',
                  reminderId: pref.id,
                  eventId: pref.event.id,
                  clubId: pref.event.clubId,
                  teamId: pref.event.teamId,
                },
              })
              await tx.eventReminderPreference.update({
                where: { id: pref.id },
                data: {
                  // 'sent' is the legacy completion flag, NOT proof of display.
                  // Per-device outcomes distinguish provider acceptance and failure.
                  sent: result.complete,
                  deliveryState: result.state,
                  remindAt: result.nextAt,
                },
              })
            },
            { timeout: 30_000 },
          )
        } catch {
          this.logger.warn(`Event reminder attempt failed for pref ${candidate.id}; will retry`)
          await this.prisma.eventReminderPreference.updateMany({
            where: {
              id: candidate.id,
              sent: false,
              remindAt: { lte: now },
            },
            data: { remindAt: new Date(Date.now() + resolveInterval()) },
          })
        }
      }
    } catch {
      this.logger.warn('Event reminder cycle failed; will retry next cycle')
    } finally {
      this.running = false
    }
  }
}

/**
 * Relative "in 20 minutes" / "dans 2 heures" / "20 dakika sonra" in the
 * reader's language via Intl.RelativeTimeFormat (native phrasing and plurals).
 */
export function formatTimeUntil(date: Date, locale: Locale, now: number = Date.now()): string {
  const diffMinutes = Math.round((date.getTime() - now) / 60000)
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE_TAG[locale], { numeric: 'auto' })
  if (diffMinutes <= 0) return rtf.format(0, 'second')
  if (diffMinutes < 60) return rtf.format(diffMinutes, 'minute')
  return rtf.format(Math.round(diffMinutes / 60), 'hour')
}

function resolveInterval() {
  const rawValue = process.env.EVENT_REMINDER_INTERVAL_MS
  if (!rawValue) return DEFAULT_INTERVAL_MS
  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS
}
