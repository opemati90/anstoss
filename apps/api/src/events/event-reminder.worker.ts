import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { formatPush } from '../push/push.templates'
import { resolveLocale, type Locale } from '../i18n/translations'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const BATCH_SIZE = 100

@Injectable()
export class EventReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventReminderWorker.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.EVENT_REMINDER_WORKER_DISABLED === 'true'
    ) {
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
    const now = new Date()
    const prefs = await this.prisma.eventReminderPreference.findMany({
      where: {
        sent: false,
        remindAt: { lte: now },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            location: true,
            clubId: true,
            cancelledAt: true,
          },
        },
        user: { select: { preferredLanguage: true } },
      },
      take: BATCH_SIZE,
    })

    for (const pref of prefs) {
      try {
        // Skip cancelled events
        if (pref.event.cancelledAt) {
          await this.prisma.eventReminderPreference.update({
            where: { id: pref.id },
            data: { sent: true },
          })
          continue
        }

        const locale = resolveLocale(pref.user?.preferredLanguage)
        const timeUntil = formatTimeUntil(pref.event.date, locale)
        const { title, body } = formatPush(
          'EVENT_REMINDER',
          {
            eventTitle: pref.event.title,
            timeUntil,
            location: pref.event.location ?? undefined,
          },
          locale,
        )

        await this.pushService.sendToUser(pref.userId, title, body, {
          type: 'event',
          eventId: pref.event.id,
        }, { clubId: pref.event.clubId })

        await this.prisma.eventReminderPreference.update({
          where: { id: pref.id },
          data: { sent: true },
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown error'
        this.logger.warn(
          `Event reminder failed for pref ${pref.id}: ${message}`,
        )
      }
    }

    if (prefs.length > 0) {
      this.logger.log(`Processed ${prefs.length} event reminders.`)
    }
  }
}

function formatTimeUntil(date: Date, locale: Locale): string {
  const diffMs = date.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60000)

  const now: Record<Locale, string> = {
    de: 'jetzt',
    en: 'now',
    fr: 'maintenant',
    it: 'adesso',
    pt: 'agora',
  }
  // i18next-free relative phrasing incl. the preposition ("in"/"dans"/"tra"/"em").
  const inMinutes: Record<Locale, (n: number) => string> = {
    de: (n) => `in ${n} Min.`,
    en: (n) => `in ${n} min`,
    fr: (n) => `dans ${n} min`,
    it: (n) => `tra ${n} min`,
    pt: (n) => `em ${n} min`,
  }
  const inHours: Record<Locale, (n: number) => string> = {
    de: (n) => `in ${n} Std.`,
    en: (n) => (n === 1 ? 'in 1 hour' : `in ${n} hours`),
    fr: (n) => (n === 1 ? 'dans 1 heure' : `dans ${n} heures`),
    it: (n) => (n === 1 ? 'tra 1 ora' : `tra ${n} ore`),
    pt: (n) => (n === 1 ? 'em 1 hora' : `em ${n} horas`),
  }

  if (diffMinutes <= 0) return now[locale]
  if (diffMinutes < 60) return inMinutes[locale](diffMinutes)
  return inHours[locale](Math.round(diffMinutes / 60))
}

function resolveInterval() {
  const rawValue = process.env.EVENT_REMINDER_INTERVAL_MS
  if (!rawValue) return DEFAULT_INTERVAL_MS
  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS
}
