import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ContributionsService } from './contributions.service'

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000

@Injectable()
export class ContributionsReminderWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ContributionsReminderWorker.name)
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly contributionsService: ContributionsService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.CONTRIBUTION_REMINDER_WORKER_DISABLED === 'true'
    ) {
      return
    }

    const intervalMs = resolveReminderInterval()
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

  private async runCycle() {
    const clubs = await this.prisma.clubContributionSettings.findMany({
      where: {
        enabled: true,
        autoRemindersEnabled: true,
      },
      select: {
        clubId: true,
      },
    })

    for (const { clubId } of clubs) {
      try {
        const result =
          await this.contributionsService.runAutomaticReminderSweep(clubId)

        if (result.sent > 0) {
          this.logger.log(
            `Sent ${result.sent} automatic contribution reminders for club ${clubId}.`,
          )
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown error'
        this.logger.warn(
          `Automatic contribution reminders failed for club ${clubId}: ${message}`,
        )
      }
    }
  }
}

function resolveReminderInterval() {
  const rawValue = process.env.CONTRIBUTION_REMINDER_INTERVAL_MS
  if (!rawValue) {
    return DEFAULT_INTERVAL_MS
  }

  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS
}
