import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EventsService, RSVP_REMINDER_COOLDOWN_MS } from './events.service'

const INTERVAL_MS = 5 * 60 * 1000
const BATCH_SIZE = 100

/** Team-wide nudges for unanswered RSVPs, separate from personal one-hour reminders. */
@Injectable()
export class RsvpReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RsvpReminderWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.EVENT_REMINDER_WORKER_DISABLED === 'true' ||
      process.env.RSVP_REMINDER_WORKER_DISABLED === 'true'
    )
      return
    this.timer = setInterval(() => {
      void this.runCycle()
    }, INTERVAL_MS)
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
      const due = await this.prisma.event.findMany({
        where: {
          rsvpAutoReminder: true,
          cancelledAt: null,
          archivedAt: null,
          date: { gt: now, lte: new Date(now.getTime() + RSVP_REMINDER_COOLDOWN_MS) },
          AND: [
            {
              OR: [
                { rsvpAutoReminderFor: null },
                { NOT: { rsvpAutoReminderFor: { equals: this.prisma.event.fields.date } } },
              ],
            },
            {
              OR: [
                { lastRsvpReminderAt: null },
                { lastRsvpReminderAt: { lt: new Date(now.getTime() - RSVP_REMINDER_COOLDOWN_MS) } },
              ],
            },
          ],
        },
        select: { id: true, clubId: true },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
      })
      for (const event of due) {
        try {
          // Rechecks eligibility and atomically claims the shared cooldown.
          await this.events.remindRsvpAutomatically(event.clubId, event.id)
        } catch {
          this.logger.warn(`Automatic RSVP reminder failed for event ${event.id}`)
        }
      }
    } catch {
      this.logger.warn('Automatic RSVP reminder cycle failed; will retry next cycle')
    } finally {
      this.running = false
    }
  }
}
